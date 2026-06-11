import { describe, expect, it } from "vitest";
import { formatBeatName, parseBeatName } from "@/lib/musicTiming";

describe("music timing beat names", () => {
  it("formats stored zero-based beats as one-based beat names", () => {
    expect(formatBeatName(0)).toBe("1");
    expect(formatBeatName(21.75)).toBe("22.75");
  });

  it("parses one-based beat names back to stored zero-based beats", () => {
    expect(parseBeatName("1")).toBe(0);
    expect(parseBeatName("22.75")).toBe(21.75);
  });

  it("rejects invalid beat names", () => {
    expect(parseBeatName("end")).toBeNull();
  });
});
