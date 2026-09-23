import { test } from "node:test";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { makeKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { deepEqual, equal, isNull, isTrue } from "rich-assert";
import { isLessonUnavailable, isSentenceLessonText } from "./lesson.ts";
import { SentenceLesson } from "./sentences.ts";
import { lessonProps } from "./settings.ts";

function sequenceRng(values: readonly number[]): RNGStream {
  let index = 0;
  const rng = (() => {
    const value = values[index % values.length] ?? 0;
    index++;
    return value;
  }) as RNGStream<number>;
  rng.mark = () => index;
  rng.reset = (mark) => {
    index = mark;
  };
  return rng;
}

function makeLesson(pairs: readonly { id: string; en: string; ru: string }[]) {
  const settings = new Settings().set(lessonProps.length, 0);
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new SentenceLesson(settings, keyboard, model, pairs);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));
  return { lesson, lessonKeys };
}

test("includes all letters and keeps text and pairs atomic", () => {
  const { lesson, lessonKeys } = makeLesson([
    { id: "tatoeba:1", en: "a".repeat(110), ru: "А" },
    { id: "tatoeba:2", en: "b".repeat(110), ru: "Б" },
  ]);

  equal(lessonKeys.findIncludedKeys().length, lesson.letters.length);
  equal(lessonKeys.findFocusedKey()?.letter.codePoint, 0x61);
  isTrue(Object.isFrozen(lesson.pairs[0]));
  const result = lesson.generate(lessonKeys, sequenceRng([0.01, 0.01]));

  isTrue(isSentenceLessonText(result));
  if (!isSentenceLessonText(result)) {
    throw new Error("Expected a structured sentence result");
  }
  equal(result.text, result.pairs.map(({ en }) => en).join(" "));
  deepEqual(result.pairs, [{ id: "tatoeba:1", en: "a".repeat(110), ru: "А" }]);
});

test("allows the general pool when the specialized branch is skipped", () => {
  const { lesson, lessonKeys } = makeLesson([
    { id: "tatoeba:1", en: "a".repeat(110), ru: "А" },
    { id: "tatoeba:2", en: "b".repeat(110), ru: "Б" },
  ]);
  const result = lesson.generate(lessonKeys, sequenceRng([0.99, 0.99]));

  isTrue(isSentenceLessonText(result));
  if (!isSentenceLessonText(result)) {
    throw new Error("Expected a structured sentence result");
  }
  equal(result.pairs[0].id, "tatoeba:2");
});

test("keeps specializing while an unselected focused pair remains", () => {
  const { lesson, lessonKeys } = makeLesson([
    { id: "tatoeba:1", en: "a".repeat(60), ru: "А" },
    { id: "tatoeba:2", en: "b".repeat(60), ru: "Б" },
    { id: "tatoeba:3", en: "c".repeat(60), ru: "В" },
  ]);
  const result = lesson.generate(
    lessonKeys,
    sequenceRng([0.99, 0.5, 0.7, 0.01]),
  );

  isTrue(isSentenceLessonText(result));
  if (!isSentenceLessonText(result)) {
    throw new Error("Expected a structured sentence result");
  }
  deepEqual(
    result.pairs.map(({ id }) => id),
    ["tatoeba:2", "tatoeba:1"],
  );
});

test("combines whole pairs in order until the lesson target is reached", () => {
  const { lesson, lessonKeys } = makeLesson([
    { id: "tatoeba:1", en: "a".repeat(60), ru: "А" },
    { id: "tatoeba:2", en: "b".repeat(60), ru: "Б" },
  ]);
  const result = lesson.generate(
    lessonKeys,
    sequenceRng([0.01, 0.01, 0.99, 0.01]),
  );

  isTrue(isSentenceLessonText(result));
  if (!isSentenceLessonText(result)) {
    throw new Error("Expected a structured sentence result");
  }
  deepEqual(
    result.pairs.map(({ id }) => id),
    ["tatoeba:1", "tatoeba:2"],
  );
  equal(result.text, `${"a".repeat(60)} ${"b".repeat(60)}`);
});

test("returns unavailable when no pair is compatible with the keyboard", () => {
  const { lesson, lessonKeys } = makeLesson([
    { id: "tatoeba:1", en: "café", ru: "Кафе" },
  ]);
  const result = lesson.generate(lessonKeys, sequenceRng([0.1]));

  isTrue(isLessonUnavailable(result));
  if (!isLessonUnavailable(result)) {
    throw new Error("Expected an unavailable sentence result");
  }
  equal(result.origin, "sentences");
  isNull(lessonKeys.findFocusedKey());
});

test("does not create a non-recording lesson from a too-short corpus", () => {
  const { lesson, lessonKeys } = makeLesson([
    { id: "tatoeba:1", en: "Hi.", ru: "Привет." },
  ]);
  const result = lesson.generate(lessonKeys, sequenceRng([0.1]));

  isTrue(isLessonUnavailable(result));
  if (!isLessonUnavailable(result)) {
    throw new Error("Expected an unavailable short sentence result");
  }
  equal(result.origin, "sentences");
});
