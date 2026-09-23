#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type SentencePair } from "@keybr/content";
import {
  SENTENCE_ATTRIBUTION,
  SENTENCE_CORPUS_VERSION,
  SENTENCE_GENERATOR_VERSION,
  SENTENCE_LICENSE,
  SENTENCE_RULES_VERSION,
  SENTENCE_SOURCE_ARCHIVE_SHA256,
  SENTENCE_SOURCE_ARCHIVE_URL,
  SENTENCE_SOURCE_ENTRY_NAME,
  SENTENCE_SOURCE_ID,
  SENTENCE_SOURCE_PAGE_URL,
  SENTENCE_SOURCE_UPDATED,
  type SentenceCorpusManifest,
} from "@keybr/content-words/lib/sentence-contract.ts";
import {
  hasControlCharacters,
  isValidEnglishText,
  isValidTranslationText,
} from "@keybr/content-words/lib/sentence-validation.ts";
import { pathTo } from "./root.ts";

type DropReason =
  | "empty-row"
  | "malformed-row"
  | "empty-english"
  | "empty-russian"
  | "control-character"
  | "english-too-long"
  | "english-not-basic"
  | "invalid-attribution";

type AttributionRecord = {
  readonly id: string;
  readonly englishId: number;
  readonly russianId: number;
  readonly attribution: string;
};

type ImportCandidate = {
  readonly pair: SentencePair;
  readonly attribution: string;
  readonly englishId: number;
  readonly russianId: number;
  readonly inputIndex: number;
};

export type SentenceImportResult = {
  readonly pairs: readonly SentencePair[];
  readonly manifest: SentenceCorpusManifest;
  readonly dataText: string;
  readonly attributionText: string;
  readonly manifestText: string;
};

const SOURCE_ENTRY_NAME = SENTENCE_SOURCE_ENTRY_NAME;
const USAGE =
  "Usage: generate-en-ru-sentences.ts --input <absolute-tsv> --archive <zip> [--check]";

export function normalizeSentenceText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u00a0/gu, " ")
    .replace(/[\u2018\u2019\u02bc]/gu, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/gu, '"')
    .replace(/[\u2010-\u2015]/gu, "-")
    .replace(/\u2026/gu, "...")
    .replace(/\s+/gu, " ")
    .trim();
}

