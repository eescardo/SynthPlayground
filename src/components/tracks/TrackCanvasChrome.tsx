import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { MacroPanel, MacroPanelRow } from "@/components/MacroPanel";
import { PatchSummaryPopover } from "@/components/PatchSummaryPopover";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import {
  AUTOMATION_LANE_COLLAPSED_HEIGHT,
  MACRO_PANEL_TOGGLE_Y_OFFSET,
  TRACK_PATCH_CONTROL_SIZE,
  SPEAKER_Y_OFFSET
} from "@/components/tracks/trackCanvasConstants";
import {
  TrackLayout,
  TrackCanvasAutomationActions,
  TrackCanvasPatchActions,
  TrackCanvasTrackActions
} from "@/components/tracks/trackCanvasTypes";
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
  patchActions: TrackCanvasPatchActions;
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
const TRACK_INSPECTOR_ROW_Y_OFFSET = -3;
const PATCH_SUMMARY_POPOVER_GAP = 8;
const PATCH_SUMMARY_HOVER_DELAY_MS = 900;
const PATCH_SUMMARY_LEAVE_DELAY_MS = 140;
const PATCH_SUMMARY_EXPANDED_MIN_HEIGHT = 204;

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
  patchActions,
  automationActions
}: TrackHeaderChromeProps) {
  const [patchSummaryPopover, setPatchSummaryPopover] = useState<{ trackId: string; mode: "teaser" | "expanded" } | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const clearHoverTimers = useCallback(() => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const closePatchSummaryPopover = useCallback(() => {
    clearHoverTimers();
    setPatchSummaryPopover(null);
  }, [clearHoverTimers]);

  useEffect(() => () => clearHoverTimers(), [clearHoverTimers]);

  useEffect(() => {
    if (patchSummaryPopover && patchSummaryPopover.trackId !== selectedTrackId) {
      closePatchSummaryPopover();
    }
  }, [closePatchSummaryPopover, patchSummaryPopover, selectedTrackId]);

  useEffect(() => {
    if (!patchSummaryPopover) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePatchSummaryPopover();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".track-patch-summary-popover, .track-instrument-selection, .track-macro-panel-area")) {
        return;
      }
      closePatchSummaryPopover();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closePatchSummaryPopover, patchSummaryPopover]);

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
        const macroLaneLayouts = layout.automationLanes.filter((entry) => entry.laneType === "macro");
        const volumeLaneTop = volumeLaneLayout?.y ?? null;
        const macroRows = trackPatch?.ui.macros
          .map((macro) => ({
            macro,
            lane: getTrackMacroLane(track, macro.id),
            laneLayout: layout.automationLanes.find((entry) => entry.macroId === macro.id) ?? null
          }))
          .filter((entry) => entry.laneLayout !== null) ?? [];
        const macroPanelTop = volumeLaneTop ?? macroLaneLayouts[0]?.y ?? null;
        const macroPanelBottom =
          macroLaneLayouts.length > 0
            ? Math.max(
                ...macroLaneLayouts.map((entry) => entry.y + entry.height),
                volumeLane ? (volumeLaneLayout?.y ?? layout.y + 72) + (volumeLaneLayout?.height ?? AUTOMATION_LANE_COLLAPSED_HEIGHT) : 0
              )
            : volumeLane
              ? (volumeLaneLayout?.y ?? layout.y + 72) + (volumeLaneLayout?.height ?? AUTOMATION_LANE_COLLAPSED_HEIGHT)
              : null;
        const macroPanelHeight =
          macroPanelTop !== null && macroPanelBottom !== null ? Math.max(20, macroPanelBottom - macroPanelTop - 2) : 0;
        const macroPanelShellTop =
          macroPanelTop !== null
            ? macroPanelTop - TRACK_INSPECTOR_PANEL_VERTICAL_PADDING + TRACK_INSPECTOR_PANEL_MARGIN_TOP
            : null;
        const macroPanelShellHeight = Math.max(
          20,
          macroPanelHeight +
            TRACK_INSPECTOR_PANEL_VERTICAL_PADDING * 2 -
            TRACK_INSPECTOR_PANEL_MARGIN_TOP -
            TRACK_INSPECTOR_PANEL_MARGIN_BOTTOM
        );
        const hasPatchSummaryPopover = patchSummaryPopover?.trackId === track.id;
        const patchSummaryAnchorTop = layout.y + 8;
        const patchSummaryAnchorBottom =
          macroPanelShellTop !== null ? macroPanelShellTop + macroPanelShellHeight : layout.y + 8 + TRACK_PATCH_CONTROL_SIZE;
        const patchSummaryAnchorHeight = Math.max(TRACK_PATCH_CONTROL_SIZE, patchSummaryAnchorBottom - patchSummaryAnchorTop);
        const patchSummaryExpandedHeight = Math.max(PATCH_SUMMARY_EXPANDED_MIN_HEIGHT, patchSummaryAnchorHeight);
        const patchSummaryExpandedTop =
          patchSummaryAnchorTop + (patchSummaryAnchorHeight - patchSummaryExpandedHeight) * 0.5;
        const patchSummaryLeft = 170 + PATCH_SUMMARY_POPOVER_GAP;
        const patchInvalid = Boolean(invalidPatchIds?.has(track.instrumentPatchId));

        const openExpandedPatchSummary = () => {
          clearHoverTimers();
          if (!selected) {
            trackActions.onSelectTrack(track.id);
          }
          if (!track.macroPanelExpanded) {
            trackActions.onToggleTrackMacroPanel(track.id);
          }
          setPatchSummaryPopover({ trackId: track.id, mode: "expanded" });
        };

        const scheduleTeaserPatchSummary = () => {
          if (!selected || !track.macroPanelExpanded || patchSummaryPopover?.mode === "expanded") {
            return;
          }
          if (hoverCloseTimerRef.current !== null) {
            window.clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
          }
          if (hasPatchSummaryPopover || hoverOpenTimerRef.current !== null) {
            return;
          }
          hoverOpenTimerRef.current = window.setTimeout(() => {
            hoverOpenTimerRef.current = null;
            setPatchSummaryPopover((current) =>
              current && current.trackId === track.id && current.mode === "expanded"
                ? current
                : { trackId: track.id, mode: "teaser" }
            );
          }, PATCH_SUMMARY_HOVER_DELAY_MS);
        };

        const schedulePatchSummaryDismiss = () => {
          if (hoverOpenTimerRef.current !== null) {
            window.clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
          }
          if (!hasPatchSummaryPopover || patchSummaryPopover?.mode !== "teaser") {
            return;
          }
          if (hoverCloseTimerRef.current !== null) {
            window.clearTimeout(hoverCloseTimerRef.current);
          }
          hoverCloseTimerRef.current = window.setTimeout(() => {
            hoverCloseTimerRef.current = null;
            setPatchSummaryPopover((current) =>
              current && current.trackId === track.id && current.mode === "teaser" ? null : current
            );
          }, PATCH_SUMMARY_LEAVE_DELAY_MS);
        };

        const cancelPatchSummaryDismiss = () => {
          if (hoverOpenTimerRef.current !== null) {
            window.clearTimeout(hoverOpenTimerRef.current);
            hoverOpenTimerRef.current = null;
          }
          if (hoverCloseTimerRef.current !== null) {
            window.clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
          }
        };

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
              className={`track-patch-select track-instrument-selection${patchInvalid ? " invalid" : ""}`}
              value={track.instrumentPatchId}
              style={{
                top: `${layout.y + MACRO_PANEL_TOGGLE_Y_OFFSET}px`,
                height: `${TRACK_PATCH_CONTROL_SIZE}px`
              }}
              onClick={() => {
                if (patchInvalid) {
                  openExpandedPatchSummary();
                }
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
                panelTop={macroPanelShellTop}
                panelHeight={macroPanelShellHeight}
                rows={macroPanelRows}
                onMouseEnter={scheduleTeaserPatchSummary}
                onMouseLeave={schedulePatchSummaryDismiss}
                onDoubleClick={openExpandedPatchSummary}
              />
            )}
            {selected && track.macroPanelExpanded && trackPatch && hasPatchSummaryPopover && (
              <PatchSummaryPopover
                patch={trackPatch}
                invalid={patchInvalid}
                canRemove={patchActions.canRemoveSelectedPatch}
                mode={patchSummaryPopover.mode}
                top={patchSummaryPopover.mode === "expanded" ? patchSummaryExpandedTop : patchSummaryAnchorTop}
                left={patchSummaryLeft}
                height={patchSummaryPopover.mode === "expanded" ? patchSummaryExpandedHeight : patchSummaryAnchorHeight}
                onExpand={() => setPatchSummaryPopover({ trackId: track.id, mode: "expanded" })}
                onDuplicate={patchActions.onDuplicateSelectedPatch}
                onRemove={patchActions.onRequestRemoveSelectedPatch}
                onOpenWorkspace={patchActions.onOpenSelectedPatchWorkspace}
                onMouseEnter={cancelPatchSummaryDismiss}
                onMouseLeave={schedulePatchSummaryDismiss}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
