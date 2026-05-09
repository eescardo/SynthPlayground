import { describe, expect, it } from "vitest";
import { resolveScreenshotScenariosFromLabels, resolveScreenshotScenariosFromLabelsJson } from "./scenarios";

describe("resolveScreenshotScenariosFromLabels", () => {
  it("enables a specific screenshot scenario label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:selection-popover"])).toMatchObject({
      enabled: true,
      value: "selection-popover",
      grep: "@selection-popover",
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
    expect(resolveScreenshotScenariosFromLabelsJson('["bug","screenshots:selection-popover"]')).toMatchObject({
      enabled: true,
      value: "selection-popover",
      grep: "@selection-popover",
      error: ""
    });
  });

  it("parses the macro automation lane label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:macro-automation-lane"])).toMatchObject({
      enabled: true,
      value: "macro-automation-lane",
      grep: "@macro-automation-lane",
      error: ""
    });
  });

  it("parses the microtonal pitches label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:microtonal-pitches"])).toMatchObject({
      enabled: true,
      value: "microtonal-pitches",
      grep: "@microtonal-pitches",
      error: ""
    });
  });

  it("parses the patch baseline diff label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:patch-baseline-diff"])).toMatchObject({
      enabled: true,
      value: "patch-baseline-diff",
      grep: "@patch-baseline-diff",
      error: ""
    });
  });

  it("parses the patch expanded face label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:patch-expanded-face"])).toMatchObject({
      enabled: true,
      value: "patch-expanded-face",
      grep: "@patch-expanded-face",
      error: ""
    });
  });

  it("parses the patch Sprout chat label", () => {
    expect(resolveScreenshotScenariosFromLabels(["screenshots:patch-sprout-chat"])).toMatchObject({
      enabled: true,
      value: "patch-sprout-chat",
      grep: "@patch-sprout-chat",
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
