export type SignalHealthStatus = "blank" | "clean" | "hot" | "clip" | "dc" | "rough";

export const SIGNAL_HEALTH_STATUS_LABELS = {
  blank: "no signal",
  clean: "ok",
  hot: "hot",
  clip: "clipping",
  dc: "dc",
  rough: "rough"
} as const satisfies Record<SignalHealthStatus, string>;

export function formatSignalHealthStatusLabel(status: SignalHealthStatus) {
  return SIGNAL_HEALTH_STATUS_LABELS[status];
}

export function buildSignalHealthGradientId(reactId: string) {
  return `signal-health-level-gradient-${reactId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function createSignalHealthGraphStatusClass(options: { compact?: boolean; status: SignalHealthStatus }) {
  return ["signal-health-probe", options.compact ? "compact" : null, options.status].filter(Boolean).join(" ");
}
