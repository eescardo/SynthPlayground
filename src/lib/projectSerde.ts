import { createId } from "@/lib/ids";
import { DEFAULT_LOOP_REPEAT_COUNT, MAX_LOOP_REPEAT_COUNT } from "@/lib/looping";
import { sanitizeMacroAutomationMap } from "@/lib/macroAutomation";
import { clamp, clamp01 } from "@/lib/numeric";
import { clampProbeMaxFrequencyHz, DEFAULT_PROBE_MAX_FREQUENCY_HZ } from "@/lib/patch/probes";
import { presetPatches } from "@/lib/patch/presets";
import { normalizePatch } from "@/lib/patch/normalize";
import { TRACK_VOLUME_DEFAULT, TRACK_VOLUME_MAX, TRACK_VOLUME_MIN } from "@/lib/trackVolume";
import { Project, TrackFxSettings, PatchWorkspaceTabState } from "@/types/music";
import { PatchProbeTarget, PatchWorkspaceProbeState } from "@/types/probes";
import { ProjectAssetLibrary } from "@/types/assets";
import {
  createEmptyProjectAssetLibrary,
  normalizeProjectAssetLibrary,
  pickReferencedProjectAssets
} from "@/lib/sampleAssetLibrary";
import type { Patch } from "@/types/patch";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asString = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback);

const asOptionalFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const defaultTrackFx = (): TrackFxSettings => ({
  delayEnabled: false,
  reverbEnabled: false,
  saturationEnabled: false,
  compressorEnabled: false,
  delayMix: 0.2,
  reverbMix: 0.2,
  drive: 0.2,
  compression: 0.4
});

const bundledPresetNameById = new Map(
  presetPatches.flatMap((patch) => (patch.meta.source === "preset" ? [[patch.meta.presetId, patch.name] as const] : []))
);

const alignPresetDisplayName = (patch: Patch): Patch => {
  if (patch.meta.source !== "preset") {
    return patch;
  }

  const bundledName = bundledPresetNameById.get(patch.meta.presetId);
  return bundledName && patch.name !== bundledName ? { ...patch, name: bundledName } : patch;
};

const sanitizeMacroValueMap = (raw: unknown): Record<string, number> => {
  if (!isObject(raw)) {
    return {};
  }
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = clamp01(value);
    }
  }
  return values;
};

const sanitizePresetUpdateVersionMap = (raw: unknown): Record<string, number> | undefined => {
  if (!isObject(raw)) {
    return undefined;
  }

  const versions: Record<string, number> = {};
  for (const [presetId, version] of Object.entries(raw)) {
    if (typeof version === "number" && Number.isInteger(version) && version > 0) {
      versions[presetId] = version;
    }
  }
  return Object.keys(versions).length > 0 ? versions : undefined;
};

const sanitizeProbeTarget = (raw: unknown): PatchProbeTarget | undefined => {
  const target = isObject(raw) ? raw : {};
  if (target.kind === "connection" && typeof target.connectionId === "string") {
    return { kind: "connection", connectionId: target.connectionId };
  }
  if (
    target.kind === "port" &&
    (target.portKind === "in" || target.portKind === "out") &&
    typeof target.nodeId === "string" &&
    typeof target.portId === "string"
  ) {
    return {
      kind: "port",
      portKind: target.portKind,
      nodeId: target.nodeId,
      portId: target.portId
    };
  }
  return undefined;
};

