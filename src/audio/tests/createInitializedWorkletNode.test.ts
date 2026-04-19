import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkletOutboundMessage } from "@/types/audio";
import { createInitializedWorkletNode } from "@/audio/createInitializedWorkletNode";

interface FakePort {
  onmessage: ((event: MessageEvent<WorkletOutboundMessage>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

interface FakeAudioWorkletNode {
  port: FakePort;
}

const installAudioWorkletNode = (factory: () => FakeAudioWorkletNode) => {
  class MockAudioWorkletNode {
    constructor() {
      return factory();
    }
  }
  vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);
};

const createContext = () => ({
  audioWorklet: {
    addModule: vi.fn().mockResolvedValue(undefined)
  }
});

describe("createInitializedWorkletNode", () => {
  const originalAudioWorkletNode = globalThis.AudioWorkletNode;
  const originalWindow = (globalThis as typeof globalThis & { window?: typeof globalThis }).window;

  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis)
    });
  });

  afterEach(() => {
    if (originalAudioWorkletNode) {
      vi.stubGlobal("AudioWorkletNode", originalAudioWorkletNode);
    } else {
      vi.unstubAllGlobals();
    }

    if (originalWindow) {
      vi.stubGlobal("window", originalWindow);
    }
    vi.useRealTimers();
  });

  it("resolves when the worklet reports INIT_READY", async () => {
    const context = createContext();
    let createdNode: FakeAudioWorkletNode | null = null;

    installAudioWorkletNode(() => {
        createdNode = {
          port: {
            onmessage: null,
            postMessage: vi.fn(() => {
              createdNode?.port.onmessage?.({ data: { type: "INIT_READY" } } as MessageEvent<WorkletOutboundMessage>);
            })
          }
      };
      return createdNode;
    });

    const onMessage = vi.fn();
    const worklet = await createInitializedWorkletNode({
      context: context as unknown as AudioContext,
      moduleUrl: "/worklets/test.js",
      sampleRate: 48000,
      blockSize: 128,
      onMessage
    });

    expect(context.audioWorklet.addModule).toHaveBeenCalledWith("/worklets/test.js");
    expect(worklet).toBe(createdNode);
    expect(createdNode).not.toBeNull();
    expect(createdNode!.port.postMessage).toHaveBeenCalledWith(
      {
        type: "INIT",
        sampleRate: 48000,
        blockSize: 128,
        wasmBytes: undefined
      },
      []
    );
    expect(onMessage).toHaveBeenCalledWith({ type: "INIT_READY" });
  });

  it("rejects when the worklet reports INIT_ERROR", async () => {
    const context = createContext();

    installAudioWorkletNode(() => ({
        port: {
          onmessage: null,
          postMessage: vi.fn(function (this: FakePort) {
            this.onmessage?.({
              data: { type: "INIT_ERROR", error: "boom" }
            } as MessageEvent<WorkletOutboundMessage>);
          })
        }
      }));

    await expect(
      createInitializedWorkletNode({
        context: context as unknown as AudioContext,
        moduleUrl: "/worklets/test.js",
        sampleRate: 48000,
        blockSize: 128
      })
    ).rejects.toThrow("Audio worklet init failed: boom");
  });

  it("rejects when the worklet never initializes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });

    const context = createContext();
    installAudioWorkletNode(() => ({
        port: {
          onmessage: null,
          postMessage: vi.fn()
        }
      }));

    const pending = createInitializedWorkletNode({
      context: context as unknown as AudioContext,
      moduleUrl: "/worklets/test.js",
      sampleRate: 48000,
      blockSize: 128,
      timeoutMs: 50
    });

    const rejection = expect(pending).rejects.toThrow("Timed out waiting for audio worklet initialization.");
    await vi.advanceTimersByTimeAsync(51);
    await rejection;
  });
});
