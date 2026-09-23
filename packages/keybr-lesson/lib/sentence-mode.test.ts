import { test } from "node:test";
import { keyboardProps, Language } from "@keybr/keyboard";
import { Settings } from "@keybr/settings";
import { equal } from "rich-assert";
import { isSentenceMode } from "./sentence-mode.ts";
import { lessonProps } from "./settings.ts";

test("sentence mode is disabled by default", () => {
  equal(isSentenceMode(new Settings()), false);
});

test("sentence mode is enabled only for English keyboard languages", () => {
  const enabled = new Settings().set(lessonProps.sentences.enabled, true);
  equal(isSentenceMode(enabled), true);
  equal(
    isSentenceMode(enabled.set(keyboardProps.language, Language.EN_GB)),
    true,
  );
  equal(
    isSentenceMode(enabled.set(keyboardProps.language, Language.RU)),
    false,
  );
});
