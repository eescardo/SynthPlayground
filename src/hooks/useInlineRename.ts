"use client";

import { useCallback, useEffect, useState } from "react";

interface UseInlineRenameOptions {
  value: string;
  onCommit: (nextValue: string) => void;
}

export function useInlineRename(options: UseInlineRenameOptions) {
  const { onCommit, value } = options;
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const commit = useCallback(() => {
    const nextValue = draft.trim();
    if (nextValue.length > 0 && nextValue !== value) {
      onCommit(nextValue);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }, [draft, onCommit, value]);

  return {
    cancel,
    commit,
    draft,
    editing,
    setDraft,
    setEditing
  };
}
