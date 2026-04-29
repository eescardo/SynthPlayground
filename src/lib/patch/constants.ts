// Canonical host-facing patch boundary ports.
export const HOST_PORT_IDS = {
  pitch: "$host.pitch",
  gate: "$host.gate",
  velocity: "$host.velocity",
  modWheel: "$host.modwheel",
  output: "$host.output"
} as const;

export type HostPatchPortId = (typeof HOST_PORT_IDS)[keyof typeof HOST_PORT_IDS];
export type HostSourcePortId =
  | typeof HOST_PORT_IDS.pitch
  | typeof HOST_PORT_IDS.gate
  | typeof HOST_PORT_IDS.velocity
  | typeof HOST_PORT_IDS.modWheel;
export type HostSinkPortId = typeof HOST_PORT_IDS.output;

export const SOURCE_HOST_PORT_IDS: readonly HostSourcePortId[] = [
  HOST_PORT_IDS.pitch,
  HOST_PORT_IDS.gate,
  HOST_PORT_IDS.velocity,
  HOST_PORT_IDS.modWheel
];

export const SINK_HOST_PORT_IDS: readonly HostSinkPortId[] = [HOST_PORT_IDS.output];
export const HOST_PATCH_PORT_IDS: readonly HostPatchPortId[] = [...SOURCE_HOST_PORT_IDS, ...SINK_HOST_PORT_IDS];

export const SOURCE_HOST_PORT_TYPE_BY_ID: Record<HostSourcePortId, "NotePitch" | "NoteGate" | "NoteVelocity" | "ModWheel"> = {
  [HOST_PORT_IDS.pitch]: "NotePitch",
  [HOST_PORT_IDS.gate]: "NoteGate",
  [HOST_PORT_IDS.velocity]: "NoteVelocity",
  [HOST_PORT_IDS.modWheel]: "ModWheel"
};

export const HOST_PATCH_PORT_TYPE_BY_ID: Record<HostPatchPortId, "NotePitch" | "NoteGate" | "NoteVelocity" | "ModWheel" | "Output"> = {
  ...SOURCE_HOST_PORT_TYPE_BY_ID,
  [HOST_PORT_IDS.output]: "Output"
};

export const HOST_PATCH_PORT_DIRECTION_BY_ID: Record<HostPatchPortId, "source" | "sink"> = {
  [HOST_PORT_IDS.pitch]: "source",
  [HOST_PORT_IDS.gate]: "source",
  [HOST_PORT_IDS.velocity]: "source",
  [HOST_PORT_IDS.modWheel]: "source",
  [HOST_PORT_IDS.output]: "sink"
};
