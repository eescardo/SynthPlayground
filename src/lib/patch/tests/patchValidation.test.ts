import { describe, expect, it } from "vitest";

import { bassPatch, createClearPatch, drumPatch, pluckPatch, presetPatches } from "@/lib/patch/presets";
import { validatePatch, validatePatchConnectionCandidate } from "@/lib/patch/validation";
import { Patch } from "@/types/patch";

function findIssue(patch: Patch, code: string, nodeId: string, portId: string) {
  return validatePatch(patch).issues.find(
    (issue) => issue.code === code && issue.context?.nodeId === nodeId && issue.context?.portId === portId
  );
}

describe("patch validation", () => {
  it("rejects conflicting macro bindings across different macros", () => {
    const patch = pluckPatch();
    patch.ui.macros.push({
      id: "macro_conflict",
      name: "Conflict",
      keyframeCount: 2,
      bindings: [
        {
          id: "conflict_binding",
          nodeId: "karplus1",
          paramId: "brightness",
          map: "linear",
          min: 0.2,
          max: 0.8
        }
      ]
    });

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Conflicting macro bindings target the same parameter"))).toBe(true);
  });

  it("rejects duplicate bindings to the same parameter within one macro", () => {
    const patch = pluckPatch();
    patch.ui.macros[0].bindings.push({
      id: "dup_binding",
      nodeId: "vcf1",
      paramId: "cutoffHz",
      map: "linear",
      min: 100,
      max: 500
    });

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Macro binds the same parameter more than once"))).toBe(true);
  });

  it("rejects bindings whose keyframe count differs from the macro", () => {
    const patch = pluckPatch();
    patch.ui.macros[0].keyframeCount = 2;
    patch.ui.macros[0].bindings[0] = {
      ...patch.ui.macros[0].bindings[0],
      map: "piecewise",
      points: [
        { x: 0, y: 100 },
        { x: 0.5, y: 400 },
        { x: 1, y: 900 }
      ]
    };

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("keyframe count"))).toBe(true);
  });

  it("accepts bundled pluck preset with non-overlapping macro targets", () => {
    const patch: Patch = pluckPatch();

    const result = validatePatch(patch);

    expect(result.ok).toBe(true);
  });

  it("accepts bundled drum preset with non-overlapping macro targets", () => {
    const patch: Patch = drumPatch();

    const result = validatePatch(patch);

    expect(result.ok).toBe(true);
  });

  it("accepts all bundled presets with required port validation enabled", () => {
    for (const patch of presetPatches) {
      const result = validatePatch(patch);
      expect(result.ok, patch.name).toBe(true);
    }
  });

  it("rejects modules with unconnected required input ports", () => {
    const patch = bassPatch();
    patch.connections = patch.connections.filter(
      (connection) => !(connection.to.nodeId === "vco1" && connection.to.portId === "pitch")
    );

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(findIssue(patch, "required-port-unconnected", "vco1", "pitch")).toBeTruthy();
  });

  it("rejects modules with unconnected required output ports", () => {
    const patch = bassPatch();
    patch.connections = patch.connections.filter(
      (connection) => !(connection.from.nodeId === "sat1" && connection.from.portId === "out")
    );

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(findIssue(patch, "required-port-unconnected", "sat1", "out")).toBeTruthy();
  });

  it("does not treat same-module wiring as satisfying required ports", () => {
    const patch: Patch = {
      schemaVersion: 1,
      id: "self_loop_validation",
      name: "Self Loop Validation",
      meta: { source: "custom" },
      nodes: [
        {
          id: "vca1",
          typeId: "VCA",
          params: {
            bias: 0,
            gain: 1
          }
        },
        {
          id: "out1",
          typeId: "Output",
          params: {
            gainDb: -6,
            limiter: true
          }
        }
      ],
      connections: [
        {
          id: "c1",
          from: { nodeId: "vca1", portId: "out" },
          to: { nodeId: "vca1", portId: "in" }
        },
        {
          id: "c2",
          from: { nodeId: "vca1", portId: "out" },
          to: { nodeId: "out1", portId: "in" }
        }
      ],
      ui: { macros: [] },
      layout: { nodes: [] },
      io: {
        audioOutNodeId: "out1",
        audioOutPortId: "in"
      }
    };

    const result = validatePatch(patch);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Cycle detected in patch graph"))).toBe(true);
    expect(findIssue(patch, "required-port-unconnected", "vca1", "in")).toBeTruthy();
  });

  it("allows wiring a module output into Output even when other required ports are still missing", () => {
    const patch = createClearPatch({ id: "clear_patch", name: "Clear Patch" });
    patch.nodes.unshift({
      id: "vco1",
      typeId: "VCO",
      params: {
        wave: "saw",
        pulseWidth: 0.5,
        baseTuneCents: 0,
        fineTuneCents: 0,
        pwmAmount: 0
      }
    });
    patch.layout.nodes.unshift({ nodeId: "vco1", x: 8, y: 6 });

    const issues = validatePatchConnectionCandidate(patch, "vco1", "out", "out1", "in");

    expect(issues).toEqual([]);
  });

  it("allows wiring host pitch into a module pitch input", () => {
    const patch = createClearPatch({ id: "host_connect", name: "Host Connect" });
    patch.nodes.unshift({
      id: "vco1",
      typeId: "VCO",
      params: {
        wave: "saw",
        pulseWidth: 0.5,
        baseTuneCents: 0,
        fineTuneCents: 0,
        pwmAmount: 0
      }
    });
    patch.layout.nodes.unshift({ nodeId: "vco1", x: 8, y: 6 });

    const issues = validatePatchConnectionCandidate(patch, "$host.pitch", "out", "vco1", "pitch");

    expect(issues).toEqual([]);
  });
});
