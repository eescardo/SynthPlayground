// Canonical host-facing patch boundary ports.
export const HOST_SOURCE_PORT_NAMES = {
  pitch: "pitch",
  gate: "gate",
  velocity: "velocity",
  modWheel: "modwheel"
} as const;

export const HOST_SINK_PORT_NAMES = {
  output: "output"
} as const;

export const PATCH_OUTPUT_PORT_ID = HOST_SINK_PORT_NAMES.output;

export const PATCH_BOUNDARY_PORT_NAMES: readonly [
  typeof HOST_SOURCE_PORT_NAMES.pitch,
  typeof HOST_SOURCE_PORT_NAMES.gate,
  typeof HOST_SOURCE_PORT_NAMES.velocity,
  typeof HOST_SOURCE_PORT_NAMES.modWheel,
  typeof HOST_SINK_PORT_NAMES.output
] = [
  HOST_SOURCE_PORT_NAMES.pitch,
  HOST_SOURCE_PORT_NAMES.gate,
  HOST_SOURCE_PORT_NAMES.velocity,
  HOST_SOURCE_PORT_NAMES.modWheel,
  HOST_SINK_PORT_NAMES.output
];

const toHostPortId = <T extends string>(name: T): `$host.${T}` => `$host.${name}`;

export const HOST_PORT_IDS = {
  pitch: toHostPortId(HOST_SOURCE_PORT_NAMES.pitch),
  gate: toHostPortId(HOST_SOURCE_PORT_NAMES.gate),
  velocity: toHostPortId(HOST_SOURCE_PORT_NAMES.velocity),
  modWheel: toHostPortId(HOST_SOURCE_PORT_NAMES.modWheel),
  output: toHostPortId(HOST_SINK_PORT_NAMES.output)
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