const sanitizePatchWorkspaceProbes = (raw: unknown): PatchWorkspaceProbeState[] => {
  const probes = Array.isArray(raw) ? raw : [];
  return probes.map((probe, index) => {
    const entry = isObject(probe) ? probe : {};
    const kind = entry.kind === "spectrum" ? "spectrum" : entry.kind === "pitch_tracker" ? "pitch_tracker" : "scope";
    const spectrumWindowSize = asFiniteNumber(entry.spectrumWindowSize, 0);
    const rawFrequencyView = isObject(entry.frequencyView) ? entry.frequencyView : {};
    const legacySpectrumMaxFrequencyHz = asOptionalFiniteNumber(entry.spectrumMaxFrequencyHz);
    const frequencyView =
      kind === "spectrum"
        ? {
            maxHz: clampProbeMaxFrequencyHz(
              asFiniteNumber(rawFrequencyView.maxHz, legacySpectrumMaxFrequencyHz ?? DEFAULT_PROBE_MAX_FREQUENCY_HZ)
            )
          }
        : undefined;
    return {
      id: asString(entry.id, createId(`probe_${index}`)),
      kind,
      name: asString(
        entry.name,
        kind === "spectrum" ? "Spectrum Probe" : kind === "pitch_tracker" ? "Pitch Tracker" : "Scope Probe"
      ),
      x: Math.max(0, Math.floor(asFiniteNumber(entry.x, 4))),
      y: Math.max(0, Math.floor(asFiniteNumber(entry.y, 4))),
      width: Math.max(6, Math.floor(asFiniteNumber(entry.width, 10))),
      height: Math.max(4, Math.floor(asFiniteNumber(entry.height, 6))),
      expanded: entry.expanded === true,
      target: sanitizeProbeTarget(entry.target),
      spectrumWindowSize: [256, 512, 1024, 2048].includes(spectrumWindowSize) ? spectrumWindowSize : undefined,
      frequencyView
    };
  });
};

const sanitizePatchWorkspaceTab = (
  raw: unknown,
  index: number,
  patchIds: Set<string>,
  fallbackPatchId: string,
  patchNameById: Map<string, string>
): PatchWorkspaceTabState => {
  const tab = isObject(raw) ? raw : {};
  const patchId = asString(tab.patchId, fallbackPatchId);
  const resolvedPatchId = patchIds.has(patchId) ? patchId : fallbackPatchId;
  return {
    id: asString(tab.id, createId(`patch_tab_${index}`)),
    name: asString(tab.name, patchNameById.get(resolvedPatchId) ?? `Tab ${index + 1}`),
    patchId: resolvedPatchId,
    baselinePatch: isObject(tab.baselinePatch)
      ? normalizePatch(tab.baselinePatch, {
          fallbackId: `${resolvedPatchId}_baseline`,
          fallbackName: `${patchNameById.get(resolvedPatchId) ?? `Tab ${index + 1}`} Baseline`
        })
      : undefined,
    selectedNodeId: typeof tab.selectedNodeId === "string" ? tab.selectedNodeId : undefined,
    selectedMacroId: typeof tab.selectedMacroId === "string" ? tab.selectedMacroId : undefined,
    selectedProbeId: typeof tab.selectedProbeId === "string" ? tab.selectedProbeId : undefined,
    probes: sanitizePatchWorkspaceProbes(tab.probes)
  };
};

interface SerializedProjectBundleV2 {
  version: 2;
  project: Project;
  assets: ProjectAssetLibrary;
}

const isSerializedProjectBundleV2 = (value: unknown): value is SerializedProjectBundleV2 =>
  isObject(value) && value.version === 2 && isObject(value.project) && isObject(value.assets);

export const exportProjectToJson = (
  project: Project,
  assets: ProjectAssetLibrary = createEmptyProjectAssetLibrary()
): string =>
  JSON.stringify(
    {
      version: 2,
      project,
      assets: pickReferencedProjectAssets(project, assets)
    } satisfies SerializedProjectBundleV2,
    null,
    2
  );

