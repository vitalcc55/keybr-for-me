import { resolveWordListDescriptor } from "@keybr/content-words";
import { ErrorAlert } from "@keybr/debug";
import { KeyboardOptions, Language } from "@keybr/keyboard";
import { lessonProps, LessonType } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import {
  CheckBox,
  Field,
  FieldList,
  FieldSet,
  OptionList,
  Range,
} from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

export function WordListSourceSettings({
  lessonType,
}: {
  readonly lessonType: LessonType;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const { language } = KeyboardOptions.from(settings);
  if (
    language !== Language.RU ||
    (lessonType !== LessonType.GUIDED && lessonType !== LessonType.WORDLIST)
  ) {
    return null;
  }
  let source: "ru-personal" | "ru-standard";
  let limit: "inherit" | "all" | number;
  try {
    source = settings.get(lessonProps.wordList.source);
    limit = settings.get(lessonProps.wordList.limit);
  } catch (error) {
    return (
      <>
        <ErrorAlert title="Invalid word-list settings." error={error} />
        <button type="button" onClick={() => updateSettings(settings.reset())}>
          Reset lesson settings
        </button>
      </>
    );
  }
  const allWords = limit === "inherit" || limit === "all";
  const personalWordCount =
    resolveWordListDescriptor(Language.RU, "ru-personal").wordCount ?? 0;
  return (
    <FieldSet
      legend={formatMessage({
        id: "t_Word_source",
        defaultMessage: "Word source",
      })}
    >
      <FieldList>
        <Field>
          <FormattedMessage id="t_Dictionary:" defaultMessage="Dictionary:" />
        </Field>
        <Field>
          <OptionList
            options={[
              {
                value: "ru-personal",
                name: formatMessage({
                  id: "t_My_dictionary",
                  defaultMessage: "My dictionary",
                }),
              },
              {
                value: "ru-standard",
                name: formatMessage({
                  id: "t_Standard_dictionary",
                  defaultMessage: "Standard dictionary",
                }),
              },
            ]}
            value={source}
            onSelect={(value) => {
              let nextSettings = settings.set(
                lessonProps.wordList.source,
                value as "ru-personal" | "ru-standard",
              );
              if (
                value === "ru-standard" &&
                (() => {
                  const currentLimit = settings.get(lessonProps.wordList.limit);
                  return (
                    currentLimit === "all" ||
                    (typeof currentLimit === "number" && currentLimit > 1000)
                  );
                })()
              ) {
                nextSettings = nextSettings.set(
                  lessonProps.wordList.limit,
                  "inherit",
                );
              }
              updateSettings(nextSettings);
            }}
          />
        </Field>
        {lessonType === LessonType.WORDLIST && source === "ru-personal" && (
          <>
            <Field>
              <CheckBox
                label={formatMessage({
                  id: "t_All_words",
                  defaultMessage: "All words",
                })}
                checked={allWords}
                onChange={(value) => {
                  updateSettings(
                    settings.set(
                      lessonProps.wordList.limit,
                      value ? "all" : 1000,
                    ),
                  );
                }}
              />
            </Field>
            <Field>
              <Range
                size={16}
                min={1}
                max={personalWordCount}
                step={1}
                disabled={allWords}
                value={typeof limit === "number" ? limit : personalWordCount}
                onChange={(value) => {
                  updateSettings(
                    settings.set(lessonProps.wordList.limit, value),
                  );
                }}
              />
            </Field>
          </>
        )}
      </FieldList>
    </FieldSet>
  );
}
