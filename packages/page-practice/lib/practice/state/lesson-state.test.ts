import { test } from "node:test";
import { Layout, loadKeyboard } from "@keybr/keyboard";
import { GuidedLesson, isLessonUnavailable, lessonProps } from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { Settings } from "@keybr/settings";
import { Feedback } from "@keybr/textinput";
import { type IInputEvent } from "@keybr/textinput-events";
import { equal, isNull, isTrue } from "rich-assert";
import { LessonState } from "./lesson-state.ts";
import { Progress } from "./progress.ts";

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
