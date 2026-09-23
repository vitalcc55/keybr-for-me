import { KeyboardOptions, Language } from "@keybr/keyboard";
import { type Settings } from "@keybr/settings";
import { lessonProps } from "./settings.ts";

export function isSentenceMode(settings: Settings): boolean {
  if (!settings.get(lessonProps.sentences.enabled)) {
    return false;
  }
  const { language } = KeyboardOptions.from(settings);
  return language === Language.EN || language === Language.EN_GB;
}
