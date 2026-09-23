import { Description, Explainer, FieldSet } from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { LessonLengthProp } from "./LessonLengthProp.tsx";
import { TargetSpeedProp } from "./TargetSpeedProp.tsx";

export function SentenceLessonSettings(): ReactNode {
  const { formatMessage } = useIntl();
  return (
    <>
      <Explainer>
        <Description>
          <FormattedMessage
            id="lessonType.sentences.description"
            defaultMessage="Practice English sentence pairs with source-provided Russian translations. Lessons prefer pairs containing the current weak letters."
          />
        </Description>
      </Explainer>
      <FieldSet
        legend={formatMessage({
          id: "t_Lesson_options",
          defaultMessage: "Lesson options",
        })}
      >
        <TargetSpeedProp />
        <LessonLengthProp />
      </FieldSet>
    </>
  );
}
