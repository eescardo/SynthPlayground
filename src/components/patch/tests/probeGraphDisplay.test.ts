import { describe, expect, it } from "vitest";

import {
  buildSignalHealthGradientId,
  createSignalHealthGraphStatusClass,
  formatSignalHealthStatusLabel
} from "@/components/patch/probeGraphDisplay";

describe("probe graph display helpers", () => {
  it("labels dc and rough statuses distinctly from ok", () => {
    expect(formatSignalHealthStatusLabel("clean")).toBe("ok");
    expect(formatSignalHealthStatusLabel("dc")).toBe("dc");
    expect(formatSignalHealthStatusLabel("rough")).toBe("rough");
    expect(createSignalHealthGraphStatusClass({ status: "dc" })).toContain(" dc");
    expect(createSignalHealthGraphStatusClass({ status: "rough" })).toContain(" rough");
  });

  it("sanitizes React ids before using them as SVG gradient ids", () => {
    expect(buildSignalHealthGradientId(":r1:")).toBe("signal-health-level-gradient-_r1_");
    expect(buildSignalHealthGradientId("stable-id_2")).toBe("signal-health-level-gradient-stable-id_2");
  });
});
