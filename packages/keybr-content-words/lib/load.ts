import {
  type WordList,
  type WordListDescriptor,
  type WordListLimit,
  type WordListPolicy,
  type WordListSource,
} from "@keybr/content";
import { Language } from "@keybr/keyboard";
import personalManifest from "./data/words-ru-personal.manifest.json" with { type: "json" };
import {
  PERSONAL_CORPUS_SHA256,
  PERSONAL_CORPUS_VERSION,
  PERSONAL_WORD_COUNT,
  PERSONAL_WORD_LIST_ID,
} from "./personal.ts";

export async function loadWordList(
  language: Language,
  source: WordListSource = "ru-standard",
): Promise<WordList> {
  if (source !== "ru-standard" && source !== "ru-personal") {
    throw new TypeError(`Unknown word-list source: ${String(source)}`);
  }
  if (source === "ru-personal") {
    if (language !== Language.RU) {
      throw new TypeError("The personal word list is available only for RU.");
    }
    return (
      await import(
        /* webpackChunkName: "words-ru-personal" */ "./data/words-ru-personal.json",
        { with: { type: "json" } }
      )
    ).default;
  }
  switch (language) {
    case Language.AR:
      return (
        await import(
          /* webpackChunkName: "words-ar" */ "./data/words-ar.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.BE:
      return (
        await import(
          /* webpackChunkName: "words-be" */ "./data/words-be.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.BR:
      return (
        await import(
          /* webpackChunkName: "words-br" */ "./data/words-br.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.CS:
      return (
        await import(
          /* webpackChunkName: "words-cs" */ "./data/words-cs.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.DA:
      return (
        await import(
          /* webpackChunkName: "words-da" */ "./data/words-da.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.DE:
      return (
        await import(
          /* webpackChunkName: "words-de" */ "./data/words-de.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.EL:
      return (
        await import(
          /* webpackChunkName: "words-el" */ "./data/words-el.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.EN:
      return (
        await import(
          /* webpackChunkName: "words-en" */ "./data/words-en.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.EN_GB:
      return (
        await import(
          /* webpackChunkName: "words-en-GB" */ "./data/words-en-GB.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.ES:
      return (
        await import(
          /* webpackChunkName: "words-es" */ "./data/words-es.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.ET:
      return (
        await import(
          /* webpackChunkName: "words-et" */ "./data/words-et.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.FA:
      return (
        await import(
          /* webpackChunkName: "words-fa" */ "./data/words-fa.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.FI:
      return (
        await import(
          /* webpackChunkName: "words-fi" */ "./data/words-fi.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.FR:
      return (
        await import(
          /* webpackChunkName: "words-fr" */ "./data/words-fr.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.HE:
      return (
        await import(
          /* webpackChunkName: "words-he" */ "./data/words-he.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.HR:
      return (
        await import(
          /* webpackChunkName: "words-hr" */ "./data/words-hr.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.HU:
      return (
        await import(
          /* webpackChunkName: "words-hu" */ "./data/words-hu.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.IT:
      return (
        await import(
          /* webpackChunkName: "words-it" */ "./data/words-it.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.JA:
      return (
        await import(
          /* webpackChunkName: "words-ja" */ "./data/words-ja.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.LT:
      return (
        await import(
          /* webpackChunkName: "words-lt" */ "./data/words-lt.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.LV:
      return (
        await import(
          /* webpackChunkName: "words-lv" */ "./data/words-lv.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.NB:
      return (
        await import(
          /* webpackChunkName: "words-nb" */ "./data/words-nb.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.NL:
      return (
        await import(
          /* webpackChunkName: "words-nl" */ "./data/words-nl.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.PL:
      return (
        await import(
          /* webpackChunkName: "words-pl" */ "./data/words-pl.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.PT:
      return (
        await import(
          /* webpackChunkName: "words-pt" */ "./data/words-pt.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.RO:
      return (
        await import(
          /* webpackChunkName: "words-ro" */ "./data/words-ro.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.RU:
      return (
        await import(
          /* webpackChunkName: "words-ru" */ "./data/words-ru.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.SL:
      return (
        await import(
          /* webpackChunkName: "words-sl" */ "./data/words-sl.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.SV:
      return (
        await import(
          /* webpackChunkName: "words-sv" */ "./data/words-sv.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.TH:
      return (
        await import(
          /* webpackChunkName: "words-th" */ "./data/words-th.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.TR:
      return (
        await import(
          /* webpackChunkName: "words-tr" */ "./data/words-tr.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.UK:
      return (
        await import(
          /* webpackChunkName: "words-uk" */ "./data/words-uk.json",
          { with: { type: "json" } }
        )
      ).default;
    case Language.VI:
      return (
        await import(
          /* webpackChunkName: "words-vi" */ "./data/words-vi.json",
          { with: { type: "json" } }
        )
      ).default;
    default:
      throw new Error();
  }
}

export function resolveWordListDescriptor(
  language: Language,
  source: WordListSource,
): WordListDescriptor {
  if (source !== "ru-standard" && source !== "ru-personal") {
    throw new TypeError(`Unknown word-list source: ${String(source)}`);
  }
  if (source === "ru-personal") {
    if (language !== Language.RU) {
      throw new TypeError("The personal word list is available only for RU.");
    }
    return {
      source,
      languageId: "ru",
      wordListId: PERSONAL_WORD_LIST_ID,
      wordCount: PERSONAL_WORD_COUNT,
      corpusVersion: PERSONAL_CORPUS_VERSION,
      corpusSha256: PERSONAL_CORPUS_SHA256,
      model: {
        id: personalManifest.modelId,
        version: personalManifest.modelVersion,
        sha256: personalManifest.modelSha256,
      },
    };
  }
  return {
    source,
    languageId: language.id,
    wordListId: `words-${language.id}`,
    wordCount: null,
    corpusVersion: null,
    corpusSha256: null,
    model: null,
  };
}

export function wordListDescriptorIdentity(
  descriptor: WordListDescriptor,
): string {
  const model = descriptor.model;
  return [
    descriptor.source,
    descriptor.languageId,
    descriptor.wordListId,
    descriptor.corpusVersion ?? "legacy",
    descriptor.corpusSha256 ?? "legacy",
    model?.id ?? "legacy",
    model?.version ?? "legacy",
    model?.sha256 ?? "legacy",
  ].join(":");
}

export function resolveWordListPolicy(
  descriptor: WordListDescriptor,
  limit: WordListLimit,
  legacySize: number,
): WordListPolicy {
  const effectiveLimit =
    limit === "inherit"
      ? descriptor.source === "ru-personal"
        ? "all"
        : legacySize
      : limit;
  if (effectiveLimit === "all") {
    if (descriptor.source !== "ru-personal") {
      throw new TypeError(
        "The all-words limit is available only for RU personal words.",
      );
    }
  } else if (
    !Number.isSafeInteger(effectiveLimit) ||
    effectiveLimit < 1 ||
    (descriptor.source === "ru-personal"
      ? effectiveLimit > (descriptor.wordCount ?? 0)
      : effectiveLimit > 1000)
  ) {
    throw new TypeError("The word-list limit is outside the available pool.");
  }
  return {
    source: descriptor.source,
    limit: effectiveLimit,
    naturalWordLimit: descriptor.source === "ru-personal" ? null : 1000,
    identity: wordListDescriptorIdentity(descriptor),
    sourceTotal: descriptor.wordCount,
    sourceVersion: descriptor.corpusVersion,
  };
}
