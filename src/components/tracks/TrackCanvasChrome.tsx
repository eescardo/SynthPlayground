import { CSSProperties, Dispatch, RefObject, SetStateAction, useEffect, useState } from "react";
import { MacroPanel, MacroPanelRow } from "@/components/tracks/MacroPanel";
import { PatchSummaryPopover } from "@/components/PatchSummaryPopover";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import { TriangleGlyph } from "@/components/icons/TriangleGlyph";
import { useRenameActivation } from "@/hooks/useRenameActivation";
import {
  AUTOMATION_LANE_COLLAPSED_HEIGHT,
  HEADER_WIDTH,
  MACRO_PANEL_TOGGLE_Y_OFFSET,
  MUTE_ICON_SIZE,
  SPEAKER_ICON_SRC,
  SPEAKER_MUTED_ICON_SRC,
  TRACK_PATCH_CONTROL_SIZE,
  TRACK_HEIGHT,
  SPEAKER_Y_OFFSET
} from "@/components/tracks/trackCanvasConstants";
import {
  AutomationLaneLayout,
  TrackLayout,
  TrackCanvasAutomationActions,
  TrackCanvasPatchActions,
  TrackCanvasTrackActions
} from "@/components/tracks/trackCanvasTypes";
import { usePatchSummaryPopover } from "@/hooks/tracks/usePatchSummaryPopover";
import { getTrackMacroLane, getTrackVolumeLane } from "@/lib/macroAutomation";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { isTrackVolumeMuted } from "@/lib/trackVolume";
import { VerticalDirection } from "@/types/direction";
import { Project } from "@/types/music";
import styles from "./TrackCanvas.module.css";

