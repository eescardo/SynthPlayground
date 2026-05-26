"use client";

import { createInitializedWorkletNode } from "@/audio/worklets/createInitializedWorkletNode";
import { collectEventsInWindow } from "@/audio/scheduler";
import {
  TRANSPORT_INITIAL_PRIME_MS,
  TRANSPORT_LOOKAHEAD_MS,
  TRANSPORT_SCHEDULER_TICK_MS,
  transportMsToSamples
} from "@/audio/transportScheduling";
import { getSongBeatForPlaybackBeat } from "@/lib/looping";
import { getProjectTimelineEndBeat, getTrackMacroValueAtBeat, TRACK_VOLUME_AUTOMATION_ID } from "@/lib/macroAutomation";
import { beatToSample, samplesPerBeat } from "@/lib/musicTiming";
import { pitchToVoct } from "@/lib/pitch";
import { createId } from "@/lib/ids";
import { isUiCaptureFakeAudioEnabled } from "@/lib/uiCaptureMode";
import { createSproutError, hydrateSerializableSproutError, SproutError } from "@/lib/sproutErrors";
import { AudioProject, SchedulerEvent, TransportCommand, WorkletOutboundMessage } from "@/types/audio";
import type { Track } from "@/types/music";
import { PreviewProbeCapture, PreviewProbeRequest, PreviewProbeSharedBuffer } from "@/types/probes";

export const BLOCK_SIZE = 128;
export const FIXED_SAMPLE_RATE = 48000;

const canUseSharedProbeBuffers = () =>
  typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;

const createPreviewProbeSharedBuffers = (
  captureProbes: PreviewProbeRequest[] | undefined,
  capacitySamples: number
): PreviewProbeSharedBuffer[] | undefined => {
  if (!captureProbes?.length || !canUseSharedProbeBuffers()) {
    return undefined;
  }
  const sharedBufferProbes = captureProbes.filter((probe) => probe.kind !== "spectrum");
  if (!sharedBufferProbes.length) {
    return undefined;
  }
  const safeCapacitySamples = Math.max(1, Math.floor(capacitySamples));
  return sharedBufferProbes.map((probe) => ({
    probeId: probe.probeId,
    capacitySamples: safeCapacitySamples,
    sampleBuffer: new SharedArrayBuffer(safeCapacitySamples * Float32Array.BYTES_PER_ELEMENT)
  }));
};

const hydrateSharedPreviewCaptureSamples = (capture: PreviewProbeCapture): PreviewProbeCapture => {
  if (!capture.sampleBuffer) {
    return capture;
  }
  const sampleLength = Math.max(
    0,
    Math.min(
      capture.sampleLength ?? capture.capturedSamples,
      capture.sampleBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT
    )
  );
  return {
    ...capture,
    samples: new Float32Array(capture.sampleBuffer, 0, sampleLength)
  };
};

export interface AudioEngineBackend {
  init(): Promise<void>;
  ensureRunning(): Promise<void>;
  setRuntimeErrorListener(listener: ((error: SproutError) => void) | null): void;
  replaceProject(project: AudioProject): void;
  syncProjectSnapshot(project: AudioProject, options?: { syncToWorklet?: boolean }): void;
  setTrackMuted(trackId: string, muted: boolean, options?: { restoreVolume?: boolean }): void;
  play(startBeat?: number, options?: AudioEnginePlayOptions): Promise<void>;
  stop(): void;
  getPlayheadBeat(): number;
  getSampleRate(): number;
  getCurrentSongSample(): number;
  getElapsedPlaybackBeat(): number;
  sendParamChanges(events: SchedulerEvent[]): void;
  setMacroValue(trackId: string, macroId: string, normalized: number): void;
  setRecordingTrack(trackId: string | null): void;
  recordNoteOn(trackId: string, noteId: string, pitchVoct: number, velocity?: number): Promise<number>;
  recordNoteOff(trackId: string, noteId: string): number;
  previewNote(
    trackId: string,
    pitchVoct: number,
    durationBeats: number,
    velocity?: number,
    options?: {
      ignoreVolume?: boolean;
      projectOverride?: AudioProject;
      captureProbes?: PreviewProbeRequest[];
      captureDurationBeats?: number;
      previewId?: string;
      holdUntilReleased?: boolean;
    }
  ): Promise<void>;
  releasePreviewNote(trackId: string, previewId: string, options?: { forceStop?: boolean }): void;
  setPreviewCaptureListener(
    listener: ((previewId: string | undefined, captures: PreviewProbeCapture[]) => void) | null
  ): void;
}

