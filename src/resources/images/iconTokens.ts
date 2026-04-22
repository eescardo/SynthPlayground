export const ICON_TOKENS = {
  ui: {
    grid: 24,
    viewBox: "0 0 24 24",
    safeInset: 2,
    stroke: 1.75,
    strokeEmphasis: 2,
    lineCap: "round",
    lineJoin: "round",
  },
  brand: {
    grid: 32,
    viewBox: "0 0 32 32",
    safeInset: 3,
    stroke: 2.25,
    lineCap: "round",
    lineJoin: "round",
  },
  render: {
    navIcon: 16,
    navPatchIcon: 17,
    brandMark: 20,
    favicon16: 16,
    favicon32: 32,
    favicon48: 48,
    favicon64: 64,
  },
  colors: {
    ink: "#E8F2FF",
    accent: "#4FB8FF",
    ok: "#6DDB84",
  },
} as const;

export type IconTokens = typeof ICON_TOKENS;
