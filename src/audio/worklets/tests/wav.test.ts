import { describe, expect, it } from "vitest";
import { pcmStereoToWavBlob } from "@/audio/wav";

describe("pcmStereoToWavBlob", () => {
  it("encodes stereo PCM data into a wav blob with the expected byte length", async () => {
    const left = new Float32Array([0, 0.5, -0.5, 1]);
    const right = new Float32Array([0.25, -0.25, 0.75, -1]);

    const blob = pcmStereoToWavBlob({
      left,
      right,
      sampleRate: 48000
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe("audio/wav");
    expect(bytes.length).toBe(44 + left.length * 2 * 2);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
  });
});
