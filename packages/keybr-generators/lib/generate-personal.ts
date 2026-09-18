#!/usr/bin/env -S npx tsnode

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  formatPersonalWordList,
  parsePersonalWordList,
  PERSONAL_ALPHABET,
  PERSONAL_CORPUS_SHA256,
  PERSONAL_MODEL_GENERATOR_VERSION,
  PERSONAL_MODEL_ID,
  PERSONAL_MODEL_ORDER,
  PERSONAL_MODEL_VERSION,
  PERSONAL_MODEL_WORD_COUNT,
  PERSONAL_WORD_LIST_ID,
  validatePersonalManifest,
  validatePersonalModelManifest,
  validatePersonalWordList,
} from "@keybr/content-words/lib/personal.ts";
import { Language } from "@keybr/keyboard";
import { TransitionTable, TransitionTableBuilder } from "@keybr/phonetic-model";
import { toCodePoints } from "@keybr/unicode";
import { pathTo } from "./root.ts";

const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const model = args.has("--model");
const exportWords = args.has("--export") || model || !check;
const unknownArgs = [...args].filter(
  (arg) => !["--check", "--export", "--model"].includes(arg),
);
if (
  unknownArgs.length > 0 ||
  (check && (args.has("--export") || model)) ||
  (args.has("--export") && model)
) {
  throw new Error("Usage: generate-personal.ts [--export | --model | --check]");
}

const wordsPath = pathTo(
  "../keybr-content-words/lib/data/words-ru-personal.json",
);
const manifestPath = pathTo(
  "../keybr-content-words/lib/data/words-ru-personal.manifest.json",
);
const textPath = pathTo(
  "../keybr-content-words/lib/data/words-ru-personal.txt",
);
const modelPath = pathTo(
  "../keybr-phonetic-model/assets/model-ru-personal.data",
);

const words = validatePersonalWordList(
  JSON.parse(readFileSync(wordsPath, "utf8")) as unknown,
);
const corpusSha256 = createHash("sha256")
  .update(Buffer.from(words.join("\n"), "utf8"))
  .digest("hex");
if (corpusSha256 !== PERSONAL_CORPUS_SHA256) {
  throw new Error(
    `Personal corpus checksum mismatch: expected ${PERSONAL_CORPUS_SHA256}, got ${corpusSha256}.`,
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
validatePersonalManifest(manifest, corpusSha256);
if (manifest.wordListId !== PERSONAL_WORD_LIST_ID) {
  throw new Error("Personal corpus manifest word-list identity is invalid.");
}

const text = formatPersonalWordList(words);
const modelData = buildPersonalModel(words);
const modelSha256 = createHash("sha256").update(modelData).digest("hex");

if (check) {
  checkTextExport(text);
  if (!existsSync(modelPath)) {
    throw new Error(`Personal phonetic model is missing: ${modelPath}`);
  }
  const storedModel = readFileSync(modelPath);
  if (!storedModel.equals(modelData)) {
    throw new Error(
      "Personal phonetic model differs from the canonical JSON source.",
    );
  }
  validatePersonalModelManifest(manifest, corpusSha256, modelSha256);
  console.log(
    `Checked ${words.length} personal words and model (${modelSha256}); no files written.`,
  );
} else {
  if (exportWords) {
    writeFileSync(textPath, Buffer.from(text, "utf8"));
  }
  if (model) {
    writeFileSync(modelPath, modelData);
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          ...manifest,
          modelId: PERSONAL_MODEL_ID,
          modelVersion: PERSONAL_MODEL_VERSION,
          modelSha256,
          generatorVersion: PERSONAL_MODEL_GENERATOR_VERSION,
          order: PERSONAL_MODEL_ORDER,
          alphabet: PERSONAL_ALPHABET,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Generated ${modelPath} (${modelSha256}).`);
  } else if (exportWords) {
    console.log(`Generated ${textPath} from ${wordsPath}.`);
  }
}

function checkTextExport(text: string): void {
  if (!existsSync(textPath)) {
    throw new Error(`Personal TXT export is missing: ${textPath}`);
  }
  const exported = readFileSync(textPath);
  if (!exported.equals(Buffer.from(text, "utf8"))) {
    throw new Error(
      "Personal TXT export differs from the canonical JSON source.",
    );
  }
  parsePersonalWordList(exported.toString("utf8"));
}

function buildPersonalModel(words: readonly string[]): Uint8Array {
  const alphabet = [...toCodePoints(PERSONAL_ALPHABET)];
  const allowed = new Set(alphabet);
  const modelWords = words.filter((word) => [...word].length >= 3);
  if (modelWords.length !== PERSONAL_MODEL_WORD_COUNT) {
    throw new Error(
      `Personal model must use ${PERSONAL_MODEL_WORD_COUNT} words; got ${modelWords.length}.`,
    );
  }
  for (const [index, word] of modelWords.entries()) {
    for (const codePoint of toCodePoints(word)) {
      if (!allowed.has(codePoint)) {
        throw new Error(
          `Personal model word ${index} contains an unknown code point: ${word}.`,
        );
      }
    }
  }

  const builder = new TransitionTableBuilder(4, [0x0020, ...alphabet]);
  for (const word of modelWords) {
    builder.append(word);
  }
  const data = builder.build().compress();
  const table = TransitionTable.load(data);
  const roundTrip = table.compress();
  if (
    table.order !== PERSONAL_MODEL_ORDER ||
    String.fromCodePoint(...table.alphabet) !== ` ${PERSONAL_ALPHABET}` ||
    roundTrip.length !== data.length ||
    !roundTrip.every((value, index) => value === data[index])
  ) {
    throw new Error("Personal phonetic model binary contract is invalid.");
  }
  for (const letter of table.letters(Language.RU)) {
    if (letter.codePoint !== 0x0020 && !(letter.f > 0)) {
      throw new Error(
        `Personal phonetic model has no positive frequency for ${letter.label}.`,
      );
    }
  }
  return data;
}
