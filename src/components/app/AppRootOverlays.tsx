"use client";

import { AudioDebugPanel } from "./AudioDebugPanel";
import { BrowserCompatibilityDialog } from "./BrowserCompatibilityDialog";
import { PatchRemovalDialogModal } from "@/components/composer/PatchRemovalDialogModal";
import { PresetUpdateDialogModal } from "@/components/composer/PresetUpdateDialogModal";
import { PitchPickerModal } from "@/components/composer/PitchPickerModal";
import { RecordingDock } from "@/components/composer/RecordingDock";
import { ExplodeSelectionDialog } from "@/components/ExplodeSelectionDialog";
import { LoopConflictDialog } from "@/components/LoopConflictDialog";
import type { useWasmReadiness } from "@/hooks/app/useWasmReadiness";
import type { useLoopSettings } from "@/hooks/useLoopSettings";
import type { useExplodeSelectionDialog } from "@/hooks/useExplodeSelectionDialog";
import type { useComposerTransientUi } from "@/hooks/useComposerTransientUi";
import type { useRecordingController } from "@/hooks/useRecordingController";
import type { usePatchWorkspaceState } from "@/hooks/patch/usePatchWorkspaceState";
import type { useNoteEditor } from "@/hooks/useNoteEditor";
import type { getProjectPresetUpdateSummary } from "@/lib/patch/source";
import type { Project, Track, Note } from "@/types/music";

type AppRootOverlaysProps = Pick<
  ReturnType<typeof useWasmReadiness>,
  "wasmReady" | "browserCompatibilityIssue" | "setBrowserCompatibilityIssue"
> &
  Pick<ReturnType<typeof useLoopSettings>, "loopConflictDialog" | "clearLoopConflictDialog" | "applyLoopSettings"> &
  Pick<
    ReturnType<typeof useExplodeSelectionDialog>,
    "explodeSelectionDialogState" | "setExplodeSelectionDialogState" | "closeExplodeSelectionDialog"
  > &
  Pick<ReturnType<typeof useComposerTransientUi>, "pitchPicker" | "patchRemovalDialog" | "setPatchRemovalDialog"> & {
    project: Project;
    trackNameById: Map<string, string>;
    confirmExplodeSelection: () => void;
    recording: ReturnType<typeof useRecordingController>;
    activeRecordingTrack: Track | undefined;
    pitchPickerNote: Note | undefined;
    patchWorkspace: Pick<
      ReturnType<typeof usePatchWorkspaceState>,
      | "previewPitch"
      | "previewPitchPickerOpen"
      | "setPreviewPitchPickerOpen"
      | "setPreviewPitch"
      | "previewSelectedPatchNow"
    >;
    workspaceView: "composer" | "patch-workspace";
    closePitchPicker: () => void;
    updateNote: ReturnType<typeof useNoteEditor>["updateNote"];
    previewNoteForPitchPicker: (trackId: string, noteId: string, pitch: string) => void;
    confirmRemovePatch: () => void;
    showPresetUpdatePrompt: boolean;
    presetUpdateSummary: ReturnType<typeof getProjectPresetUpdateSummary>;
    dismissPresetUpdatePrompt: () => void;
    updateAllPresetUpdates: () => void;
  };

