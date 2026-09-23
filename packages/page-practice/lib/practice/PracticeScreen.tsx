import { catchError } from "@keybr/debug";
import { KeyboardProvider } from "@keybr/keyboard";
import { schedule } from "@keybr/lang";
import { type Lesson } from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { LoadingProgress } from "@keybr/pages-shared";
import { type Result, useResults } from "@keybr/result";
import { useSettings } from "@keybr/settings";
import { useEffect, useMemo, useState } from "react";
import { SentenceModeSwitch } from "../SentenceModeSwitch.tsx";
import { Controller } from "./Controller.tsx";
import { displayEvent, Progress } from "./state/index.ts";

export function PracticeScreen() {
  return (
    <KeyboardProvider>
      <SentenceModeSwitch />
      <LessonLoader>
        {(lesson) => <ProgressUpdater lesson={lesson} />}
      </LessonLoader>
    </KeyboardProvider>
  );
}

function ProgressUpdater({ lesson }: { readonly lesson: Lesson }) {
  const { results, appendResults } = useResults();
  const [progress, { total, current }] = useProgress(lesson, results);
  if (progress == null) {
    return <LoadingProgress total={total} current={current} />;
  } else {
    return (
      <Controller
        progress={progress}
        onResult={(result) => {
          if (result.validate()) {
            progress.append(result, displayEvent);
            appendResults([result]);
          }
        }}
      />
    );
  }
}

function useProgress(lesson: Lesson, results: readonly Result[]) {
  const { settings } = useSettings();
  const [seededProgress, setSeededProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState({ total: 0, current: 0 });
  const progress = useMemo(
    () => new Progress(settings, lesson),
    [settings, lesson],
  );
  useEffect(() => {
    // Populating the progress object can take a long time, so we do this
    // asynchronously, interleaved with the browser event loop to avoid
    // freezing of the UI.
    const controller = new AbortController();
    const { signal } = controller;
    setSeededProgress(null);
    setLoading({ total: 0, current: 0 });
    const updateLoading = (value: { total: number; current: number }) => {
      if (!signal.aborted) {
        setLoading(value);
      }
    };
    schedule(progress.seedAsync(lesson.filter(results), updateLoading), {
      signal,
    })
      .then(() => {
        if (!signal.aborted) {
          setSeededProgress(progress);
        }
      })
      .catch(catchError);
    return () => {
      controller.abort();
    };
  }, [progress, lesson, results]);
  return [seededProgress === progress ? progress : null, loading] as const;
}
