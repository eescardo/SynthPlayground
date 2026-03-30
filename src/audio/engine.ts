"use client";

import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample, samplesPerBeat } from "@/lib/musicTiming";
import { createId } from "@/lib/ids";
import { Project } from "@/types/music";
import { SchedulerEvent } from "@/types/audio";

const LOOKAHEAD_MS = 300;
const SCHEDULER_TICK_MS = 25;
const BLOCK_SIZE = 128;
const FIXED_SAMPLE_RATE = 48000;
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
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private scheduler: number | null = null;
  private songStartContextTime = 0;
  private scheduledUntilSample = 0;
  private isPlaying = false;
  private project: Project | null = null;
  private playSessionId = 0;
  private recordingTrackId: string | null = null;

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

  private computeStaticScheduleEndSample(startSample: number, lookaheadSamples: number): number {
    if (!this.project) {
      return startSample + lookaheadSamples;
    }

    const maxNoteEndBeat = this.project.tracks
      .flatMap((track) => track.notes)
      .reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    const maxNoteEndSample = beatToSample(maxNoteEndBeat, FIXED_SAMPLE_RATE, this.project.global.tempo);
    return Math.max(startSample + lookaheadSamples, maxNoteEndSample + 1);
  }

  async init(): Promise<void> {
    if (this.context && this.worklet) {
      return;
    }

    await this.disposeContext();

    const context = new AudioContext({ sampleRate: FIXED_SAMPLE_RATE, latencyHint: "interactive" });
    const workletUrl =
      process.env.NODE_ENV === "development"
        ? `/worklets/synth-worklet.js?v=${Date.now()}`
        : "/worklets/synth-worklet.js";

    try {
      await context.audioWorklet.addModule(workletUrl);

      const worklet = new AudioWorkletNode(context, "synth-worklet-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      worklet.connect(context.destination);
      worklet.port.postMessage({
        type: "INIT",
        sampleRate: FIXED_SAMPLE_RATE,
        blockSize: BLOCK_SIZE
      });

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

  setProject(project: Project, options?: { syncToWorklet?: boolean }): void {
    this.project = project;
    if (options?.syncToWorklet === false) {
      return;
    }
    this.worklet?.port.postMessage({
      type: "SET_PROJECT",
      project
    });
  }

  async play(startBeat = 0): Promise<void> {
    await this.ensureRunning();
    if (!this.context || !this.worklet || !this.project) {
      return;
    }

    this.playSessionId += 1;
    const sessionId = this.playSessionId;

    const secondsAtBeat = (startBeat * 60) / this.project.global.tempo;
    this.songStartContextTime = this.context.currentTime - secondsAtBeat;
    const startSample = Math.max(0, beatToSample(startBeat, FIXED_SAMPLE_RATE, this.project.global.tempo));
    const lookaheadSamples = Math.round((LOOKAHEAD_MS / 1000) * FIXED_SAMPLE_RATE);
    const primedToSample =
      this.project.global.loop?.enabled
        ? startSample + lookaheadSamples
        : this.computeStaticScheduleEndSample(startSample, lookaheadSamples);
    const primedEvents = collectEventsInWindow(this.project, {
      fromSample: startSample,
      toSample: primedToSample
    });

    this.scheduledUntilSample = primedToSample;
    this.isPlaying = true;

    this.worklet.port.postMessage({
      type: "SET_PROJECT",
      project: this.project
    });

    this.worklet.port.postMessage({
      type: "TRANSPORT",
      isPlaying: true,
      songStartSample: startSample,
      events: primedEvents,
      sessionId
    });

    this.tickSchedule();
    if (this.scheduler !== null) {
      window.clearInterval(this.scheduler);
    }
    this.scheduler = window.setInterval(() => this.tickSchedule(), SCHEDULER_TICK_MS);
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

  private tickSchedule(): void {
    if (!this.context || !this.worklet || !this.project || !this.isPlaying) {
      return;
    }

    const currentSongSample = Math.max(0, Math.round((this.context.currentTime - this.songStartContextTime) * FIXED_SAMPLE_RATE));
    const lookaheadSamples = Math.round((LOOKAHEAD_MS / 1000) * FIXED_SAMPLE_RATE);
    const fromSample = this.scheduledUntilSample;
    const toSample = currentSongSample + lookaheadSamples;

    if (toSample <= fromSample) {
      return;
    }

    const loop = this.project.global.loop;
    if (loop?.enabled) {
      const loopStartSample = beatToSample(loop.startBeat, FIXED_SAMPLE_RATE, this.project.global.tempo);
      const loopEndSample = beatToSample(loop.endBeat, FIXED_SAMPLE_RATE, this.project.global.tempo);

      if (currentSongSample >= loopEndSample) {
        const loopDuration = loopEndSample - loopStartSample;
        this.songStartContextTime += loopDuration / FIXED_SAMPLE_RATE;
        this.scheduledUntilSample = loopStartSample;
        return;
      }
    }

    const events = collectEventsInWindow(this.project, { fromSample, toSample });
    if (events.length > 0) {
      this.worklet.port.postMessage({ type: "EVENTS", events, sessionId: this.playSessionId });
    }
    this.scheduledUntilSample = toSample;
  }

  getPlayheadBeat(): number {
    if (!this.context || !this.project || !this.isPlaying) {
      return 0;
    }
    const sample = Math.max(0, Math.round((this.context.currentTime - this.songStartContextTime) * FIXED_SAMPLE_RATE));
    return sample / samplesPerBeat(FIXED_SAMPLE_RATE, this.project.global.tempo);
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

  private getSafeLiveSampleTime(leadSamples = BLOCK_SIZE * 2): number {
    const currentSample = this.getCurrentSongSample();
    return currentSample + leadSamples;
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
    this.worklet?.port.postMessage({
      type: "RECORDING",
      trackId
    });
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

  recordNoteOff(trackId: string, noteId: string, pitchVoct: number): number {
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
          pitchVoct,
          noteId
        }
      ]
    });
    return sampleTime;
  }

  async previewNote(trackId: string, pitchVoct: number, durationBeats: number, velocity = 0.9): Promise<void> {
    if (this.isPlaying || !this.project) {
      return;
    }

    await this.ensureRunning();
    if (!this.worklet) {
      return;
    }

    const durationSamples = Math.max(1, beatToSample(durationBeats, FIXED_SAMPLE_RATE, this.project.global.tempo));
    const previewId = createId("preview");
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
      },
      {
        id: `${previewId}_off`,
        type: "NoteOff",
        source: "preview",
        sampleTime: durationSamples,
        trackId,
        pitchVoct,
        noteId: previewId
      }
    ];

    this.worklet.port.postMessage({
      type: "PREVIEW",
      events,
      durationSamples: durationSamples + BLOCK_SIZE
    });
  }

  async exportProjectAudio(project: Project): Promise<Blob> {
    const maxNoteEndBeat = project.tracks
      .flatMap((track) => track.notes)
      .reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    const renderEndBeat = Math.max(EXPORT_TAIL_BEATS, maxNoteEndBeat + EXPORT_TAIL_BEATS);
    const totalSamples = Math.max(BLOCK_SIZE, beatToSample(renderEndBeat, FIXED_SAMPLE_RATE, project.global.tempo) + BLOCK_SIZE);
    const initialEvents = collectEventsInWindow(project, { fromSample: 0, toSample: totalSamples });

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
