import { describe, it, expect } from "vitest";
import { lessonWrapUp } from "../index";

const next = { id: 7, title: "Generics" };

describe("lessonWrapUp", () => {
  it("shows nothing to a visitor who is not signed in", () => {
    expect(
      lessonWrapUp({
        signedIn: false,
        enrolled: false,
        completed: false,
        nextLesson: next,
      })
    ).toBeNull();
  });

  it("gives a signed-in viewer who is not enrolled a note but no completion step", () => {
    expect(
      lessonWrapUp({
        signedIn: true,
        enrolled: false,
        completed: false,
        nextLesson: next,
      })
    ).toEqual({ completion: null });
  });

  it("offers to complete and continue when there is a next lesson", () => {
    expect(
      lessonWrapUp({
        signedIn: true,
        enrolled: true,
        completed: false,
        nextLesson: next,
      })
    ).toEqual({
      completion: { kind: "complete-and-continue", nextLesson: next },
    });
  });

  it("offers to mark complete on the last lesson", () => {
    expect(
      lessonWrapUp({
        signedIn: true,
        enrolled: true,
        completed: false,
        nextLesson: null,
      })
    ).toEqual({ completion: { kind: "mark-complete" } });
  });

  it("shows a completed lesson with a link on to the next one", () => {
    expect(
      lessonWrapUp({
        signedIn: true,
        enrolled: true,
        completed: true,
        nextLesson: next,
      })
    ).toEqual({
      completion: { kind: "completed", nextLesson: next },
    });
  });

  it("shows a completed last lesson with nowhere further to go", () => {
    expect(
      lessonWrapUp({
        signedIn: true,
        enrolled: true,
        completed: true,
        nextLesson: null,
      })
    ).toEqual({
      completion: { kind: "completed", nextLesson: null },
    });
  });
});