export const normalizeProject = (raw: unknown): Project => {
  if (!isObject(raw)) {
    throw new Error("Project root must be an object");
  }

  const patchesRaw = Array.isArray(raw.patches) ? raw.patches : [];
  const normalizedPatches = patchesRaw
    .map((patch, index) => normalizePatch(patch, { fallbackId: `patch_${index}`, fallbackName: `Patch ${index + 1}` }))
    .map(alignPresetDisplayName);
  const existingPatchIds = new Set(normalizedPatches.map((patch) => patch.id));
  const patches = [
    ...normalizedPatches,
    ...presetPatches.filter((patch) => !existingPatchIds.has(patch.id)).map((patch) => structuredClone(patch))
  ];
  if (patches.length === 0) {
    throw new Error("Project must include at least one patch");
  }

  const globalRaw = isObject(raw.global) ? raw.global : {};
  const meter = globalRaw.meter === "3/4" ? "3/4" : "4/4";
  const gridBeats = asFiniteNumber(globalRaw.gridBeats, 0.25);
  const loopRaw = Array.isArray(globalRaw.loop) ? globalRaw.loop : isObject(globalRaw.loop) ? [globalRaw.loop] : [];

  const patchIds = new Set(patches.map((patch) => patch.id));
  const fallbackPatchId = patches[0].id;
  const patchNameById = new Map(patches.map((patch) => [patch.id, patch.name] as const));
  const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : [];
  const tracks = tracksRaw
    .map((entry, index) => {
      const track = isObject(entry) ? entry : {};
      const fxRaw = isObject(track.fx) ? track.fx : {};
      const notesRaw = Array.isArray(track.notes) ? track.notes : [];

      const notes = notesRaw
        .map((noteEntry) => {
          const note = isObject(noteEntry) ? noteEntry : {};
          const pitchStr = asString(note.pitchStr, "");
          const startBeat = asFiniteNumber(note.startBeat, Number.NaN);
          const durationBeats = asFiniteNumber(note.durationBeats, Number.NaN);
          if (!pitchStr || !Number.isFinite(startBeat) || !Number.isFinite(durationBeats) || durationBeats <= 0) {
            return null;
          }
          return {
            id: asString(note.id, createId("note")),
            pitchStr,
            startBeat: Math.max(0, startBeat),
            durationBeats,
            velocity: clamp01(asFiniteNumber(note.velocity, 0.85))
          };
        })
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
        .sort((a, b) => a.startBeat - b.startBeat);

      const rawPatchId = asString(track.instrumentPatchId, fallbackPatchId);
      return {
        id: asString(track.id, `track_${index}`),
        name: asString(track.name, `Track ${index + 1}`),
        instrumentPatchId: patchIds.has(rawPatchId) ? rawPatchId : fallbackPatchId,
        notes,
        macroValues: sanitizeMacroValueMap(track.macroValues),
        macroAutomations: sanitizeMacroAutomationMap(track.macroAutomations),
        macroPanelExpanded: track.macroPanelExpanded === true,
        volume: clamp(asFiniteNumber(track.volume, TRACK_VOLUME_DEFAULT), TRACK_VOLUME_MIN, TRACK_VOLUME_MAX),
        mute: Boolean(track.mute),
        solo: Boolean(track.solo),
        fx: {
          delayEnabled: Boolean(fxRaw.delayEnabled),
          reverbEnabled: Boolean(fxRaw.reverbEnabled),
          saturationEnabled: Boolean(fxRaw.saturationEnabled),
          compressorEnabled: Boolean(fxRaw.compressorEnabled),
          delayMix: clamp01(asFiniteNumber(fxRaw.delayMix, defaultTrackFx().delayMix)),
          reverbMix: clamp01(asFiniteNumber(fxRaw.reverbMix, defaultTrackFx().reverbMix)),
          drive: clamp01(asFiniteNumber(fxRaw.drive, defaultTrackFx().drive)),
          compression: clamp01(asFiniteNumber(fxRaw.compression, defaultTrackFx().compression))
        }
      };
    })
    .filter((track) => track.instrumentPatchId);
  if (tracks.length === 0) {
    throw new Error("Project must include at least one valid track");
  }

  const masterFxRaw = isObject(raw.masterFx) ? raw.masterFx : {};
  const uiRaw = isObject(raw.ui) ? raw.ui : {};
  const patchWorkspaceRaw = isObject(uiRaw.patchWorkspace) ? uiRaw.patchWorkspace : {};
  const dismissedPresetUpdateVersions = sanitizePresetUpdateVersionMap(uiRaw.dismissedPresetUpdateVersions);
  const patchWorkspaceTabsRaw = Array.isArray(patchWorkspaceRaw.tabs) ? patchWorkspaceRaw.tabs : [];
  const patchWorkspaceTabs = patchWorkspaceTabsRaw.map((tab, index) =>
    sanitizePatchWorkspaceTab(tab, index, patchIds, fallbackPatchId, patchNameById)
  );
  const defaultTab: PatchWorkspaceTabState = {
    id: createId("patchTab"),
    name: patchNameById.get(tracks[0]?.instrumentPatchId ?? fallbackPatchId) ?? "Instrument",
    patchId: tracks[0]?.instrumentPatchId ?? fallbackPatchId,
    probes: []
  };
  const normalizedPatchWorkspaceTabs = patchWorkspaceTabs.length > 0 ? patchWorkspaceTabs : [defaultTab];
  const activeTabId = asString(patchWorkspaceRaw.activeTabId, normalizedPatchWorkspaceTabs[0].id);
  const now = Date.now();

  return {
    id: asString(raw.id, `project_${now}`),
    name: asString(raw.name, "Imported Project"),
    global: {
      sampleRate: 48000,
      tempo: clamp(asFiniteNumber(globalRaw.tempo, 120), 20, 400),
      meter,
      gridBeats: gridBeats > 0 ? gridBeats : 0.25,
      loop: loopRaw.flatMap((entry, index) => {
        const marker = isObject(entry) ? entry : {};
        const kind = marker.kind === "start" || marker.kind === "end" ? marker.kind : null;
        const beatRaw = asOptionalFiniteNumber(marker.beat);
        if (kind && beatRaw !== undefined) {
          return [
            {
              id: asString(marker.id, createId(`loop_marker_${index}`)),
              kind,
              beat: Math.max(0, beatRaw),
              repeatCount:
                kind === "end"
                  ? Math.max(
                      DEFAULT_LOOP_REPEAT_COUNT,
                      Math.min(
                        MAX_LOOP_REPEAT_COUNT,
                        Math.round(asFiniteNumber(marker.repeatCount, DEFAULT_LOOP_REPEAT_COUNT))
                      )
                    )
                  : undefined
            }
          ];
        }

        const startBeatRaw = asOptionalFiniteNumber(marker.startBeat);
        if (startBeatRaw === undefined) {
          return [];
        }
        const endBeatRaw = asOptionalFiniteNumber(marker.endBeat);
        const repeatCount = Math.max(
          DEFAULT_LOOP_REPEAT_COUNT,
          Math.min(MAX_LOOP_REPEAT_COUNT, Math.round(asFiniteNumber(marker.repeatCount, DEFAULT_LOOP_REPEAT_COUNT)))
        );
        const markerIdBase = asString(marker.id, createId(`loop_region_${index}`));
        return [
          {
            id: `${markerIdBase}_start`,
            kind: "start" as const,
            beat: Math.max(0, startBeatRaw),
            repeatCount: undefined
          },
          ...(endBeatRaw === undefined
            ? []
            : [
                {
                  id: `${markerIdBase}_end`,
                  kind: "end" as const,
                  beat: Math.max(0, endBeatRaw),
                  repeatCount
                }
              ])
        ];
      })
    },
    tracks,
    patches,
    masterFx: {
      compressorEnabled: Boolean(masterFxRaw.compressorEnabled),
      limiterEnabled: masterFxRaw.limiterEnabled !== false,
      makeupGain: asFiniteNumber(masterFxRaw.makeupGain, 0)
    },
    ui: {
      patchWorkspace: {
        activeTabId: normalizedPatchWorkspaceTabs.some((tab) => tab.id === activeTabId)
          ? activeTabId
          : normalizedPatchWorkspaceTabs[0].id,
        tabs: normalizedPatchWorkspaceTabs
      },
      dismissedPresetUpdateVersions
    },
    createdAt: asFiniteNumber(raw.createdAt, now),
    updatedAt: asFiniteNumber(raw.updatedAt, now)
  };
};

export const importProjectFromJson = (json: string): Project => {
  return importProjectBundleFromJson(json).project;
};

export const importProjectBundleFromJson = (json: string): { project: Project; assets: ProjectAssetLibrary } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!isObject(parsed)) {
    throw new Error("Project JSON root must be an object");
  }
  if (isSerializedProjectBundleV2(parsed)) {
    return {
      project: normalizeProject(parsed.project),
      assets: normalizeProjectAssetLibrary(parsed.assets)
    };
  }
  return {
    project: normalizeProject(parsed),
    assets: createEmptyProjectAssetLibrary()
  };
};
