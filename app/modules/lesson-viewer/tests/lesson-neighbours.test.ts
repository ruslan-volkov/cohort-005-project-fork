import { describe, it, expect } from "vitest";
import { lessonNeighbours } from "../course.server";

const course = {
  modules: [
    {
      id: 1,
      title: "Basics",
      lessons: [
        { id: 10, title: "Intro", moduleId: 1 },
        { id: 11, title: "Setup", moduleId: 1 },
      ],
    },
    {
      id: 2,
      title: "Generics",
      lessons: [{ id: 20, title: "Type parameters", moduleId: 2 }],
    },
  ],
};

describe("lessonNeighbours", () => {
  it("has no previous lesson for the first lesson", () => {
    const { prevLesson, nextLesson } = lessonNeighbours(course, 10);
    expect(prevLesson).toBeNull();
    expect(nextLesson?.id).toBe(11);
  });

  it("crosses into the next module", () => {
    expect(lessonNeighbours(course, 11).nextLesson).toEqual({
      id: 20,
      title: "Type parameters",
      moduleId: 2,
      moduleTitle: "Generics",
    });
  });

  it("crosses back into the previous module", () => {
    expect(lessonNeighbours(course, 20).prevLesson?.id).toBe(11);
  });

  it("has no next lesson for the last lesson", () => {
    expect(lessonNeighbours(course, 20).nextLesson).toBeNull();
  });
});
