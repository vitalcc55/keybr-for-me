export type WordList = readonly string[];

export type WordListSource = "ru-standard" | "ru-personal";

export type WordListLimit = "inherit" | "all" | number;

export type WordListPolicy = {
  readonly source: WordListSource;
  readonly limit: "all" | number;
  readonly naturalWordLimit: 1000 | null;
  readonly identity?: string;
  readonly sourceTotal?: number | null;
  readonly sourceVersion?: number | null;
};

export type ModelReference = {
  readonly id: string;
  readonly version: number;
  readonly sha256: string;
};

export type WordListDescriptor = {
  readonly source: WordListSource;
  readonly languageId: string;
  readonly wordListId: string;
  readonly wordCount: number | null;
  readonly corpusVersion: number | null;
  readonly corpusSha256: string | null;
  readonly model: ModelReference | null;
};
