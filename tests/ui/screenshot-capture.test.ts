import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { SCREENSHOT_SCENARIOS, type ScreenshotScenario } from "../../scripts/ui-screenshots/scenarios";

const repoRoot = process.cwd();

const cleanupLabels = new Set<string>();

afterEach(() => {
  for (const label of cleanupLabels) {
    fs.rmSync(path.join(repoRoot, "artifacts", "screenshots", label), { recursive: true, force: true });
  }
  cleanupLabels.clear();
});

describe.sequential("ui screenshot capture", () => {
  test.each([...SCREENSHOT_SCENARIOS])("captures %s without errors", (scenario) => {
    const label = `vitest-${scenario}`;
    cleanupLabels.add(label);

    execFileSync("node", ["--import", "tsx", "scripts/ui-screenshots/capture.ts", scenario], {
      cwd: repoRoot,
      env: {
        ...process.env,
        SCREENSHOT_LABEL: label,
        PLAYWRIGHT_PORT: portForScenario(scenario)
      },
      stdio: "pipe"
    });

    const outputPath = path.join(repoRoot, "artifacts", "screenshots", label, `${scenario}.png`);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
  }, 120_000);
});

function portForScenario(scenario: ScreenshotScenario): string {
  const offset = [...SCREENSHOT_SCENARIOS].indexOf(scenario);
  return String(3400 + offset);
}
