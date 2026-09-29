import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { stopChildProcess } from "./childProcess";

describe("stopChildProcess", () => {
  it.each([
    { exitCode: 0, signalCode: null },
    { exitCode: null, signalCode: "SIGTERM" }
  ])("skips a child that already exited: %j", async (state) => {
    const kill = vi.fn();
    await stopChildProcess({ ...state, kill } as unknown as ChildProcess);
    expect(kill).not.toHaveBeenCalled();
  });

  it("subscribes before signaling, even when exit is immediate", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => {
        child.emit("exit", null, "SIGTERM");
        return true;
      })
    });
    await stopChildProcess(child as unknown as ChildProcess);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(child.listenerCount("exit")).toBe(0);
  });

  it("can clean up a real signaled child twice without waiting for a second exit", async () => {
    const child = spawn(process.execPath, ["-e", 'process.stdout.write("ready"); setInterval(() => {}, 1000);']);
    try {
      await once(child.stdout!, "data");
      await stopChildProcess(child);
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBe("SIGTERM");
      await stopChildProcess(child);
    } finally {
      child.kill("SIGKILL");
    }
  }, 3000);
});
