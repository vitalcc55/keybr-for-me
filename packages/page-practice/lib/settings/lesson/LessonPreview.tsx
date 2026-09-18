import { isLessonUnavailable, type Lesson } from "@keybr/lesson";
import { CurrentKeyRow, KeySetRow } from "@keybr/lesson-ui";
import { LCG } from "@keybr/rand";
import { makeKeyStatsMap, useResults } from "@keybr/result";
import { useSettings } from "@keybr/settings";
import {
  TextInput,
  toTextDisplaySettings,
  toTextInputSettings,
} from "@keybr/textinput";
import { StaticText } from "@keybr/textinput-ui";
import { FieldSet } from "@keybr/widget";
import { type ReactNode, useMemo } from "react";
import { useIntl } from "react-intl";
import { LessonUnavailableMessage } from "../../LessonUnavailableMessage.tsx";
import * as styles from "./LessonPreview.module.less";

export function LessonPreview({
  lesson,
}: {
  readonly lesson: Lesson;
}): ReactNode {
  const { formatMessage } = useIntl();
  const { settings } = useSettings();
  const { results } = useResults();
  const { lessonKeys, generation } = useMemo(() => {
    const lessonKeys = lesson.update(
      makeKeyStatsMap(lesson.letters, lesson.filter(results)),
    );
    const generation = lesson.generate(lessonKeys, LCG(123));
    return { lessonKeys, generation };
  }, [lesson, results]);
  return (
    <FieldSet
      legend={formatMessage({
        id: "t_Lesson_preview:",
        defaultMessage: "Lesson preview",
      })}
    >
      <div className={styles.root}>
        <KeySetRow lessonKeys={lessonKeys} />
        <CurrentKeyRow lessonKeys={lessonKeys} />
        <div className={styles.text}>
          {isLessonUnavailable(generation) ? (
            <LessonUnavailableMessage unavailable={generation} />
          ) : (
            <StaticText
              settings={toTextDisplaySettings(settings)}
              lines={
                new TextInput(generation, toTextInputSettings(settings)).lines
              }
            />
          )}
        </div>
      </div>
    </FieldSet>
  );
}
