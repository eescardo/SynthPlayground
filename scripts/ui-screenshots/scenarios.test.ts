import { describe, expect, it } from "vitest";
import {
  resolveScreenshotScenariosFromLabels,
  resolveScreenshotScenariosFromLabelsJson
} from "./scenarios";

describe("resolveScreenshotScenariosFromLabels", () => {
  it("enables a specific screenshot scenario label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:track-note-hover"])).toMatchObject({
      enabled: true,
      value: "track-note-hover",
      grep: "@track-note-hover",
      error: ""
    });
  });

  it("treats the broad screenshots label as all scenarios", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots"])).toMatchObject({
      enabled: true,
      value: "all",
      grep: "",
      error: ""
    });
  });
});

describe("resolveScreenshotScenariosFromLabelsJson", () => {
  it("parses labels from a JSON payload", () => {
    expect(resolveScreenshotScenariosFromLabelsJson('["bug","screenshots:track-note-hover"]')).toMatchObject({
      enabled: true,
      value: "track-note-hover",
      grep: "@track-note-hover",
      error: ""
    });
  });

  it("returns a validation error for malformed JSON", () => {
    expect(resolveScreenshotScenariosFromLabelsJson("not-json")).toMatchObject({
      enabled: false,
      error: "Screenshot labels payload must be valid JSON."
    });
  });
});
