import { db } from "~/db";
import {
  lessonProgress,
  lessons,
  modules,
  videoWatchEvents,
  LessonProgressStatus,
} from "~/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";

export function getLessonProgress(userId: number, lessonId: number) {
  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .get();
}

export function getLessonProgressForCourse(userId: number, courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id))))
    .all();

  if (courseLessons.length === 0) return [];

  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        or(...courseLessons.map((l) => eq(lessonProgress.lessonId, l.id)))
      )
    )
    .all();
}

export function markLessonComplete(
  userId: number,
  lessonId: number,
  now: Date
) {
  const existing = getLessonProgress(userId, lessonId);

  if (existing) {
    return db
      .update(lessonProgress)
      .set({
        status: LessonProgressStatus.Completed,
        completedAt: now.toISOString(),
      })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.Completed,
      completedAt: now.toISOString(),
    })
    .returning()
    .get();
}

export function markLessonInProgress(userId: number, lessonId: number) {
  const existing = getLessonProgress(userId, lessonId);

  if (existing) {
    if (existing.status === LessonProgressStatus.Completed) {
      return existing;
    }
    return db
      .update(lessonProgress)
      .set({ status: LessonProgressStatus.InProgress })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.InProgress,
    })
    .returning()
    .get();
}

export function getLastWatchPosition(userId: number, lessonId: number) {
  const lastEvent = db
    .select()
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .orderBy(desc(videoWatchEvents.createdAt))
    .limit(1)
    .get();

  return lastEvent?.positionSeconds ?? 0;
}

export function calculateWatchProgress(
  userId: number,
  lessonId: number,
  videoDurationSeconds: number
) {
  if (videoDurationSeconds <= 0) return 0;

  const result = db
    .select({ maxPos: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .get();

  const maxPosition = result?.maxPos ?? 0;

  return Math.min(Math.round((maxPosition / videoDurationSeconds) * 100), 100);
}

export type LessonProgressView = {
  lessonStatus: string | null;
  lastWatchPosition: number;
  watchProgress: number;
  lessonProgressMap: Record<number, string>;
};

/**
 * Marks the lesson in progress and reads back everything the page shows about
 * the viewer's progress. Pass a null `userId` for anyone who cannot take the
 * course: progress is recorded only for them, so a Student under a Country
 * Lock gets none.
 */
export function loadLessonProgress(input: {
  userId: number | null;
  courseId: number;
  lesson: {
    id: number;
    videoUrl: string | null;
    durationMinutes: number | null;
  };
}): LessonProgressView {
  const { userId, courseId, lesson } = input;
  if (!userId) {
    return {
      lessonStatus: null,
      lastWatchPosition: 0,
      watchProgress: 0,
      lessonProgressMap: {},
    };
  }

  markLessonInProgress(userId, lesson.id);
  const progress = getLessonProgress(userId, lesson.id);

  const lessonProgressMap: Record<number, string> = {};
  for (const record of getLessonProgressForCourse(userId, courseId)) {
    lessonProgressMap[record.lessonId] = record.status;
  }

  return {
    lessonStatus: progress?.status ?? null,
    lessonProgressMap,
    ...videoWatchState(userId, lesson),
  };
}

/** Where to resume the video, and how much of it has been watched. */
function videoWatchState(
  userId: number,
  lesson: {
    id: number;
    videoUrl: string | null;
    durationMinutes: number | null;
  }
) {
  if (!lesson.videoUrl) return { lastWatchPosition: 0, watchProgress: 0 };

  const videoDurationSeconds = (lesson.durationMinutes ?? 0) * 60;
  return {
    lastWatchPosition: getLastWatchPosition(userId, lesson.id),
    watchProgress:
      videoDurationSeconds > 0
        ? calculateWatchProgress(userId, lesson.id, videoDurationSeconds)
        : 0,
  };
}
