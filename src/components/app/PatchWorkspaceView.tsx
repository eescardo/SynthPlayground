"use client";

import type { ComponentProps } from "react";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface PatchWorkspaceViewProps {
  patch: Patch;
  previewPitch: string;
  migrationNotice?: string | null;
  selectedNodeId?: string;
  validationIssues: ComponentProps<typeof InstrumentEditor>["validationIssues"];
  invalid?: boolean;
  canRemovePatch: boolean;
  onBackToComposer: () => void;
  onOpenHelp: () => void;
  onRenamePatch: (name: string) => void;
  onDuplicatePatch: () => void;
  onUpdatePreset: () => void;
  onRequestRemovePatch: () => void;
  onOpenPreviewPitchPicker: () => void;
  onPreviewNow: () => void;
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
}

export function PatchWorkspaceView(props: PatchWorkspaceViewProps) {
  return (
    <section className="patch-workspace-shell">
      <div className="patch-workspace-header">
        <div className="patch-workspace-heading">
          <button type="button" className="patch-workspace-back-button" onClick={props.onBackToComposer}>
            Back to Composer
          </button>
          <div>
            <h2>Patch Workspace</h2>
            <p className="muted">{props.patch.name}</p>
          </div>
        </div>
        <button type="button" onClick={props.onOpenHelp}>Help</button>
      </div>

      <InstrumentEditor
        patch={props.patch}
        previewPitch={props.previewPitch}
        migrationNotice={props.migrationNotice}
        selectedNodeId={props.selectedNodeId}
        validationIssues={props.validationIssues}
        invalid={props.invalid}
        onRenamePatch={props.onRenamePatch}
        onDuplicatePatch={props.onDuplicatePatch}
        onUpdatePreset={props.onUpdatePreset}
        canRemovePatch={props.canRemovePatch}
        onRequestRemovePatch={props.onRequestRemovePatch}
        onOpenPreviewPitchPicker={props.onOpenPreviewPitchPicker}
        onPreviewNow={props.onPreviewNow}
        onSelectNode={props.onSelectNode}
        onApplyOp={props.onApplyOp}
        onExposeMacro={props.onExposeMacro}
      />
    </section>
  );
}
