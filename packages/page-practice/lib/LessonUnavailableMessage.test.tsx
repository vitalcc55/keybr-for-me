import { test } from "node:test";
import { FakeIntlProvider } from "@keybr/intl";
import { render } from "@testing-library/react";
import { isNotNull } from "rich-assert";
import { LessonUnavailableMessage } from "./LessonUnavailableMessage.tsx";

test("uses sentence-specific unavailable copy", () => {
  const result = render(
    <FakeIntlProvider>
      <LessonUnavailableMessage
        unavailable={{
          kind: "unavailable",
          origin: "sentences",
          fallbackUsed: false,
          reason: "empty-word-list",
          action: "settings",
        }}
      />
    </FakeIntlProvider>,
  );

  isNotNull(
    result.getByText(
      "The local English sentence corpus has no usable pairs for the current keyboard and lesson settings.",
    ),
  );
  result.unmount();
});
