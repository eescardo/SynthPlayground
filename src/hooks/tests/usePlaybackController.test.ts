import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldResetPlayheadOnStop, usePlaybackController } from "@/hooks/usePlaybackController";
import { ComposerInteractionProvider, useComposerInteraction } from "@/components/app/ComposerInteraction";
import type { ComposerInteraction } from "@/lib/composerInteraction";
import type { AudioEngine } from "@/audio/engine";
import { createDefaultProject } from "@/lib/patch/presets";

afterEach(() => vi.unstubAllGlobals());

describe("shouldResetPlayheadOnStop", () => {
  it("defaults reset mode stops to the cue beat", () => {
    expect(shouldResetPlayheadOnStop("reset")).toBe(true);
  });

  it("defaults continue mode stops to the current playback beat", () => {
    expect(shouldResetPlayheadOnStop("continue")).toBe(false);
  });

  it("lets explicit stop options override the active play mode", () => {
    expect(shouldResetPlayheadOnStop("continue", { resetToCue: true })).toBe(true);
    expect(shouldResetPlayheadOnStop("reset", { resetToCue: false })).toBe(false);
  });
});

describe("terminal playback seeks", () => {
  it.each([8, 10])("fully stops transport before releasing playback mode when seeking to beat %s", async (beat) => {
    const engine = {
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      syncProjectSnapshot: vi.fn(),
      setRuntimeErrorListener: vi.fn()
    };
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(42));
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const project = createDefaultProject();
    const setPlaying = vi.fn();
    const setPlayheadBeat = vi.fn();
    const stopRecording = vi.fn();
    let controller!: ReturnType<typeof usePlaybackController>;
    let interaction!: ComposerInteraction;
    function Probe() {
      interaction = useComposerInteraction().interaction;
      controller = usePlaybackController({
        project,
        renderProject: { project },
        playbackEndBeat: 8,
        userCueBeat: 0,
        playheadBeat: 0,
        wasmReady: true,
        audioEngineRef: { current: engine as unknown as AudioEngine },
        setPlaying,
        setPlayheadBeat,
        setRuntimeError: vi.fn(),
        onStopRecordingSession: stopRecording,
        onHandleRecordingBeat: vi.fn()
      });
      return null;
    }
    // Exercise the actual controller callbacks with real React hooks, without
    // mounting browser effects; the browser test covers rendering and RAF motion.
    renderToString(createElement(ComposerInteractionProvider, null, createElement(Probe)));
    await controller.startPlayback();
    expect(interaction.getMode()).toBe("playback");
    const onModeChange = vi.fn((mode: string) => {
      if (mode === "editing") {
        expect(engine.stop).toHaveBeenCalledOnce();
        expect(cancelFrame).toHaveBeenCalledWith(42);
      }
    });
    const unsubscribe = interaction.subscribe(onModeChange);
    await controller.seekPlaybackToBeat(beat);
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(stopRecording).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(setPlaying).toHaveBeenLastCalledWith(false);
    expect(setPlayheadBeat).toHaveBeenLastCalledWith(8);
    expect(engine.play).toHaveBeenCalledOnce();
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith("editing");
    unsubscribe();
  });
});
