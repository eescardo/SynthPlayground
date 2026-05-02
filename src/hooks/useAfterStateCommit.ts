"use client";

import { useEffect, useRef } from "react";

interface UseAfterStateCommitOptions {
  enabled?: boolean;
  commitKey: string;
  onCommit: () => void;
}

// React does not expose a separate "state has settled" lifecycle beyond the
// commit phase. For the patch-workspace preview path, we only need to know
// when the current props/state for the active editor have committed so the
// workspace can preview with those values.
export function useAfterStateCommit(options: UseAfterStateCommitOptions) {
  const { enabled = true, commitKey, onCommit } = options;
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    onCommitRef.current();
  }, [commitKey, enabled]);
}
