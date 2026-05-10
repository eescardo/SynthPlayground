import { describe, expect, it } from "vitest";
import { resolvePatchWireCandidate } from "@/lib/patch/wireCandidate";
import { Patch } from "@/types/patch";

const makePatch = (connections: Patch["connections"] = []): Patch => ({
  schemaVersion: 1,
  id: "patch_wire_candidate",
  name: "Wire Candidate",
  meta: { source: "custom" },
  nodes: [
    { id: "vco1", typeId: "VCO", params: {} },
    { id: "env1", typeId: "ADSR", params: {} },
    { id: "env2", typeId: "ADSR", params: {} },
    { id: "vca1", typeId: "VCA", params: {} }
  ],
  ports: [],
  connections,
  layout: { nodes: [] },
  ui: { macros: [] }
});

describe("resolvePatchWireCandidate", () => {
  it("reports type mismatches without changing the source", () => {
    expect(
      resolvePatchWireCandidate(
        makePatch(),
        { nodeId: "vco1", portId: "out", kind: "out" },
        { nodeId: "vca1", portId: "gainCV", kind: "in" }
      )
    ).toMatchObject({ status: "invalid", reason: "type mismatch" });
  });

  it("classifies occupied single-input ports as replace candidates when the new source is compatible", () => {
    expect(
      resolvePatchWireCandidate(
        makePatch([
          { id: "existing", from: { nodeId: "env1", portId: "out" }, to: { nodeId: "vca1", portId: "gainCV" } }
        ]),
        { nodeId: "env2", portId: "out", kind: "out" },
        { nodeId: "vca1", portId: "gainCV", kind: "in" }
      )
    ).toMatchObject({ status: "replace", disconnectConnectionId: "existing" });
  });

  it("reports cycles as invalid candidates", () => {
    expect(
      resolvePatchWireCandidate(
        makePatch(),
        { nodeId: "vca1", portId: "out", kind: "out" },
        { nodeId: "vca1", portId: "in", kind: "in" }
      )
    ).toMatchObject({ status: "invalid", reason: "would create cycle" });
  });
});
