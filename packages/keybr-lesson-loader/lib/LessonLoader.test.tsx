import { test } from "node:test";
import {
  KeyboardContext,
  KeyboardOptions,
  Language,
  Layout,
  loadKeyboard,
} from "@keybr/keyboard";
import { type GuidedLesson, lessonProps, SentenceLesson } from "@keybr/lesson";
import { FakePhoneticModel, type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { render } from "@testing-library/react";
import { equal, includes } from "rich-assert";
import { LessonLoader } from "./LessonLoader.tsx";

test("load", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;
  const keyboard = loadKeyboard(Layout.EN_US);

  const r = render(
    <FakeSettingsContext initialSettings={new Settings()}>
      <KeyboardContext.Provider value={keyboard}>
        <LessonLoader>
          {({ model }) => <TestChild model={model} />}
        </LessonLoader>
      </KeyboardContext.Provider>
    </FakeSettingsContext>,
  );

  includes((await r.findByTitle("letters")).textContent!, "ABCDEFGHIJ");

  r.unmount();
});

test("RU defaults to the personal word-list/model source", async () => {
  let source = "";
  PhoneticModelLoader.loader = async (_language, modelSource) => {
    source = modelSource ?? "";
    return new FakePhoneticModel();
  };
  const options = KeyboardOptions.default()
    .withLanguage(Language.RU)
    .withLayout(Layout.RU_RU);
  const settings = options.save(new Settings());
  const keyboard = loadKeyboard(Layout.RU_RU);

  const r = render(
    <FakeSettingsContext initialSettings={settings}>
      <KeyboardContext.Provider value={keyboard}>
        <LessonLoader>
          {(lesson) => (
            <>
              <span title="source">{source}</span>
              <span title="last-word">
                {[...(lesson as GuidedLesson).dictionary].at(-1)}
              </span>
            </>
          )}
        </LessonLoader>
      </KeyboardContext.Provider>
    </FakeSettingsContext>,
  );

  includes((await r.findByTitle("source")).textContent!, "ru-personal");
  includes((await r.findByTitle("last-word")).textContent!, "нёбо");

  r.unmount();
});

test("loads the sentence lesson when the effective mode is enabled", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;
  const keyboard = loadKeyboard(Layout.EN_US);
  const settings = new Settings().set(lessonProps.sentences.enabled, true);
  let loadCount = 0;

  const r = render(
    <FakeSettingsContext initialSettings={settings}>
      <KeyboardContext.Provider value={keyboard}>
        <LessonLoader
          loadSentences={async () => {
            loadCount++;
            return [
              { id: "tatoeba:1", en: "Hello world.", ru: "Привет, мир." },
            ];
          }}
        >
          {(lesson) => (
            <span title="kind">
              {lesson instanceof SentenceLesson ? "sentences" : "other"}
            </span>
          )}
        </LessonLoader>
      </KeyboardContext.Provider>
    </FakeSettingsContext>,
  );

  equal((await r.findByTitle("kind")).textContent, "sentences");
  equal(loadCount, 1);
  r.unmount();
});

function TestChild({ model }: { model: PhoneticModel }) {
  return <span title="letters">{model.letters.map(String).join("")}</span>;
}
