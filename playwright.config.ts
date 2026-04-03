import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3005);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 1400 },
    trace: "off",
    video: "off",
    screenshot: "off"
  },
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
