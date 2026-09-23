import { test } from "node:test";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { deepEqual, equal, isNull } from "rich-assert";
import { findWeakestKey, LessonKey, LessonKeys } from "./key.ts";

const { letter1, letter2, letter3 } = FakePhoneticModel;

test("finds the weakest key with stable ties and null priority", () => {
  const keys = [
    new LessonKey({
      letter: letter1,
      samples: [],
      timeToType: null,
      bestTimeToType: null,
      confidence: null,
      bestConfidence: null,
    }),
    new LessonKey({
      letter: letter2,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 0.5,
      bestConfidence: 0.5,
    }),
    new LessonKey({
      letter: letter3,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 0.5,
      bestConfidence: 0.5,
    }),
  ];

  equal(findWeakestKey(keys, "current"), keys[0]);
  equal(findWeakestKey(keys.slice(1), "current"), keys[0 + 1]);
  isNull(findWeakestKey([], "best"));
});

test("mutate lesson keys", () => {
  // Arrange.

  const keys = new LessonKeys([
    new LessonKey({
      letter: letter1,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
    }),
    new LessonKey({
      letter: letter2,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
    }),
    new LessonKey({
      letter: letter3,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
    }),
  ]);

  // Act.

  keys.focus(letter1);

  // Assert.

  deepEqual(keys.letters, [letter1, letter2, letter3]);
  deepEqual(
    [...keys],
    [
      new LessonKey({
        letter: letter1,
        samples: [],
        timeToType: 300,
        bestTimeToType: 300,
        confidence: 1.0,
        bestConfidence: 1.0,
        isIncluded: true,
        isForced: false,
        isFocused: true,
      }),
      new LessonKey({
        letter: letter2,
        samples: [],
        timeToType: 300,
        bestTimeToType: 300,
        confidence: 1.0,
        bestConfidence: 1.0,
        isIncluded: false,
        isForced: false,
        isFocused: false,
      }),
      new LessonKey({
        letter: letter3,
        samples: [],
        timeToType: 300,
        bestTimeToType: 300,
        confidence: 1.0,
        bestConfidence: 1.0,
        isIncluded: false,
        isForced: false,
        isFocused: false,
      }),
    ],
  );
  deepEqual(keys.findIncludedKeys(), [
    new LessonKey({
      letter: letter1,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
      isIncluded: true,
      isForced: false,
      isFocused: true,
    }),
  ]);
  deepEqual(keys.findExcludedKeys(), [
    new LessonKey({
      letter: letter2,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
      isIncluded: false,
      isForced: false,
      isFocused: false,
    }),
    new LessonKey({
      letter: letter3,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
      isIncluded: false,
      isForced: false,
      isFocused: false,
    }),
  ]);
  deepEqual(
    keys.findFocusedKey(),
    new LessonKey({
      letter: letter1,
      samples: [],
      timeToType: 300,
      bestTimeToType: 300,
      confidence: 1.0,
      bestConfidence: 1.0,
      isIncluded: true,
      isForced: false,
      isFocused: true,
    }),
  );
});
