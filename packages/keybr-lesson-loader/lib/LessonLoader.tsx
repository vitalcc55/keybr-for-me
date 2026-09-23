import { type SentencePair, type WordListPolicy } from "@keybr/content";
import { loadContent } from "@keybr/content-books";
import {
  loadSentencePairs,
  loadWordList,
  resolveWordListDescriptor,
  resolveWordListPolicy,
} from "@keybr/content-words";
import { ErrorAlert } from "@keybr/debug";
import { KeyboardOptions, Language, useKeyboard } from "@keybr/keyboard";
import {
  BooksLesson,
  CodeLesson,
  CustomTextLesson,
  GuidedLesson,
  isSentenceMode,
  type Lesson,
  lessonProps,
  LessonType,
  NumbersLesson,
  SentenceLesson,
  WordListLesson,
} from "@keybr/lesson";
import { LoadingProgress } from "@keybr/pages-shared";
import { type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { type Settings, useSettings } from "@keybr/settings";
import { Button } from "@keybr/widget";
import { type ReactNode, useEffect, useMemo, useState } from "react";

export function LessonLoader({
  children,
  fallback = <LoadingProgress />,
  loadSentences = loadSentencePairs,
}: {
  readonly children: (result: Lesson) => ReactNode;
  readonly fallback?: ReactNode;
  readonly loadSentences?: () => Promise<readonly SentencePair[]>;
}): ReactNode {
  const { settings, updateSettings } = useSettings();
  const lessonType = settings.get(lessonProps.type);
  const sentenceMode = isSentenceMode(settings);
  const options = KeyboardOptions.from(settings);
  const { language } = options;
  const sourceResolution = useMemo(() => {
    try {
      return {
        error: null,
        policy: resolveSourcePolicy(settings, language, lessonType),
      };
    } catch (error) {
      return { error, policy: null };
    }
  }, [language, lessonType, settings]);
  if (sourceResolution.error != null) {
    return (
      <>
        <ErrorAlert
          title="Invalid lesson settings."
          error={sourceResolution.error}
        />
        <Button
          size={16}
          label="Reset lesson settings"
          onClick={() => updateSettings(settings.reset())}
        />
      </>
    );
  }
  const sourcePolicy = sourceResolution.policy;
  const modelSource =
    sourcePolicy?.source === "ru-personal" ? "ru-personal" : "standard";
  return (
    <PhoneticModelLoader
      language={language}
      source={modelSource}
      sourceKey={sentenceMode ? "sentences-en-ru" : sourcePolicy?.identity}
    >
      {(model) => (
        <Loader
          key={`${lessonType.id}:${language.id}:${options.layout.id}:${sourcePolicy?.source ?? "sentences"}:${sourcePolicy?.limit ?? "inherit"}:${sourcePolicy?.identity ?? "sentences-en-ru"}:${JSON.stringify(settings.toJSON())}`}
          language={language}
          model={model}
          policy={sourcePolicy}
          sentenceMode={sentenceMode}
          loadSentences={loadSentences}
          fallback={fallback}
        >
          {children}
        </Loader>
      )}
    </PhoneticModelLoader>
  );
}

function Loader({
  language,
  model,
  policy,
  sentenceMode,
  loadSentences,
  children,
  fallback,
}: {
  readonly language: Language;
  readonly model: PhoneticModel;
  readonly policy: WordListPolicy | null;
  readonly sentenceMode: boolean;
  readonly loadSentences: () => Promise<readonly SentencePair[]>;
  readonly children: (result: Lesson) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const [{ error, result }, retry] = useLoader(
    language,
    model,
    policy,
    sentenceMode,
    loadSentences,
  );
  if (error != null) {
    return (
      <>
        <ErrorAlert title="Could not load the lesson." error={error} />
        <Button size={16} label="Retry" onClick={retry} />
      </>
    );
  }
  if (result == null) {
    return fallback;
  } else {
    return children(result);
  }
}

function useLoader(
  language: Language,
  model: PhoneticModel,
  policy: WordListPolicy | null,
  sentenceMode: boolean,
  loadSentences: () => Promise<readonly SentencePair[]>,
) {
  const { settings } = useSettings();
  const keyboard = useKeyboard();
  const [state, setState] = useState<{
    readonly result: Lesson | null;
    readonly error: unknown;
  }>({ result: null, error: null });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let didCancel = false;
    setState({ result: null, error: null });

    const load = async (): Promise<void> => {
      if (sentenceMode) {
        const pairs = await loadSentences();
        if (!didCancel) {
          setState({
            error: null,
            result: new SentenceLesson(settings, keyboard, model, pairs),
          });
        }
        return;
      }
      if (policy == null) {
        throw new Error("A word-list policy is required for a regular lesson.");
      }
      switch (settings.get(lessonProps.type)) {
        case LessonType.GUIDED: {
          const wordList = await loadWordList(language, policy.source);
          if (!didCancel) {
            setState({
              error: null,
              result: new GuidedLesson(
                settings,
                keyboard,
                model,
                wordList,
                policy,
              ),
            });
          }
          break;
        }
        case LessonType.WORDLIST: {
          const wordList = await loadWordList(language, policy.source);
          if (!didCancel) {
            setState({
              error: null,
              result: new WordListLesson(
                settings,
                keyboard,
                model,
                wordList,
                policy,
              ),
            });
          }
          break;
        }
        case LessonType.BOOKS: {
          const book = settings.get(lessonProps.books.book);
          const content = await loadContent(book);
          if (!didCancel) {
            setState({
              error: null,
              result: new BooksLesson(settings, keyboard, model, {
                book,
                content,
              }),
            });
          }
          break;
        }
        case LessonType.CUSTOM: {
          if (!didCancel) {
            setState({
              error: null,
              result: new CustomTextLesson(settings, keyboard, model),
            });
          }
          break;
        }
        case LessonType.CODE: {
          if (!didCancel) {
            setState({
              error: null,
              result: new CodeLesson(settings, keyboard, model),
            });
          }
          break;
        }
        case LessonType.NUMBERS: {
          if (!didCancel) {
            setState({
              error: null,
              result: new NumbersLesson(settings, keyboard, model),
            });
          }
          break;
        }
        default:
          throw new Error();
      }
    };

    load().catch((error) => {
      if (!didCancel) {
        setState({ error, result: null });
      }
    });

    return () => {
      didCancel = true;
    };
  }, [
    language,
    model,
    policy,
    retry,
    sentenceMode,
    settings,
    keyboard,
    loadSentences,
  ]);

  return [state, () => setRetry((value) => value + 1)] as const;
}

function resolveSourcePolicy(
  settings: Settings,
  language: Language,
  lessonType: LessonType,
): WordListPolicy | null {
  if (isSentenceMode(settings)) {
    return null;
  }
  const usesWordList =
    lessonType === LessonType.GUIDED || lessonType === LessonType.WORDLIST;
  if (!usesWordList || language !== Language.RU) {
    return resolveWordListPolicy(
      resolveWordListDescriptor(language, "ru-standard"),
      "inherit",
      settings.get(lessonProps.wordList.wordListSize),
    );
  }
  const source = settings.get(lessonProps.wordList.source);
  const descriptor = resolveWordListDescriptor(language, source);
  return resolveWordListPolicy(
    descriptor,
    settings.get(lessonProps.wordList.limit),
    settings.get(lessonProps.wordList.wordListSize),
  );
}
