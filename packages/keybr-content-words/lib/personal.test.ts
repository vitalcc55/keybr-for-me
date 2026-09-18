import { throws } from "node:assert/strict";
import { test } from "node:test";
import { Language } from "@keybr/keyboard";
import words from "./data/words-ru-personal.json" with { type: "json" };
import {
  loadWordList,
  resolveWordListDescriptor,
  resolveWordListPolicy,
} from "./load.ts";
import {
  formatPersonalWordList,
  parsePersonalWordList,
  validatePersonalWordList,
} from "./personal.ts";

test("personal corpus has the canonical shape", () => {
  const validated = validatePersonalWordList(words);
  const text = formatPersonalWordList(validated);

  if (validated[0] !== "и" || validated.at(-1) !== "нёбо") {
    throw new Error("Personal corpus order is not canonical.");
  }
  if (validated.filter((word) => word.includes("ё")).length !== 26) {
    throw new Error("Personal corpus must contain 26 words with ё.");
  }
  if (text.includes("\r") || text.includes("\n")) {
    throw new Error("Personal TXT export must be one line.");
  }
  const roundTrip = parsePersonalWordList(text);
  if (
    roundTrip.length !== validated.length ||
    roundTrip[700] !== validated[700]
  ) {
    throw new Error("Personal TXT round-trip changed the corpus.");
  }
});

test("personal corpus parser rejects malformed exports", () => {
  throws(() => parsePersonalWordList(""), /empty/);
  throws(() => parsePersonalWordList("и,  не"), /whitespace/);
  throws(() => parsePersonalWordList("и\nне"), /single line/);
  throws(() => parsePersonalWordList("\ufeffи"), /BOM/);
  throws(() => validatePersonalWordList(["ребе\u0308нок"]), /NFC/);
  throws(() => validatePersonalWordList(["abc"]), /outside/);
});

test("personal word-list source exposes the complete corpus", async () => {
  const wordList = await loadWordList(Language.RU, "ru-personal");

  if (wordList.length !== 1232 || wordList.at(-1) !== "нёбо") {
    throw new Error("Personal word-list source is incomplete.");
  }
});

test("personal descriptor resolves its model and full-pool policy", () => {
  const descriptor = resolveWordListDescriptor(Language.RU, "ru-personal");
  const policy = resolveWordListPolicy(descriptor, "inherit", 1000);

  if (
    descriptor.wordListId !== "words-ru-personal" ||
    descriptor.model?.id !== "model-ru-personal" ||
    policy.limit !== "all" ||
    policy.naturalWordLimit != null
  ) {
    throw new Error("Personal source descriptor is inconsistent.");
  }
  throws(
    () => resolveWordListDescriptor(Language.EN, "ru-personal"),
    /only for RU/,
  );
  throws(
    () => resolveWordListPolicy(descriptor, 1233, 1000),
    /outside the available pool/,
  );
});
