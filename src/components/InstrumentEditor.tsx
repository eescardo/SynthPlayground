"use client";

import { useMemo } from "react";
import { InstrumentToolbar } from "@/components/patch/InstrumentToolbar";
import { PatchEditorCanvas } from "@/components/patch/PatchEditorCanvas";
import { createInstrumentEditorPreviewReadyKey } from "@/components/patch/instrumentEditorPreview";
import { PatchEditorSession } from "@/components/patch/patchEditorSession";
import { useAfterStateCommit } from "@/hooks/useAfterStateCommit";
import { resolvePatchSource } from "@/lib/patch/source";

interface InstrumentEditorProps {
  session: PatchEditorSession;
}

export function InstrumentEditor(props: InstrumentEditorProps) {
  const { actions, editorSessionKey, model } = props.session;
  const { invalid, macroValues, patch } = model;
  const patchSource = resolvePatchSource(patch);
  const structureLocked = patchSource === "preset";
  const previewReadyCommitKey = useMemo(
    () => createInstrumentEditorPreviewReadyKey(editorSessionKey, patch.id, macroValues),
    [editorSessionKey, macroValues, patch.id]
  );

  useAfterStateCommit({
    commitKey: previewReadyCommitKey,
    enabled: Boolean(actions.onReady),
    onCommit: () => actions.onReady?.(macroValues)
  });

  return (
    <section className={`instrument-editor${invalid ? " invalid" : ""}`}>
      <InstrumentToolbar patch={patch} invalid={invalid} />

      {model.migrationNotice && <p className="warn">{model.migrationNotice}</p>}
      {model.patchEditError && <p className="error">{model.patchEditError}</p>}
      {invalid && (
        <p className="error">
          This instrument patch is invalid. Track playback may fail until you update the preset or fix the conflicting
          bindings.
        </p>
      )}

      <PatchEditorCanvas
        model={{
          ...model,
          structureLocked
        }}
        actions={actions}
      />
    </section>
  );
}
