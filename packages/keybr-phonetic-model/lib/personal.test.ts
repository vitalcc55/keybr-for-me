import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Language } from "@keybr/keyboard";
import { equal } from "rich-assert";
import { TransitionTable } from "./transitiontable.ts";

const standardModelSha256 =
  "4a00f67fdd15ab254d37900c80790bc21e78abc4cc3ff2efe2ca1ea5e83fad83";
const personalModelSha256 =
  "4e61920649f88ac848ea3ef0428619a8952d1841c26e771699dfd7216a3f19d0";

test("standard Russian model remains unchanged", () => {
  const data = readFileSync(
    new URL("../assets/model-ru.data", import.meta.url),
  );

  equal(createHash("sha256").update(data).digest("hex"), standardModelSha256);
  equal(
    String.fromCodePoint(...TransitionTable.load(data).alphabet),
    " абвгдежзийклмнопрстуфхцчшщъыьэюя",
  );
});

test("personal Russian model contains all letters including ё", () => {
  const data = readFileSync(
    new URL("../assets/model-ru-personal.data", import.meta.url),
  );
  const table = TransitionTable.load(data);
  const letters = table.letters(Language.RU);

  equal(createHash("sha256").update(data).digest("hex"), personalModelSha256);
  equal(table.order, 4);
  equal(
    String.fromCodePoint(...table.alphabet),
    " абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
  );
  equal(letters.length, 34);
  for (const letter of letters) {
    if (letter.codePoint !== 0x0020) {
      if (!(letter.f > 0)) {
        throw new Error(`No personal frequency for ${letter.label}.`);
      }
    }
  }
  if (!((letters.find(({ codePoint }) => codePoint === 0x0451)?.f ?? 0) > 0)) {
    throw new Error("Personal model has no ё frequency.");
  }
  equal(Buffer.from(table.compress()).equals(data), true);
});
