import { catchError } from "@keybr/debug";
import { type Language } from "@keybr/keyboard";
import { LoadingProgress } from "@keybr/pages-shared";
import {
  type PhoneticModel,
  PhoneticModelContext,
} from "@keybr/phonetic-model";
import { type ReactNode, useEffect, useState } from "react";
import { type PhoneticModelSource } from "./assets.ts";
import { loaderImpl } from "./loader.ts";

export function PhoneticModelLoader({
  language,
  source = "standard",
  children,
  fallback = <LoadingProgress />,
}: {
  readonly language: Language;
  readonly source?: PhoneticModelSource;
  readonly children: (result: PhoneticModel) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  return (
    <Loader
      key={`${language.id}:${source}`}
      language={language}
      source={source}
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
  children,
  fallback,
}: {
  readonly language: Language;
  readonly source: PhoneticModelSource;
  readonly children: (result: PhoneticModel) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const result = useLoader(language, source);
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
): PhoneticModel | null {
  const [result, setResult] = useState<PhoneticModel | null>(null);

  useEffect(() => {
    let didCancel = false;

    PhoneticModelLoader.loader(language, source)
      .then((result) => {
        if (!didCancel) {
          setResult(result);
        }
      })
      .catch(catchError);

    return () => {
      didCancel = true;
    };
  }, [language, source]);

  return result;
}
