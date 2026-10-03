import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import type { ChildProcess } from "node:child_process";
import { chromium } from "@playwright/test";
import { expect, test } from "vitest";
import { startDevServer, waitForServer } from "../../scripts/ui-capture/common";

const PORT = 3604;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const distDir = path.join(process.cwd(), `.next-ui-capture-${PORT}`);

const stopServer = async (server: ChildProcess) => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, "exit", { signal: AbortSignal.timeout(5_000) });
  server.kill("SIGTERM");
  try {
    await exited;
  } catch (error) {
    server.kill("SIGKILL");
    throw error;
  }
};

test("server exit finishes shutdown writes before the capture directory is removed and reused", async () => {
  // Exercise real Next.js shutdown: a launcher exiting is not enough, because
  // its child can still recreate trace and telemetry files in this directory.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    // On the last cycle the worker ignores SIGTERM, exercising the Next CLI's
    // bounded forced-worker shutdown as well as its normal graceful path.
    const server = startDevServer(
      PORT,
      iteration === 2 ? { NEXT_MANUAL_SIG_HANDLE: "1", NEXT_EXIT_TIMEOUT_MS: "100" } : undefined
    );
    try {
      await waitForServer(BASE_URL, 60_000);
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(BASE_URL);
        await page.locator(".track-canvas-shell").waitFor();
      } finally {
        await browser.close();
      }

      await stopServer(server);
      fs.rmSync(distDir, { recursive: true, force: true });
      // Check throughout a bounded observation window, rather than only once
      // before the old CLI has had time to flush its shutdown traces.
      for (let sample = 0; sample < 10; sample += 1) {
        await delay(25);
        expect(fs.existsSync(distDir), "shutdown must not recreate the removed capture directory").toBe(false);
      }
    } finally {
      await stopServer(server);
    }
  }
}, 120_000);
