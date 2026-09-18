import personalManifest from "@keybr/content-words/lib/data/words-ru-personal.manifest.json" with { type: "json" };
import { Language } from "@keybr/keyboard";
import {
  censor,
  makePhoneticModel,
  type PhoneticModel,
  TransitionTable,
} from "@keybr/phonetic-model";
import { expectType, request } from "@keybr/request";
import { modelAssetPath } from "./assets.ts";

export const loaderImpl: PhoneticModel.Loader = async (
  language: Language,
  source = "standard",
): Promise<PhoneticModel> => {
  if (source !== "standard" && source !== "ru-personal") {
    throw new Error(`Unknown phonetic model source: ${source}`);
  }
  const response = await request
    .use(expectType("application/octet-stream"))
    .GET(modelAssetPath(language, source))
    .send();
  const body = await response.arrayBuffer();
  const table = TransitionTable.load(new Uint8Array(body));
  if (source === "ru-personal") {
    const modelSha256 = await sha256(new Uint8Array(body));
    const alphabet = String.fromCodePoint(...table.alphabet);
    const expectedAlphabet = ` ${String.fromCodePoint(...Language.RU.alphabet)}`;
    const yo = table
      .letters(Language.RU)
      .find(({ codePoint }) => codePoint === 0x0451);
    if (
      table.order !== 4 ||
      alphabet !== expectedAlphabet ||
      !(yo != null && yo.f > 0) ||
      modelSha256 !== personalManifest.modelSha256
    ) {
      throw new Error("Personal phonetic model asset is invalid.");
    }
  }
  const model = makePhoneticModel(language, table);
  return censor(model);
};

async function sha256(data: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
