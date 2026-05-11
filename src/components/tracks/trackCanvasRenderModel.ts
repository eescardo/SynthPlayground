import { useMemo } from "react";
import { BEAT_WIDTH, HEADER_WIDTH } from "@/components/tracks/trackCanvasConstants";
import { resolveSelectedContentTabStopRect } from "@/components/tracks/trackCanvasSelection";
import { TrackCanvasProps, TrackCanvasSelection, TrackLayout } from "@/components/tracks/trackCanvasTypes";
import { useTrackCanvasLayout } from "@/hooks/tracks/useTrackCanvasLayout";
import { getProjectTimelineEndBeat } from "@/lib/macroAutomation";
import { Note } from "@/types/music";

export interface TrackOverlapModel {
  overlapNoteIds: Set<string>;
  overlapRanges: Array<{ startBeat: number; endBeat: number }>;
}

export interface TrackCanvasRenderModel {
  totalBeats: number;
  width: number;
  height: number;
  meterBeats: number;
  gridBeats: number;
  trackLayouts: TrackLayout[];
  playheadTabStopLeft: number;
  selectedContentTabStopRect: ReturnType<typeof resolveSelectedContentTabStopRect>;
  selectionBeatRange: Exclude<TrackCanvasSelection, { kind: "none" }>["beatRange"] | null;
  selectionLabel: string | null;
  selectionMarkerTrackId: string | null;
  selectedNoteKeys: ReadonlySet<string> | undefined;
  automationKeyframeSelectionKeys: ReadonlySet<string> | undefined;
}

export function findTrackOverlaps(notes: Note[]): TrackOverlapModel {
  const overlapNoteIds = new Set<string>();
  const ranges: TrackOverlapModel["overlapRanges"] = [];
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const epsilon = 1e-9;

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    const aEnd = a.startBeat + a.durationBeats;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (b.startBeat >= aEnd - epsilon) {
        break;
      }
      const bEnd = b.startBeat + b.durationBeats;
      const overlapStart = Math.max(a.startBeat, b.startBeat);
      const overlapEnd = Math.min(aEnd, bEnd);
      if (overlapEnd > overlapStart + epsilon) {
        overlapNoteIds.add(a.id);
        overlapNoteIds.add(b.id);
        ranges.push({ startBeat: overlapStart, endBeat: overlapEnd });
      }
    }
  }

  if (ranges.length === 0) {
    return { overlapNoteIds, overlapRanges: [] };
  }

  ranges.sort((a, b) => a.startBeat - b.startBeat);
  const merged: TrackOverlapModel["overlapRanges"] = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const last = merged[merged.length - 1];
    if (current.startBeat <= last.endBeat + epsilon) {
      last.endBeat = Math.max(last.endBeat, current.endBeat);
    } else {
      merged.push({ ...current });
    }
  }

  return { overlapNoteIds, overlapRanges: merged };
}

export function useTrackCanvasRenderModel({
  playheadBeat,
  project,
  selection
}: Pick<TrackCanvasProps, "playheadBeat" | "project" | "selection">): TrackCanvasRenderModel {
  const totalBeats = useMemo(() => getProjectTimelineEndBeat(project), [project]);
  const width = HEADER_WIDTH + totalBeats * BEAT_WIDTH;
  const { trackLayouts, height } = useTrackCanvasLayout(project);
  const meterBeats = project.global.meter === "4/4" ? 4 : 3;
  const gridBeats = project.global.gridBeats;
  const selectedContentTabStopRect = useMemo(
    () => resolveSelectedContentTabStopRect(project.tracks, selection, trackLayouts),
    [project.tracks, selection, trackLayouts]
  );

  return {
    totalBeats,
    width,
    height,
    meterBeats,
    gridBeats,
    trackLayouts,
    playheadTabStopLeft: HEADER_WIDTH + playheadBeat * BEAT_WIDTH - 1,
    selectedContentTabStopRect,
    selectionBeatRange: selection.kind === "none" ? null : selection.beatRange,
    selectionLabel: selection.kind === "none" ? null : selection.label,
    selectionMarkerTrackId: selection.kind === "none" ? null : selection.markerTrackId,
    selectedNoteKeys: selection.kind === "note" ? selection.content.noteKeys : undefined,
    automationKeyframeSelectionKeys:
      selection.kind === "note" ? selection.content.automationKeyframeSelectionKeys : undefined
  };
}
