import { type SentencePair } from "@keybr/content";
import { filterText, type Keyboard } from "@keybr/keyboard";
import { type PhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type KeyStatsMap, Result, TextType } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { type CodePoint, toCodePoints } from "@keybr/unicode";
import { findWeakestKey, LessonKeys } from "./key.ts";
import {
  Lesson,
  type LessonGenerationResult,
  lessonUnavailable,
} from "./lesson.ts";
import { Target } from "./target.ts";
import { lessonTextLength } from "./text/fragment.ts";

const SPECIALIZED_ATTEMPT_RATIO = 0.8;
const MAX_SENTENCE_ATTEMPTS = 64;

export class SentenceLesson extends Lesson {
  readonly pairs: readonly SentencePair[];
  readonly #pairsByLetter: ReadonlyMap<CodePoint, readonly SentencePair[]>;

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    pairs: readonly SentencePair[],
  ) {
    super(settings, keyboard, model);
    const letters = new Set(
      this.model.letters.map(({ codePoint }) => codePoint),
    );
    const validPairs = pairs
      .filter((pair) => filterText(pair.en, this.codePoints) === pair.en)
      .map((pair) => Object.freeze({ ...pair }));
    this.pairs = Object.freeze([...validPairs]);

    const pairsByLetter = new Map<CodePoint, SentencePair[]>();
    for (const pair of this.pairs) {
      const seen = new Set<CodePoint>();
      for (const codePoint of toCodePoints(
        this.model.language.lowerCase(pair.en),
      )) {
        if (!letters.has(codePoint) || seen.has(codePoint)) {
          continue;
        }
        seen.add(codePoint);
        const indexed = pairsByLetter.get(codePoint);
        if (indexed == null) {
          pairsByLetter.set(codePoint, [pair]);
        } else {
          indexed.push(pair);
        }
      }
    }
    this.#pairsByLetter = new Map(
      [...pairsByLetter].map(([codePoint, indexed]) => [
        codePoint,
        Object.freeze([...indexed]),
      ]),
    );
  }

  override get letters() {
    return this.model.letters;
  }

  override get textType() {
    return TextType.NATURAL;
  }

  override update(keyStatsMap: KeyStatsMap) {
    const lessonKeys = LessonKeys.includeAll(
      keyStatsMap,
      new Target(this.settings),
    );
    const candidateKeys = lessonKeys
      .findIncludedKeys()
      .filter((key) => this.#pairsByLetter.has(key.letter.codePoint))
      .filter((key) => (key.confidence ?? 0) < 1);
    const weakestKey = findWeakestKey(candidateKeys, "current");
    if (weakestKey != null) {
      lessonKeys.focus(weakestKey.letter);
    }
    return lessonKeys;
  }

  override generate(
    lessonKeys: LessonKeys,
    rng: RNGStream,
  ): LessonGenerationResult {
    if (this.pairs.length === 0) {
      return lessonUnavailable(
        "sentences",
        false,
        "empty-word-list",
        "settings",
        0,
      );
    }

    const focusedKey = lessonKeys.findFocusedKey();
    const focusedPairs = focusedKey
      ? (this.#pairsByLetter.get(focusedKey.letter.codePoint) ?? [])
      : [];
    const selected: SentencePair[] = [];
    const selectedIds = new Set<string>();
    const focusedIds = new Set(focusedPairs.map(({ id }) => id));
    let selectedFocusedCount = 0;
    const targetLength = lessonTextLength(this.settings);
    let selectedTextLength = 0;

    for (
      let attempts = 0;
      attempts < MAX_SENTENCE_ATTEMPTS && selected.length < this.pairs.length;
      attempts++
    ) {
      const hasFocusedPair = focusedPairs.length > selectedFocusedCount;
      const useFocused = hasFocusedPair && rng() < SPECIALIZED_ATTEMPT_RATIO;
      let pair = chooseUnselectedPair(
        useFocused ? focusedPairs : this.pairs,
        rng,
        selectedIds,
      );
      if (pair == null && useFocused) {
        pair = chooseUnselectedPair(this.pairs, rng, selectedIds);
      }
      if (pair == null) {
        break;
      }
      selectedIds.add(pair.id);
      if (focusedIds.has(pair.id)) {
        selectedFocusedCount++;
      }
      selected.push(pair);
      selectedTextLength += (selectedTextLength > 0 ? 1 : 0) + pair.en.length;
      if (selectedTextLength >= targetLength) {
        break;
      }
    }

    if (selected.length === 0 || selectedTextLength < Result.filter.minLength) {
      return lessonUnavailable(
        "sentences",
        false,
        "no-valid-candidates",
        "settings",
        this.pairs.length,
      );
    }
    return {
      kind: "sentences",
      text: selected.map(({ en }) => en).join(" "),
      pairs: Object.freeze(selected),
    };
  }
}

function chooseUnselectedPair(
  pairs: readonly SentencePair[],
  rng: RNGStream,
  selectedIds: ReadonlySet<string>,
): SentencePair | null {
  if (pairs.length === 0) {
    return null;
  }
  const randomAttempts = Math.min(8, pairs.length);
  for (let attempt = 0; attempt < randomAttempts; attempt++) {
    const pair = pairs[(rng() * pairs.length) | 0];
    if (pair != null && !selectedIds.has(pair.id)) {
      return pair;
    }
  }
  const scanLimit = Math.min(
    pairs.length,
    MAX_SENTENCE_ATTEMPTS + selectedIds.size,
  );
  for (let index = 0; index < scanLimit; index++) {
    const pair = pairs[index];
    if (pair != null && !selectedIds.has(pair.id)) {
      return pair;
    }
  }
  return null;
}
