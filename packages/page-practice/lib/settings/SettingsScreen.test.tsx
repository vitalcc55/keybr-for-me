import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { lessonProps } from "@keybr/lesson";
import { FakePhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { FakeResultContext, ResultFaker } from "@keybr/result";
import { FakeSettingsContext, Settings } from "@keybr/settings";
import { fireEvent, render } from "@testing-library/react";
import { isNotNull } from "rich-assert";
import { SettingsScreen } from "./SettingsScreen.tsx";

const faker = new ResultFaker();

test("render", async () => {
  PhoneticModelLoader.loader = FakePhoneticModel.loader;

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext>
        <FakeResultContext initialResults={faker.nextResultList(100)}>
          <SettingsScreen />
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  isNotNull(await r.findByText("Lessons"));
  isNotNull(await r.findByText("Typing"));
  isNotNull(await r.findByText("Keyboard"));
  isNotNull(await r.findByText("Miscellaneous"));

  fireEvent.click(r.getByText("Lessons"));

  isNotNull(r.queryByText("Lesson options"));
  isNotNull(r.queryByText("Lesson preview"));
  isNotNull(r.queryByText("Use English sentence practice"));

  fireEvent.click(r.getByText("Typing"));

  isNotNull(r.queryByText("Typing options"));

  fireEvent.click(r.getByText("Keyboard"));

  isNotNull(r.queryByText("Options"));
  isNotNull(r.queryByText("Preview"));

  fireEvent.click(r.getByText("Miscellaneous"));

  isNotNull(r.queryByText("Interface options"));

  r.unmount();
});

test("preview renders an unavailable Guided generation", async () => {
  PhoneticModelLoader.loader = async () => new FakePhoneticModel([""]);

  const r = render(
    <FakeIntlProvider>
      <FakeSettingsContext
        initialSettings={new Settings().set(
          lessonProps.guided.naturalWords,
          false,
        )}
      >
        <FakeResultContext initialResults={faker.nextResultList(10)}>
          <SettingsScreen />
        </FakeResultContext>
      </FakeSettingsContext>
    </FakeIntlProvider>,
  );

  isNotNull(
    await r.findByText(
      "Guided could not generate a usable word for the current weak-key focus.",
    ),
  );

  r.unmount();
});
