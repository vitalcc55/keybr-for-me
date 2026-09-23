import { type WordList, type WordListPolicy } from "@keybr/content";
import { type Keyboard } from "@keybr/keyboard";
import { Filter, Letter, type PhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type KeyStatsMap } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { Dictionary, filterWordList } from "./dictionary.ts";
import { findWeakestKey, LessonKey, LessonKeys } from "./key.ts";
import { Lesson, lessonUnavailable } from "./lesson.ts";
import { lessonProps } from "./settings.ts";
import { Target } from "./target.ts";
import { generateFragment } from "./text/fragment.ts";
import {
  isValidCandidate,
  mangledWords,
  phoneticWords,
  randomWords,
  uniqueWords,
} from "./text/words.ts";

const STANDARD_RU_LETTER_ORDER = "атиоеёнркслйвьыдумячзжгбпцшщхюфэъ";

export class GuidedLesson extends Lesson {
  readonly dictionary: Dictionary;

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    wordList: WordList,
    readonly policy: WordListPolicy = {
      source: "ru-standard",
      limit: 1000,
      naturalWordLimit: 1000,
    },
  ) {
    super(settings, keyboard, model);
    this.dictionary = new Dictionary(
      filterWordList(wordList, this.codePoints).filter(
        (word) => word.length > 2,
      ),
    );
  }

  override get letters() {
    return this.model.letters;
  }

  override update(keyStatsMap: KeyStatsMap) {
    const alphabetSize = this.settings.get(lessonProps.guided.alphabetSize);
    const recoverKeys = this.settings.get(lessonProps.guided.recoverKeys);

    const letters = this.#getLetters();

    const minSize = 6;
    const maxSize =
      minSize + Math.round((letters.length - minSize) * alphabetSize);

    const target = new Target(this.settings);

    const lessonKeys = new LessonKeys(
      letters.map((letter) => LessonKey.from(keyStatsMap.get(letter), target)),
    );

    for (const lessonKey of lessonKeys) {
      const includedKeys = lessonKeys.findIncludedKeys();

      if (includedKeys.length < minSize) {
        // Meet the minimal required alphabet size.
        lessonKeys.include(lessonKey.letter);
        continue;
      }

      if (includedKeys.length < maxSize) {
        // Meet the maximal required alphabet size.
        lessonKeys.force(lessonKey.letter);
        continue;
      }

      if ((lessonKey.bestConfidence ?? 0) >= 1) {
        // Must include all confident keys.
        lessonKeys.include(lessonKey.letter);
        continue;
      }

      if (recoverKeys) {
        if (includedKeys.every((key) => (key.confidence ?? 0) >= 1)) {
          // Include a new key only when all the previous keys
          // are now above the target speed.
          lessonKeys.include(lessonKey.letter);
          continue;
        }
      } else {
        if (includedKeys.every((key) => (key.bestConfidence ?? 0) >= 1)) {
          // Include a new key only when all the previous keys
          // were once above the target speed.
          lessonKeys.include(lessonKey.letter);
          continue;
        }
      }
    }

    // Find the least confident of all included keys and focus on it.
    const confidenceOf = (key: LessonKey): number => {
      return recoverKeys ? (key.confidence ?? 0) : (key.bestConfidence ?? 0);
    };
    const weakestKeys = lessonKeys
      .findIncludedKeys()
      .filter((key) => confidenceOf(key) < 1);
    const weakestKey = findWeakestKey(
      weakestKeys,
      recoverKeys ? "current" : "best",
    );
    if (weakestKey != null) {
      lessonKeys.focus(weakestKey.letter);
    }

    return lessonKeys;
  }

  override generate(lessonKeys: LessonKeys, rng: RNGStream) {
    const filter = new Filter(
      lessonKeys.findIncludedKeys(),
      lessonKeys.findFocusedKey(),
    );
    const { wordGenerator, fallbackUsed, candidateCount } =
      this.#makeWordGenerator(filter, rng);
    const words = mangledWords(
      uniqueWords(wordGenerator),
      this.model.language,
      Letter.restrict(Letter.punctuators, this.codePoints),
      {
        withCapitals: this.settings.get(lessonProps.capitals),
        withPunctuators: this.settings.get(lessonProps.punctuators),
      },
      rng,
    );
    return generateFragment(this.settings, words, {
      repeatWords: this.settings.get(lessonProps.repeatWords),
      unavailable: lessonUnavailable(
        "guided",
        fallbackUsed,
        "no-valid-candidates",
        "settings",
        candidateCount,
      ),
    });
  }

  #getLetters() {
    const letters =
      this.policy.source === "ru-personal"
        ? standardRussianOrder(this.model.letters)
        : this.model.letters;
    const { codePoints } = this;
    if (this.settings.get(lessonProps.guided.keyboardOrder)) {
      return Letter.weightedFrequencyOrder(letters, ({ codePoint }) =>
        codePoints.weight(codePoint),
      );
    } else if (this.policy.source === "ru-personal") {
      return letters;
    } else {
      return Letter.frequencyOrder(letters);
    }
  }

  #makeWordGenerator(filter: Filter, rng: RNGStream) {
    const pseudoWords = phoneticWords(this.model, filter, rng);
    if (this.settings.get(lessonProps.guided.naturalWords)) {
      const words = this.dictionary
        .find(filter)
        .filter((word) => isValidCandidate(word, filter));
      if (this.policy.naturalWordLimit != null) {
        words.splice(this.policy.naturalWordLimit);
      }
      const candidateCount = words.length;
      const fallbackUsed = words.length < 15;
      const maxFallbackAttempts = 15;
      let fallbackAttempts = 0;
      while (words.length < 15 && fallbackAttempts < maxFallbackAttempts) {
        fallbackAttempts++;
        const word = pseudoWords();
        if (word != null) {
          words.push(word);
        }
      }
      return {
        wordGenerator: randomWords(words, rng),
        fallbackUsed,
        candidateCount,
      };
    }
    return {
      wordGenerator: pseudoWords,
      fallbackUsed: false,
    };
  }
}

function standardRussianOrder(letters: readonly Letter[]): Letter[] {
  const order = new Map(
    [...STANDARD_RU_LETTER_ORDER].map((letter, index) => [
      letter.codePointAt(0)!,
      index,
    ]),
  );
  return [...letters].sort(
    (a, b) =>
      (order.get(a.codePoint) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.codePoint) ?? Number.MAX_SAFE_INTEGER) ||
      a.codePoint - b.codePoint,
  );
}
