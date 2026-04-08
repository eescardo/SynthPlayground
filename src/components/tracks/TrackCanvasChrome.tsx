import { Dispatch, SetStateAction } from "react";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import { MACRO_PANEL_TOGGLE_Y_OFFSET, SPEAKER_Y_OFFSET } from "@/components/tracks/trackCanvasConstants";
import { TrackLayout, TrackCanvasAutomationActions, TrackCanvasTrackActions } from "@/components/tracks/trackCanvasTypes";
import { getTrackMacroLane, getTrackVolumeLane } from "@/lib/macroAutomation";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { Project } from "@/types/music";

interface TrackHeaderChromeProps {
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

export function TrackHeaderChrome({
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
  trackActions,
  automationActions
}: TrackHeaderChromeProps) {
  return (
    <div className="track-header-overlays">
      {project.tracks.map((track) => {
        const layout = trackLayouts.find((entry) => entry.trackId === track.id);
        if (!layout) {
          return null;
        }
        const trackPatch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
        const volumeLane = getTrackVolumeLane(track);
        const selected = selectedTrackId === track.id;
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
            {selected && (
              <button
                type="button"
                className="track-macro-toggle-button"
                aria-label={track.macroPanelExpanded ? "Collapse macro lanes" : "Expand macro lanes"}
                title={track.macroPanelExpanded ? "Collapse macro lanes" : "Expand macro lanes"}
                style={{
                  top: `${layout.y + MACRO_PANEL_TOGGLE_Y_OFFSET}px`
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  trackActions.onToggleTrackMacroPanel(track.id);
                }}
              >
                {track.macroPanelExpanded ? "^" : "v"}
              </button>
            )}
            {volumePopoverTrackId === track.id && (
              <TrackVolumePopover
                trackName={track.name}
                effectiveVolume={effectiveVolume}
                rememberedVolume={rememberedVolume}
                muted={Boolean(track.mute)}
                automated={Boolean(volumeLane)}
                top={`${layout.y + 6}px`}
                onMouseEnter={() => cancelScheduledVolumePopoverDismiss()}
                onMouseLeave={() => scheduleVolumePopoverDismiss()}
                onVolumeChange={(volume, options) => trackActions.onSetTrackVolume(track.id, volume, options)}
                onBindToAutomation={() => trackActions.onBindTrackVolumeToAutomation(track.id, track.volume / 2)}
                onUnbindFromAutomation={() => trackActions.onUnbindTrackVolumeFromAutomation(track.id)}
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
            {selected && track.macroPanelExpanded && (
              <>
                {volumeLane && (
                  <div className="track-inspector-row icon-only" style={{ top: `${layout.y + 72}px` }}>
                    <div className="track-inspector-row-actions">
                      <button
                        type="button"
                        className="track-inspector-action-button"
                        title="Use fixed value"
                        aria-label="Use fixed value"
                        onClick={() => trackActions.onUnbindTrackVolumeFromAutomation(track.id)}
                      >
                        ◉
                      </button>
                      <button
                        type="button"
                        className="track-inspector-action-button"
                        title={volumeLane.expanded ? "Collapse lane" : "Expand lane"}
                        aria-label={volumeLane.expanded ? "Collapse lane" : "Expand lane"}
                        onClick={() => trackActions.onToggleTrackVolumeAutomationLane(track.id)}
                      >
                        {volumeLane.expanded ? "^" : "v"}
                      </button>
                    </div>
                  </div>
                )}
                {trackPatch?.ui.macros.map((macro) => {
                  const lane = getTrackMacroLane(track, macro.id);
                  const laneLayout = layout.automationLanes.find((entry) => entry.macroId === macro.id);
                  if (!laneLayout) {
                    return null;
                  }
                  const top = laneLayout.y + 1;
                  return (
                    <div key={macro.id} className="track-inspector-row icon-only" style={{ top: `${top}px` }}>
                      <div className="track-inspector-row-actions">
                        {lane ? (
                          <button
                            type="button"
                            className="track-inspector-action-button"
                            title="Use fixed value"
                            aria-label="Use fixed value"
                            onClick={() => automationActions.onUnbindTrackMacroFromAutomation(track.id, macro.id)}
                          >
                            ◉
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="track-inspector-action-button"
                            title="Automate in timeline"
                            aria-label="Automate in timeline"
                            onClick={() =>
                              automationActions.onBindTrackMacroToAutomation(
                                track.id,
                                macro.id,
                                track.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5
                              )
                            }
                          >
                            ◎
                          </button>
                        )}
                        {lane && (
                          <button
                            type="button"
                            className="track-inspector-action-button"
                            title={lane.expanded ? "Collapse lane" : "Expand lane"}
                            aria-label={lane.expanded ? "Collapse lane" : "Expand lane"}
                            onClick={() => automationActions.onToggleTrackMacroAutomationLane(track.id, macro.id)}
                          >
                            {lane.expanded ? "^" : "v"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
