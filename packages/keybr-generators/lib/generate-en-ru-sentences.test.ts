import { test } from "node:test";
import { deepEqual, equal, throws } from "rich-assert";
import {
  importSentenceTsv,
  normalizeSentenceText,
} from "./generate-en-ru-sentences.ts";

const ARCHIVE_HASH =
  "1534e267976f43ae97e966d2ac9dc1e9128fdd0efdf08eceee21cd88ff20682c";

test("imports and normalizes the sentence TSV deterministically", () => {
  const input = [
    "\ufeff“Hello”—world!\tПривет — мир!\tCC-BY 2.0 (France) Attribution: tatoeba.org #3 (author) & #4 (translator)",
    "Hello-world!\tДругой перевод\tCC-BY 2.0 (France) Attribution: tatoeba.org #2 (author) & #5 (translator)",
    "Hello-world!\tДругой перевод\tCC-BY 2.0 (France) Attribution: tatoeba.org #2 (author) & #5 (translator)",
    `${"a".repeat(241)}\tПропуск\tCC-BY 2.0 (France) Attribution: tatoeba.org #8 (author) & #9 (translator)`,
    `café\tКофе\tCC-BY 2.0 (France) Attribution: tatoeba.org #9 (author) & #10 (translator)`,
    `bad\tстрока\textra\tfield`,
    "Same.\tПеревод Z\tCC-BY 2.0 (France) Attribution: tatoeba.org #10 (author) & #11 (translator)",
    "Same.\tПеревод A\tCC-BY 2.0 (France) Attribution: tatoeba.org #10 (author) & #12 (translator)",
  ].join("\r\n");

  const result = importSentenceTsv(
    new TextEncoder().encode(input),
    "rus.txt",
    ARCHIVE_HASH,
  );

  deepEqual(result.pairs, [
    { id: "tatoeba:3", en: '"Hello"-world!', ru: "Привет - мир!" },
    { id: "tatoeba:2", en: "Hello-world!", ru: "Другой перевод" },
    { id: "tatoeba:10", en: "Same.", ru: "Перевод A" },
  ]);
  equal(result.manifest.sourceBom, true);
  equal(result.manifest.inputRowCount, 8);
  equal(result.manifest.outputPairCount, 3);
  equal(result.manifest.exactDuplicateCount, 1);
  equal(result.manifest.normalizedEnglishDuplicateCount, 1);
  equal(result.manifest.attributionPairCount, 3);
  deepEqual(result.manifest.rejected, {
    "english-not-basic": 1,
    "malformed-row": 1,
    "english-too-long": 1,
  });

  const repeat = importSentenceTsv(
    new TextEncoder().encode(input),
    "rus.txt",
    ARCHIVE_HASH,
  );
  equal(repeat.dataText, result.dataText);
  equal(repeat.manifestText, result.manifestText);
});

test("normalizes only the agreed typography", () => {
  equal(
    normalizeSentenceText("  That’s\u00a0a test—really…  "),
    "That's a test-really...",
  );
});

test("rejects malformed UTF-8 input", () => {
  throws(() =>
    importSentenceTsv(new Uint8Array([0xc3, 0x28]), "rus.txt", ARCHIVE_HASH),
  );
});

test("rejects a source with no valid attribution rows", () => {
  throws(() =>
    importSentenceTsv(
      new TextEncoder().encode("Hello.\tПривет.\tunknown"),
      "rus.txt",
      ARCHIVE_HASH,
    ),
  );
});

test("rejects an English source ID reused by different sentences", () => {
  const input = [
    "One.\tОдин.\tCC-BY 2.0 (France) Attribution: tatoeba.org #20 (author) & #21 (translator)",
    "Two.\tДва.\tCC-BY 2.0 (France) Attribution: tatoeba.org #20 (author) & #22 (translator)",
  ].join("\n");
  throws(() =>
    importSentenceTsv(new TextEncoder().encode(input), "rus.txt", ARCHIVE_HASH),
  );
});