export interface AudioEnginePlayOptions {
  recordingTrackId?: string | null;
}

type LegacyWorkletRuntimeErrorMessage = Omit<Extract<WorkletOutboundMessage, { type: "RUNTIME_ERROR" }>, "sproutError">;
type ToleratedWorkletRuntimeErrorMessage =
  | Extract<WorkletOutboundMessage, { type: "RUNTIME_ERROR" }>
  | LegacyWorkletRuntimeErrorMessage;

export const formatWorkletRuntimeError = (message: ToleratedWorkletRuntimeErrorMessage) =>
  `Audio worklet ${message.phase} failed: ${message.error}`;

export const createWorkletRuntimeSproutError = (message: ToleratedWorkletRuntimeErrorMessage): SproutError =>
  "sproutError" in message
    ? hydrateSerializableSproutError(message.sproutError)
    : createSproutError({
        source: "audio_worklet",
        code: "runtime_error",
        severity: "error",
        message: formatWorkletRuntimeError(message),
        error: new Error(message.error),
        details: { phase: message.phase }
      });

const getWorkletUrl = () => {
  const basePath = "/worklets/synth-worklet.js";
  return process.env.NODE_ENV === "development" ? `${basePath}?v=${Date.now()}` : basePath;
};

const loadWorkletWasmBytes = async () => {
  const response = await fetch(
    process.env.NODE_ENV === "development" ? `/wasm/pkg/dsp_core_bg.wasm?v=${Date.now()}` : "/wasm/pkg/dsp_core_bg.wasm"
  );
  if (!response.ok) {
    throw new Error(`Failed to load worklet WASM binary: ${response.status} ${response.statusText}`);
  }
  return await response.arrayBuffer();
};

export const createTrackVolumeRestoreCommand = (
  project: AudioProject,
  track: Track,
  songBeat: number
): TransportCommand => ({
  type: "SetTrackVolume",
  trackId: track.id,
  normalized: getTrackMacroValueAtBeat(
    track,
    TRACK_VOLUME_AUTOMATION_ID,
    track.volume / 2,
    songBeat,
    getProjectTimelineEndBeat(project)
  )
});

export const updateTrackMuteSnapshot = (project: AudioProject, trackId: string, muted: boolean): AudioProject => {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || Boolean(track.mute) === muted) {
      return track;
    }
    changed = true;
    return { ...track, mute: muted };
  });
  return changed ? { ...project, tracks } : project;
};

export const createActiveTrackNoteEvents = (
  project: AudioProject,
  trackId: string,
  songBeat: number,
  noteOnSample: number
): SchedulerEvent[] => {
  const track = project.tracks.find((entry) => entry.id === trackId);
  if (!track) {
    return [];
  }

  const spb = samplesPerBeat(project.global.sampleRate, project.global.tempo);
  return track.notes.flatMap((note): SchedulerEvent[] => {
    const noteEndBeat = note.startBeat + note.durationBeats;
    if (note.startBeat > songBeat || noteEndBeat <= songBeat) {
      return [];
    }

    const noteOffSample = Math.max(
      noteOnSample + BLOCK_SIZE,
      noteOnSample + Math.round((noteEndBeat - songBeat) * spb)
    );
    return [
      {
        id: `${trackId}:${note.id}:live-unmute-on:${noteOnSample}`,
        type: "NoteOn",
        source: "live_input",
        sampleTime: noteOnSample,
        trackId,
        noteId: note.id,
        pitchVoct: pitchToVoct(note.pitchStr),
        velocity: note.velocity
      },
      {
        id: `${trackId}:${note.id}:live-unmute-off:${noteOffSample}`,
        type: "NoteOff",
        source: "live_input",
        sampleTime: noteOffSample,
        trackId,
        noteId: note.id
      }
    ];
  });
};

