import { wordListStats } from "@keybr/content";
import { useIntlNumbers } from "@keybr/intl";
import { KeyboardOptions, Language } from "@keybr/keyboard";
import { lessonProps, type WordListLesson } from "@keybr/lesson";
import { useSettings } from "@keybr/settings";
import {
  CheckBox,
  Description,
  Explainer,
  Field,
  FieldList,
  FieldSet,
  NameValue,
  Para,
  Range,
  TextField,
} from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { LessonLengthProp } from "./LessonLengthProp.tsx";
import { RepeatWordsProp } from "./RepeatWordsProp.tsx";
import { TargetSpeedProp } from "./TargetSpeedProp.tsx";
import { TextManglingProp } from "./TextManglingProp.tsx";

export function WordListLessonSettings({
  lesson,
}: {
  readonly lesson: WordListLesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  return (
    <>
      <Explainer>
        <Description>
          <FormattedMessage
            id="lessonType.wordList.description"
            defaultMessage="Generate typing lessons only from the selected word list. All keys are included by default; unlike Guided, this strict mode never adds pseudo-words."
          />
        </Description>
      </Explainer>
      <FieldSet
        legend={formatMessage({
          id: "t_Lesson_options",
          defaultMessage: "Lesson options",
        })}
      >
        <WordListPreview lesson={lesson} />
        <WordListStats lesson={lesson} />
        <TargetSpeedProp />
        <RepeatWordsProp />
        <TextManglingProp />
        <LessonLengthProp />
      </FieldSet>
    </>
  );
}

function WordListPreview({
  lesson,
}: {
  readonly lesson: WordListLesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  const language = KeyboardOptions.from(settings).language;
  const source =
    language === Language.RU
      ? settings.get(lessonProps.wordList.source)
      : "ru-standard";
  const limit =
    language === Language.RU
      ? settings.get(lessonProps.wordList.limit)
      : "inherit";
  const showLegacySize = source === "ru-standard" || language !== Language.RU;
  const useExplicitLimit =
    language === Language.RU &&
    source === "ru-standard" &&
    typeof limit === "number";
  return (
    <>
      <FieldList>
        {showLegacySize && (
          <>
            <Field>
              <FormattedMessage
                id="t_Word_list_size:"
                defaultMessage="Word list size:"
              />
            </Field>
            <Field>
              <Range
                size={16}
                min={
                  useExplicitLimit ? 1 : lessonProps.wordList.wordListSize.min
                }
                max={lessonProps.wordList.wordListSize.max}
                step={1}
                value={
                  useExplicitLimit
                    ? (limit as number)
                    : settings.get(lessonProps.wordList.wordListSize)
                }
                onChange={(value) => {
                  updateSettings(
                    useExplicitLimit
                      ? settings.set(lessonProps.wordList.limit, value)
                      : settings.set(lessonProps.wordList.wordListSize, value),
                  );
                }}
              />
            </Field>
          </>
        )}
        <Field>
          <CheckBox
            label={formatMessage({
              id: "t_Long_words_only",
              defaultMessage: "Long words only",
            })}
            checked={settings.get(lessonProps.wordList.longWordsOnly)}
            onChange={(value) => {
              updateSettings(
                settings.set(lessonProps.wordList.longWordsOnly, value),
              );
            }}
          />
        </Field>
      </FieldList>
      <Para>
        <TextField
          type="textarea"
          value={[...lesson.wordList].join(", ")}
          readOnly={true}
        />
      </Para>
    </>
  );
}

function WordListStats({
  lesson,
}: {
  readonly lesson: WordListLesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { formatNumber } = useIntlNumbers();
  const { wordCount, avgWordLength } = wordListStats(lesson.wordList);
  return (
    <FieldList>
      {lesson.policy.sourceTotal != null && (
        <Field>
          <NameValue
            name={formatMessage({
              id: "t_Source_words",
              defaultMessage: "Source words",
            })}
            value={formatNumber(lesson.policy.sourceTotal)}
          />
        </Field>
      )}
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_Filtered_words",
            defaultMessage: "Filtered words",
          })}
          value={formatNumber(lesson.filteredWordCount)}
        />
      </Field>
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_num_Unique_words",
            defaultMessage: "Unique words",
          })}
          value={formatNumber(wordCount)}
        />
      </Field>
      {lesson.policy.sourceVersion != null && (
        <Field>
          <NameValue
            name={formatMessage({
              id: "t_Source_version",
              defaultMessage: "Source version",
            })}
            value={formatNumber(lesson.policy.sourceVersion)}
          />
        </Field>
      )}
      <Field>
        <NameValue
          name={formatMessage({
            id: "t_Average_word_length",
            defaultMessage: "Average word length",
          })}
          value={formatNumber(avgWordLength, 2)}
        />
      </Field>
    </FieldList>
  );
}
