import { throws } from "node:assert/strict";
import { test } from "node:test";
import words from "./data/words-ru-personal.json" with { type: "json" };
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
