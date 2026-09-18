import { test } from "node:test";
import { Settings } from "@keybr/settings";
import { deepEqual } from "rich-assert";
import { lessonUnavailable } from "../lesson.ts";
import { generateFragment } from "./fragment.ts";

test("returns typed unavailable when strict generation has no words", () => {
  const unavailable = lessonUnavailable(
    "guided",
    true,
    "no-valid-candidates",
    "settings",
  );

  deepEqual(
    generateFragment(new Settings(), () => null, { unavailable }),
    unavailable,
  );
});
