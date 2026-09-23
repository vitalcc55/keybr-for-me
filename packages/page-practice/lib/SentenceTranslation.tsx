import { type SentencePair } from "@keybr/content";
import { type ReactNode } from "react";
import * as styles from "./SentenceTranslation.module.less";

export function SentenceTranslation({
  pairs,
}: {
  readonly pairs: readonly SentencePair[];
}): ReactNode {
  if (pairs.length === 0) {
    return null;
  }
  return (
    <div className={styles.root} data-testid="sentence-translation">
      {pairs.map((pair) => (
        <div className={styles.item} key={pair.id}>
          {pair.ru}
        </div>
      ))}
    </div>
  );
}
