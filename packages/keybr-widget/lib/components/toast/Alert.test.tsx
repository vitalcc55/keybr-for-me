import { test } from "node:test";
import { render } from "@testing-library/react";
import { isNotNull } from "rich-assert";
import { Alert } from "./Alert.tsx";

test("renders inline without a toast provider", () => {
  const r = render(<Alert severity="info">Message</Alert>);

  isNotNull(r.getByText("Message"));
  r.unmount();
});
