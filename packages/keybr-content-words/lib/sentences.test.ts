import { test } from "node:test";
import { deepEqual, equal, throws } from "rich-assert";
import {
  sentenceCorpusIdentity,
  validateSentenceManifest,
  validateSentencePairs,
} from "./sentences.ts";

test("validates the sentence pair contract", () => {
  deepEqual(
    validateSentencePairs([{ id: "tatoeba:1", en: "Hello.", ru: "Привет." }]),
    [{ id: "tatoeba:1", en: "Hello.", ru: "Привет." }],
  );
  throws(() =>
    validateSentencePairs([
      { id: "tatoeba:1", en: "Hello.", ru: "Привет." },
      { id: "tatoeba:2", en: "Hello.", ru: "Здравствуйте." },
    ]),
  );
  throws(() =>
    validateSentencePairs([{ id: "tatoeba:1", en: "café", ru: "Кафе." }]),
  );
});

test("validates the generated manifest and exposes stable identity", () => {
  validateSentenceManifest(
    JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        sourceId: "manythings-rus-eng",
        sourcePageUrl: "https://www.manythings.org/anki/",
        sourceArchiveUrl: "https://www.manythings.org/anki/rus-eng.zip",
        sourceUpdated: "2026-02-13",
        corpusVersion: 1,
        sourceEntryName: "rus.txt",
        sourceEncoding: "utf-8",
        sourceBom: false,
        sourceTsvSha256: "0".repeat(64),
        sourceArchiveSha256:
          "1534e267976f43ae97e966d2ac9dc1e9128fdd0efdf08eceee21cd88ff20682c",
        inputByteLength: 1,
        listedPairCount: 1,
        inputRowCount: 1,
        outputPairCount: 1,
        exactDuplicateCount: 0,
        normalizedEnglishDuplicateCount: 0,
        rejected: {},
        attributionFile: "sentences-en-ru.attribution.json",
        attributionSha256: "0".repeat(64),
        attributionPairCount: 1,
        rulesVersion: 1,
        generatorVersion: 1,
        idPolicy: "tatoeba:<english-attribution-id>",
        license: "CC BY 2.0 FR",
        attribution: "Data from www.manythings.org/anki and tatoeba.org",
        generatedSha256: "0".repeat(64),
      }),
    ),
  );
  equal(sentenceCorpusIdentity().startsWith("manythings-rus-eng:"), true);
});

test("rejects negative manifest rejection counts", () => {
  throws(() =>
    validateSentenceManifest({
      schemaVersion: 1,
      sourceId: "manythings-rus-eng",
      sourcePageUrl: "https://www.manythings.org/anki/",
      sourceArchiveUrl: "https://www.manythings.org/anki/rus-eng.zip",
      sourceUpdated: "2026-02-13",
      corpusVersion: 1,
      sourceEntryName: "rus.txt",
      sourceEncoding: "utf-8",
      sourceBom: false,
      sourceTsvSha256: "0".repeat(64),
      sourceArchiveSha256:
        "1534e267976f43ae97e966d2ac9dc1e9128fdd0efdf08eceee21cd88ff20682c",
      inputByteLength: 1,
      listedPairCount: 1,
      inputRowCount: 1,
      outputPairCount: 1,
      exactDuplicateCount: 0,
      normalizedEnglishDuplicateCount: 0,
      rejected: { malformed: -1 },
      attributionFile: "sentences-en-ru.attribution.json",
      attributionSha256: "0".repeat(64),
      attributionPairCount: 1,
      rulesVersion: 1,
      generatorVersion: 1,
      idPolicy: "tatoeba:<english-attribution-id>",
      license: "CC BY 2.0 FR",
      attribution: "Data from www.manythings.org/anki and tatoeba.org",
      generatedSha256: "0".repeat(64),
    }),
  );
});
