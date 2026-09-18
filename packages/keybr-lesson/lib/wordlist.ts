import { type WordList, type WordListPolicy } from "@keybr/content";
import { type Keyboard } from "@keybr/keyboard";
import { Letter, type PhoneticModel } from "@keybr/phonetic-model";
import { type RNGStream } from "@keybr/rand";
import { type KeyStatsMap } from "@keybr/result";
import { type Settings } from "@keybr/settings";
import { filterWordList } from "./dictionary.ts";
import { LessonKeys } from "./key.ts";
import { Lesson } from "./lesson.ts";
import { lessonProps } from "./settings.ts";
import { Target } from "./target.ts";
import { generateFragment } from "./text/fragment.ts";
import { mangledWords, randomWords, uniqueWords } from "./text/words.ts";

export class WordListLesson extends Lesson {
  readonly wordList: WordList;
  readonly filteredWordCount: number;

  constructor(
    settings: Settings,
    keyboard: Keyboard,
    model: PhoneticModel,
    wordList: WordList,
    readonly policy: WordListPolicy = {
      source: "ru-standard",
      limit: settings.get(lessonProps.wordList.wordListSize),
      naturalWordLimit: 1000,
    },
  ) {
    super(settings, keyboard, model);
    const limit = policy.limit;
    const longWordsOnly = settings.get(lessonProps.wordList.longWordsOnly);
    const filtered = filterWordList(wordList, this.codePoints).filter(
      (word) => !longWordsOnly || word.length > 3,
    );
    this.filteredWordCount = filtered.length;
    this.wordList = limit === "all" ? filtered : filtered.slice(0, limit);
  }

  override get letters() {
    return this.model.letters;
  }

  override update(keyStatsMap: KeyStatsMap) {
    return LessonKeys.includeAll(keyStatsMap, new Target(this.settings));
  }

  override generate(lessonKeys: LessonKeys, rng: RNGStream) {
    const wordGenerator = randomWords(this.wordList, rng);
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
    });
  }
}