export class RealAudioEngineBackend implements AudioEngineBackend {
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private scheduler: number | null = null;
  private songStartContextTime = 0;
  private scheduledUntilSample = 0;
  private isPlaying = false;
  private project: AudioProject | null = null;
  private playSessionId = 0;
  private recordingTrackId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private cueBeat = 0;
  private previewCaptureListener: ((previewId: string | undefined, captures: PreviewProbeCapture[]) => void) | null =
    null;
  private runtimeErrorListener: ((error: SproutError) => void) | null = null;

  private async disposeContext(): Promise<void> {
    this.worklet?.disconnect();
    this.worklet = null;
    if (this.context) {
      const context = this.context;
      this.context = null;
      try {
        await context.close();
      } catch {
        // ignore close failures during recovery
      }
    }
  }

  private tickSchedule(): void {
    if (!this.context || !this.worklet || !this.project || !this.isPlaying) {
      return;
    }

    const currentSongSample = Math.max(
      0,
      Math.round((this.context.currentTime - this.songStartContextTime) * FIXED_SAMPLE_RATE)
    );
    const lookaheadSamples = transportMsToSamples(TRANSPORT_LOOKAHEAD_MS, FIXED_SAMPLE_RATE);
    const fromSample = this.scheduledUntilSample;
    const toSample = currentSongSample + lookaheadSamples;

    if (toSample <= fromSample) {
      return;
    }

    const events = collectEventsInWindow(
      this.project,
      { fromSample, toSample },
      {
        cueBeat: this.cueBeat,
        skipTimelineNoteTrackIds: this.getScheduledTimelineNoteSkipTrackIds()
      }
    );
    if (events.length > 0) {
      this.worklet.port.postMessage({ type: "EVENTS", events, sessionId: this.playSessionId });
    }
    this.scheduledUntilSample = toSample;
  }

  private getSafeLiveSampleTime(leadSamples = BLOCK_SIZE * 2): number {
    const currentSample = this.getCurrentSongSample();
    return currentSample + leadSamples;
  }

  private dispatchTransportCommand(command: TransportCommand): void {
    if (!this.worklet || !this.isPlaying) {
      return;
    }
    this.worklet.port.postMessage({ type: "TRANSPORT_COMMAND", command, sessionId: this.playSessionId });
  }

  private rescheduleUnmutedTrackEvents(trackId: string): void {
    if (!this.project || !this.worklet || !this.isPlaying) {
      return;
    }

    const currentSongSample = this.getCurrentSongSample();
    const lookaheadSamples = transportMsToSamples(TRANSPORT_LOOKAHEAD_MS, FIXED_SAMPLE_RATE);
    const toSample = Math.max(this.scheduledUntilSample, currentSongSample + lookaheadSamples);
    if (toSample <= currentSongSample) {
      return;
    }

    const noteOnSample = this.getSafeLiveSampleTime();
    const activeNoteEvents = createActiveTrackNoteEvents(this.project, trackId, this.getPlayheadBeat(), noteOnSample);
    const events = activeNoteEvents.concat(
      collectEventsInWindow(
        this.project,
        { fromSample: currentSongSample, toSample },
        { cueBeat: this.cueBeat, skipTimelineNoteTrackIds: this.getScheduledTimelineNoteSkipTrackIds() }
      ).filter((event) => "trackId" in event && event.trackId === trackId)
    );
    if (events.length > 0) {
      this.worklet.port.postMessage({ type: "EVENTS", events, sessionId: this.playSessionId });
    }
  }

