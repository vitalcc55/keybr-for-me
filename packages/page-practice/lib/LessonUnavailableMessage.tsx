import { type LessonUnavailable } from "@keybr/lesson";
import { Alert, Button } from "@keybr/widget";
import { type ReactNode } from "react";
import { FormattedMessage } from "react-intl";

export function LessonUnavailableMessage({
  unavailable,
  onRetry,
  onSettings,
}: {
  readonly unavailable: LessonUnavailable;
  readonly onRetry?: () => void;
  readonly onSettings?: () => void;
}): ReactNode {
  const settingsLabel =
    unavailable.action === "word-list" ? (
      <FormattedMessage
        id="t_Change_word_list"
        defaultMessage="Change word list"
      />
    ) : (
      <FormattedMessage
        id="t_Open_lesson_settings"
        defaultMessage="Open lesson settings"
      />
    );
  return (
    <Alert severity="info">
      <div>
        {unavailable.reason === "empty-word-list" ? (
          <FormattedMessage
            id="lesson.unavailable.wordList"
            defaultMessage="The selected Word List has no usable words for the current keyboard and filters."
          />
        ) : (
          <FormattedMessage
            id="lesson.unavailable.guided"
            defaultMessage="Guided could not generate a usable word for the current weak-key focus."
          />
        )}
      </div>
      {unavailable.candidateCount != null && (
        <div>
          <FormattedMessage
            id="lesson.unavailable.count"
            defaultMessage="Usable candidates: {count}"
            values={{ count: unavailable.candidateCount }}
          />
        </div>
      )}
      {unavailable.fallbackUsed && (
        <div>
          <FormattedMessage
            id="lesson.unavailable.fallback"
            defaultMessage="The adaptive pseudo-word fallback was exhausted; adjust the lesson settings or try again."
          />
        </div>
      )}
      <div>
        {onRetry != null && (
          <Button
            size={16}
            label={
              <FormattedMessage id="t_Try_again" defaultMessage="Try again" />
            }
            onClick={onRetry}
          />
        )}
        {onSettings != null && (
          <Button size={16} label={settingsLabel} onClick={onSettings} />
        )}
      </div>
    </Alert>
  );
}
