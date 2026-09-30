import { describe, expect, it } from "vitest";
import { runCaptureScenarios } from "./runCaptureScenarios";

describe("runCaptureScenarios", () => {
  it("finishes later captures and reports every failed scenario with its cause", async () => {
    const captured: string[] = [];
    const beforeOnlyError = new Error("Base revision has no mixer scrolling");
    const renderError = new Error("Expanded face did not render");
    const errors = new Map([
      ["mixer-scroll", beforeOnlyError],
      ["expanded-face", renderError]
    ]);
    const run = runCaptureScenarios(["mixer-scroll", "main-view", "expanded-face", "patch-editor"], async (name) => {
      if (errors.has(name)) throw errors.get(name);
      captured.push(name);
    });

    await expect(run).rejects.toBeInstanceOf(AggregateError);
    await expect(run).rejects.toMatchObject({
      errors: [expect.objectContaining({ cause: beforeOnlyError }), expect.objectContaining({ cause: renderError })]
    });
    await expect(run).rejects.toThrow("[mixer-scroll]");
    await expect(run).rejects.toThrow("[expanded-face]");
    expect(captured).toEqual(["main-view", "patch-editor"]);
  });

  it("succeeds when every requested scenario captures", async () => {
    const captured: string[] = [];
    await runCaptureScenarios(["main-view", "record-mode"], async (name) => {
      captured.push(name);
    });
    expect(captured).toEqual(["main-view", "record-mode"]);
  });
});
