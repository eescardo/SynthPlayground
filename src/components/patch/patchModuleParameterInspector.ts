import { MagneticSliderSnap } from "@/components/patch/patchModuleParameterControls";
import { PatchNode, ParamSchema } from "@/types/patch";

const ADSR_LINEAR_CURVE_SNAP_RADIUS = 0.035;

export function resolveParamSliderMagnet(node: PatchNode, param: ParamSchema): MagneticSliderSnap | undefined {
  if (node.typeId === "ADSR" && param.id === "curve" && param.type === "float") {
    return { point: 0, radius: ADSR_LINEAR_CURVE_SNAP_RADIUS };
  }
  return undefined;
}
