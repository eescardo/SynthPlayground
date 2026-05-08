"use client";

import { renderProjectOfflineBrowserWasm } from "@/audio/offline/renderProjectOfflineBrowserWasm";
import { collectEventsInWindow } from "@/audio/scheduler";
import { pcmStereoToWavBlob } from "@/audio/wav";
import { getLoopPlaybackEndBeat } from "@/lib/looping";
import { beatToSample } from "@/lib/musicTiming";
import { createAudioEngineBackend, AudioEngineBackend, BLOCK_SIZE, FIXED_SAMPLE_RATE } from "@/audio/engineBackends";
import { AudioProject } from "@/types/audio";
import { PreviewProbeCapture, PreviewProbeRequest } from "@/types/probes";

const EXPORT_TAIL_BEATS = 8;

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

  recordNoteOff(trackId: string, noteId: string): number {
    return this.backend.recordNoteOff(trackId, noteId);
  }

  previewNote(
    trackId: string,
    pitchVoct: number,
    durationBeats: number,
    velocity = 0.9,
    options?: {
      ignoreVolume?: boolean;
      projectOverride?: AudioProject;
      captureProbes?: PreviewProbeRequest[];
      previewId?: string;
      holdUntilReleased?: boolean;
    }
  ): Promise<void> {
    return this.backend.previewNote(trackId, pitchVoct, durationBeats, velocity, options);
  }

  releasePreviewNote(trackId: string, previewId: string): void {
    this.backend.releasePreviewNote(trackId, previewId);
  }

  setPreviewCaptureListener(
    listener: ((previewId: string | undefined, captures: PreviewProbeCapture[]) => void) | null
  ): void {
    this.backend.setPreviewCaptureListener(listener);
  }

  async exportProjectAudio(project: AudioProject): Promise<Blob> {
    const maxNoteEndBeat = project.tracks
      .flatMap((track) => track.notes)
      .reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    const renderEndBeat = Math.max(EXPORT_TAIL_BEATS, maxNoteEndBeat + EXPORT_TAIL_BEATS);
    const playbackEndBeat = getLoopPlaybackEndBeat(project, 0, renderEndBeat);
    const totalSamples = Math.max(
      BLOCK_SIZE,
      beatToSample(playbackEndBeat, FIXED_SAMPLE_RATE, project.global.tempo) + BLOCK_SIZE
    );
    const initialEvents = collectEventsInWindow(project, { fromSample: 0, toSample: totalSamples }, { cueBeat: 0 });
    const rendered = await renderProjectOfflineBrowserWasm(project, {
      sampleRate: FIXED_SAMPLE_RATE,
      blockSize: BLOCK_SIZE,
      durationSamples: totalSamples,
      events: initialEvents,
      sessionId: 1
    });

    return pcmStereoToWavBlob({
      left: rendered.left,
      right: rendered.right,
      sampleRate: FIXED_SAMPLE_RATE
    });
  }
}
