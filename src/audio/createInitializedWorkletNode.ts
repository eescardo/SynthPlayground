"use client";

import type { WorkletOutboundMessage } from "@/types/audio";

interface CreateInitializedWorkletNodeOptions {
  context: AudioContext;
  moduleUrl: string;
  sampleRate: number;
  blockSize: number;
  wasmBytes?: ArrayBuffer;
  timeoutMs?: number;
  onMessage?: (message: WorkletOutboundMessage) => void;
}

export const createInitializedWorkletNode = async ({
  context,
  moduleUrl,
  sampleRate,
  blockSize,
  wasmBytes,
  timeoutMs = 5000,
  onMessage
}: CreateInitializedWorkletNodeOptions): Promise<AudioWorkletNode> => {
  await context.audioWorklet.addModule(moduleUrl);

  const worklet = new AudioWorkletNode(context, "synth-worklet-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  });

  worklet.port.onmessage = (event: MessageEvent<WorkletOutboundMessage>) => {
    onMessage?.(event.data);
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error("Timed out waiting for audio worklet initialization."));
    }, timeoutMs);

    const previousOnMessage = worklet.port.onmessage;
    worklet.port.onmessage = (event: MessageEvent<WorkletOutboundMessage>) => {
      previousOnMessage?.call(worklet.port, event);
      const message = event.data;
      if (settled) {
        return;
      }
      if (message?.type === "INIT_READY") {
        settled = true;
        window.clearTimeout(timeout);
        resolve();
        return;
      }
      if (message?.type === "INIT_ERROR") {
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error(`Audio worklet init failed: ${message.error}`));
      }
    };

    worklet.port.postMessage(
      {
        type: "INIT",
        sampleRate,
        blockSize,
        wasmBytes
      },
      wasmBytes ? [wasmBytes] : []
    );
  });

  return worklet;
};