interface TrackHeaderChromeProps {
  project: Project;
  canvasShellRef: RefObject<HTMLDivElement | null>;
  canvasHeight: number;
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
const TRACK_INSPECTOR_PANEL_MARGIN_BOTTOM = 1;
const TRACK_INSPECTOR_ROW_HEIGHT = 20;
const TRACK_INSPECTOR_ROW_TOP_INSET = 1;
const PATCH_SUMMARY_EXPANDED_MIN_HEIGHT = 184;
const MACRO_PILL_AUTO_TITLE = "Automated in timeline. Click to revert to fixed value";
const MACRO_PILL_FIXED_TITLE = "Click to automate in timeline";

interface MacroPanelGeometry {
  shellTop: number | null;
  shellHeight: number;
}

interface PatchSummaryAnchor {
  viewportLeft: number;
  viewportTop: number;
  anchorHeight: number;
  expandedHeight: number;
}

const resolveMacroPanelGeometry = (
  layout: TrackLayout,
  volumeLane: ReturnType<typeof getTrackVolumeLane>,
  volumeLaneLayout: AutomationLaneLayout | null,
  macroLaneLayouts: AutomationLaneLayout[]
): MacroPanelGeometry => {
  const volumeLaneTop = volumeLaneLayout?.y ?? null;
  const panelTop = volumeLaneTop ?? macroLaneLayouts[0]?.y ?? null;
  const panelBottom =
    macroLaneLayouts.length > 0
      ? Math.max(
          ...macroLaneLayouts.map((entry) => entry.y + entry.height),
          volumeLane
            ? (volumeLaneLayout?.y ?? layout.y + TRACK_HEIGHT) +
                (volumeLaneLayout?.height ?? AUTOMATION_LANE_COLLAPSED_HEIGHT)
            : 0
        )
      : volumeLane
        ? (volumeLaneLayout?.y ?? layout.y + TRACK_HEIGHT) +
          (volumeLaneLayout?.height ?? AUTOMATION_LANE_COLLAPSED_HEIGHT)
        : null;
  const panelHeight = panelTop !== null && panelBottom !== null ? Math.max(20, panelBottom - panelTop - 2) : 0;
  const shellTop =
    panelTop !== null ? panelTop - TRACK_INSPECTOR_PANEL_VERTICAL_PADDING + TRACK_INSPECTOR_PANEL_MARGIN_TOP : null;
  const shellHeight = Math.max(
    20,
    panelHeight +
      TRACK_INSPECTOR_PANEL_VERTICAL_PADDING * 2 -
      TRACK_INSPECTOR_PANEL_MARGIN_TOP -
      TRACK_INSPECTOR_PANEL_MARGIN_BOTTOM
  );
  return { shellTop, shellHeight };
};

const resolvePatchSummaryAnchor = (args: {
  layout: TrackLayout;
  macroPanelShellTop: number | null;
  macroPanelShellHeight: number;
  popoverMode?: "teaser" | "expanded";
  canvasViewport: { left: number; top: number; scrollTop: number };
}): PatchSummaryAnchor => {
  const anchorTop = args.layout.y + 8;
  const anchorBottom =
    args.macroPanelShellTop !== null
      ? args.macroPanelShellTop + args.macroPanelShellHeight
      : args.layout.y + 8 + TRACK_PATCH_CONTROL_SIZE;
  const anchorHeight = Math.max(TRACK_PATCH_CONTROL_SIZE, anchorBottom - anchorTop);
  const expandedHeight = Math.max(PATCH_SUMMARY_EXPANDED_MIN_HEIGHT, anchorHeight);
  const expandedTop = anchorTop + (anchorHeight - expandedHeight) * 0.5;
  const localTop = args.popoverMode === "expanded" ? expandedTop : anchorTop;
  return {
    viewportLeft: args.canvasViewport.left + HEADER_WIDTH,
    viewportTop: args.canvasViewport.top + localTop - args.canvasViewport.scrollTop,
    anchorHeight,
    expandedHeight
  };
};

const buildMacroPanelRow = (args: {
  id: string;
  label: string;
  stateLabel: "auto" | "fixed";
  laneLayout: AutomationLaneLayout | null;
  fallbackY: number;
  fallbackHeight: number;
  expanded: boolean;
  bindTitle: string;
  bindAriaLabel: string;
  onBindToggle: () => void;
  expandTitle?: string;
  expandAriaLabel?: string;
  expandDirection?: VerticalDirection;
  onExpandToggle?: () => void;
}): MacroPanelRow => ({
  id: args.id,
  label: args.label,
  stateLabel: args.stateLabel,
  top: (args.laneLayout?.y ?? args.fallbackY) + TRACK_INSPECTOR_ROW_TOP_INSET,
  height: Math.max(
    TRACK_INSPECTOR_ROW_HEIGHT,
    (args.laneLayout?.height ?? args.fallbackHeight) - TRACK_INSPECTOR_ROW_TOP_INSET * 2
  ),
  expanded: args.expanded,
  bindTitle: args.bindTitle,
  bindAriaLabel: args.bindAriaLabel,
  onBindToggle: args.onBindToggle,
  expandTitle: args.expandTitle,
  expandAriaLabel: args.expandAriaLabel,
  expandDirection: args.expandDirection,
  onExpandToggle: args.onExpandToggle
});

const buildMacroPanelRows = (args: {
  track: Project["tracks"][number];
  trackPatch?: Project["patches"][number];
  layout: TrackLayout;
  volumeLane: ReturnType<typeof getTrackVolumeLane>;
  volumeLaneLayout: AutomationLaneLayout | null;
  trackActions: TrackCanvasTrackActions;
  automationActions: TrackCanvasAutomationActions;
}): MacroPanelRow[] => {
  const rows: MacroPanelRow[] = [];
  if (args.volumeLane) {
    const expandTitle = args.volumeLane.expanded ? "Collapse lane" : "Expand lane";
    rows.push(
      buildMacroPanelRow({
        id: `${args.track.id}:volume`,
        label: "Volume",
        stateLabel: "auto",
        laneLayout: args.volumeLaneLayout,
        fallbackY: args.layout.y + TRACK_HEIGHT,
        fallbackHeight: AUTOMATION_LANE_COLLAPSED_HEIGHT,
        expanded: Boolean(args.volumeLaneLayout?.expanded),
        bindTitle: MACRO_PILL_AUTO_TITLE,
        bindAriaLabel: MACRO_PILL_AUTO_TITLE,
        onBindToggle: () => args.trackActions.onUnbindTrackVolumeFromAutomation(args.track.id),
        expandTitle,
        expandAriaLabel: expandTitle,
        expandDirection: args.volumeLane.expanded ? "up" : "down",
        onExpandToggle: () => args.trackActions.onToggleTrackVolumeAutomationLane(args.track.id)
      })
    );
  }

  for (const macro of args.trackPatch?.ui.macros ?? []) {
    const laneLayout = args.layout.automationLanes.find((entry) => entry.macroId === macro.id) ?? null;
    if (!laneLayout) {
      continue;
    }
    const lane = getTrackMacroLane(args.track, macro.id);
    const expandTitle = lane ? (lane.expanded ? "Collapse lane" : "Expand lane") : undefined;
    rows.push(
      buildMacroPanelRow({
        id: macro.id,
        label: macro.name,
        stateLabel: lane ? "auto" : "fixed",
        laneLayout,
        fallbackY: laneLayout.y,
        fallbackHeight: laneLayout.height,
        expanded: laneLayout.expanded,
        bindTitle: lane ? MACRO_PILL_AUTO_TITLE : MACRO_PILL_FIXED_TITLE,
        bindAriaLabel: lane ? MACRO_PILL_AUTO_TITLE : MACRO_PILL_FIXED_TITLE,
        onBindToggle: lane
          ? () => args.automationActions.onUnbindTrackMacroFromAutomation(args.track.id, macro.id)
          : () =>
              args.automationActions.onBindTrackMacroToAutomation(
                args.track.id,
                macro.id,
                args.track.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5
              ),
        expandTitle,
        expandAriaLabel: expandTitle,
        expandDirection: lane ? (lane.expanded ? "up" : "down") : undefined,
        onExpandToggle: lane
          ? () => args.automationActions.onToggleTrackMacroAutomationLane(args.track.id, macro.id)
          : undefined
      })
    );
  }

  return rows;
};

export function TrackHeaderChrome({
  project,
  canvasShellRef,
  canvasHeight,
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
  const renameActivation = useRenameActivation<string>();
  const {
    patchSummaryPopover,
    setPatchSummaryPopover,
    closePatchSummaryPopover,
    openExpandedPatchSummary,
    scheduleTeaserPatchSummary,
    schedulePatchSummaryDismiss,
    cancelPatchSummaryDismiss
  } = usePatchSummaryPopover({ selectedTrackId });
  const [canvasViewport, setCanvasViewport] = useState({ left: 0, top: 0, scrollTop: 0 });

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) {
      return;
    }
    const updateCanvasViewport = () => {
      const rect = shell.getBoundingClientRect();
      const nextViewport = {
        left: rect.left,
        top: rect.top,
        scrollTop: shell.scrollTop
      };
      setCanvasViewport((previousViewport) => {
        if (
          previousViewport.left === nextViewport.left &&
          previousViewport.top === nextViewport.top &&
          previousViewport.scrollTop === nextViewport.scrollTop
        ) {
          return previousViewport;
        }
        return nextViewport;
      });
    };
    updateCanvasViewport();
    shell.addEventListener("scroll", updateCanvasViewport, { passive: true });
    window.addEventListener("resize", updateCanvasViewport);
    return () => {
      shell.removeEventListener("scroll", updateCanvasViewport);
      window.removeEventListener("resize", updateCanvasViewport);
    };
  }, [canvasShellRef]);

  return (
    <div
      className={styles.headerOverlays}
      data-track-chrome="header-overlays"
      style={{ "--track-header-width": `${HEADER_WIDTH}px` } as CSSProperties}
    >
      <div className={styles.headerMask} style={{ height: `${canvasHeight}px` }} />
      {project.tracks.map((track) => {
        const layout = trackLayouts.find((entry) => entry.trackId === track.id);
        if (!layout) {
          return null;
        }
        const trackPatch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
        const volumeLane = getTrackVolumeLane(track);
        const selected = selectedTrackId === track.id;
        const effectiveVolume = track.mute ? 0 : track.volume;
        const trackSilenced = track.mute || isTrackVolumeMuted(track.volume);
        const rememberedVolume = track.volume;
        const volumeLaneLayout = layout.automationLanes.find((entry) => entry.laneType === "volume") ?? null;
        const macroLaneLayouts = layout.automationLanes.filter((entry) => entry.laneType === "macro");
        const macroPanelGeometry = resolveMacroPanelGeometry(layout, volumeLane, volumeLaneLayout, macroLaneLayouts);
        const hasPatchSummaryPopover = patchSummaryPopover?.trackId === track.id;
        const patchSummaryAnchor = resolvePatchSummaryAnchor({
          layout,
          macroPanelShellTop: macroPanelGeometry.shellTop,
          macroPanelShellHeight: macroPanelGeometry.shellHeight,
          popoverMode: patchSummaryPopover?.mode,
          canvasViewport
        });
        const patchInvalid = Boolean(invalidPatchIds?.has(track.instrumentPatchId));
        const macroPanelRows = buildMacroPanelRows({
          track,
          trackPatch,
          layout,
          volumeLane,
          volumeLaneLayout,
          trackActions,
          automationActions
        });

        return (
          <div key={track.id}>
            <div
              className={`${styles.headerRow}${selected ? ` ${styles.headerRowSelected}` : ""}${
                patchInvalid ? ` ${styles.headerRowInvalid}` : ""
              }`}
              style={{
                top: `${layout.y}px`,
                height: `${layout.height}px`
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                trackActions.onSelectTrack(track.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (selectedTrackId !== track.id) {
                  trackActions.onSelectTrack(track.id);
                }
                trackActions.onToggleTrackMacroPanel(track.id);
              }}
              onContextMenu={(event) => event.preventDefault()}
            />
            <button
              type="button"
              className={`${styles.trackNameButton}${
                renameActivation.isArmed(track.id) ? ` ${styles.renameArmed}` : ""
              }${patchInvalid ? ` ${styles.trackNameButtonInvalid}` : ""}`}
              data-testid="track-name-button"
              aria-label={`Rename track ${track.name}`}
              style={{
                top: `${layout.y + 8}px`,
                cursor: selectedTrackId === track.id ? "text" : "default"
              }}
              {...renameActivation.getRenameTriggerProps({
                id: track.id,
                onPlainClick: (event) => {
                  event.stopPropagation();
                  if (selectedTrackId !== track.id) {
                    trackActions.onSelectTrack(track.id);
                  }
                },
                onStartRename: () => {
                  trackActions.onSelectTrack(track.id);
                  setEditingTrackId(track.id);
                  setEditingTrackName(track.name);
                }
              })}
            >
              {track.name}
            </button>
            <button
              type="button"
              className={styles.volumeButton}
              data-track-chrome="volume-button"
              aria-label={`Track volume for ${track.name}`}
              aria-expanded={volumePopoverTrackId === track.id}
              style={{
                top: `${layout.y + SPEAKER_Y_OFFSET}px`,
                backgroundImage: `url("${trackSilenced ? SPEAKER_MUTED_ICON_SRC : SPEAKER_ICON_SRC}")`,
                backgroundSize: `${MUTE_ICON_SIZE}px ${MUTE_ICON_SIZE}px`
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
                className={styles.macroToggleButton}
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
                <TriangleGlyph
                  direction={track.macroPanelExpanded ? "up" : "down"}
                  className={styles.macroToggleGlyph}
                />
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
              className={`${styles.patchSelect}${patchInvalid ? ` ${styles.patchSelectInvalid}` : ""}`}
              data-track-control="instrument-selection"
              value={track.instrumentPatchId}
              style={{
                top: `${layout.y + MACRO_PANEL_TOGGLE_Y_OFFSET}px`,
                height: `${TRACK_PATCH_CONTROL_SIZE}px`
              }}
              onClick={() => {
                if (patchInvalid) {
                  openExpandedPatchSummary({
                    trackId: track.id,
                    selected,
                    macroPanelExpanded: track.macroPanelExpanded,
                    onSelectTrack: trackActions.onSelectTrack,
                    onToggleTrackMacroPanel: trackActions.onToggleTrackMacroPanel
                  });
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
                panelTop={macroPanelGeometry.shellTop}
                panelHeight={macroPanelGeometry.shellHeight}
                rows={macroPanelRows}
                onMouseEnter={() =>
                  scheduleTeaserPatchSummary({
                    trackId: track.id,
                    selected,
                    macroPanelExpanded: track.macroPanelExpanded
                  })
                }
                onMouseLeave={() => schedulePatchSummaryDismiss(track.id)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (patchSummaryPopover?.trackId === track.id && patchSummaryPopover.mode === "expanded") {
                    closePatchSummaryPopover();
                    return;
                  }
                  openExpandedPatchSummary({
                    trackId: track.id,
                    selected,
                    macroPanelExpanded: track.macroPanelExpanded,
                    onSelectTrack: trackActions.onSelectTrack,
                    onToggleTrackMacroPanel: trackActions.onToggleTrackMacroPanel
                  });
                }}
              />
            )}
            {selected && track.macroPanelExpanded && trackPatch && hasPatchSummaryPopover && (
              <PatchSummaryPopover
                patch={trackPatch}
                invalid={patchInvalid}
                canRemove={patchActions.canRemoveSelectedPatch}
                mode={patchSummaryPopover.mode}
                top={patchSummaryAnchor.viewportTop}
                left={patchSummaryAnchor.viewportLeft}
                height={
                  patchSummaryPopover.mode === "expanded"
                    ? patchSummaryAnchor.expandedHeight
                    : patchSummaryAnchor.anchorHeight
                }
                fixed
                onExpand={() => setPatchSummaryPopover({ trackId: track.id, mode: "expanded" })}
                onDuplicate={patchActions.onDuplicateSelectedPatch}
                onRemove={patchActions.onRequestRemoveSelectedPatch}
                onOpenWorkspace={patchActions.onOpenSelectedPatchWorkspace}
                onMouseEnter={cancelPatchSummaryDismiss}
                onMouseLeave={() => schedulePatchSummaryDismiss(track.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
