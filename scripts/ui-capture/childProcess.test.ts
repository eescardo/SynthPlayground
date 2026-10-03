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
    expect(child.listenerCount("error")).toBe(0);
  });

  it("escalates to SIGKILL when SIGTERM is ignored", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn((signal: NodeJS.Signals) => {
        if (signal === "SIGKILL") {
          child.signalCode = signal;
          child.emit("exit", null, signal);
        }
        return true;
      })
    });

    try {
      const stopped = stopChildProcess(child as unknown as ChildProcess, {
        gracefulTimeoutMs: 100,
        forceTimeoutMs: 100
      });
      await vi.advanceTimersByTimeAsync(100);
      await stopped;

      expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
      expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
      expect(child.listenerCount("exit")).toBe(0);
      expect(child.listenerCount("error")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects after a bounded force timeout and preserves the process error", async () => {
    vi.useFakeTimers();
    const processError = new Error("spawn failed");
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(() => false)
    });

    try {
      const stopped = stopChildProcess(child as unknown as ChildProcess, {
        gracefulTimeoutMs: 100,
        forceTimeoutMs: 100
      });
      child.emit("error", processError);
      const rejection = expect(stopped).rejects.toMatchObject({
        message: "Child process did not exit after SIGKILL",
        cause: processError
      });
      await vi.advanceTimersByTimeAsync(200);
      await rejection;

      expect(child.kill).toHaveBeenCalledTimes(2);
      expect(child.listenerCount("exit")).toBe(0);
      expect(child.listenerCount("error")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tolerates a failed graceful signal when the child exits concurrently", async () => {
    const signalError = new Error("no such process");
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null,
      kill: vi.fn(() => {
        child.exitCode = 0;
        child.emit("exit", 0, null);
        throw signalError;
      })
    });

    await expect(stopChildProcess(child as unknown as ChildProcess)).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.listenerCount("exit")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
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

  it("force-kills a real child that ignores SIGTERM", async () => {
    const child = spawn(process.execPath, [
      "-e",
      'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000);'
    ]);
    try {
      await once(child.stdout!, "data");
      await stopChildProcess(child, { gracefulTimeoutMs: 50, forceTimeoutMs: 1_000 });
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBe("SIGKILL");
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
  }, 3000);
});
