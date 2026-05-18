import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { EXPANDED_PROBE_SIZE } from "@/lib/patch/probes";
import { PatchWorkspaceProbeState } from "@/types/probes";

export function resolveRenderedProbeWidth(probe: PatchWorkspaceProbeState, zoom: number) {
  return probe.expanded ? EXPANDED_PROBE_SIZE.width : probe.width * PATCH_CANVAS_GRID * zoom;
}

export function resolveRenderedProbeHeight(probe: PatchWorkspaceProbeState, zoom: number) {
  return probe.expanded ? EXPANDED_PROBE_SIZE.height : probe.height * PATCH_CANVAS_GRID * zoom;
}
