import { toAudioProject } from "@/audio/audioProject";
import { TRACK_VOLUME_AUTOMATION_ID, createTrackMacroAutomationLane } from "@/lib/macroAutomation";
import { presetPatches } from "@/lib/patch/presets";
import { AudioBenchmarkScenario, AudioBenchmarkScenarioConfig } from "@/audio/benchmarks/types";
import { Project, Track } from "@/types/music";

const DEFAULT_CONFIG: AudioBenchmarkScenarioConfig = {
  id: "stress-3min-35tracks",
  name: "Stress: 3 minute song, 35 tracks, dense notes and automation",
  durationBeats: 360,
  tempo: 120,
  meter: "4/4",
  gridBeats: 0.25,
  trackCount: 35,
  automatedTrackCount: 18,
  macroAutomationLanesPerTrack: 2,
  includeVolumeAutomationOnAutomatedTracks: true,
  noteSpacingBeats: 1,
  noteDurationBeats: 0.5,
  blockSize: 128,
  sampleRate: 48000
};

const PITCH_SETS_BY_PATCH_ID: Record<string, string[]> = {
  preset_bass: ["C2", "G2", "A#1", "F2"],
  preset_bassdrum: ["C1", "C1", "C1", "C1"],
  preset_brass: ["C4", "E4", "G4", "A#4"],
  preset_drumish: ["C2", "D2", "F#2", "A2"],
  preset_keys: ["C4", "E4", "G4", "B4"],
  preset_pad: ["C4", "G4", "A4", "D5"],
  preset_pluck: ["C5", "E5", "G5", "B5"]
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const createAutomationLane = (macroId: string, trackIndex: number, laneIndex: number, durationBeats: number) => {
  const lane = createTrackMacroAutomationLane(macroId, clamp01(((trackIndex + laneIndex) % 7) / 6));
  lane.endValue = clamp01(((trackIndex * 3 + laneIndex * 2 + 1) % 9) / 8);
  lane.keyframes = [
    {
      id: `${macroId}_q1`,
      beat: durationBeats * 0.2,
      type: "whole",
      value: clamp01(((trackIndex + laneIndex + 2) % 10) / 9)
    },
    {
      id: `${macroId}_mid`,
      beat: durationBeats * 0.45,
      type: "split",
      incomingValue: clamp01(((trackIndex + laneIndex + 4) % 11) / 10),
      outgoingValue: clamp01(((trackIndex + laneIndex + 1) % 11) / 10)
    },
    {
      id: `${macroId}_q3`,
      beat: durationBeats * 0.72,
      type: "whole",
      value: clamp01(((trackIndex * 5 + laneIndex + 3) % 12) / 11)
    }
  ];
  return lane;
};

const createTrackFx = (trackIndex: number) => ({
  delayEnabled: trackIndex % 3 === 0,
  reverbEnabled: trackIndex % 4 === 0,
  saturationEnabled: trackIndex % 2 === 0,
  compressorEnabled: trackIndex % 5 === 0,
  delayMix: 0.12 + (trackIndex % 4) * 0.08,
  reverbMix: 0.1 + (trackIndex % 3) * 0.06,
  drive: 0.18 + (trackIndex % 5) * 0.08,
  compression: 0.2 + (trackIndex % 4) * 0.12
});

const createTrackNotes = (
  patchId: string,
  trackIndex: number,
  durationBeats: number,
  noteSpacingBeats: number,
  noteDurationBeats: number
) => {
  const pitchSet = PITCH_SETS_BY_PATCH_ID[patchId] ?? ["C4", "E4", "G4", "B4"];
  const notes = [];
  let noteIndex = 0;
  const phaseOffset = (trackIndex % 4) * 0.25;

  for (let beat = phaseOffset; beat < durationBeats - 1e-9; beat += noteSpacingBeats) {
    notes.push({
      id: `note_${trackIndex + 1}_${noteIndex + 1}`,
      pitchStr: pitchSet[(noteIndex + trackIndex) % pitchSet.length],
      startBeat: Number(beat.toFixed(3)),
      durationBeats: noteDurationBeats,
      velocity: 0.65 + ((trackIndex + noteIndex) % 4) * 0.08
    });
    noteIndex += 1;
  }

  return notes;
};

const createTrack = (patchId: string, trackIndex: number, config: AudioBenchmarkScenarioConfig): Track => {
  const patch = presetPatches.find((entry) => entry.id === patchId);
  if (!patch) {
    throw new Error(`Missing preset patch: ${patchId}`);
  }

  const macroValues = Object.fromEntries(
    patch.ui.macros.map((macro, macroIndex) => [macro.id, clamp01(((trackIndex + macroIndex + 2) % 10) / 9)])
  );
  const macroAutomations: Track["macroAutomations"] = {};
  const automated = trackIndex < config.automatedTrackCount;

  if (automated) {
    for (const [laneIndex, macro] of patch.ui.macros.slice(0, config.macroAutomationLanesPerTrack).entries()) {
      macroAutomations[macro.id] = createAutomationLane(macro.id, trackIndex, laneIndex, config.durationBeats);
    }
    if (config.includeVolumeAutomationOnAutomatedTracks) {
      macroAutomations[TRACK_VOLUME_AUTOMATION_ID] = createAutomationLane(
        TRACK_VOLUME_AUTOMATION_ID,
        trackIndex,
        patch.ui.macros.length,
        config.durationBeats
      );
    }
  }

  return {
    id: `track_${trackIndex + 1}`,
    name: `Track ${trackIndex + 1}`,
    instrumentPatchId: patchId,
    notes: createTrackNotes(patchId, trackIndex, config.durationBeats, config.noteSpacingBeats, config.noteDurationBeats),
    macroValues,
    macroAutomations,
    macroPanelExpanded: trackIndex < 4,
    volume: 0.75 + (trackIndex % 5) * 0.12,
    mute: false,
    solo: false,
    fx: createTrackFx(trackIndex)
  };
};

export const createStressBenchmarkProject = (
  overrides: Partial<AudioBenchmarkScenarioConfig> = {}
): AudioBenchmarkScenario => {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const patches = structuredClone(presetPatches);
  const patchIds = patches.map((patch) => patch.id);
  const tracks = Array.from({ length: config.trackCount }, (_, trackIndex) => createTrack(patchIds[trackIndex % patchIds.length], trackIndex, config));

  const project: Project = {
    id: `benchmark_${config.id}`,
    name: config.name,
    global: {
      sampleRate: config.sampleRate,
      tempo: config.tempo,
      meter: config.meter,
      gridBeats: config.gridBeats,
      loop: []
    },
    tracks,
    patches,
    masterFx: {
      compressorEnabled: true,
      limiterEnabled: true,
      makeupGain: 0
    },
    ui: {
      patchWorkspace: {
        activeTabId: "bench_patch_tab_1",
        tabs: [
          {
            id: "bench_patch_tab_1",
            name: patches[0]?.name ?? "Patch",
            patchId: patches[0]?.id ?? "preset_bass",
            probes: []
          }
        ]
      }
    },
    createdAt: 0,
    updatedAt: 0
  };

  return {
    config,
    project: toAudioProject(project)
  };
};
