// Canonical host node IDs injected by runtime for per-voice note/control inputs.
export const HOST_NODE_IDS = {
  pitch: "$host.pitch",
  gate: "$host.gate",
  velocity: "$host.velocity",
  modWheel: "$host.modwheel"
} as const;

export type HostNodeId = (typeof HOST_NODE_IDS)[keyof typeof HOST_NODE_IDS];

export const SOURCE_HOST_NODE_IDS: readonly HostNodeId[] = [
  HOST_NODE_IDS.pitch,
  HOST_NODE_IDS.gate,
  HOST_NODE_IDS.velocity,
  HOST_NODE_IDS.modWheel
];

export const SOURCE_HOST_NODE_TYPE_BY_ID: Record<HostNodeId, "NotePitch" | "NoteGate" | "NoteVelocity" | "ModWheel"> = {
  [HOST_NODE_IDS.pitch]: "NotePitch",
  [HOST_NODE_IDS.gate]: "NoteGate",
  [HOST_NODE_IDS.velocity]: "NoteVelocity",
  [HOST_NODE_IDS.modWheel]: "ModWheel"
};
