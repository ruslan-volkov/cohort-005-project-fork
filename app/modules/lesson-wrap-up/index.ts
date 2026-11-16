import { decideWrapUp } from "./lib/wrap-up";

export type { WrapUp, CompletionStep } from "./lib/wrap-up";

/**
 * What the panel at the foot of a lesson shows: the Student's private note
 * and the step that finishes the lesson, side by side, so writing a note and
 * moving on happen in one place.
 */
export const lessonWrapUp = decideWrapUp;
