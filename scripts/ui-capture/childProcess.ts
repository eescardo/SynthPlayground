import type { ChildProcess } from "node:child_process";

const DEFAULT_GRACEFUL_TIMEOUT_MS = 1_000;
const DEFAULT_FORCE_TIMEOUT_MS = 1_000;

interface StopChildProcessOptions {
  gracefulTimeoutMs?: number;
  forceTimeoutMs?: number;
}

interface ExitWaitResult {
  exited: boolean;
  error?: Error;
}

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<ExitWaitResult> =>
  new Promise((resolve) => {
    let observedError: Error | undefined;
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const finish = (exited: boolean) => {
      cleanup();
      resolve({ exited, error: observedError });
    };
    const onExit = () => finish(true);
    const onError = (error: Error) => {
      observedError ??= error;
    };

    child.once("exit", onExit);
    child.on("error", onError);
    timer = setTimeout(() => finish(hasExited(child)), timeoutMs);

    // The process may have exited between the caller's check and subscribing.
    if (hasExited(child)) finish(true);
  });

const signal = (child: ChildProcess, name: NodeJS.Signals): Error | undefined => {
  try {
    if (child.kill(name)) return undefined;
    return new Error(`Child process rejected ${name}`);
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

/** Stops a child process, escalating to SIGKILL when graceful shutdown times out. */
export const stopChildProcess = async (
  child: ChildProcess,
  options: StopChildProcessOptions = {}
): Promise<void> => {
  if (hasExited(child)) return;

  const gracefulExit = waitForExit(child, options.gracefulTimeoutMs ?? DEFAULT_GRACEFUL_TIMEOUT_MS);
  const gracefulSignalError = signal(child, "SIGTERM");
  const gracefulResult = await gracefulExit;
  if (gracefulResult.exited || hasExited(child)) return;

  const forcedExit = waitForExit(child, options.forceTimeoutMs ?? DEFAULT_FORCE_TIMEOUT_MS);
  const forceSignalError = signal(child, "SIGKILL");
  const forcedResult = await forcedExit;
  if (forcedResult.exited || hasExited(child)) return;

  throw new Error("Child process did not exit after SIGKILL", {
    cause: forcedResult.error ?? gracefulResult.error ?? forceSignalError ?? gracefulSignalError
  });
};
