import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { startDevServer } from "./common";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

test("returns the directly spawned Next CLI so its exit includes shutdown writes", () => {
  const remove = vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);
  const child = {} as ChildProcess;
  vi.mocked(spawn).mockReturnValue(child);
  const nextCli = createRequire(path.join(process.cwd(), "package.json")).resolve("next/dist/bin/next");

  expect(startDevServer(3604, { NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1" })).toBe(child);
  expect(remove).toHaveBeenCalledWith(path.join(process.cwd(), ".next-ui-capture-3604"), {
    recursive: true,
    force: true
  });
  expect(spawn).toHaveBeenCalledWith(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3604"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_UI_CAPTURE: "1",
      NEXT_DIST_DIR: ".next-ui-capture-3604",
      NEXT_PUBLIC_UI_CAPTURE_FAKE_AUDIO: "1"
    }
  });
});
