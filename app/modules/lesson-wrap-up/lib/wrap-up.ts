type NextLesson = { id: number; title: string };

export type CompletionStep =
  | { kind: "completed"; nextLesson: NextLesson | null }
  | { kind: "complete-and-continue"; nextLesson: NextLesson }
  | { kind: "mark-complete" };

/** The note is always there; the completion step only for an enrolled Student. */
export type WrapUp = {
  completion: CompletionStep | null;
};

/**
 * What the panel at the foot of a lesson shows: the Student's private note
 * and the step that finishes the lesson, side by side, so writing a note and
 * moving on happen in one place.
 */
export function lessonWrapUp(input: {
  signedIn: boolean;
  enrolled: boolean;
  completed: boolean;
  nextLesson: NextLesson | null;
}): WrapUp | null {
  if (!input.signedIn) return null;

  // Progress belongs to an enrollment, so only an enrolled Student can
  // complete a lesson; anyone else who can view it may still keep a note.
  return { completion: input.enrolled ? completionStep(input) : null };
}

function completionStep(input: {
  completed: boolean;
  nextLesson: NextLesson | null;
}): CompletionStep {
  if (input.completed) {
    return { kind: "completed", nextLesson: input.nextLesson };
  }
  if (input.nextLesson) {
    return { kind: "complete-and-continue", nextLesson: input.nextLesson };
  }
  return { kind: "mark-complete" };
}