  private getTrackVolumeRestoreCommand(trackId: string): TransportCommand | null {
    if (!this.project) {
      return null;
    }
    const track = this.project.tracks.find((entry) => entry.id === trackId);
    if (!track) {
      return null;
    }
    return createTrackVolumeRestoreCommand(this.project, track, this.getPlayheadBeat());
  }

  setTrackMuted(trackId: string, muted: boolean, options?: { restoreVolume?: boolean }): void {
    if (this.project) {
      this.project = updateTrackMuteSnapshot(this.project, trackId, muted);
    }
    this.dispatchTransportCommand({ type: "SetTrackMute", trackId, muted });
    if (!muted && options?.restoreVolume !== false) {
      const restoreCommand = this.getTrackVolumeRestoreCommand(trackId);
      if (restoreCommand) {
        this.dispatchTransportCommand(restoreCommand);
      }
    }
    if (!muted) {
      this.rescheduleUnmutedTrackEvents(trackId);
    }
  }

  async init(): Promise<void> {
    if (this.context && this.worklet) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeAudioContext();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initializeAudioContext(): Promise<void> {
    if (this.context && this.worklet) {
      return;
    }

    await this.disposeContext();

    const context = new AudioContext({ sampleRate: FIXED_SAMPLE_RATE, latencyHint: "interactive" });

    try {
      const wasmBytes = await loadWorkletWasmBytes();
      const worklet = await createInitializedWorkletNode({
        context,
        moduleUrl: getWorkletUrl(),
        sampleRate: FIXED_SAMPLE_RATE,
        blockSize: BLOCK_SIZE,
        wasmBytes,
        onMessage: (message: WorkletOutboundMessage) => {
          if (message?.type === "PREVIEW_CAPTURE") {
            this.previewCaptureListener?.(message.previewId, message.captures.map(hydrateSharedPreviewCaptureSamples));
          } else if (message?.type === "RUNTIME_ERROR") {
            const runtimeError = createWorkletRuntimeSproutError(message);
            if (this.runtimeErrorListener) {
              this.runtimeErrorListener(runtimeError);
            } else {
              console.error("Audio runtime error listener is not registered.", runtimeError);
            }
          }
        }
      });

      worklet.connect(context.destination);

      if (this.project) {
        worklet.port.postMessage({
          type: "SET_PROJECT",
          project: this.project
        });
      }

      this.context = context;
      this.worklet = worklet;
    } catch (error) {
      try {
        await context.close();
      } catch {
        // ignore cleanup failures after init error
      }
      throw new Error(`Failed to initialize audio worklet: ${(error as Error).message}`);
    }
  }

  async ensureRunning(): Promise<void> {
    await this.init();
    if (!this.context) {
      return;
    }
    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }

  setRuntimeErrorListener(listener: ((error: SproutError) => void) | null): void {
    this.runtimeErrorListener = listener;
  }

  replaceProject(project: AudioProject): void {
    this.stop();
    this.project = project;
    this.worklet?.port.postMessage({
      type: "SET_PROJECT",
      project
    });
  }

  syncProjectSnapshot(project: AudioProject, options?: { syncToWorklet?: boolean }): void {
    const previousProject = this.project;
    this.project = project;
    if (this.isPlaying && this.worklet) {
      const previousTracksById = new Map(previousProject?.tracks.map((track) => [track.id, track]));
      for (const nextTrack of project.tracks) {
        const previousTrack = previousTracksById.get(nextTrack.id);
        if (!previousTrack || previousTrack.mute === nextTrack.mute) {
          continue;
        }
        this.setTrackMuted(nextTrack.id, Boolean(nextTrack.mute));
      }
    }
    if (options?.syncToWorklet === false) {
      return;
    }
    this.worklet?.port.postMessage({
      type: "SET_PROJECT",
      project
    });
  }

  setPreviewCaptureListener(
    listener: ((previewId: string | undefined, captures: PreviewProbeCapture[]) => void) | null
  ): void {
    this.previewCaptureListener = listener;
  }

  async play(startBeat = 0, options?: AudioEnginePlayOptions): Promise<void> {
    if (options?.recordingTrackId !== undefined) {
      this.recordingTrackId = options.recordingTrackId;
    }
    await this.ensureRunning();
    if (!this.context || !this.worklet || !this.project) {
      return;
    }

    this.cueBeat = startBeat;
    this.playSessionId += 1;
    const sessionId = this.playSessionId;

    this.songStartContextTime = this.context.currentTime;
    const primedToSample = transportMsToSamples(TRANSPORT_INITIAL_PRIME_MS, FIXED_SAMPLE_RATE);
    const primedEvents = collectEventsInWindow(
      this.project,
      { fromSample: 0, toSample: primedToSample },
      { cueBeat: startBeat, skipTimelineNoteTrackIds: this.getScheduledTimelineNoteSkipTrackIds() }
    );

    this.scheduledUntilSample = primedToSample;
    this.isPlaying = true;

    this.worklet.port.postMessage({
      type: "SET_PROJECT",
      project: this.project
    });

    this.worklet.port.postMessage({
      type: "TRANSPORT",
      isPlaying: true,
      songStartSample: 0,
      events: primedEvents,
      sessionId
    });
    this.postRecordingTrack();

    this.tickSchedule();
    if (this.scheduler !== null) {
      window.clearInterval(this.scheduler);
    }
    this.scheduler = window.setInterval(() => this.tickSchedule(), TRANSPORT_SCHEDULER_TICK_MS);
  }

  stop(): void {
    this.isPlaying = false;
    this.recordingTrackId = null;
    if (this.scheduler !== null) {
      window.clearInterval(this.scheduler);
      this.scheduler = null;
    }

    this.worklet?.port.postMessage({
      type: "RECORDING",
      trackId: null
    });
    this.worklet?.port.postMessage({
      type: "TRANSPORT",
      isPlaying: false,
      songStartSample: 0,
      sessionId: this.playSessionId
    });
  }

  getPlayheadBeat(): number {
    if (!this.context || !this.project || !this.isPlaying) {
      return 0;
    }
    const elapsedPlaybackBeat =
      Math.max(0, Math.round((this.context.currentTime - this.songStartContextTime) * FIXED_SAMPLE_RATE)) /
      samplesPerBeat(FIXED_SAMPLE_RATE, this.project.global.tempo);
    return getSongBeatForPlaybackBeat(elapsedPlaybackBeat, this.cueBeat, this.project.global.loop);
  }

  getSampleRate(): number {
    return FIXED_SAMPLE_RATE;
  }

  getCurrentSongSample(): number {
    if (!this.context || !this.isPlaying) {
      return 0;
    }
    return Math.max(0, Math.round((this.context.currentTime - this.songStartContextTime) * FIXED_SAMPLE_RATE));
  }

  getElapsedPlaybackBeat(): number {
    if (!this.context || !this.isPlaying) {
      return 0;
    }
    return (
      Math.max(0, Math.round((this.context.currentTime - this.songStartContextTime) * FIXED_SAMPLE_RATE)) /
      samplesPerBeat(FIXED_SAMPLE_RATE, this.project?.global.tempo ?? 120)
    );
  }

  sendParamChanges(events: SchedulerEvent[]): void {
    if (!this.worklet || events.length === 0) {
      return;
    }
    this.worklet.port.postMessage({ type: "EVENTS", events });
  }

  setMacroValue(trackId: string, macroId: string, normalized: number): void {
    this.worklet?.port.postMessage({ type: "MACRO", trackId, macroId, normalized });
  }

  setRecordingTrack(trackId: string | null): void {
    this.recordingTrackId = trackId;
    this.postRecordingTrack();
  }

  private postRecordingTrack(): void {
    this.worklet?.port.postMessage({
      type: "RECORDING",
      trackId: this.recordingTrackId
    });
  }

  private getScheduledTimelineNoteSkipTrackIds(): ReadonlySet<string> | undefined {
    return this.recordingTrackId ? new Set([this.recordingTrackId]) : undefined;
  }

  async recordNoteOn(trackId: string, noteId: string, pitchVoct: number, velocity = 0.9): Promise<number> {
    await this.ensureRunning();
    if (!this.worklet || !this.isPlaying) {
      return 0;
    }

    const sampleTime = this.getSafeLiveSampleTime();
    this.worklet.port.postMessage({
      type: "EVENTS",
      sessionId: this.playSessionId,
      events: [
        {
          id: `${noteId}_live_on`,
          type: "NoteOn",
          source: "live_input",
          sampleTime,
          trackId,
          pitchVoct,
          velocity,
          noteId
        }
      ]
    });
    return sampleTime;
  }

  recordNoteOff(trackId: string, noteId: string): number {
    if (!this.worklet || !this.isPlaying) {
      return 0;
    }

    const sampleTime = this.getSafeLiveSampleTime();
    this.worklet.port.postMessage({
      type: "EVENTS",
      sessionId: this.playSessionId,
      events: [
        {
          id: `${noteId}_live_off`,
          type: "NoteOff",
          source: "live_input",
          sampleTime,
          trackId,
          noteId
        }
      ]
    });
    return sampleTime;
  }

  async previewNote(
    trackId: string,
    pitchVoct: number,
    durationBeats: number,
    velocity = 0.9,
    options?: {
      ignoreVolume?: boolean;
      projectOverride?: AudioProject;
      captureProbes?: PreviewProbeRequest[];
      captureDurationBeats?: number;
      previewId?: string;
      holdUntilReleased?: boolean;
    }
  ): Promise<void> {
    if (this.isPlaying || !this.project) {
      return;
    }

    await this.ensureRunning();
    if (!this.worklet) {
      return;
    }

    const previewProject = options?.projectOverride ?? this.project;
    const durationSamples = Math.max(1, beatToSample(durationBeats, FIXED_SAMPLE_RATE, previewProject.global.tempo));
    const captureDurationBeats = options?.captureDurationBeats ?? durationBeats;
    const captureDurationSamples =
      Math.max(1, beatToSample(captureDurationBeats, FIXED_SAMPLE_RATE, previewProject.global.tempo)) + BLOCK_SIZE;
    const previewId = options?.previewId ?? createId("preview");
    const captureSharedBuffers = createPreviewProbeSharedBuffers(options?.captureProbes, captureDurationSamples);
    const events: SchedulerEvent[] = [
      {
        id: `${previewId}_on`,
        type: "NoteOn",
        source: "preview",
        sampleTime: 0,
        trackId,
        pitchVoct,
        velocity,
        noteId: previewId
      }
    ];
    if (!options?.holdUntilReleased) {
      events.push({
        id: `${previewId}_off`,
        type: "NoteOff",
        source: "preview",
        sampleTime: durationSamples,
        trackId,
        noteId: previewId
      });
    }

    this.worklet.port.postMessage({
      type: "PREVIEW",
      trackId,
      previewId,
      events,
      durationSamples: durationSamples + BLOCK_SIZE,
      captureDurationSamples,
      ignoreVolume: options?.ignoreVolume !== false,
      project: options?.projectOverride,
      captureProbes: options?.captureProbes,
      captureSharedBuffers
    });
  }

  releasePreviewNote(trackId: string, previewId: string, options?: { forceStop?: boolean }): void {
    this.worklet?.port.postMessage({
      type: "PREVIEW_RELEASE",
      trackId,
      previewId,
      forceStop: options?.forceStop
    });
  }
}

class FakeAudioEngineBackend implements AudioEngineBackend {
  private fakeSongStartTimeMs = 0;
  private isPlaying = false;
  private project: AudioProject | null = null;
  private cueBeat = 0;
  private recordingTrackId: string | null = null;

