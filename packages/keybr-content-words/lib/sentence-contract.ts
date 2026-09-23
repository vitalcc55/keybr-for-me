export const SENTENCE_SOURCE_ID = "manythings-rus-eng";
export const SENTENCE_SOURCE_PAGE_URL = "https://www.manythings.org/anki/";
export const SENTENCE_SOURCE_ARCHIVE_URL =
  "https://www.manythings.org/anki/rus-eng.zip";
export const SENTENCE_SOURCE_UPDATED = "2026-02-13";
export const SENTENCE_SOURCE_ENTRY_NAME = "rus.txt";
export const SENTENCE_SOURCE_ARCHIVE_SHA256 =
  "1534e267976f43ae97e966d2ac9dc1e9128fdd0efdf08eceee21cd88ff20682c";
export const SENTENCE_CORPUS_VERSION = 1;
export const SENTENCE_RULES_VERSION = 1;
export const SENTENCE_GENERATOR_VERSION = 1;
export const SENTENCE_LICENSE = "CC BY 2.0 FR";
export const SENTENCE_ATTRIBUTION =
  "Data from www.manythings.org/anki and tatoeba.org";

export type SentenceCorpusManifest = {
  readonly schemaVersion: 1;
  readonly sourceId: typeof SENTENCE_SOURCE_ID;
  readonly sourcePageUrl: typeof SENTENCE_SOURCE_PAGE_URL;
  readonly sourceArchiveUrl: typeof SENTENCE_SOURCE_ARCHIVE_URL;
  readonly sourceUpdated: typeof SENTENCE_SOURCE_UPDATED;
  readonly corpusVersion: typeof SENTENCE_CORPUS_VERSION;
  readonly sourceEntryName: typeof SENTENCE_SOURCE_ENTRY_NAME;
  readonly sourceEncoding: "utf-8";
  readonly sourceBom: boolean;
  readonly sourceTsvSha256: string;
  readonly sourceArchiveSha256: typeof SENTENCE_SOURCE_ARCHIVE_SHA256;
  readonly inputByteLength: number;
  readonly listedPairCount: number;
  readonly inputRowCount: number;
  readonly outputPairCount: number;
  readonly exactDuplicateCount: number;
  readonly normalizedEnglishDuplicateCount: number;
  readonly rejected: Readonly<Record<string, number>>;
  readonly attributionFile: "sentences-en-ru.attribution.json";
  readonly attributionSha256: string;
  readonly attributionPairCount: number;
  readonly rulesVersion: typeof SENTENCE_RULES_VERSION;
  readonly generatorVersion: typeof SENTENCE_GENERATOR_VERSION;
  readonly idPolicy: "tatoeba:<english-attribution-id>";
  readonly license: typeof SENTENCE_LICENSE;
  readonly attribution: typeof SENTENCE_ATTRIBUTION;
  readonly generatedSha256: string;
};