export function importSentenceTsv(
  inputBytes: Uint8Array,
  sourceEntryName = SOURCE_ENTRY_NAME,
  sourceArchiveSha256: string,
): SentenceImportResult {
  if (sourceEntryName !== SOURCE_ENTRY_NAME) {
    throw new Error(
      `Sentence TSV must be the ${SOURCE_ENTRY_NAME} archive entry.`,
    );
  }
  assertPinnedArchiveHash(sourceArchiveSha256);
  const sourceTsvSha256 = sha256(inputBytes);
  const { text: inputText, hadBom } = decodeUtf8(inputBytes);
  const lines = inputText.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  const rejected = new Map<DropReason, number>();
  const candidates: ImportCandidate[] = [];
  const exactKeys = new Set<string>();
  let exactDuplicateCount = 0;

  for (const [lineIndex, sourceLine] of lines.entries()) {
    const inputIndex = lineIndex + 1;
    const line = sourceLine.endsWith("\r")
      ? sourceLine.slice(0, -1)
      : sourceLine;
    if (line.length === 0) {
      reject(rejected, "empty-row");
      continue;
    }
    const fields = line.split("\t");
    if (fields.length !== 3) {
      reject(rejected, "malformed-row");
      continue;
    }
    const [rawEnglish, rawRussian, attribution] = fields;
    if (hasControlCharacters(rawEnglish + rawRussian + attribution)) {
      reject(rejected, "control-character");
      continue;
    }
    const english = normalizeSentenceText(rawEnglish);
    const russian = normalizeSentenceText(rawRussian);
    if (english.length === 0) {
      reject(rejected, "empty-english");
      continue;
    }
    if (russian.length === 0) {
      reject(rejected, "empty-russian");
      continue;
    }
    if ([...english].length > 240) {
      reject(rejected, "english-too-long");
      continue;
    }
    if (!isValidEnglishText(english)) {
      reject(rejected, "english-not-basic");
      continue;
    }
    if (!isValidTranslationText(russian)) {
      reject(rejected, "control-character");
      continue;
    }

    const source = parseAttribution(attribution);
    if (source == null) {
      reject(rejected, "invalid-attribution");
      continue;
    }

    const pair: SentencePair = {
      id: `tatoeba:${source.englishId}`,
      en: english,
      ru: russian,
    };
    const exactKey = `${english}\u0000${russian}`;
    if (exactKeys.has(exactKey)) {
      exactDuplicateCount++;
      continue;
    }
    exactKeys.add(exactKey);
    candidates.push({
      pair,
      attribution,
      englishId: source.englishId,
      russianId: source.russianId,
      inputIndex,
    });
  }

  const grouped = new Map<string, ImportCandidate[]>();
  for (const candidate of candidates) {
    const existing = grouped.get(candidate.pair.en);
    if (existing == null) {
      grouped.set(candidate.pair.en, [candidate]);
    } else {
      existing.push(candidate);
    }
  }

  const selected: ImportCandidate[] = [];
  let normalizedEnglishDuplicateCount = 0;
  for (const values of grouped.values()) {
    values.sort(
      (a, b) =>
        a.englishId - b.englishId ||
        compareCodePoints(a.pair.ru, b.pair.ru) ||
        compareCodePoints(a.attribution, b.attribution) ||
        a.inputIndex - b.inputIndex,
    );
    selected.push(values[0]);
    normalizedEnglishDuplicateCount += values.length - 1;
  }
  selected.sort((a, b) => a.inputIndex - b.inputIndex);

  const pairs = selected.map(({ pair }) => pair);
  const selectedIds = new Set<string>();
  for (const pair of pairs) {
    if (selectedIds.has(pair.id)) {
      throw new Error(
        `Sentence import has a duplicate English source ID: ${pair.id}.`,
      );
    }
    selectedIds.add(pair.id);
  }
  if (pairs.length === 0) {
    throw new Error("Sentence import produced no valid pairs.");
  }
  const dataText = `${JSON.stringify(pairs, null, 2)}\n`;
  const attributionRecords: readonly AttributionRecord[] = selected.map(
    ({ pair, attribution, englishId, russianId }) => ({
      id: pair.id,
      englishId,
      russianId,
      attribution,
    }),
  );
  const attributionText = `${JSON.stringify(attributionRecords, null, 2)}\n`;
  const rejectedRecord = Object.fromEntries(rejected);
  const rejectedCount = Object.values(rejectedRecord).reduce(
    (total, count) => total + count,
    0,
  );
  if (
    pairs.length +
      exactDuplicateCount +
      normalizedEnglishDuplicateCount +
      rejectedCount !==
    lines.length
  ) {
    throw new Error("Sentence import accounting does not match input rows.");
  }
  const manifestWithoutGeneratedHash = {
    schemaVersion: 1 as const,
    sourceId: SENTENCE_SOURCE_ID,
    sourcePageUrl: SENTENCE_SOURCE_PAGE_URL,
    sourceArchiveUrl: SENTENCE_SOURCE_ARCHIVE_URL,
    sourceUpdated: SENTENCE_SOURCE_UPDATED,
    corpusVersion: SENTENCE_CORPUS_VERSION,
    sourceEntryName: SENTENCE_SOURCE_ENTRY_NAME,
    sourceTsvSha256,
    sourceArchiveSha256,
    inputByteLength: inputBytes.byteLength,
    listedPairCount: lines.length,
    inputRowCount: lines.length,
    outputPairCount: pairs.length,
    exactDuplicateCount,
    normalizedEnglishDuplicateCount,
    rejected: rejectedRecord,
    attributionFile: "sentences-en-ru.attribution.json" as const,
    attributionSha256: sha256(new TextEncoder().encode(attributionText)),
    attributionPairCount: attributionRecords.length,
    rulesVersion: SENTENCE_RULES_VERSION,
    generatorVersion: SENTENCE_GENERATOR_VERSION,
    idPolicy: "tatoeba:<english-attribution-id>" as const,
    license: SENTENCE_LICENSE,
    attribution: SENTENCE_ATTRIBUTION,
    sourceEncoding: "utf-8" as const,
    sourceBom: hadBom,
  } as const;
  const manifest: SentenceCorpusManifest = {
    ...manifestWithoutGeneratedHash,
    generatedSha256: sha256(new TextEncoder().encode(dataText)),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  return { pairs, manifest, dataText, attributionText, manifestText };
}

function decodeUtf8(inputBytes: Uint8Array): {
  readonly text: string;
  readonly hadBom: boolean;
} {
  const hadBom =
    inputBytes.length >= 3 &&
    inputBytes[0] === 0xef &&
    inputBytes[1] === 0xbb &&
    inputBytes[2] === 0xbf;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(inputBytes);
  } catch (error) {
    throw new Error("Sentence TSV must be valid UTF-8.", { cause: error });
  }
  return { text: text.replace(/^\ufeff/u, ""), hadBom };
}

