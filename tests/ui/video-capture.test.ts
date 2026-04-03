import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { type VideoScenario, VIDEO_SCENARIOS } from "../../scripts/ui-videos/scenarios";

const repoRoot = process.cwd();

const cleanupLabels = new Set<string>();

afterEach(() => {
  for (const label of cleanupLabels) {
    fs.rmSync(path.join(repoRoot, "artifacts", "videos", label), { recursive: true, force: true });
  }
  cleanupLabels.clear();
});

describe.sequential("ui video capture", () => {
  test.each([...VIDEO_SCENARIOS])("captures %s without errors", (scenario) => {
    const label = `vitest-${scenario}`;
    cleanupLabels.add(label);

    execFileSync("node", ["--import", "tsx", "scripts/ui-videos/capture.ts", scenario], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VIDEO_LABEL: label,
        PLAYWRIGHT_PORT: portForScenario(scenario),
        VIDEO_PLAYBACK_DURATION_MS: "800",
        VIDEO_RECORD_COUNT_IN_MS: "400",
        VIDEO_RECORD_HOLD_MS: "150",
        VIDEO_RECORD_GAP_MS: "150",
        VIDEO_RECORD_CYCLES: "2",
        VIDEO_POST_ACTION_SETTLE_MS: "100"
      },
      stdio: "pipe"
    });

    const outputPath = path.join(repoRoot, "artifacts", "videos", label, `${scenario}.webm`);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
  }, 120_000);
});

function portForScenario(scenario: VideoScenario): string {
  const offset = [...VIDEO_SCENARIOS].indexOf(scenario);
  return String(3500 + offset);
}
