import { ErrorAlert } from "@keybr/debug";
import { type Language } from "@keybr/keyboard";
import { LoadingProgress } from "@keybr/pages-shared";
import {
  type PhoneticModel,
  PhoneticModelContext,
} from "@keybr/phonetic-model";
import { Button } from "@keybr/widget";
import { type ReactNode, useEffect, useState } from "react";
import { type PhoneticModelSource } from "./assets.ts";
import { loaderImpl } from "./loader.ts";

export function PhoneticModelLoader({
  language,
  source = "standard",
  sourceKey,
  children,
  fallback = <LoadingProgress />,
}: {
  readonly language: Language;
  readonly source?: PhoneticModelSource;
  readonly sourceKey?: string;
  readonly children: (result: PhoneticModel) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  return (
    <Loader
      key={`${language.id}:${source}:${sourceKey ?? ""}`}
      language={language}
      source={source}
      sourceKey={sourceKey}
      fallback={fallback}
    >
      {children}
    </Loader>
  );
}

export namespace PhoneticModelLoader {
  export let loader: PhoneticModel.Loader = loaderImpl;
}

function Loader({
  language,
  source,
  sourceKey,
  children,
  fallback,
}: {
  readonly language: Language;
  readonly source: PhoneticModelSource;
  readonly sourceKey?: string;
  readonly children: (result: PhoneticModel) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const [{ error, result }, retry] = useLoader(language, source, sourceKey);
  if (error != null) {
    return (
      <>
        <ErrorAlert title="Could not load the phonetic model." error={error} />
        <Button size={16} label="Retry" onClick={retry} />
      </>
    );
  }
  if (result == null) {
    return fallback;
  } else {
    return (
      <PhoneticModelContext.Provider value={result}>
        {children(result)}
      </PhoneticModelContext.Provider>
    );
  }
}

function useLoader(
  language: Language,
  source: PhoneticModelSource,
  sourceKey?: string,
) {
  const [state, setState] = useState<{
    readonly result: PhoneticModel | null;
    readonly error: unknown;
  }>({ result: null, error: null });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let didCancel = false;
    setState({ result: null, error: null });

    PhoneticModelLoader.loader(language, source)
      .then((result) => {
        if (!didCancel) {
          setState({ error: null, result });
        }
      })
      .catch((error) => {
        if (!didCancel) {
          setState({ error, result: null });
        }
      });

    return () => {
      didCancel = true;
    };
  }, [language, retry, source, sourceKey]);

  return [state, () => setRetry((value) => value + 1)] as const;
}
