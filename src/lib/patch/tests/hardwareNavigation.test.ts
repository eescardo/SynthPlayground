import { describe, expect, it } from "vitest";
import {
  buildPatchCanvasNavigationModel,
  buildPatchFocusableId,
  resolveNextPatchCanvasFocus,
  resolveNextPatchPortFocus,
  resolvePatchHostFocusablePorts,
  resolvePatchFocusablePorts
} from "@/lib/patch/hardwareNavigation";
import { createClearPatch } from "@/lib/patch/presets";
import { Patch } from "@/types/patch";

function createNavigationPatch(): Patch {
  const patch = createClearPatch({ id: "patch_hw_nav", name: "Hardware Nav" });
  patch.nodes.push(
    { id: "vco", typeId: "VCO", params: {} },
    { id: "vcf", typeId: "VCF", params: {} },
    { id: "vca", typeId: "VCA", params: {} },
    { id: "delay", typeId: "Delay", params: {} }
  );
  patch.layout.nodes.push(
    { nodeId: "vco", x: 4, y: 4 },
    { nodeId: "vcf", x: 16, y: 4 },
    { nodeId: "vca", x: 16, y: 13 },
    { nodeId: "delay", x: 28, y: 13 }
  );
  return patch;
}

describe("patch hardware navigation", () => {
  it("builds predictable arrow edges for canvas modules and probes", () => {
    const patch = createNavigationPatch();
    const layoutByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));
    const model = buildPatchCanvasNavigationModel({
      patch,
      layoutByNode,
      probes: [{ id: "probe_scope", kind: "scope", name: "Scope", x: 28, y: 4, width: 10, height: 6 }]
    });

    expect(resolveNextPatchCanvasFocus(model, { kind: "module", nodeId: "vco" }, "ArrowRight")).toEqual({
      kind: "module",
      nodeId: "vcf"
    });
    expect(resolveNextPatchCanvasFocus(model, { kind: "module", nodeId: "vcf" }, "ArrowDown")).toEqual({
      kind: "module",
      nodeId: "vca"
    });
    expect(resolveNextPatchCanvasFocus(model, { kind: "module", nodeId: "vcf" }, "ArrowRight")).toEqual({
      kind: "probe",
      probeId: "probe_scope"
    });
  });

  it("keeps every canvas item reachable through arrow traversal", () => {
    const patch = createNavigationPatch();
    const layoutByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));
    const model = buildPatchCanvasNavigationModel({
      patch,
      layoutByNode,
      probes: [{ id: "probe_scope", kind: "scope", name: "Scope", x: 28, y: 4, width: 10, height: 6 }]
    });
    const reachable = new Set<string>();
    const queue = [model.items[0]];
    for (const item of queue) {
      if (reachable.has(item.id)) {
        continue;
      }
      reachable.add(item.id);
      for (const nextId of Object.values(model.edgesByItemId.get(item.id) ?? {})) {
        const nextItem = nextId ? model.itemById.get(nextId) : undefined;
        if (nextItem && !reachable.has(nextItem.id)) {
          queue.push(nextItem);
        }
      }
    }

    expect([...reachable].sort()).toEqual(model.items.map((item) => item.id).sort());
  });

  it("resolves a selected module's ports in keyboard order", () => {
    const patch = createNavigationPatch();
    const layoutByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));

    expect(
      resolvePatchFocusablePorts({
        patch,
        layoutByNode,
        nodeId: "vca",
        outputHostCanvasLeft: 1200,
        hitPorts: []
      }).map((port) => buildPatchFocusableId({ kind: "port", ...port }))
    ).toEqual(["port:vca:in:in", "port:vca:in:gainCV", "port:vca:out:out"]);
  });

  it("uses rendered hit-port rectangles before fallback geometry", () => {
    const patch = createNavigationPatch();
    const layoutByNode = new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));

    expect(
      resolvePatchFocusablePorts({
        patch,
        layoutByNode,
        nodeId: "vca",
        outputHostCanvasLeft: 1200,
        hitPorts: [{ nodeId: "vca", portId: "out", kind: "out", x: 111, y: 222, width: 33, height: 12 }]
      })
    ).toEqual([{ nodeId: "vca", portId: "out", portKind: "out", x: 111, y: 222, width: 33, height: 12 }]);
  });

  it("exposes host ports as keyboard-focusable wire destinations", () => {
    const patch = createNavigationPatch();

    expect(
      resolvePatchHostFocusablePorts({
        patch,
        outputHostCanvasLeft: 1200
      }).map((port) => buildPatchFocusableId({ kind: "port", ...port }))
    ).toEqual([
      "port:output:in:in",
      "port:$host.pitch:out:out",
      "port:$host.gate:out:out",
      "port:$host.velocity:out:out",
      "port:$host.modwheel:out:out"
    ]);
  });

  it("navigates module ports by side and exits horizontally", () => {
    const ports = [
      { nodeId: "vca", portId: "in", portKind: "in" as const, x: 0, y: 0, width: 10, height: 10 },
      { nodeId: "vca", portId: "gainCV", portKind: "in" as const, x: 0, y: 20, width: 10, height: 10 },
      { nodeId: "vca", portId: "out", portKind: "out" as const, x: 100, y: 0, width: 10, height: 10 }
    ];

    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "in", portKind: "in" },
        ports,
        key: "ArrowLeft"
      })
    ).toEqual({ kind: "exitToGraph" });
    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "in", portKind: "in" },
        ports,
        key: "ArrowRight"
      })
    ).toEqual({ kind: "exitToModule" });
    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "out", portKind: "out" },
        ports,
        key: "ArrowRight"
      })
    ).toEqual({ kind: "exitToGraph" });
    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "out", portKind: "out" },
        ports,
        key: "ArrowLeft"
      })
    ).toEqual({ kind: "exitToModule" });
    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "gainCV", portKind: "in" },
        ports,
        key: "ArrowDown"
      })
    ).toEqual({ kind: "exit" });
    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "in", portKind: "in" },
        ports,
        key: "ArrowUp"
      })
    ).toEqual({ kind: "exit" });
    expect(
      resolveNextPatchPortFocus({
        current: { kind: "port", nodeId: "vca", portId: "in", portKind: "in" },
        ports,
        key: "ArrowDown"
      })
    ).toEqual({
      kind: "port",
      focus: { kind: "port", nodeId: "vca", portId: "gainCV", portKind: "in" }
    });
  });
});
