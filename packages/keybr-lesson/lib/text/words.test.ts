import { test } from "node:test";
import { Language } from "@keybr/keyboard";
import { FakePhoneticModel, Filter, Letter } from "@keybr/phonetic-model";
import { FakeRNGStream } from "@keybr/rand";
import { equal, isFalse, isNull, isTrue } from "rich-assert";
import {
  isValidCandidate,
  mangledWords,
  phoneticWords,
  randomWords,
  uniqueWords,
  wordSequence,
} from "./words.ts";

test("random words", () => {
  const rng = FakeRNGStream(3);

  isNull(randomWords([], rng)());

  const wordList = ["a", "b", "c"];

  equal(randomWords(wordList, rng)(), "a");
  equal(randomWords(wordList, rng)(), "b");
  equal(randomWords(wordList, rng)(), "c");
});

test("word sequence", () => {
  isNull(wordSequence([], { wordIndex: 0 })());

  const wordList = ["a", "b", "c"];
  const cursor = { wordIndex: 100 };

  equal(wordSequence(wordList, cursor)(), "a");
  equal(cursor.wordIndex, 1);
  equal(wordSequence(wordList, cursor)(), "b");
  equal(cursor.wordIndex, 2);
  equal(wordSequence(wordList, cursor)(), "c");
  equal(cursor.wordIndex, 3);
  equal(wordSequence(wordList, cursor)(), "a");
  equal(cursor.wordIndex, 1);
});

test("unique words", () => {
  isNull(uniqueWords(wordSequence([], { wordIndex: 0 }))());
  isNull(uniqueWords(randomWords([], () => 0))());

  const words = uniqueWords(
    wordSequence(["a", "a", "b", "b", "c"], { wordIndex: 0 }),
  );

  equal(words(), "a");
  equal(words(), "b");
  equal(words(), "c");
  equal(words(), "a");
  equal(words(), "b");
});

test("validate phonetic candidates against length and focus", () => {
  const a = new Letter(0x61, 1);
  const filter = new Filter([a, new Letter(0x62, 1)], a);

  isTrue(isValidCandidate("aba", filter));
  isFalse(isValidCandidate("ab", filter));
  isFalse(isValidCandidate("bbb", filter));
  isFalse(isValidCandidate("a-", filter));
});

test("does not add a retry layer over the model budget", () => {
  class RejectingModel extends FakePhoneticModel {
    calls = 0;

    override nextWord(): string {
      this.calls++;
      return "";
    }
  }

  const model = new RejectingModel();
  const letter = FakePhoneticModel.letter1;
  const filter = new Filter([letter], letter);

  isNull(phoneticWords(model, filter, () => 0)());
  equal(model.calls, 1);
});

test("propagate an unavailable hyphen suffix", () => {
  const punctuators = Letter.punctuators.filter(({ codePoint }) => {
    return codePoint === 0x2d;
  });
  let calls = 0;
  const word = mangledWords(
    () => (calls++ === 0 ? "abc" : null),
    Language.EN,
    punctuators,
    { withPunctuators: 1 },
    () => 0,
  );

  isNull(word());
});
