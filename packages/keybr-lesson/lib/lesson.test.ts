import { test } from "node:test";
import { deepEqual, equal, isFalse, isTrue } from "rich-assert";
import {
  getLessonText,
  isSentenceLessonText,
  type SentenceLessonText,
} from "./lesson.ts";

test("extracts text from a structured sentence generation", () => {
  const generation: SentenceLessonText = {
    kind: "sentences",
    text: "Hello world.",
    pairs: [{ id: "1", en: "Hello world.", ru: "Привет, мир." }],
  };

  isTrue(isSentenceLessonText(generation));
  equal(getLessonText(generation), "Hello world.");
  deepEqual(generation.pairs, [
    { id: "1", en: "Hello world.", ru: "Привет, мир." },
  ]);
  isFalse(isSentenceLessonText("Hello world."));
  equal(getLessonText("Hello world."), "Hello world.");
});
