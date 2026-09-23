import { test } from "node:test";
import { render } from "@testing-library/react";
import { equal } from "rich-assert";
import { SentenceTranslation } from "./SentenceTranslation.tsx";

test("renders translations in the same pair order", () => {
  const result = render(
    <SentenceTranslation
      pairs={[
        { id: "tatoeba:1", en: "Hello.", ru: "Привет." },
        { id: "tatoeba:2", en: "World.", ru: "Мир." },
      ]}
    />,
  );

  equal(result.getByTestId("sentence-translation").textContent, "Привет.Мир.");
  result.unmount();
});
