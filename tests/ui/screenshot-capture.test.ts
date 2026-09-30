import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { chromium, expect as browserExpect } from "@playwright/test";
import { afterEach, describe, expect, test } from "vitest";
import { SCREENSHOT_SCENARIOS, type ScreenshotScenario } from "../../scripts/ui-screenshots/scenarios";
import { getScenarioDefinition } from "../../scripts/ui-screenshots/registry";
import { startScreenshotServer } from "../../scripts/ui-screenshots/runtime";
import { waitForServer } from "../../scripts/ui-capture/common";

const repoRoot = process.cwd();

const cleanupLabels = new Set<string>();

afterEach(() => {
  for (const label of cleanupLabels) {
    fs.rmSync(path.join(repoRoot, "artifacts", "screenshots", label), { recursive: true, force: true });
  }
  cleanupLabels.clear();
});

describe.sequential("ui screenshot capture", () => {
  test("captures record mode even when WASM assets cannot load", async () => {
    const label = "vitest-record-without-wasm";
    cleanupLabels.add(label);
    const originalConfigs = ["tsconfig.json", "next-env.d.ts"].map((file) => ({
      file,
      content: fs.readFileSync(path.join(repoRoot, file), "utf8")
    }));
    const port = portForScenario("record-mode");
    const server = startScreenshotServer(Number(port));
    try {
      await waitForServer(`http://127.0.0.1:${port}`, 120_000);
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          baseURL: `http://127.0.0.1:${port}`,
          viewport: { width: 1440, height: 1400 }
        });
        const wasmRequests: string[] = [];
        await page.route("**/wasm/pkg/**", async (route) => {
          wasmRequests.push(route.request().url());
          await route.abort();
        });
        await getScenarioDefinition("record-mode").capture(
          page,
          path.join(repoRoot, "artifacts", "screenshots", label, "record-mode.png")
        );
        await browserExpect(page.locator(".recording-dock")).toBeVisible();
        await browserExpect(page.locator(".error")).toHaveCount(0);
        expect(wasmRequests).toEqual([]);
      } finally {
        await browser.close();
      }
    } finally {
      try {
        if (server.exitCode === null && server.signalCode === null) {
          const exited = once(server, "exit");
          server.kill("SIGTERM");
          await exited;
        }
      } finally {
        for (const { file, content } of originalConfigs) {
          fs.writeFileSync(path.join(repoRoot, file), content);
        }
      }
    }
  }, 120_000);

  test.each([...SCREENSHOT_SCENARIOS])(
    "captures %s without errors",
    (scenario) => {
      const label = `vitest-${scenario}`;
      cleanupLabels.add(label);

      execFileSync("node", ["--import", "tsx", "scripts/ui-screenshots/capture.ts", scenario], {
        cwd: repoRoot,
        env: {
          ...process.env,
          SCREENSHOT_LABEL: label,
          PLAYWRIGHT_PORT: portForScenario(scenario)
        },
        maxBuffer: 16 * 1024 * 1024,
        stdio: "pipe"
      });

      const outputPath = path.join(repoRoot, "artifacts", "screenshots", label, `${scenario}.png`);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    },
    120_000
  );
});

function portForScenario(scenario: ScreenshotScenario): string {
  const offset = [...SCREENSHOT_SCENARIOS].indexOf(scenario);
  return String(3400 + offset);
}
