import { type SentencePair } from "@keybr/content";
import manifest from "./data/sentences-en-ru.manifest.json" with { type: "json" };
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
} from "./sentence-contract.ts";
import {
  isValidEnglishText,
  isValidTranslationText,
} from "./sentence-validation.ts";
export * from "./sentence-contract.ts";

export function validateSentencePairs(value: unknown): readonly SentencePair[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("Sentence corpus must be a non-empty JSON array.");
  }

  const ids = new Set<string>();
  const english = new Set<string>();
  const pairs: SentencePair[] = [];
  for (const [index, item] of value.entries()) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(`Sentence pair ${index} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record).sort().join(",");
    if (keys !== "en,id,ru") {
      throw new TypeError(`Sentence pair ${index} has an invalid shape.`);
    }
    const { id, en, ru } = record;
    if (typeof id !== "string" || !/^tatoeba:\d+$/u.test(id)) {
      throw new TypeError(`Sentence pair ${index} has an invalid id.`);
    }
    if (typeof en !== "string" || !isValidEnglishText(en)) {
      throw new TypeError(`Sentence pair ${index} has invalid English text.`);
    }
    if (typeof ru !== "string" || !isValidTranslationText(ru)) {
      throw new TypeError(`Sentence pair ${index} has invalid Russian text.`);
    }
    if (ids.has(id)) {
      throw new TypeError(`Sentence pair ${index} duplicates id ${id}.`);
    }
    if (english.has(en)) {
      throw new TypeError(
        `Sentence pair ${index} duplicates normalized English text.`,
      );
    }
    ids.add(id);
    english.add(en);
    pairs.push({ id, en, ru });
  }
  return pairs;
}

export function validateSentenceManifest(
  value: unknown,
): asserts value is SentenceCorpusManifest {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Sentence corpus manifest must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.sourceId !== SENTENCE_SOURCE_ID ||
    record.sourcePageUrl !== SENTENCE_SOURCE_PAGE_URL ||
    record.sourceArchiveUrl !== SENTENCE_SOURCE_ARCHIVE_URL ||
    record.sourceUpdated !== SENTENCE_SOURCE_UPDATED ||
    record.corpusVersion !== SENTENCE_CORPUS_VERSION ||
    record.rulesVersion !== SENTENCE_RULES_VERSION ||
    record.generatorVersion !== SENTENCE_GENERATOR_VERSION ||
    record.idPolicy !== "tatoeba:<english-attribution-id>" ||
    record.license !== SENTENCE_LICENSE ||
    record.attribution !== SENTENCE_ATTRIBUTION ||
    record.sourceEntryName !== SENTENCE_SOURCE_ENTRY_NAME ||
    record.sourceEncoding !== "utf-8" ||
    typeof record.sourceBom !== "boolean" ||
    typeof record.sourceTsvSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.sourceTsvSha256) ||
    record.sourceArchiveSha256 !== SENTENCE_SOURCE_ARCHIVE_SHA256 ||
    typeof record.inputByteLength !== "number" ||
    !Number.isSafeInteger(record.inputByteLength) ||
    (record.inputByteLength as number) < 0 ||
    typeof record.listedPairCount !== "number" ||
    !Number.isSafeInteger(record.listedPairCount) ||
    (record.listedPairCount as number) < 0 ||
    typeof record.inputRowCount !== "number" ||
    !Number.isSafeInteger(record.inputRowCount) ||
    (record.inputRowCount as number) < 0 ||
    typeof record.outputPairCount !== "number" ||
    !Number.isSafeInteger(record.outputPairCount) ||
    (record.outputPairCount as number) < 0 ||
    typeof record.exactDuplicateCount !== "number" ||
    !Number.isSafeInteger(record.exactDuplicateCount) ||
    (record.exactDuplicateCount as number) < 0 ||
    typeof record.normalizedEnglishDuplicateCount !== "number" ||
    !Number.isSafeInteger(record.normalizedEnglishDuplicateCount) ||
    (record.normalizedEnglishDuplicateCount as number) < 0 ||
    !isDropReasonRecord(record.rejected) ||
    record.attributionFile !== "sentences-en-ru.attribution.json" ||
    typeof record.attributionSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.attributionSha256) ||
    typeof record.attributionPairCount !== "number" ||
    !Number.isSafeInteger(record.attributionPairCount) ||
    typeof record.generatedSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.generatedSha256)
  ) {
    throw new TypeError(
      "Sentence corpus manifest does not match the v1 contract.",
    );
  }
  const typedManifest = record as unknown as SentenceCorpusManifest;
  const rejectedCount = Object.values(typedManifest.rejected).reduce(
    (total, count) => total + count,
    0,
  );
  if (
    typedManifest.attributionPairCount !== typedManifest.outputPairCount ||
    typedManifest.outputPairCount +
      typedManifest.exactDuplicateCount +
      typedManifest.normalizedEnglishDuplicateCount +
      rejectedCount !==
      typedManifest.inputRowCount
  ) {
    throw new TypeError("Sentence corpus manifest counts are inconsistent.");
  }
}

export async function loadSentencePairs(): Promise<readonly SentencePair[]> {
  validateSentenceManifest(manifest);
  // The generated and attribution hashes are checked by the local importer
  // preflight. Avoid hashing 100+ MB in the browser; this boundary validates
  // the runtime shape and manifest count before a lesson is created.
  const pairs = validateSentencePairs(
    (
      await import(
        /* webpackChunkName: "sentences-en-ru" */
        "./data/sentences-en-ru.json",
        { with: { type: "json" } }
      )
    ).default,
  );
  if (pairs.length !== manifest.outputPairCount) {
    throw new Error(
      `Sentence corpus count mismatch: expected ${manifest.outputPairCount}, got ${pairs.length}.`,
    );
  }
  return pairs;
}

export function sentenceCorpusIdentity(): string {
  validateSentenceManifest(manifest);
  return [
    manifest.sourceId,
    manifest.corpusVersion,
    manifest.sourceUpdated,
    manifest.sourceArchiveSha256,
    manifest.sourceTsvSha256,
    manifest.generatedSha256,
    manifest.attributionSha256,
    manifest.outputPairCount,
  ].join(":");
}

function isDropReasonRecord(value: unknown): value is Record<string, number> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (count) =>
      typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
  );
}
