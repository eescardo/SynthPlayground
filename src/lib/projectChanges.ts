import { extendExplicitCompositionEndToLastNote } from "@/lib/compositionEnd";
import { pushHistory, type HistoryState } from "@/lib/history";
import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import type { Project } from "@/types/music";

export interface ProjectChangeOptions {
  actionKey?: string;
  coalesce?: boolean;
  onCommitted?: (project: Project) => void;
  skipHistory?: boolean;
}

export type CommitProjectChange = (updater: (current: Project) => Project, options?: ProjectChangeOptions) => void;

/** Apply project rules at the edit boundary, before handing snapshots to history. */
export function applyProjectChange(
  previous: HistoryState<Project>,
  updater: (current: Project) => Project,
  options?: ProjectChangeOptions
): HistoryState<Project> {
  // Materialize an existing extension before an edit can delete its tail note.
  const current = extendExplicitCompositionEndToLastNote(previous.current);
  const next = extendExplicitCompositionEndToLastNote(updater(current));
  if (next === previous.current) return previous;

  const history = current === previous.current ? previous : { ...previous, current: freezeProjectSnapshot(current) };
  const frozenNext = freezeProjectSnapshot(next);
  options?.onCommitted?.(frozenNext);
  return options?.skipHistory ? { ...history, current: frozenNext } : pushHistory(history, frozenNext, options);
}

/** Reconcile restored/replaced projects without adding an undo step or clearing redo. */
export function reconcileProjectRules(previous: HistoryState<Project>): HistoryState<Project> {
  const next = extendExplicitCompositionEndToLastNote(previous.current);
  return next === previous.current ? previous : { ...previous, current: freezeProjectSnapshot(next) };
}
