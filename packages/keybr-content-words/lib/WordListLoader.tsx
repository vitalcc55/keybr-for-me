import { type WordList, type WordListSource } from "@keybr/content";
import { ErrorAlert } from "@keybr/debug";
import { type Language } from "@keybr/keyboard";
import { Button } from "@keybr/widget";
import { type ReactNode, useEffect, useState } from "react";
import {
  loadWordList,
  resolveWordListDescriptor,
  wordListDescriptorIdentity,
} from "./load.ts";

export function WordListLoader({
  language,
  source = "ru-standard",
  children,
  fallback,
}: {
  readonly language: Language;
  readonly source?: WordListSource;
  readonly children: (result: WordList) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const identity = wordListDescriptorIdentity(
    resolveWordListDescriptor(language, source),
  );
  return (
    <Loader
      key={`${language.id}:${source}:${identity}`}
      language={language}
      source={source}
      fallback={fallback}
    >
      {children}
    </Loader>
  );
}

function Loader({
  language,
  source,
  children,
  fallback,
}: {
  readonly language: Language;
  readonly source: WordListSource;
  readonly children: (result: WordList) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const [{ error, wordList }, retry] = useLoader(language, source);
  if (error != null) {
    return (
      <>
        <ErrorAlert title="Could not load the word list." error={error} />
        <Button size={16} label="Retry" onClick={retry} />
      </>
    );
  }
  if (wordList == null) {
    return fallback;
  } else {
    return children(wordList);
  }
}

function useLoader(language: Language, source: WordListSource) {
  const [state, setState] = useState<{
    readonly wordList: WordList | null;
    readonly error: unknown;
  }>({ wordList: null, error: null });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let didCancel = false;

    setState({ error: null, wordList: null });
    loadWordList(language, source)
      .then((wordList) => {
        if (!didCancel) {
          setState({ error: null, wordList });
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setState({ error, wordList: null });
        }
      });

    return () => {
      didCancel = true;
    };
  }, [language, retry, source]);

  return [state, () => setRetry((value) => value + 1)] as const;
}
