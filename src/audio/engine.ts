"use client";

import { collectEventsInWindow } from "@/audio/scheduler";
import { getLoopPlaybackEndBeat } from "@/lib/looping";
import { beatToSample } from "@/lib/musicTiming";
import { createAudioEngineBackend, AudioEngineBackend, BLOCK_SIZE, FIXED_SAMPLE_RATE } from "@/audio/engineBackends";
import { AudioProject } from "@/types/audio";

const EXPORT_TAIL_BEATS = 8;

const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([wav], { type: "audio/wav" });
};

export class AudioEngine {
  private readonly backend: AudioEngineBackend;

  constructor() {
    this.backend = createAudioEngineBackend();
  }

  init(): Promise<void> {
    return this.backend.init();
  }

  ensureRunning(): Promise<void> {
    return this.backend.ensureRunning();
  }

  setProject(project: AudioProject, options?: { syncToWorklet?: boolean }): void {
    this.backend.setProject(project, options);
  }

  play(startBeat = 0): Promise<void> {
    return this.backend.play(startBeat);
  }

  stop(): void {
    this.backend.stop();
  }

  getPlayheadBeat(): number {
    return this.backend.getPlayheadBeat();
  }

  getSampleRate(): number {
    return this.backend.getSampleRate();
  }

  getCurrentSongSample(): number {
    return this.backend.getCurrentSongSample();
  }

  getElapsedPlaybackBeat(): number {
    return this.backend.getElapsedPlaybackBeat();
  }

  sendParamChanges(events: Parameters<AudioEngineBackend["sendParamChanges"]>[0]): void {
    this.backend.sendParamChanges(events);
  }

  setMacroValue(trackId: string, macroId: string, normalized: number): void {
    this.backend.setMacroValue(trackId, macroId, normalized);
  }

  setRecordingTrack(trackId: string | null): void {
    this.backend.setRecordingTrack(trackId);
  }

  recordNoteOn(trackId: string, noteId: string, pitchVoct: number, velocity = 0.9): Promise<number> {
    return this.backend.recordNoteOn(trackId, noteId, pitchVoct, velocity);
  }

  recordNoteOff(trackId: string, noteId: string, pitchVoct: number): number {
    return this.backend.recordNoteOff(trackId, noteId, pitchVoct);
  }

  previewNote(
    trackId: string,
    pitchVoct: number,
    durationBeats: number,
    velocity = 0.9,
    options?: { ignoreVolume?: boolean; projectOverride?: AudioProject }
  ): Promise<void> {
    return this.backend.previewNote(trackId, pitchVoct, durationBeats, velocity, options);
  }

  async exportProjectAudio(project: AudioProject): Promise<Blob> {
    const maxNoteEndBeat = project.tracks
      .flatMap((track) => track.notes)
      .reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    const renderEndBeat = Math.max(EXPORT_TAIL_BEATS, maxNoteEndBeat + EXPORT_TAIL_BEATS);
    const playbackEndBeat = getLoopPlaybackEndBeat(project, 0, renderEndBeat);
    const totalSamples = Math.max(BLOCK_SIZE, beatToSample(playbackEndBeat, FIXED_SAMPLE_RATE, project.global.tempo) + BLOCK_SIZE);
    const initialEvents = collectEventsInWindow(project, { fromSample: 0, toSample: totalSamples }, { cueBeat: 0 });

    const context = new OfflineAudioContext({
      numberOfChannels: 2,
      length: totalSamples,
      sampleRate: FIXED_SAMPLE_RATE
    });
    const workletUrl =
      process.env.NODE_ENV === "development"
        ? `/worklets/synth-worklet.js?v=${Date.now()}`
        : "/worklets/synth-worklet.js";

    await context.audioWorklet.addModule(workletUrl);
    const worklet = new AudioWorkletNode(context, "synth-worklet-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        sampleRate: FIXED_SAMPLE_RATE,
        blockSize: BLOCK_SIZE,
        project,
        transport: {
          isPlaying: true,
          songStartSample: 0,
          events: initialEvents,
          sessionId: 1
        }
      }
    });
    worklet.connect(context.destination);

    const rendered = await context.startRendering();
    worklet.disconnect();
    return audioBufferToWavBlob(rendered);
  }
}