  private getSafeLiveSampleTime(leadSamples = BLOCK_SIZE * 2): number {
    return this.getCurrentSongSample() + leadSamples;
  }

  async init(): Promise<void> {}

  async ensureRunning(): Promise<void> {
    await this.init();
  }

  setRuntimeErrorListener(): void {}

  replaceProject(project: AudioProject): void {
    this.stop();
    this.project = project;
  }

  syncProjectSnapshot(project: AudioProject): void {
    this.project = project;
  }

  setTrackMuted(trackId: string, muted: boolean): void {
    void trackId;
    void muted;
  }

  setPreviewCaptureListener(): void {}

  async play(startBeat = 0, options?: AudioEnginePlayOptions): Promise<void> {
    if (options?.recordingTrackId !== undefined) {
      this.recordingTrackId = options.recordingTrackId;
    }
    if (!this.project) {
      return;
    }
    this.cueBeat = startBeat;
    this.fakeSongStartTimeMs = performance.now();
    this.isPlaying = true;
  }

  stop(): void {
    this.isPlaying = false;
    this.recordingTrackId = null;
  }

  getPlayheadBeat(): number {
    if (!this.project || !this.isPlaying) {
      return 0;
    }
    return getSongBeatForPlaybackBeat(this.getElapsedPlaybackBeat(), this.cueBeat, this.project.global.loop);
  }

