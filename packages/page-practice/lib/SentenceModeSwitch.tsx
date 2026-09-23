import { KeyboardOptions, Language } from "@keybr/keyboard";
import { isSentenceMode, lessonProps } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import { CheckBox, Field, FieldList } from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

export function SentenceModeSwitch(): ReactNode {
  const { settings, updateSettings } = useSettings();
  const { language } = KeyboardOptions.from(settings);
  if (language !== Language.EN && language !== Language.EN_GB) {
    return null;
  }
  return (
    <FieldList>
      <Field>
        <CheckBox
          label={
            <FormattedMessage
              id="lesson.sentences.toggle"
              defaultMessage="Use English sentence practice"
            />
          }
          checked={isSentenceMode(settings)}
          onChange={(value) => {
            updateSettings(settings.set(lessonProps.sentences.enabled, value));
          }}
        />
      </Field>
    </FieldList>
  );
}
