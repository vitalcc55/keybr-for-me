import { keyboardProps, type KeyId } from "@keybr/keyboard";
import {
  type DailyGoal,
  getLessonText,
  isLessonUnavailable,
  Lesson,
  type LessonGenerationResult,
  type LessonKeys,
} from "@keybr/lesson";
import {
  type KeyStatsMap,
  Result,
  type StreakList,
  type SummaryStats,
} from "@keybr/result";
import { type Settings } from "@keybr/settings";
import {
  Feedback,
  type LineList,
  makeStats,
  type TextDisplaySettings,
  TextInput,
  type TextInputSettings,
  toTextDisplaySettings,
  toTextInputSettings,
} from "@keybr/textinput";
import { type IInputEvent } from "@keybr/textinput-events";
import { type CodePoint } from "@keybr/unicode";
import { type LastLesson } from "./last-lesson.ts";
import { type Progress } from "./progress.ts";

export class LessonState {
  readonly #onResult: (result: Result, textInput: TextInput) => void;
  readonly settings: Settings;
  readonly lesson: Lesson;
  readonly textInputSettings: TextInputSettings;
  readonly textDisplaySettings: TextDisplaySettings;
  readonly keyStatsMap: KeyStatsMap;
  readonly summaryStats: SummaryStats;
  readonly streakList: StreakList;
  readonly dailyGoal: DailyGoal;
  readonly lessonKeys: LessonKeys;

  lastLesson: LastLesson | null = null;

  generation!: LessonGenerationResult; // Mutable.
  textInput: TextInput | null = null; // Mutable.
  lines: LineList = { text: "", lines: [] }; // Mutable.
  suffix: readonly CodePoint[] = []; // Mutable.
  depressedKeys: readonly KeyId[] = []; // Mutable.

  constructor(
    progress: Progress,
    onResult: (result: Result, textInput: TextInput) => void,
  ) {
    this.#onResult = onResult;
    this.settings = progress.settings;
    this.lesson = progress.lesson;
    this.textInputSettings = toTextInputSettings(this.settings);
    this.textDisplaySettings = toTextDisplaySettings(this.settings);
    this.keyStatsMap = progress.keyStatsMap.copy();
    this.summaryStats = progress.summaryStats.copy();
    this.streakList = progress.streakList.copy();
    this.dailyGoal = progress.dailyGoal.copy();
    this.lessonKeys = this.lesson.update(this.keyStatsMap);
    this.#reset(this.lesson.generate(this.lessonKeys, Lesson.rng));
  }

  resetLesson() {
    if (this.textInput != null) {
      this.#reset(this.generation);
    }
  }

  skipLesson() {
    this.#reset(this.lesson.generate(this.lessonKeys, Lesson.rng));
  }

  onInput(event: IInputEvent): Feedback {
    const textInput = this.textInput;
    if (textInput == null) {
      return Feedback.Failed;
    }
    const feedback = textInput.onInput(event);
    this.lines = textInput.lines;
    this.suffix = textInput.remaining.map(({ codePoint }) => codePoint);
    if (textInput.completed) {
      this.#onResult(this.#makeResult(textInput), textInput);
    }
    return feedback;
  }

  #reset(generation: LessonGenerationResult) {
    this.generation = generation;
    if (isLessonUnavailable(generation)) {
      this.textInput = null;
      this.lines = { text: "", lines: [] };
      this.suffix = [];
      return;
    }
    const textInput = new TextInput(
      getLessonText(generation),
      this.textInputSettings,
    );
    this.textInput = textInput;
    this.lines = textInput.lines;
    this.suffix = textInput.remaining.map(({ codePoint }) => codePoint);
  }

  #makeResult(textInput: TextInput, timeStamp = Date.now()) {
    return Result.fromStats(
      this.settings.get(keyboardProps.layout),
      this.lesson.textType,
      timeStamp,
      makeStats(textInput.steps),
    );
  }
}
