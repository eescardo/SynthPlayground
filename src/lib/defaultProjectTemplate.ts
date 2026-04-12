import defaultProjectTemplateData from "@/lib/defaultProjectTemplateData.json";
import { createId } from "@/lib/ids";
import { DEFAULT_LOOP_REPEAT_COUNT, MAX_LOOP_REPEAT_COUNT } from "@/lib/looping";
import { sanitizeMacroAutomationMap } from "@/lib/macroAutomation";
import { ensurePatchLayout } from "@/lib/patch/autoLayout";
import { Project, Track, PatchWorkspaceTabState } from "@/types/music";
import { Patch } from "@/types/patch";

type RawTemplateTrack = {
  name?: unknown;
  instrumentPatchId?: unknown;
  notes?: unknown;
  macroValues?: unknown;
  macroAutomations?: unknown;
  macroPanelExpanded?: unknown;
  volume?: unknown;
  mute?: unknown;
  solo?: unknown;
  fx?: unknown;
};

type RawTemplatePatch = {
  id?: unknown;
  layout?: {
    nodes?: Array<{ nodeId?: unknown; x?: unknown; y?: unknown }>;
  };
};

type RawTemplateProject = {
  name?: unknown;
  global?: {
    tempo?: unknown;
    meter?: unknown;
    gridBeats?: unknown;
    loop?: Array<{ kind?: unknown; beat?: unknown; repeatCount?: unknown }>;
  };
  tracks?: RawTemplateTrack[];
  patches?: RawTemplatePatch[];
  masterFx?: {
    compressorEnabled?: unknown;
    limiterEnabled?: unknown;
    makeupGain?: unknown;
  };
};

const templateProject = defaultProjectTemplateData as RawTemplateProject;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const asString = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);
const asFiniteNumber = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const sanitizeTemplateTrack = (track: RawTemplateTrack, index: number): Track => {
  const fx = typeof track.fx === "object" && track.fx !== null ? track.fx : {};
  const notes = Array.isArray(track.notes) ? track.notes : [];
  const macroValuesRaw = typeof track.macroValues === "object" && track.macroValues !== null ? track.macroValues : {};
  const macroValues = Object.fromEntries(
    Object.entries(macroValuesRaw).flatMap(([key, value]) =>
      typeof value === "number" && Number.isFinite(value) ? [[key, clamp(value, 0, 1)]] : []
    )
  );

  return {
    id: createId("track"),
    name: asString(track.name, `Track ${index + 1}`),
    instrumentPatchId: asString(track.instrumentPatchId, "preset_bass"),
    notes: notes.flatMap((entry) => {
      const note = typeof entry === "object" && entry !== null ? entry : {};
      const pitchStr = asString((note as { pitchStr?: unknown }).pitchStr, "");
      const startBeat = asFiniteNumber((note as { startBeat?: unknown }).startBeat, Number.NaN);
      const durationBeats = asFiniteNumber((note as { durationBeats?: unknown }).durationBeats, Number.NaN);
      if (!pitchStr || !Number.isFinite(startBeat) || !Number.isFinite(durationBeats) || durationBeats <= 0) {
        return [];
      }
      return [
        {
          id: createId("note"),
          pitchStr,
          startBeat: Math.max(0, startBeat),
          durationBeats,
          velocity: clamp(asFiniteNumber((note as { velocity?: unknown }).velocity, 0.85), 0, 1)
        }
      ];
    }),
    macroValues,
    macroAutomations: sanitizeMacroAutomationMap(track.macroAutomations),
    macroPanelExpanded: track.macroPanelExpanded === true,
    volume: clamp(asFiniteNumber(track.volume, 1), 0, 2),
    mute: Boolean(track.mute),
    solo: Boolean(track.solo),
    fx: {
      delayEnabled: Boolean((fx as { delayEnabled?: unknown }).delayEnabled),
      reverbEnabled: Boolean((fx as { reverbEnabled?: unknown }).reverbEnabled),
      saturationEnabled: Boolean((fx as { saturationEnabled?: unknown }).saturationEnabled),
      compressorEnabled: Boolean((fx as { compressorEnabled?: unknown }).compressorEnabled),
      delayMix: clamp(asFiniteNumber((fx as { delayMix?: unknown }).delayMix, 0.2), 0, 1),
      reverbMix: clamp(asFiniteNumber((fx as { reverbMix?: unknown }).reverbMix, 0.2), 0, 1),
      drive: clamp(asFiniteNumber((fx as { drive?: unknown }).drive, 0.2), 0, 1),
      compression: clamp(asFiniteNumber((fx as { compression?: unknown }).compression, 0.4), 0, 1)
    }
  };
};

const createInitialPatchWorkspaceState = (initialPatchId: string, bundledPresetPatches: Patch[]) => {
  const initialPatchName = bundledPresetPatches.find((patch) => patch.id === initialPatchId)?.name ?? "Instrument";
  const initialTab: PatchWorkspaceTabState = {
    id: createId("patchTab"),
    name: initialPatchName,
    patchId: initialPatchId,
    probes: []
  };
  return {
    activeTabId: initialTab.id,
    tabs: [initialTab]
  };
};

