import { useEffect } from "react";
import { Link, useFetcher, useNavigate, data } from "react-router";
import type { Route } from "./+types/courses.$slug.lessons.$lessonId";
import {
  coursePermissions,
  type Capability,
  type CourseRef,
  type DenialReason,
} from "~/modules/permissions/course-permissions.server";
import {
  createComment,
  deleteComment,
  editComment,
} from "~/lib/comments.server";
import { defaultNotifications } from "~/lib/notifications.server";
import { isBookmarked, toggleBookmark } from "~/lib/bookmarks.server";
import { getNote, saveNote } from "~/lib/notes.server";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { CommentThread } from "~/components/comment-thread";
import { db } from "~/db";
import { LessonProgressStatus } from "~/db/schema";
import {
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
  lessonNeighbours,
} from "~/modules/lesson-viewer/course.server";
import {
  loadLessonProgress,
  markLessonComplete,
} from "~/modules/lesson-viewer/progress.server";
import {
  getCommentById,
  loadLessonThread,
} from "~/modules/lesson-viewer/thread.server";
import {
  computeResult,
  getQuizById,
  loadLessonQuiz,
} from "~/modules/lesson-viewer/quiz.server";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { ChevronLeft, ChevronRight, Clock, Github } from "lucide-react";
import { formatDuration } from "~/lib/utils";
import { renderMarkdown } from "~/lib/markdown.server";
import { YouTubePlayer } from "~/components/youtube-player";
import {
  LessonWrapUp,
  markCompleteFetcherKey,
} from "~/components/lesson-wrap-up";
import { lessonWrapUp } from "~/modules/lesson-wrap-up";
import { useAutoplay } from "~/components/use-autoplay";
import { LockedLesson } from "~/components/lesson-locked";
import { LessonBreadcrumb } from "~/components/lesson-breadcrumb";
import { BookmarkToggle } from "~/components/lesson-bookmark-toggle";
import { CurriculumSidebar } from "~/components/lesson-curriculum-sidebar";
import { QuizSection } from "~/components/lesson-quiz";
import { z } from "zod";
import { parseFormData } from "~/lib/validation";

import { LessonError } from "~/components/lesson-error-boundary";

const createCommentSchema = z.object({
  intent: z.literal("create-comment"),
  body: z.string(),
  parentId: z.coerce.number().int().optional(),
});

const editCommentSchema = z.object({
  intent: z.literal("edit-comment"),
  commentId: z.coerce.number().int(),
  body: z.string(),
});

const saveNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something before saving your note.")
    .max(
      MAX_NOTE_LENGTH,
      `Your note is over ${MAX_NOTE_LENGTH.toLocaleString("en")} characters, so it was not saved.`
    ),
});

const submitQuizSchema = z.object({
  quizId: z.coerce.number().int().positive(),
});

const deleteCommentSchema = z.object({
  intent: z.literal("delete-comment"),
  commentId: z.coerce.number().int(),
});

/**
 * The course named by this route's slug, through this lesson. A lesson in
 * another course, or a malformed lesson id, counts as not found.
 */
function lessonRef(params: { slug: string; lessonId: string }): CourseRef {
  return { slug: params.slug, lessonId: params.lessonId };
}

/**
 * What each action intent needs: comments, Bookmarks and Notes need view;
 * progress and quizzes need take. Moderating Discussions (deleting someone
 * else's post) additionally needs manage, checked in the delete intent.
 */
