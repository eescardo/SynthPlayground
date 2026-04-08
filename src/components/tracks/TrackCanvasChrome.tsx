import { Dispatch, SetStateAction } from "react";
import { MacroPanel, MacroPanelRow } from "@/components/MacroPanel";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import {
  AUTOMATION_LANE_COLLAPSED_HEIGHT,
  MACRO_PANEL_TOGGLE_Y_OFFSET,
  TRACK_PATCH_CONTROL_SIZE,
  SPEAKER_Y_OFFSET
} from "@/components/tracks/trackCanvasConstants";
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
  volumePopoverPosition: { left: number; top: number } | null;
  openVolumePopover: (trackId: string, anchor?: HTMLElement | null) => void;
  scheduleVolumePopoverOpen: (trackId: string, anchor?: HTMLElement | null) => void;
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

const TRACK_INSPECTOR_PANEL_VERTICAL_PADDING = 6;
const TRACK_INSPECTOR_PANEL_MARGIN_TOP = 2;
const TRACK_INSPECTOR_PANEL_MARGIN_BOTTOM = 6;
const TRACK_INSPECTOR_ROW_HEIGHT = 20;
const TRACK_INSPECTOR_ROW_Y_OFFSET = -2;

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
  volumePopoverPosition,
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
        const volumeLaneLayout = layout.automationLanes.find((entry) => entry.laneType === "volume") ?? null;
        const volumeLaneTop = volumeLaneLayout?.y ?? null;
        const macroRows = trackPatch?.ui.macros
          .map((macro) => ({
            macro,
            lane: getTrackMacroLane(track, macro.id),
            laneLayout: layout.automationLanes.find((entry) => entry.macroId === macro.id) ?? null
          }))
          .filter((entry) => entry.laneLayout !== null) ?? [];
        const macroPanelTop = volumeLaneTop ?? macroRows[0]?.laneLayout?.y ?? null;
        const macroPanelBottom =
          macroRows.length > 0
            ? Math.max(...macroRows.map((entry) => (entry.laneLayout ? entry.laneLayout.y + entry.laneLayout.height : 0)))
            : volumeLane
              ? (volumeLaneLayout?.y ?? layout.y + 72) + (volumeLaneLayout?.height ?? AUTOMATION_LANE_COLLAPSED_HEIGHT)
              : null;
        const macroPanelHeight =
          macroPanelTop !== null && macroPanelBottom !== null ? Math.max(20, macroPanelBottom - macroPanelTop - 2) : 0;
        const macroPanelRows: MacroPanelRow[] = [];
        if (volumeLane) {
          macroPanelRows.push({
            id: `${track.id}:volume`,
            top:
              (volumeLaneLayout?.y ?? layout.y + 72) +
              Math.max(0, ((volumeLaneLayout?.height ?? AUTOMATION_LANE_COLLAPSED_HEIGHT) - TRACK_INSPECTOR_ROW_HEIGHT) / 2) +
              TRACK_INSPECTOR_ROW_Y_OFFSET,
            bindTitle: "Use fixed value",
            bindAriaLabel: "Use fixed value",
            bindIcon: "◉",
            onBindToggle: () => trackActions.onUnbindTrackVolumeFromAutomation(track.id),
            expandTitle: volumeLane.expanded ? "Collapse lane" : "Expand lane",
            expandAriaLabel: volumeLane.expanded ? "Collapse lane" : "Expand lane",
            expandIcon: volumeLane.expanded ? "^" : "v",
            onExpandToggle: () => trackActions.onToggleTrackVolumeAutomationLane(track.id)
          });
        }
        for (const { macro, lane, laneLayout } of macroRows) {
          if (!laneLayout) {
            continue;
          }
          macroPanelRows.push({
            id: macro.id,
            top:
              laneLayout.y +
              Math.max(0, (laneLayout.height - TRACK_INSPECTOR_ROW_HEIGHT) / 2) +
              TRACK_INSPECTOR_ROW_Y_OFFSET,
            bindTitle: lane ? "Use fixed value" : "Automate in timeline",
            bindAriaLabel: lane ? "Use fixed value" : "Automate in timeline",
            bindIcon: lane ? "◉" : "◎",
            onBindToggle: lane
              ? () => automationActions.onUnbindTrackMacroFromAutomation(track.id, macro.id)
              : () =>
                  automationActions.onBindTrackMacroToAutomation(
                    track.id,
                    macro.id,
                    track.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5
                  ),
            expandTitle: lane ? (lane.expanded ? "Collapse lane" : "Expand lane") : undefined,
            expandAriaLabel: lane ? (lane.expanded ? "Collapse lane" : "Expand lane") : undefined,
            expandIcon: lane ? (lane.expanded ? "^" : "v") : undefined,
            onExpandToggle: lane ? () => automationActions.onToggleTrackMacroAutomationLane(track.id, macro.id) : undefined,
            expandPlaceholder: !lane
          });
        }

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
              onMouseEnter={(event) => scheduleVolumePopoverOpen(track.id, event.currentTarget)}
              onMouseLeave={() => scheduleVolumePopoverDismiss()}
              onClick={(event) => {
                event.stopPropagation();
                trackActions.onToggleTrackMute(track.id);
                openVolumePopover(track.id, event.currentTarget);
              }}
            />
            {selected && (
              <button
                type="button"
                className="track-macro-toggle-button"
                aria-label={track.macroPanelExpanded ? "Collapse macro lanes" : "Expand macro lanes"}
                title={track.macroPanelExpanded ? "Collapse macro lanes" : "Expand macro lanes"}
                style={{
                  top: `${layout.y + MACRO_PANEL_TOGGLE_Y_OFFSET}px`,
                  width: `${TRACK_PATCH_CONTROL_SIZE}px`,
                  height: `${TRACK_PATCH_CONTROL_SIZE}px`
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
                top={`${volumePopoverPosition?.top ?? layout.y + 6}px`}
                left={`${volumePopoverPosition?.left ?? 164}px`}
                onMouseEnter={() => cancelScheduledVolumePopoverDismiss()}
                onMouseLeave={() => scheduleVolumePopoverDismiss()}
                onVolumeChange={(volume, options) => {
                  trackActions.onSetTrackVolume(track.id, volume, options);
                  if (options?.commit) {
                    trackActions.onPreviewTrackVolume(track.id, volume);
                  }
                }}
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
              style={{
                top: `${layout.y + MACRO_PANEL_TOGGLE_Y_OFFSET}px`,
                height: `${TRACK_PATCH_CONTROL_SIZE}px`
              }}
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
              <MacroPanel
                panelTop={
                  macroPanelTop !== null
                    ? macroPanelTop - TRACK_INSPECTOR_PANEL_VERTICAL_PADDING + TRACK_INSPECTOR_PANEL_MARGIN_TOP
                    : null
                }
                panelHeight={Math.max(
                  20,
                  macroPanelHeight +
                    TRACK_INSPECTOR_PANEL_VERTICAL_PADDING * 2 -
                    TRACK_INSPECTOR_PANEL_MARGIN_TOP -
                    TRACK_INSPECTOR_PANEL_MARGIN_BOTTOM
                )}
                rows={macroPanelRows}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