  getSampleRate(): number {
    return FIXED_SAMPLE_RATE;
  }

  getCurrentSongSample(): number {
    if (!this.isPlaying) {
      return 0;
    }
    return Math.max(0, Math.round(((performance.now() - this.fakeSongStartTimeMs) / 1000) * FIXED_SAMPLE_RATE));
  }

  getElapsedPlaybackBeat(): number {
    if (!this.isPlaying) {
      return 0;
    }
    return (performance.now() - this.fakeSongStartTimeMs) / 1000 / (60 / (this.project?.global.tempo ?? 120));
  }

  sendParamChanges(events: SchedulerEvent[]): void {
    void events;
  }

  setMacroValue(trackId: string, macroId: string, normalized: number): void {
    void trackId;
    void macroId;
    void normalized;
  }

  setRecordingTrack(trackId: string | null): void {
    this.recordingTrackId = trackId;
  }

  async recordNoteOn(trackId: string, noteId: string, pitchVoct: number, velocity = 0.9): Promise<number> {
    void trackId;
    void noteId;
    void pitchVoct;
    void velocity;
    await this.ensureRunning();
    return this.getSafeLiveSampleTime();
  }

  recordNoteOff(trackId: string, noteId: string): number {
    void trackId;
    void noteId;
    return this.getSafeLiveSampleTime();
  }

  async previewNote(
    trackId: string,
    pitchVoct: number,
    durationBeats: number,
    velocity = 0.9,
    options?: {
      ignoreVolume?: boolean;
      projectOverride?: AudioProject;
      captureProbes?: PreviewProbeRequest[];
      captureDurationBeats?: number;
      previewId?: string;
      holdUntilReleased?: boolean;
    }
  ): Promise<void> {
    void trackId;
    void pitchVoct;
    void durationBeats;
    void velocity;
    void options;
  }

  releasePreviewNote(trackId: string, previewId: string, options?: { forceStop?: boolean }): void {
    void trackId;
    void previewId;
    void options;
  }
}

export const createAudioEngineBackend = (): AudioEngineBackend =>
  isUiCaptureFakeAudioEnabled() ? new FakeAudioEngineBackend() : new RealAudioEngineBackend();
