import { Dispatch, SetStateAction } from "react";
import { MacroPanel } from "@/components/MacroPanel";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import { SPEAKER_Y_OFFSET } from "@/components/trackCanvasConstants";
import { TrackLayout, TrackCanvasAutomationActions, TrackCanvasTrackActions } from "@/components/trackCanvasTypes";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { Project, Track } from "@/types/music";

interface TrackHeaderOverlaysProps {
  project: Project;
  trackLayouts: TrackLayout[];
  selectedTrackId?: string;
  invalidPatchIds?: Set<string>;
  editingTrackId: string | null;
  editingTrackName: string;
  setEditingTrackId: Dispatch<SetStateAction<string | null>>;
  setEditingTrackName: Dispatch<SetStateAction<string>>;
  volumePopoverTrackId: string | null;
  openVolumePopover: (trackId: string) => void;
  scheduleVolumePopoverOpen: (trackId: string) => void;
  scheduleVolumePopoverDismiss: () => void;
  cancelScheduledVolumePopoverDismiss: () => void;
  trackActions: TrackCanvasTrackActions;
}

interface TrackMacroPanelProps {
  selectedTrack: Track | null;
  selectedPatch: Project["patches"][number] | null;
  trackActions: TrackCanvasTrackActions;
  automationActions: TrackCanvasAutomationActions;
}

const getPatchOptionLabel = (patch: Project["patches"][number]) => {
  const presetStatus = resolvePatchPresetStatus(patch);
  if (presetStatus === "legacy_preset") {
    return `${patch.name} (Legacy Preset)`;
  }
  if (presetStatus === "preset_update_available") {
    return `${patch.name} (Preset Update Available)`;
  }
  if (resolvePatchSource(patch) === "custom") {
    return `${patch.name} (Custom)`;
  }
  return `${patch.name} (Preset)`;
};

export function TrackHeaderOverlays({
  project,
  trackLayouts,
  selectedTrackId,
  invalidPatchIds,
  editingTrackId,
  editingTrackName,
  setEditingTrackId,
  setEditingTrackName,
  volumePopoverTrackId,
  openVolumePopover,
  scheduleVolumePopoverOpen,
  scheduleVolumePopoverDismiss,
  cancelScheduledVolumePopoverDismiss,
  trackActions
}: TrackHeaderOverlaysProps) {
  return (
    <div className="track-header-overlays">
      {project.tracks.map((track) => {
        const layout = trackLayouts.find((entry) => entry.trackId === track.id);
        if (!layout) {
          return null;
        }
        const effectiveVolume = track.mute ? 0 : track.volume;
        const rememberedVolume = track.volume;

        return (
          <div key={track.id}>
            <button
              type="button"
              className="track-name-button"
              aria-label={`Rename track ${track.name}`}
              style={{
                top: `${layout.y + 8}px`,
                cursor: selectedTrackId === track.id ? "text" : "default"
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (selectedTrackId === track.id) {
                  setEditingTrackId(track.id);
                  setEditingTrackName(track.name);
                } else {
                  trackActions.onSelectTrack(track.id);
                }
              }}
            />
            <button
              type="button"
              className="track-volume-button"
              aria-label={`Track volume for ${track.name}`}
              aria-expanded={volumePopoverTrackId === track.id}
              style={{
                top: `${layout.y + SPEAKER_Y_OFFSET}px`
              }}
              onMouseEnter={() => scheduleVolumePopoverOpen(track.id)}
              onMouseLeave={() => scheduleVolumePopoverDismiss()}
              onClick={(event) => {
                event.stopPropagation();
                trackActions.onToggleTrackMute(track.id);
                openVolumePopover(track.id);
              }}
            />
            {volumePopoverTrackId === track.id && (
              <TrackVolumePopover
                trackName={track.name}
                effectiveVolume={effectiveVolume}
                rememberedVolume={rememberedVolume}
                muted={Boolean(track.mute)}
                top={`${layout.y + 6}px`}
                onMouseEnter={() => cancelScheduledVolumePopoverDismiss()}
                onMouseLeave={() => scheduleVolumePopoverDismiss()}
                onVolumeChange={(volume, options) => trackActions.onSetTrackVolume(track.id, volume, options)}
              />
            )}
            {editingTrackId === track.id && (
              <input
                className="track-name-input"
                value={editingTrackName}
                style={{ top: `${layout.y + 8}px` }}
                autoFocus
                onChange={(event) => setEditingTrackName(event.target.value)}
                onBlur={() => {
                  const nextName = editingTrackName.trim();
                  if (nextName) {
                    trackActions.onRenameTrack(track.id, nextName);
                  }
                  setEditingTrackId(null);
                  setEditingTrackName("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setEditingTrackId(null);
                    setEditingTrackName("");
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            )}
            <select
              className={`track-patch-select${(invalidPatchIds?.has(track.instrumentPatchId) ?? false) ? " invalid" : ""}`}
              value={track.instrumentPatchId}
              style={{ top: `${layout.y + 44}px` }}
              onChange={(event) => trackActions.onUpdateTrackPatch(track.id, event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {project.patches.map((patch) => (
                <option key={patch.id} value={patch.id}>
                  {getPatchOptionLabel(patch)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

export function TrackMacroPanel({
  selectedTrack,
  selectedPatch,
  trackActions,
  automationActions
}: TrackMacroPanelProps) {
  if (!selectedTrack || !selectedPatch) {
    return null;
  }

  return (
    <div className="track-macro-panel-shell">
      <div className="track-macro-panel-header">
        <div>
          <strong>Track Macros</strong>
          <span className="track-macro-panel-subtitle">
            {selectedTrack.name} · {selectedPatch.name}
          </span>
        </div>
        <div className="track-macro-panel-actions">
          <button type="button" onClick={() => trackActions.onResetTrackMacros(selectedTrack.id)}>
            Reset
          </button>
          <button type="button" onClick={() => trackActions.onToggleTrackMacroPanel(selectedTrack.id)}>
            {selectedTrack.macroPanelExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {selectedTrack.macroPanelExpanded && (
        <MacroPanel
          patch={selectedPatch}
          macroValues={selectedTrack.macroValues}
          automatedMacroIds={new Set(Object.keys(selectedTrack.macroAutomations))}
          automationExpandedByMacroId={new Map(
            Object.values(selectedTrack.macroAutomations).map((lane) => [lane.macroId, lane.expanded] as const)
          )}
          onMacroChange={(macroId, normalized) =>
            automationActions.onChangeTrackMacro(selectedTrack.id, macroId, normalized)
          }
          onMacroCommit={(macroId, normalized) =>
            automationActions.onChangeTrackMacro(selectedTrack.id, macroId, normalized, { commit: true })
          }
          onBindMacroToAutomation={(macroId, normalized) =>
            automationActions.onBindTrackMacroToAutomation(selectedTrack.id, macroId, normalized)
          }
          onUnbindMacroFromAutomation={(macroId) =>
            automationActions.onUnbindTrackMacroFromAutomation(selectedTrack.id, macroId)
          }
          onToggleMacroAutomationLane={(macroId) =>
            automationActions.onToggleTrackMacroAutomationLane(selectedTrack.id, macroId)
          }
        />
      )}
    </div>
  );
}