export function AppRootOverlays({
  wasmReady,
  browserCompatibilityIssue,
  setBrowserCompatibilityIssue,
  loopConflictDialog,
  trackNameById,
  clearLoopConflictDialog,
  applyLoopSettings,
  explodeSelectionDialogState,
  setExplodeSelectionDialogState,
  closeExplodeSelectionDialog,
  confirmExplodeSelection,
  recording,
  activeRecordingTrack,
  pitchPicker,
  pitchPickerNote,
  patchWorkspace,
  workspaceView,
  closePitchPicker,
  updateNote,
  previewNoteForPitchPicker,
  patchRemovalDialog,
  project,
  setPatchRemovalDialog,
  confirmRemovePatch,
  showPresetUpdatePrompt,
  presetUpdateSummary,
  dismissPresetUpdatePrompt,
  updateAllPresetUpdates
}: AppRootOverlaysProps) {
  const rendererLabel = wasmReady ? "wasm" : "wasm (loading)";
  const showDebugOverlay = process.env.NODE_ENV === "development";
  return (
    <>
      {showDebugOverlay && <AudioDebugPanel rendererLabel={rendererLabel} />}

      <BrowserCompatibilityDialog
        issue={browserCompatibilityIssue}
        onClose={() => setBrowserCompatibilityIssue(null)}
      />

      {loopConflictDialog && (
        <LoopConflictDialog
          conflicts={loopConflictDialog.conflicts}
          trackNameById={trackNameById}
          onCancel={clearLoopConflictDialog}
          onSplit={() => applyLoopSettings(loopConflictDialog.nextLoop, { autoSplit: true })}
        />
      )}

      <ExplodeSelectionDialog
        open={Boolean(explodeSelectionDialogState)}
        selectionKind={explodeSelectionDialogState?.selectionKind ?? "note"}
        countText={explodeSelectionDialogState?.countText ?? "2"}
        scope={explodeSelectionDialogState?.scope ?? "selected-tracks"}
        mode={explodeSelectionDialogState?.mode ?? "insert"}
        onClose={closeExplodeSelectionDialog}
        onConfirm={confirmExplodeSelection}
        onCountTextChange={(countText) =>
          setExplodeSelectionDialogState((current) => (current ? { ...current, countText } : current))
        }
        onScopeChange={(scope) =>
          setExplodeSelectionDialogState((current) => (current ? { ...current, scope } : current))
        }
        onModeChange={(mode) => setExplodeSelectionDialogState((current) => (current ? { ...current, mode } : current))}
      />

      <RecordingDock
        open={recording.recordingActive}
        track={activeRecordingTrack}
        title={recording.recordPhase === "count_in" ? "Record Count-In" : "Recording"}
        statusText={recording.recordStatusText}
        hintText={recording.recordingHintText}
        pressedPitches={recording.pressedRecordingPitches}
        onPressStart={(pitch) => {
          if (recording.recordPhase === "recording") {
            recording.startRecordedNote(`pointer:${pitch}`, pitch);
          }
        }}
        onPressEnd={(pitch) => recording.stopRecordedInput(`pointer:${pitch}`)}
      />

      <PitchPickerModal
        open={Boolean(pitchPicker && pitchPickerNote)}
        title="Pick Pitch"
        description="Select a key from C1 to C7. QWERTY-mapped keys are shown on each note."
        selectedPitch={pitchPickerNote?.pitchStr ?? patchWorkspace.previewPitch}
        onClose={closePitchPicker}
        onSelectPitch={(pitch) => {
          if (!pitchPicker) {
            return;
          }
          updateNote(
            pitchPicker.trackId,
            pitchPicker.noteId,
            { pitchStr: pitch },
            {
              actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
            }
          );
          previewNoteForPitchPicker(pitchPicker.trackId, pitchPicker.noteId, pitch);
          closePitchPicker();
        }}
      />

      <PitchPickerModal
        open={patchWorkspace.previewPitchPickerOpen}
        title={workspaceView === "composer" ? "Placement Pitch" : "Default Pitch"}
        description={
          workspaceView === "composer"
            ? "Select the pitch used for keyboard note placement."
            : "Select the shared default pitch used for patch preview and keyboard note placement."
        }
        selectedPitch={patchWorkspace.previewPitch}
        onClose={() => patchWorkspace.setPreviewPitchPickerOpen(false)}
        onSelectPitch={(pitch) => {
          patchWorkspace.setPreviewPitch(pitch);
          patchWorkspace.setPreviewPitchPickerOpen(false);
          patchWorkspace.previewSelectedPatchNow(pitch);
        }}
      />

      <PatchRemovalDialogModal
        dialog={patchRemovalDialog}
        project={project}
        setDialog={setPatchRemovalDialog}
        onConfirm={confirmRemovePatch}
      />

      <PresetUpdateDialogModal
        open={showPresetUpdatePrompt}
        summary={presetUpdateSummary}
        onCancel={dismissPresetUpdatePrompt}
        onUpdateAll={updateAllPresetUpdates}
      />
    </>
  );
}