function parseAttribution(value: string): {
  readonly englishId: number;
  readonly russianId: number;
} | null {
  const match =
    /^CC-BY 2\.0 \(France\) Attribution: tatoeba\.org #(\d+) \((.*?)\) & #(\d+) \((.*?)\)$/u.exec(
      value,
    );
  if (match == null) {
    return null;
  }
  const englishId = Number.parseInt(match[1], 10);
  const russianId = Number.parseInt(match[3], 10);
  if (!Number.isSafeInteger(englishId) || !Number.isSafeInteger(russianId)) {
    return null;
  }
  return { englishId, russianId };
}

function compareCodePoints(left: string, right: string): number {
  const leftCodePoints = [...left].map(
    (character) => character.codePointAt(0)!,
  );
  const rightCodePoints = [...right].map(
    (character) => character.codePointAt(0)!,
  );
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index++) {
    const difference = leftCodePoints[index] - rightCodePoints[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function reject(rejected: Map<DropReason, number>, reason: DropReason): void {
  rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertPinnedArchiveHash(
  value: string,
): asserts value is typeof SENTENCE_SOURCE_ARCHIVE_SHA256 {
  if (value !== SENTENCE_SOURCE_ARCHIVE_SHA256) {
    throw new Error(
      "The source archive hash is not the pinned ManyThings corpus revision.",
    );
  }
}

function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

function parseArgs(args: readonly string[]): {
  readonly check: boolean;
  readonly inputPath: string;
  readonly archivePath: string | null;
  readonly outputPath: string;
  readonly attributionPath: string;
  readonly manifestPath: string;
} {
  let check = false;
  let inputPath: string | null = null;
  let archivePath: string | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--input" && args[index + 1] != null) {
      inputPath = resolve(args[++index]);
    } else if (arg === "--archive" && args[index + 1] != null) {
      archivePath = resolve(args[++index]);
    } else if (!arg.startsWith("--") && inputPath == null) {
      // npm 11 on Windows may strip unknown option names after `--` while
      // forwarding their values. Keep the direct CLI form strict, but accept
      // this positional forwarding shape for the package script.
      inputPath = resolve(arg);
    } else if (!arg.startsWith("--") && archivePath == null) {
      archivePath = resolve(arg);
    } else {
      throw new Error(USAGE);
    }
  }
  if (inputPath == null || archivePath == null) {
    throw new Error(USAGE);
  }
  return {
    check,
    inputPath,
    archivePath,
    outputPath: pathTo("../keybr-content-words/lib/data/sentences-en-ru.json"),
    attributionPath: pathTo(
      "../keybr-content-words/lib/data/sentences-en-ru.attribution.json",
    ),
    manifestPath: pathTo(
      "../keybr-content-words/lib/data/sentences-en-ru.manifest.json",
    ),
  };
}

function run(args: readonly string[]): void {
  const options = parseArgs(args);
  if (!existsSync(options.inputPath)) {
    throw new Error(`Input TSV is missing: ${options.inputPath}`);
  }
  if (options.archivePath == null || !existsSync(options.archivePath)) {
    throw new Error(`Source archive is missing: ${options.archivePath}`);
  }
  const inputBytes = readFileSync(options.inputPath);
  const archiveSha256 = sha256File(options.archivePath);
  const result = importSentenceTsv(
    inputBytes,
    basename(options.inputPath),
    archiveSha256,
  );

  if (options.check) {
    assertFile(options.outputPath, result.dataText);
    assertFile(options.attributionPath, result.attributionText);
    assertFile(options.manifestPath, result.manifestText);
    console.log(
      `Checked ${result.pairs.length} sentence pairs (${result.manifest.sourceTsvSha256}); no files written.`,
    );
  } else {
    writeGeneratedFile(options.outputPath, result.dataText);
    writeGeneratedFile(options.attributionPath, result.attributionText);
    writeGeneratedFile(options.manifestPath, result.manifestText);
    console.log(
      `Generated sentence data, attribution, and manifest (${result.pairs.length} pairs).`,
    );
  }
}

function writeGeneratedFile(path: string, value: string): void {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, value, "utf8");
  renameSync(temporaryPath, path);
}

function assertFile(path: string, expected: string): void {
  if (!existsSync(path)) {
    throw new Error(`Generated file is missing: ${path}`);
  }
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) {
    throw new Error(
      `Generated file differs from deterministic output: ${path}`,
    );
  }
}

if (
  process.argv[1] != null &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
) {
  run(process.argv.slice(2));
}
