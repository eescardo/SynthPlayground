import { Project } from "@/types/music";

/**
 * Project snapshots are immutable once they enter app state.
 *
 * Composer and patch-workspace edits must return replacement Project objects
 * rather than mutating the current snapshot in place. The audio renderer relies
 * on this contract: WASM planning caches are keyed by project object identity,
 * so same-reference mutation could otherwise reuse stale patch/track layout.
 */
const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (process.env.NODE_ENV === "production" || typeof value !== "object" || value === null) {
    return value;
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);

  for (const child of Object.values(objectValue)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
};

export const freezeProjectSnapshot = (project: Project): Project => deepFreeze(project);