const INTENT_CAPABILITY: Record<string, Capability | undefined> = {
  "create-comment": "view",
  "edit-comment": "view",
  "delete-comment": "view",
  "toggle-bookmark": "view",
  "save-note": "view",
  "mark-complete": "take",
  "submit-quiz": "take",
};

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.lesson?.title ?? "Lesson";
  const courseTitle = loaderData?.course?.title ?? "Course";
  return [{ title: `${title} — ${courseTitle} — Cadence` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  // Not found covers an unknown course, a malformed lesson id, and a lesson
  // from another course.
  const decisions = await coursePermissions.getCourseDecisions(
    request,
    lessonRef(params)
  );
  if (!decisions.found) {
    throw data("Lesson not found", { status: 404 });
  }

  const { course, person, enrolled, view, take, manage } = decisions;
  const currentUserId = person?.id ?? null;
  const lessonId = Number(params.lessonId);

  const courseWithDetails = getCourseWithDetails(course.id);
  const lesson = getLessonById(lessonId);
  const mod = lesson ? getModuleById(lesson.moduleId) : undefined;
  if (!courseWithDetails || !lesson || !mod) {
    throw data("Lesson not found", { status: 404 });
  }

  const curriculum = courseWithDetails.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      title: l.title,
    })),
  }));

  // Someone who can't view the content gets the lesson's title, its module and
  // the course outline — never the body, video or quiz — plus the reason, so
  // the page can show the right call to action.
  if (!view.allowed) {
    const lockedReason: DenialReason = view.reason;

    return {
      view: "locked" as const,
      course: {
        id: courseWithDetails.id,
        title: courseWithDetails.title,
        slug: courseWithDetails.slug,
      },
      curriculum,
      module: { id: mod.id, title: mod.title },
      lesson: { id: lesson.id, title: lesson.title },
      enrolled,
      lockedReason,
    };
  }

  const { lessonStatus, lastWatchPosition, watchProgress, lessonProgressMap } =
    loadLessonProgress({
      userId: take.allowed ? currentUserId : null,
      courseId: course.id,
      lesson,
    });

  // Everything from here on is behind the can-view-content bar above:
  // comments, Bookmarks and Notes are confidential to the course.
  const instructor = getUserById(course.instructorId);
  const comments = await loadLessonThread(lessonId);

  const bookmarked = currentUserId
    ? isBookmarked(db, currentUserId, lessonId)
    : false;
  const note = currentUserId ? getNote(db, currentUserId, lessonId) : undefined;

  const contentHtml = lesson.content
    ? await renderMarkdown(lesson.content)
    : null;

  const { prevLesson, nextLesson } = lessonNeighbours(
    courseWithDetails,
    lessonId
  );

  const { quiz, bestAttempt } = loadLessonQuiz(lessonId, currentUserId);
  return {
    view: "full" as const,
    course: {
      id: courseWithDetails.id,
      title: courseWithDetails.title,
      slug: courseWithDetails.slug,
    },
    curriculum,
    module: {
      id: mod.id,
      title: mod.title,
    },
    lesson,
    contentHtml,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    lastWatchPosition,
    watchProgress,
    lessonProgressMap,
    comments,
    canModerate: manage.allowed,
    instructorName: instructor?.name ?? "your instructor",
    bookmarked,
    note: note ? { body: note.body, updatedAt: note.updatedAt } : null,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Every intent checks its own capability here — loader guards don't protect
  // actions. The ref includes the lesson, so a lesson from another course (or
  // a malformed id) is a 404.
  const capability =
    typeof intent === "string" ? INTENT_CAPABILITY[intent] : undefined;
  if (!capability) {
    throw data("Invalid action", { status: 400 });
  }
  const ref = lessonRef(params);
  const { person } = await coursePermissions.requireCapability(
    request,
    capability,
    ref
  );
  const currentUserId = person.id;
  const lessonId = Number(params.lessonId);

  if (
    intent === "create-comment" ||
    intent === "edit-comment" ||
    intent === "delete-comment"
  ) {
    try {
      if (intent === "create-comment") {
        const parsed = parseFormData(formData, createCommentSchema);
        if (!parsed.success) {
          return { ok: false, error: "Enter a comment before posting." };
        }
        const created = await createComment(
          db,
          currentUserId,
          lessonId,
          parsed.data.parentId ?? null,
          parsed.data.body,
          new Date(),
          await defaultNotifications()
        );
        if (!created.ok) return created;
        return { ok: true };
      }

      if (intent === "edit-comment") {
        const parsed = parseFormData(formData, editCommentSchema);
        if (!parsed.success) {
          return { ok: false, error: "Enter a comment before saving." };
        }
        // Scope the id to this lesson so a comment elsewhere can't be reached
        // by posting its id to this route.
        const existing = getCommentById(parsed.data.commentId);
        if (!existing || existing.lessonId !== lessonId) {
          throw data("Comment not found", { status: 404 });
        }
        const edited = editComment(
          db,
          parsed.data.commentId,
          currentUserId,
          parsed.data.body,
          new Date()
        );
        if (!edited.ok) return edited;
        return { ok: true };
      }

      const parsed = parseFormData(formData, deleteCommentSchema);
      if (!parsed.success) {
        return { ok: false, error: "Could not delete that comment." };
      }
      const existing = getCommentById(parsed.data.commentId);
      if (!existing || existing.lessonId !== lessonId) {
        throw data("Comment not found", { status: 404 });
      }
      // Anyone who can view may delete their own posts; moderating someone
      // else's takes the manage capability.
      const decisions = coursePermissions.decide(person, ref);
      const canModerate = decisions.found && decisions.manage.allowed;
      const deleted = await deleteComment(
        db,
        parsed.data.commentId,
        currentUserId,
        canModerate,
        new Date(),
        await defaultNotifications()
      );
      if (!deleted.ok) return deleted;
      return { ok: true };
    } catch (error) {
      // Service validation failures are user-correctable; anything thrown as a
      // Response (404 above) should keep bubbling.
      if (error instanceof Error) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  }

  if (intent === "toggle-bookmark" || intent === "save-note") {
    if (intent === "toggle-bookmark") {
      const bookmarked = toggleBookmark(
        db,
        currentUserId,
        lessonId,
        new Date()
      );
      return { ok: true, bookmarked };
    }

    const parsed = parseFormData(formData, saveNoteSchema);
    if (!parsed.success) {
      return { ok: false, error: parsed.errors.body };
    }
    const saved = saveNote(
      db,
      currentUserId,
      lessonId,
      parsed.data.body,
      new Date()
    );
    if (!saved.ok) return saved;
    return { ok: true };
  }

  if (intent === "mark-complete") {
    markLessonComplete(currentUserId, lessonId, new Date());
    return { success: true };
  }

  if (intent === "submit-quiz") {
    const parsed = parseFormData(formData, submitQuizSchema);
    if (!parsed.success) {
      throw data("Invalid quiz ID", { status: 400 });
    }
    const { quizId } = parsed.data;
    // Scope the quiz to this lesson so a quiz elsewhere can't be reached by
    // posting its id to this route.
    const quiz = getQuizById(quizId);
    if (!quiz || quiz.lessonId !== lessonId) {
      throw data("Quiz not found", { status: 404 });
    }

    // Collect answers: form fields named "question-{questionId}" with value = optionId
    const selectedAnswers: Record<number, number> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("question-")) {
        const questionId = Number(key.replace("question-", ""));
        const optionId = Number(value);
        if (!isNaN(questionId) && !isNaN(optionId)) {
          selectedAnswers[questionId] = optionId;
        }
      }
    }

    const result = computeResult(currentUserId, quizId, selectedAnswers);
    if (!result) {
      throw data("Failed to score quiz", { status: 500 });
    }

    return { quizResult: result };
  }

  throw data("Invalid action", { status: 400 });
}

