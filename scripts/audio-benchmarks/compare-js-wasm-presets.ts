import { presetPatches } from "@/lib/patch/presets";
import { renderProjectOffline } from "@/audio/offline/renderProjectOffline";
import { renderProjectOfflineWasm } from "@/audio/offline/renderProjectOfflineWasm";
import { collectEventsInWindow } from "@/audio/scheduler";
import { beatToSample } from "@/lib/musicTiming";
import { toAudioProject } from "@/audio/audioProject";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";

const durationBeats = 32;
const tempo = 120;
const sampleRate = 48000;
const blockSize = 128;
const randomSeed = 0x1234_5678;

const pitchForPatch = (patchId: string) => {
  if (patchId.includes("bassdrum")) return "C1";
  if (patchId.includes("drum")) return "C2";
  return "C4";
};

const main = async () => {
  for (const patch of presetPatches) {
    const project = toAudioProject(
      {
        id: `cmp_${patch.id}`,
        name: patch.name,
        global: {
          sampleRate,
          tempo,
          meter: "4/4",
          gridBeats: 0.25,
          loop: []
        },
        tracks: [
          {
            id: "track_1",
            name: "Track 1",
            instrumentPatchId: patch.id,
            notes: Array.from({ length: 8 }, (_, index) => ({
              id: `n${index}`,
              pitchStr: pitchForPatch(patch.id),
              startBeat: index * 2,
              durationBeats: 0.5,
              velocity: 0.8
            })),
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
              delayMix: 0,
              reverbMix: 0,
              drive: 0,
              compression: 0
            }
          }
        ],
        patches: [structuredClone(patch)],
        masterFx: {
          compressorEnabled: false,
          limiterEnabled: false,
          makeupGain: 0
        },
        ui: {
          patchWorkspace: {
            activeTabId: "t1",
            tabs: [{ id: "t1", name: patch.name, patchId: patch.id, probes: [] }]
          }
        },
        createdAt: 0,
        updatedAt: 0
      },
      createEmptyProjectAssetLibrary()
    );

    const totalSamples = beatToSample(durationBeats, sampleRate, tempo);
    const events = collectEventsInWindow(project, { fromSample: 0, toSample: totalSamples + 1 }, { cueBeat: 0 });
    const js = renderProjectOffline(project, {
      sampleRate,
      blockSize,
      durationSamples: totalSamples,
      events,
      sessionId: 1,
      randomSeed
    });
    const wasm = await renderProjectOfflineWasm(project, {
      sampleRate,
      blockSize,
      durationSamples: totalSamples,
      events,
      sessionId: 1,
      randomSeed
    });

    let maxDiff = 0;
    for (let i = 0; i < js.left.length; i += 1) {
      const diff = Math.abs(js.left[i]! - wasm.left[i]!);
      if (diff > maxDiff) {
        maxDiff = diff;
      }
    }

    process.stdout.write(
      `${JSON.stringify({
        patchId: patch.id,
        name: patch.name,
        maxDiff,
        jsAbs: js.outputAbsSum,
        wasmAbs: wasm.outputAbsSum
      })}\n`
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
