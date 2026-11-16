import { useId } from "react";
import { Link, useFetcher } from "react-router";
import { CheckCircle2, ChevronRight, NotebookPen } from "lucide-react";
import type { CompletionStep, WrapUp } from "~/modules/lesson-wrap-up";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { formatRelativeTime } from "~/lib/utils";

type Note = { body: string; updatedAt: string } | null;

/**
 * The route watches this fetcher to move on to the next lesson once marking
 * complete succeeds, so both sides must use the same key.
 */
export function markCompleteFetcherKey(lessonId: number) {
  return `mark-complete-${lessonId}`;
}

/**
 * The panel at the foot of a lesson: the Student's private note, with the
 * step that finishes the lesson beside it.
 */
export function LessonWrapUp({
  wrapUp,
  note,
  lessonId,
  courseSlug,
}: {
  wrapUp: WrapUp;
  note: Note;
  lessonId: number;
  courseSlug: string;
}) {
  const noteFetcher = useFetcher<{ ok: boolean; error?: string }>();
  const noteFormId = useId();
  const isSaving = noteFetcher.state !== "idle";
  const error = noteFetcher.data?.error;

  return (
    <Card className="mb-8" data-testid="lesson-wrap-up">
      <CardContent className="space-y-3 pt-6">
        <noteFetcher.Form method="post" id={noteFormId} className="space-y-3">
          <input type="hidden" name="intent" value="save-note" />
          <NoteField note={note} />
        </noteFetcher.Form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              form={noteFormId}
              size="sm"
              variant="outline"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            <NoteStatus error={error} note={note} />
          </div>

          {wrapUp.completion && (
            <CompletionAction
              step={wrapUp.completion}
              lessonId={lessonId}
              courseSlug={courseSlug}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NoteStatus({ error, note }: { error?: string; note: Note }) {
  if (error) return <span className="text-sm text-red-600">{error}</span>;
  if (!note) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Last edited {formatRelativeTime(note.updatedAt)}
    </span>
  );
}

function NoteField({ note }: { note: Note }) {
  return (
    <>
      <label htmlFor="lesson-note" className="flex items-center gap-2">
        <NotebookPen className="size-4 text-muted-foreground" />
        <span className="font-semibold">Your notes</span>
        <span className="text-xs text-muted-foreground">
          Only you can read these.
        </span>
      </label>
      <Textarea
        id="lesson-note"
        name="body"
        rows={4}
        defaultValue={note?.body ?? ""}
        placeholder="What do you want to remember from this lesson?"
        className="resize-y"
      />
    </>
  );
}

function CompletionAction({
  step,
  lessonId,
  courseSlug,
}: {
  step: CompletionStep;
  lessonId: number;
  courseSlug: string;
}) {
  const fetcher = useFetcher({ key: markCompleteFetcherKey(lessonId) });
  const isMarking =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "mark-complete";

  if (step.kind === "completed") {
    return <Completed nextLesson={step.nextLesson} courseSlug={courseSlug} />;
  }

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="mark-complete" />
      <Button disabled={isMarking}>
        {step.kind === "complete-and-continue" ? (
          isMarking ? (
            "Completing..."
          ) : (
            <>
              Up next: {step.nextLesson.title}
              <ChevronRight className="ml-1 size-4" />
            </>
          )
        ) : (
          <>
            <CheckCircle2 className="mr-2 size-4" />
            {isMarking ? "Marking..." : "Mark as Complete"}
          </>
        )}
      </Button>
    </fetcher.Form>
  );
}

function Completed({
  nextLesson,
  courseSlug,
}: {
  nextLesson: { id: number; title: string } | null;
  courseSlug: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle2 className="size-5" />
        <span className="font-medium">Lesson completed</span>
      </div>
      {nextLesson && (
        <Link to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}>
          <Button variant="outline" size="sm">
            Up next: {nextLesson.title}
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}