type LessonLoaderData = Route.ComponentProps["loaderData"];

export default function LessonViewer({ loaderData }: Route.ComponentProps) {
  if (loaderData.view === "locked") {
    return <LockedLesson data={loaderData} />;
  }
  return <FullLesson data={loaderData} />;
}

function FullLesson({
  data,
}: {
  data: Extract<LessonLoaderData, { view: "full" }>;
}) {
  const {
    course,
    curriculum,
    module: mod,
    lesson,
    contentHtml,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    lastWatchPosition,
    watchProgress,
    lessonProgressMap,
    comments,
    canModerate,
    instructorName,
    bookmarked,
    note,
  } = data;
  const [autoplay, toggleAutoplay] = useAutoplay();
  const fetcher = useFetcher({ key: markCompleteFetcherKey(lesson.id) });
  const quizFetcher = useFetcher({ key: `quiz-${lesson.id}` });
  const navigate = useNavigate();

  const justCompleted = fetcher.data?.success;

  const wrapUp = lessonWrapUp({
    signedIn: currentUserId !== null,
    enrolled,
    completed:
      lessonStatus === LessonProgressStatus.Completed || !!justCompleted,
    nextLesson,
  });

  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${course.slug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, course.slug, navigate]);

  const quizResult = quizFetcher.data?.quizResult ?? null;
  const isSubmittingQuiz = quizFetcher.state !== "idle";

  return (
    <div className="flex">
      <CurriculumSidebar
        course={course}
        curriculum={curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={lessonProgressMap}
        enrolled={enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonBreadcrumb
          course={course}
          mod={mod}
          lessonTitle={lesson.title}
        />

        <div className="mx-auto max-w-4xl">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold">{lesson.title}</h1>
            {currentUserId && <BookmarkToggle bookmarked={bookmarked} />}
          </div>
          <div className="mb-6 flex items-center gap-3">
            {lesson.durationMinutes && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="size-4" />
                {formatDuration(lesson.durationMinutes, true, false, false)}
              </div>
            )}
            {lesson.githubRepoUrl && (
              <a
                href={lesson.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm">
                  <Github className="mr-1.5 size-4" />
                  Open Code
                </Button>
              </a>
            )}
          </div>

          {lesson.videoUrl && (
            <YouTubePlayer
              videoUrl={lesson.videoUrl}
              lessonId={lesson.id}
              title={lesson.title}
              startPosition={lastWatchPosition}
              durationMinutes={lesson.durationMinutes}
              watchProgress={watchProgress}
              trackingEnabled={enrolled && !!currentUserId}
              autoplay={autoplay}
              onToggleAutoplay={toggleAutoplay}
            />
          )}

          {contentHtml && (
            <div
              className="prose prose-neutral dark:prose-invert mb-8 max-w-none"
              // oxlint-disable-next-line react/no-danger -- the instructor wrote this Markdown
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          )}

          {!contentHtml && !lesson.videoUrl && (
            <Card className="mb-8">
              <CardContent className="py-12 text-center text-muted-foreground">
                No content has been added to this lesson yet.
              </CardContent>
            </Card>
          )}

          {quiz && enrolled && currentUserId && (
            <QuizSection
              quiz={quiz}
              bestAttempt={bestAttempt}
              quizResult={quizResult}
              quizFetcher={quizFetcher}
              isSubmitting={isSubmittingQuiz}
            />
          )}

          {wrapUp && (
            <LessonWrapUp
              wrapUp={wrapUp}
              note={note}
              lessonId={lesson.id}
              courseSlug={course.slug}
            />
          )}

          {/* Questions & Discussion — confidential to people with access */}
          <CommentThread
            comments={comments}
            currentUserId={currentUserId}
            canModerate={canModerate}
            canPost
            instructorName={instructorName}
          />

          <div className="flex items-center justify-between border-t pt-6">
            {prevLesson ? (
              <Link
                to={`/courses/${course.slug}/lessons/${prevLesson.id}`}
                className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground"
              >
                <ChevronLeft className="size-4" />
                <div>
                  <div className="text-xs text-muted-foreground">Previous</div>
                  <div className="font-medium text-foreground">
                    {prevLesson.title}
                  </div>
                </div>
              </Link>
            ) : (
              <div />
            )}

            {nextLesson ? (
              <Link
                to={`/courses/${course.slug}/lessons/${nextLesson.id}`}
                className="flex items-center gap-2 text-right text-sm hover:text-foreground text-muted-foreground"
              >
                <div>
                  <div className="text-xs text-muted-foreground">Next</div>
                  <div className="font-medium text-foreground">
                    {nextLesson.title}
                  </div>
                </div>
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <Link
                to={`/courses/${course.slug}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <div>
                  <div className="text-xs text-muted-foreground">Back to</div>
                  <div className="font-medium text-foreground">
                    {course.title}
                  </div>
                </div>
                <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <LessonError error={error} />;
}
