#!/usr/bin/env -S npx tsnode

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  formatPersonalWordList,
  parsePersonalWordList,
  PERSONAL_CORPUS_SHA256,
  PERSONAL_WORD_LIST_ID,
  validatePersonalManifest,
  validatePersonalWordList,
} from "@keybr/content-words/lib/personal.ts";
import { pathTo } from "./root.ts";

const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const exportWords = args.has("--export") || !check;
const unknownArgs = [...args].filter(
  (arg) => arg !== "--check" && arg !== "--export",
);
if (unknownArgs.length > 0 || (check && args.has("--export"))) {
  throw new Error("Usage: generate-personal.ts [--export | --check]");
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
if (check) {
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
  console.log(
    `Checked ${words.length} personal words (${manifest.corpusSha256}); no files written.`,
  );
} else if (exportWords) {
  writeFileSync(textPath, Buffer.from(text, "utf8"));
  console.log(`Generated ${textPath} from ${wordsPath}.`);
}
