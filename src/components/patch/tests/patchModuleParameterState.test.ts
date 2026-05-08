import { describe, expect, it } from "vitest";
import {
  resolveParamBindingState,
  resolveParamControlValue
} from "@/components/patch/patchModuleParameterState";
import { applyMagneticSliderSnap } from "@/components/patch/patchModuleParameterControls";
import { resolveParamSliderMagnet } from "@/components/patch/patchModuleParameterInspector";
import { createDefaultParamsForType, getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch } from "@/types/patch";

const karplusSchema = () => {
  const schema = getModuleSchema("KarplusStrong");
  if (!schema) {
    throw new Error("Expected KarplusStrong schema.");
  }
  return schema;
};

describe("PatchModuleParameter macro-bound controls", () => {
  it("uses a magnetic slider center for the ADSR curve parameter", () => {
    const schema = getModuleSchema("ADSR");
    const curveParam = schema?.params.find((entry) => entry.id === "curve");
    if (!curveParam) {
      throw new Error("Expected ADSR curve param.");
    }
    const magnet = resolveParamSliderMagnet(
      { id: "env1", typeId: "ADSR", params: createDefaultParamsForType("ADSR") },
      curveParam
    );
    expect(magnet).toEqual({ point: 0, radius: 0.035 });
    expect(applyMagneticSliderSnap(0.034, magnet)).toBe(0);
    expect(applyMagneticSliderSnap(-0.034, magnet)).toBe(0);
    expect(applyMagneticSliderSnap(0.04, magnet)).toBe(0.04);
    expect(applyMagneticSliderSnap(-0.04, magnet)).toBe(-0.04);
  });

  it("only previews the selected macro on parameters bound to that macro", () => {
    const node = {
      id: "karplus1",
      typeId: "KarplusStrong",
      params: {
        ...createDefaultParamsForType("KarplusStrong"),
        decay: 0.996,
        damping: 0.42,
        brightness: 0.46
      }
    };
    const patch: Patch = {
      schemaVersion: 1,
      id: "patch_macro_preview",
      name: "Macro Preview",
      meta: { source: "custom" },
      nodes: [node],
      ports: [],
      connections: [],
      ui: {
        macros: [
          {
            id: "macro_tightness",
            name: "Tightness",
            keyframeCount: 2,
            bindings: [{ id: "tightness_damping", nodeId: node.id, paramId: "damping", map: "linear", min: 0.2, max: 0.8 }]
          },
          {
            id: "macro_material",
            name: "Material",
            keyframeCount: 2,
            bindings: [{ id: "material_brightness", nodeId: node.id, paramId: "brightness", map: "linear", min: 0.1, max: 0.9 }]
          }
        ]
      },
      layout: { nodes: [{ nodeId: node.id, x: 0, y: 0 }] }
    };
    const [decayParam, dampingParam, brightnessParam] = ["decay", "damping", "brightness"].map((paramId) => {
      const param = karplusSchema().params.find((entry) => entry.id === paramId);
      if (!param) {
        throw new Error(`Expected ${paramId} param.`);
      }
      return param;
    });

    const selectedMacroId = "macro_material";
    const selectedMacroValue = 0.75;
    const dampingState = resolveParamBindingState(patch, node, dampingParam, selectedMacroId, null, false);
    const brightnessState = resolveParamBindingState(patch, node, brightnessParam, selectedMacroId, null, false);

    expect(resolveParamControlValue({
      activeBinding: dampingState.activeBindingMacro?.bindings[0],
      activeBindingMacroId: dampingState.activeBindingMacro?.id,
      selectedMacroId,
      selectedMacroValue,
      value: node.params.damping
    })).toBe(node.params.damping);
    expect(resolveParamControlValue({
      activeBinding: brightnessState.activeBindingMacro?.bindings[0],
      activeBindingMacroId: brightnessState.activeBindingMacro?.id,
      selectedMacroId,
      selectedMacroValue,
      value: node.params.brightness
    })).toBeCloseTo(0.7);
    expect(resolveParamControlValue({ selectedMacroId, selectedMacroValue, value: node.params.decay })).toBe(node.params.decay);
    expect(decayParam.id).toBe("decay");
  });
});
