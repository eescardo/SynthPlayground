import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

/** Signaled processes have a signalCode but a null exitCode, and cannot exit again. */
export const stopChildProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
};
