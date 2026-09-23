import { test } from "node:test";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import {
  GuidedLesson,
  isLessonUnavailable,
  isSentenceLessonText,
  Lesson,
  type LessonGenerationResult,
  LessonKeys,
  lessonProps,
  type SentenceLessonText,
  Target,
} from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type KeyStatsMap, TextType } from "@keybr/result";
import { Settings } from "@keybr/settings";
import { Feedback } from "@keybr/textinput";
import { type IInputEvent } from "@keybr/textinput-events";
import { equal, isNull, isTrue } from "rich-assert";
import { LessonState } from "./lesson-state.ts";
import { Progress } from "./progress.ts";

class StructuredLesson extends Lesson {
  readonly pair = {
    id: "sentence-1",
    en: "abc def",
    ru: "абв где",
  } as const;
  generateCalls = 0;

  constructor(settings: Settings) {
    super(settings, loadKeyboard(Layout.EN_US), new FakePhoneticModel());
  }

  override get letters() {
    return this.model.letters;
  }

  override get textType() {
    return TextType.NATURAL;
  }

  override update(keyStatsMap: KeyStatsMap) {
    return LessonKeys.includeAll(keyStatsMap, new Target(this.settings));
  }

  override generate(
    _lessonKeys: LessonKeys,
    _rng: RNGStream,
  ): LessonGenerationResult {
    this.generateCalls++;
    const generation: SentenceLessonText = {
      kind: "sentences",
      text: this.pair.en,
      pairs: [this.pair],
    };
    return generation;
  }
}

test("keeps an unavailable generation out of TextInput", () => {
  const settings = new Settings().set(lessonProps.guided.naturalWords, false);
  const keyboard = loadKeyboard(Layout.EN_US);
  const model = new FakePhoneticModel([""]);
  const lesson = new GuidedLesson(settings, keyboard, model, []);
  const progress = new Progress(settings, lesson);
  let results = 0;
  const state = new LessonState(progress, () => {
    results++;
  });

  isTrue(isLessonUnavailable(state.generation));
  isNull(state.textInput);
  equal(state.lines.text, "");
  const input: IInputEvent = {
    type: "input",
    timeStamp: 0,
    inputType: "appendChar",
    codePoint: 0x61,
    timeToType: 0,
  };
  equal(state.onInput(input), Feedback.Failed);
  equal(results, 0);
});

test("reset preserves structured generation metadata", () => {
  const settings = new Settings();
  const lesson = new StructuredLesson(settings);
  const progress = new Progress(settings, lesson);
  const state = new LessonState(progress, () => {});
  const generation = state.generation;

  if (!isSentenceLessonText(generation)) {
    throw new Error("Expected a structured generation");
  }
  isTrue(state.textInput != null);
  equal(lesson.generateCalls, 1);
  equal(state.lines.text, generation.text);
  const initialSuffixLength = state.suffix.length;

  state.onInput({
    type: "input",
    timeStamp: 0,
    inputType: "appendChar",
    codePoint: 0x61,
    timeToType: 0,
  });
  equal(state.suffix.length, initialSuffixLength - 1);

  state.resetLesson();

  equal(state.generation, generation);
  equal(lesson.generateCalls, 1);
  const resetGeneration = state.generation;
  if (!isSentenceLessonText(resetGeneration)) {
    throw new Error("Expected a structured generation after reset");
  }
  equal(resetGeneration.pairs, generation.pairs);
  equal(state.textInput?.text, resetGeneration.text);
  equal(state.suffix.length, initialSuffixLength);
  equal(state.lines.text, generation.text);
});