const buildTemplateLayoutByPatchId = (): Map<string, Map<string, { x: number; y: number }>> => {
  const patches = Array.isArray(templateProject.patches) ? templateProject.patches : [];
  return new Map(
    patches.flatMap((patch) => {
      const patchId = asString(patch.id, "");
      if (!patchId) {
        return [];
      }
      const layoutNodes = Array.isArray(patch.layout?.nodes) ? patch.layout.nodes : [];
      return [
        [
          patchId,
          new Map(
            layoutNodes.flatMap((entry) => {
              const nodeId = asString(entry.nodeId, "");
              if (!nodeId) {
                return [];
              }
              return [[nodeId, { x: Math.max(0, Math.floor(asFiniteNumber(entry.x, 0))), y: Math.max(0, Math.floor(asFiniteNumber(entry.y, 0))) }]];
            })
          )
        ] as const
      ];
    })
  );
};

const mergePresetLayout = (patch: Patch, templateLayoutByPatchId: Map<string, Map<string, { x: number; y: number }>>): Patch => {
  const templateLayout = templateLayoutByPatchId.get(patch.id);
  if (!templateLayout) {
    return structuredClone(patch);
  }

  return {
    ...structuredClone(patch),
    layout: {
      nodes: patch.layout.nodes.map((node) => ({
        nodeId: node.nodeId,
        x: templateLayout.get(node.nodeId)?.x ?? node.x,
        y: templateLayout.get(node.nodeId)?.y ?? node.y
      }))
    }
  };
};

export const createDefaultProjectFromTemplate = (bundledPresetPatches: Patch[]): Project => {
  const now = Date.now();
  const global = typeof templateProject.global === "object" && templateProject.global !== null ? templateProject.global : {};
  const masterFx = typeof templateProject.masterFx === "object" && templateProject.masterFx !== null ? templateProject.masterFx : {};
  const tracksRaw = Array.isArray(templateProject.tracks) ? templateProject.tracks : [];
  const templateLayoutByPatchId = buildTemplateLayoutByPatchId();

  return {
    ui: {
      patchWorkspace: createInitialPatchWorkspaceState(
        tracksRaw[0]?.instrumentPatchId && typeof tracksRaw[0].instrumentPatchId === "string"
          ? tracksRaw[0].instrumentPatchId
          : bundledPresetPatches[0]?.id ?? "preset_bass",
        bundledPresetPatches
      )
    },
    id: "project_default",
    name: asString(templateProject.name, "New Synth Playground Project"),
    global: {
      sampleRate: 48000,
      tempo: clamp(asFiniteNumber(global.tempo, 122), 20, 400),
      meter: global.meter === "3/4" ? "3/4" : "4/4",
      gridBeats: Math.max(asFiniteNumber(global.gridBeats, 0.25), 0.03125),
      loop: (Array.isArray(global.loop) ? global.loop : []).flatMap((marker) => {
        const kind = marker.kind === "start" || marker.kind === "end" ? marker.kind : null;
        const beat = asFiniteNumber(marker.beat, Number.NaN);
        if (!kind || !Number.isFinite(beat)) {
          return [];
        }
        return [
          {
            id: createId("loop_marker"),
            kind,
            beat: Math.max(0, beat),
            repeatCount:
              kind === "end"
                ? Math.max(
                    DEFAULT_LOOP_REPEAT_COUNT,
                    Math.min(MAX_LOOP_REPEAT_COUNT, Math.round(asFiniteNumber(marker.repeatCount, DEFAULT_LOOP_REPEAT_COUNT)))
                  )
                : undefined
          }
        ];
      })
    },
    tracks: tracksRaw.map(sanitizeTemplateTrack),
    patches: bundledPresetPatches.map((patch) => ensurePatchLayout(mergePresetLayout(patch, templateLayoutByPatchId))),
    masterFx: {
      compressorEnabled: Boolean(masterFx.compressorEnabled),
      limiterEnabled: masterFx.limiterEnabled !== false,
      makeupGain: asFiniteNumber(masterFx.makeupGain, 0)
    },
    createdAt: now,
    updatedAt: now
  };
};

export const createEmptyProjectFromPresets = (bundledPresetPatches: Patch[]): Project => {
  const now = Date.now();
  const firstPresetId = bundledPresetPatches[0]?.id ?? "preset_bass";

  return {
    ui: {
      patchWorkspace: createInitialPatchWorkspaceState(firstPresetId, bundledPresetPatches)
    },
    id: "project_default",
    name: "New Synth Playground Project",
    global: {
      sampleRate: 48000,
      tempo: 122,
      meter: "4/4",
      gridBeats: 0.25,
      loop: []
    },
    tracks: [
      {
        id: createId("track"),
        name: "Track 1",
        instrumentPatchId: firstPresetId,
        notes: [],
        macroValues: {},
        macroAutomations: {},
        macroPanelExpanded: false,
        volume: 1,
        mute: false,
        solo: false,
        fx: {
          delayEnabled: false,
          reverbEnabled: false,
          saturationEnabled: false,
          compressorEnabled: false,
          delayMix: 0.2,
          reverbMix: 0.2,
          drive: 0.2,
          compression: 0.4
        }
      }
    ],
    patches: bundledPresetPatches.map((patch) => ensurePatchLayout(structuredClone(patch))),
    masterFx: {
      compressorEnabled: false,
      limiterEnabled: true,
      makeupGain: 0
    },
    createdAt: now,
    updatedAt: now
  };
};
