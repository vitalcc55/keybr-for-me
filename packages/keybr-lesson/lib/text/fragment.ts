import { type Settings } from "@keybr/settings";
import {
  type LessonGenerationResult,
  type LessonUnavailable,
} from "../lesson.ts";
import { lessonProps } from "../settings.ts";
import { type WordGenerator } from "./words.ts";

export function generateFragment(
  settings: Settings,
  nextWord: WordGenerator,
  {
    repeatWords = 1,
    unavailable,
  }: {
    readonly repeatWords?: number;
    readonly unavailable?: LessonUnavailable;
  } = {},
): LessonGenerationResult {
  const length = lessonTextLength(settings);
  const words: string[] = [];
  let wordsLength = 0;
  while (true) {
    let word = nextWord();
    if (word == null || word === "") {
      if (unavailable != null) {
        return unavailable;
      }
      word = "?";
    }
    for (let i = 1; i <= repeatWords; i++) {
      words.push(word);
      wordsLength += word.length;
      if (wordsLength >= length) {
        return words.join(" ");
      }
    }
  }
}

export function lessonTextLength(settings: Settings): number {
  return 100 + Math.round(settings.get(lessonProps.length) * 100);
}
