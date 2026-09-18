import { test } from "node:test";
import { equal } from "rich-assert";
import { censor } from "./censor.ts";
import { FakePhoneticModel } from "./fake.ts";
import { Filter } from "./filter.ts";

test("censor returns an unavailable word after bounded retries", () => {
  const model = censor(new FakePhoneticModel(["fuck"]));

  equal(model.nextWord(Filter.empty), "");
});

test("censor preserves allowed words", () => {
  const model = censor(new FakePhoneticModel(["love"]));

  equal(model.nextWord(Filter.empty), "love");
});
