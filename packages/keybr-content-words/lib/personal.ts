export const PERSONAL_SOURCE_ID = "ru-personal";
export const PERSONAL_WORD_LIST_ID = "words-ru-personal";
export const PERSONAL_LANGUAGE_ID = "ru";
export const PERSONAL_CORPUS_VERSION = 1;
export const PERSONAL_WORD_COUNT = 1232;
export const PERSONAL_YO_WORD_COUNT = 26;
export const PERSONAL_ALPHABET = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
export const PERSONAL_CORPUS_SHA256 =
  "ab09647a03f1c3439e143ff20372c4d864d792ed42a1f59a5db1920bef35e563";

export type PersonalCorpusManifest = {
  readonly schemaVersion: 1;
  readonly sourceId: typeof PERSONAL_SOURCE_ID;
  readonly wordListId: typeof PERSONAL_WORD_LIST_ID;
  readonly languageId: typeof PERSONAL_LANGUAGE_ID;
  readonly corpusVersion: typeof PERSONAL_CORPUS_VERSION;
  readonly wordCount: typeof PERSONAL_WORD_COUNT;
  readonly corpusSha256: typeof PERSONAL_CORPUS_SHA256;
  readonly provenance: {
    readonly repository: "vitalcc55/keybr-for-me";
    readonly issue: 3;
    readonly url: "https://github.com/vitalcc55/keybr-for-me/issues/3";
  };
};

export function validatePersonalWordList(words: unknown): string[] {
  if (!Array.isArray(words)) {
    throw new TypeError("Personal word list must be a JSON array.");
  }

  const unique = new Set<string>();
  const letters = new Set<string>();
  let yoWordCount = 0;

  for (const [index, word] of words.entries()) {
    if (typeof word !== "string") {
      throw new TypeError(`Personal word ${index} is not a string.`);
    }
    if (word.length === 0) {
      throw new TypeError(`Personal word ${index} is empty.`);
    }
    if (word !== word.normalize("NFC")) {
      throw new TypeError(`Personal word ${index} is not NFC.`);
    }
    if (!/^[а-яё]+$/u.test(word)) {
      throw new TypeError(
        `Personal word ${index} contains a character outside [а-яё]: ${JSON.stringify(word)}.`,
      );
    }
    if (unique.has(word)) {
      throw new TypeError(`Personal word ${index} is a duplicate: ${word}.`);
    }
    unique.add(word);
    if (word.includes("ё")) {
      yoWordCount += 1;
    }
    for (const letter of word) {
      letters.add(letter);
    }
  }

  if (words.length !== PERSONAL_WORD_COUNT) {
    throw new TypeError(
      `Personal word list must contain ${PERSONAL_WORD_COUNT} words; got ${words.length}.`,
    );
  }
  if (yoWordCount !== PERSONAL_YO_WORD_COUNT) {
    throw new TypeError(
      `Personal word list must contain ${PERSONAL_YO_WORD_COUNT} words with ё; got ${yoWordCount}.`,
    );
  }
  if ([...letters].sort().join("") !== [...PERSONAL_ALPHABET].sort().join("")) {
    throw new TypeError(
      "Personal word list does not cover all 33 Russian letters.",
    );
  }

  return [...words];
}

export function formatPersonalWordList(words: readonly string[]): string {
  return words.join(", ");
}

export function parsePersonalWordList(text: string): string[] {
  if (text.length === 0) {
    throw new TypeError("Personal TXT export is empty.");
  }
  if (text.includes("\ufeff")) {
    throw new TypeError("Personal TXT export must not contain a BOM.");
  }
  if (text.includes("\r") || text.includes("\n")) {
    throw new TypeError("Personal TXT export must be a single line.");
  }
  const words = text.split(", ");
  if (words.some((word) => word.length === 0)) {
    throw new TypeError("Personal TXT export contains an empty token.");
  }
  if (words.some((word) => word.trim() !== word)) {
    throw new TypeError("Personal TXT export contains unexpected whitespace.");
  }
  return validatePersonalWordList(words);
}

export function validatePersonalManifest(
  manifest: unknown,
  corpusSha256: string,
): asserts manifest is PersonalCorpusManifest {
  if (manifest == null || typeof manifest !== "object") {
    throw new TypeError("Personal corpus manifest must be an object.");
  }
  const value = manifest as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    value.sourceId !== PERSONAL_SOURCE_ID ||
    value.wordListId !== PERSONAL_WORD_LIST_ID ||
    value.languageId !== PERSONAL_LANGUAGE_ID ||
    value.corpusVersion !== PERSONAL_CORPUS_VERSION ||
    value.wordCount !== PERSONAL_WORD_COUNT ||
    value.corpusSha256 !== PERSONAL_CORPUS_SHA256
  ) {
    throw new TypeError(
      "Personal corpus manifest does not match the v1 contract.",
    );
  }
  if (value.corpusSha256 !== corpusSha256) {
    throw new TypeError(
      `Personal corpus checksum mismatch: expected ${value.corpusSha256}, got ${corpusSha256}.`,
    );
  }
  const provenance = value.provenance;
  if (
    provenance == null ||
    typeof provenance !== "object" ||
    (provenance as Record<string, unknown>).repository !==
      "vitalcc55/keybr-for-me" ||
    (provenance as Record<string, unknown>).issue !== 3 ||
    (provenance as Record<string, unknown>).url !==
      "https://github.com/vitalcc55/keybr-for-me/issues/3"
  ) {
    throw new TypeError("Personal corpus manifest provenance is invalid.");
  }
}
