import {
  type Keyboard,
  KeyboardOptions,
  type WeightedCodePointSet,
} from "@keybr/keyboard";
import { type Letter, PhoneticModel } from "@keybr/phonetic-model";
import { LCG, type RNGStream } from "@keybr/rand";
import { type KeyStatsMap, type Result, ResultGroups } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { type StyledText } from "@keybr/textinput";
import { type LessonKeys } from "./key.ts";

export type LessonUnavailableReason = "empty-word-list" | "no-valid-candidates";

export type LessonUnavailableAction = "settings" | "word-list";

export type LessonUnavailable = {
  readonly kind: "unavailable";
  readonly origin: "guided" | "word-list";
  readonly fallbackUsed: boolean;
  readonly reason: LessonUnavailableReason;
  readonly action: LessonUnavailableAction;
  readonly candidateCount?: number;
};

export type LessonGenerationResult = StyledText | LessonUnavailable;

export function lessonUnavailable(
  origin: LessonUnavailable["origin"],
  fallbackUsed: boolean,
  reason: LessonUnavailableReason,
  action: LessonUnavailableAction,
  candidateCount?: number,
): LessonUnavailable {
  return {
    kind: "unavailable",
    origin,
    fallbackUsed,
    reason,
    action,
    candidateCount,
  };
}

export function isLessonUnavailable(
  result: LessonGenerationResult,
): result is LessonUnavailable {
  return (
    typeof result === "object" &&
    result != null &&
    "kind" in result &&
    result.kind === "unavailable"
  );
}

export abstract class Lesson {
  static rng: RNGStream = LCG(Date.now());

  readonly settings: Settings;
  readonly keyboard: Keyboard;
  readonly codePoints: WeightedCodePointSet;
  readonly model: PhoneticModel;

  protected constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
  ) {
    this.settings = settings;
    this.keyboard = keyboard;
    this.codePoints = keyboard.getCodePoints();
    this.model = PhoneticModel.restrict(model, this.codePoints);
  }

  filter(results: readonly Result[]): readonly Result[] {
    return ResultGroups.byLayoutFamily(results).get(
      KeyboardOptions.from(this.settings).layout.family,
    );
  }

  abstract get letters(): readonly Letter[];

  abstract update(keyStatsMap: KeyStatsMap): LessonKeys;

  abstract generate(
    lessonKeys: LessonKeys,
    rng: RNGStream,
  ): LessonGenerationResult;
}
