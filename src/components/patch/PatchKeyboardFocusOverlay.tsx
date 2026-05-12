import {
  buildPatchCanvasNavigationModel,
  buildPatchFocusableId,
  PatchCanvasFocusable,
  resolvePatchFocusablePorts
} from "@/lib/patch/hardwareNavigation";
import { EXPANDED_PROBE_SIZE } from "@/lib/patch/probes";
import { PatchWorkspaceProbeState } from "@/types/probes";

const PATCH_PORT_FOCUS_PAD_X = 2;
const PATCH_PORT_FOCUS_PAD_Y = 2;

interface PatchKeyboardFocusOverlayProps {
  focus: PatchCanvasFocusable | null;
  model: ReturnType<typeof buildPatchCanvasNavigationModel>;
  ports: ReturnType<typeof resolvePatchFocusablePorts>;
  probes: PatchWorkspaceProbeState[];
  selectedNodeId?: string;
  selectedProbeId?: string;
  zoom: number;
}

export function PatchKeyboardFocusOverlay(props: PatchKeyboardFocusOverlayProps) {
  if (!props.focus) {
    return null;
  }
  const rect = resolveKeyboardFocusRect(props.focus, props.model, props.ports, props.probes, props.zoom);
  if (!rect) {
    return null;
  }
  const selected =
    (props.focus.kind === "module" && props.selectedNodeId === props.focus.nodeId) ||
    (props.focus.kind === "probe" && props.selectedProbeId === props.focus.probeId);
  return (
    <div
      className={`patch-keyboard-focus-ring${selected ? " selected" : ""}`}
      style={{
        left: `${rect.x * props.zoom}px`,
        top: `${rect.y * props.zoom}px`,
        width: `${rect.width * props.zoom}px`,
        height: `${rect.height * props.zoom}px`
      }}
    />
  );
}

function resolveKeyboardFocusRect(
  focus: PatchCanvasFocusable,
  model: ReturnType<typeof buildPatchCanvasNavigationModel>,
  ports: ReturnType<typeof resolvePatchFocusablePorts>,
  probes: PatchWorkspaceProbeState[],
  zoom: number
) {
  if (focus.kind === "port") {
    const port = ports.find(
      (entry) => entry.nodeId === focus.nodeId && entry.portId === focus.portId && entry.portKind === focus.portKind
    );
    return port
      ? {
          x: port.x - PATCH_PORT_FOCUS_PAD_X,
          y: port.y - port.height / 2 - PATCH_PORT_FOCUS_PAD_Y,
          width: port.width + PATCH_PORT_FOCUS_PAD_X * 2,
          height: port.height + PATCH_PORT_FOCUS_PAD_Y * 2
        }
      : null;
  }
  if (focus.kind === "probe") {
    const probe = probes.find((entry) => entry.id === focus.probeId);
    if (probe?.expanded) {
      const rect = model.itemById.get(buildPatchFocusableId(focus))?.rect;
      return rect
        ? {
            ...rect,
            width: EXPANDED_PROBE_SIZE.width / zoom,
            height: EXPANDED_PROBE_SIZE.height / zoom
          }
        : null;
    }
  }
  if (focus.kind === "probe-action") {
    return null;
  }
  return model.itemById.get(buildPatchFocusableId(focus))?.rect ?? null;
}
