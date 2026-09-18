import { throws } from "node:assert/strict";
import { describe, it, test } from "node:test";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { makeKeyStatsMap } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { deepEqual, equal, isNull } from "rich-assert";
import { LessonKey } from "./key.ts";
import { lessonProps } from "./settings.ts";
import { WordListLesson } from "./wordlist.ts";

test("provide key set", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const wordList = ["abc", "def", "ghi"];
  const lesson = new WordListLesson(settings, keyboard, model, wordList);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

  deepEqual(lessonKeys.findIncludedKeys(), [
    new LessonKey({
      letter: FakePhoneticModel.letter1,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter2,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter3,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter4,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter5,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter6,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter7,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter8,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter9,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
    new LessonKey({
      letter: FakePhoneticModel.letter10,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
      isIncluded: true,
      isFocused: false,
      isForced: false,
    }),
  ]);
  deepEqual(lessonKeys.findExcludedKeys(), []);
  isNull(lessonKeys.findFocusedKey());
});

test("filter words", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const wordList = ["abc", "def", "こんにちは"];
  const lesson = new WordListLesson(settings, keyboard, model, wordList);

  deepEqual(lesson.wordList, ["abc", "def"]);
});

test("personal policy keeps the full filtered pool", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.RU_RU);
  const model = new FakePhoneticModel();
  const lesson = new WordListLesson(
    settings,
    keyboard,
    model,
    ["всё", "нёбо", "и"],
    {
      source: "ru-personal",
      limit: "all",
      naturalWordLimit: null,
    },
  );

  deepEqual(lesson.wordList, ["всё", "нёбо", "и"]);
});

test("empty filtered word list is unavailable", () => {
  const settings = new Settings();
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel();
  const lesson = new WordListLesson(settings, keyboard, model, ["こんにちは"]);
  const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

  deepEqual(lesson.generate(lessonKeys, model.rng), {
    kind: "unavailable",
    origin: "word-list",
    fallbackUsed: false,
    reason: "empty-word-list",
    action: "word-list",
    candidateCount: 0,
  });
});

test("word-list source and limit reject invalid persisted values", () => {
  throws(
    () =>
      new Settings({ "lesson.wordList.source": "unknown" }).get(
        lessonProps.wordList.source,
      ),
    /Unknown word-list source/,
  );
  throws(
    () =>
      new Settings({ "lesson.wordList.limit": 1.5 }).get(
        lessonProps.wordList.limit,
      ),
    /Invalid word-list limit/,
  );
  throws(
    () =>
      new Settings({ "lesson.wordList.limit": null }).get(
        lessonProps.wordList.limit,
      ),
    /Invalid word-list limit/,
  );
  throws(
    () =>
      new Settings({ "lesson.wordList.source": null }).get(
        lessonProps.wordList.source,
      ),
    /Unknown word-list source/,
  );
});

describe("generate randomized text using settings", () => {
  const keyboard = loadKeyboard(Layout.EN_US);

  it("should transform to lower case", () => {
    const settings = new Settings()
      .set(lessonProps.capitals, 0)
      .set(lessonProps.punctuators, 0);
    const model = new FakePhoneticModel();
    const wordList = ["abc", "def", "ghi"];
    const lesson = new WordListLesson(settings, keyboard, model, wordList);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "abc def ghi abc def ghi abc def ghi abc def ghi abc def ghi abc def " +
        "ghi abc def ghi abc def ghi abc def ghi abc def ghi abc def ghi abc",
    );
  });

  it("should preserve case", () => {
    const settings = new Settings()
      .set(lessonProps.capitals, 1)
      .set(lessonProps.punctuators, 1);
    const model = new FakePhoneticModel();
    const wordList = ["abc", "def", "ghi"];
    const lesson = new WordListLesson(settings, keyboard, model, wordList);
    const lessonKeys = lesson.update(makeKeyStatsMap(lesson.letters, []));

    equal(
      lesson.generate(lessonKeys, model.rng),
      "Abc, Def, Ghi! Abc, Def, Ghi! Abc, Def, Ghi! Abc, Def, Ghi! Abc, Def, " +
        "Ghi! Abc, Def, Ghi! Abc, Def, Ghi! Abc, Def, Ghi! Abc,",
    );
  });
});
