import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldResetPlayheadOnStop, usePlaybackController } from "@/hooks/usePlaybackController";
import { ComposerInteractionProvider, useComposerInteraction } from "@/components/app/ComposerInteraction";
import type { ComposerInteraction } from "@/lib/composerInteraction";
import type { AudioEngine } from "@/audio/engine";
import { createDefaultProject } from "@/lib/patch/presets";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

describe("playback start ownership", () => {
  function renderController(
    engine: Pick<AudioEngine, "play" | "stop" | "syncProjectSnapshot" | "setRuntimeErrorListener">
  ) {
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(42));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const project = createDefaultProject();
    const setPlaying = vi.fn();
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
        audioEngineRef: { current: engine as AudioEngine },
        setPlaying,
        setPlayheadBeat: vi.fn(),
        setRuntimeError: vi.fn(),
        onStopRecordingSession: stopRecording,
        onHandleRecordingBeat: vi.fn()
      });
      return null;
    }
    renderToString(createElement(ComposerInteractionProvider, null, createElement(Probe)));
    return { controller, interaction, setPlaying, stopRecording };
  }

  it("does not tear down a newer recording when an old playback start rejects", async () => {
    const firstPlay = createDeferred<void>();
    const engine = {
      play: vi.fn().mockReturnValue(firstPlay.promise),
      stop: vi.fn(),
      syncProjectSnapshot: vi.fn(),
      setRuntimeErrorListener: vi.fn()
    };
    const { controller, interaction, setPlaying, stopRecording } = renderController(engine);

    const oldStart = controller.startPlayback();
    controller.stopPlayback();
    expect(interaction.startTransport("recording")).toBe(true);
    firstPlay.reject(new Error("old start failed"));

    await expect(oldStart).rejects.toThrow("old start failed");
    expect(interaction.getMode()).toBe("recording");
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(stopRecording).toHaveBeenCalledOnce();
    expect(setPlaying).toHaveBeenCalledTimes(2);
    expect(setPlaying).toHaveBeenLastCalledWith(false);
  });

  it("does not tear down a newer playback when an old playback start rejects", async () => {
    const firstPlay = createDeferred<void>();
    const secondPlay = createDeferred<void>();
    const engine = {
      play: vi.fn().mockReturnValueOnce(firstPlay.promise).mockReturnValueOnce(secondPlay.promise),
      stop: vi.fn(),
      syncProjectSnapshot: vi.fn(),
      setRuntimeErrorListener: vi.fn()
    };
    const { controller, interaction, setPlaying, stopRecording } = renderController(engine);

    const oldStart = controller.startPlayback();
    controller.stopPlayback();
    const newStart = controller.startPlayback();
    firstPlay.reject(new Error("old start failed"));

    await expect(oldStart).rejects.toThrow("old start failed");
    expect(interaction.getMode()).toBe("playback");
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(stopRecording).toHaveBeenCalledOnce();
    expect(setPlaying).toHaveBeenCalledTimes(3);
    expect(setPlaying).toHaveBeenLastCalledWith(true);

    secondPlay.resolve();
    await newStart;
  });

  it("does not tear down a replacement seek when the original playback start rejects", async () => {
    const firstPlay = createDeferred<void>();
    const seekPlay = createDeferred<void>();
    const engine = {
      play: vi.fn().mockReturnValueOnce(firstPlay.promise).mockReturnValueOnce(seekPlay.promise),
      stop: vi.fn(),
      syncProjectSnapshot: vi.fn(),
      setRuntimeErrorListener: vi.fn()
    };
    const { controller, interaction, setPlaying, stopRecording } = renderController(engine);

    const originalStart = controller.startPlayback();
    const replacementSeek = controller.seekPlaybackToBeat(2);
    firstPlay.reject(new Error("original start failed"));

    await expect(originalStart).rejects.toThrow("original start failed");
    expect(interaction.getMode()).toBe("playback");
    expect(engine.stop).not.toHaveBeenCalled();
    expect(stopRecording).not.toHaveBeenCalled();
    expect(setPlaying).toHaveBeenCalledExactlyOnceWith(true);

    seekPlay.resolve();
    await replacementSeek;
  });

  it("cleans up and rethrows when the current playback start rejects", async () => {
    const currentPlay = createDeferred<void>();
    const engine = {
      play: vi.fn().mockReturnValue(currentPlay.promise),
      stop: vi.fn(),
      syncProjectSnapshot: vi.fn(),
      setRuntimeErrorListener: vi.fn()
    };
    const { controller, interaction, setPlaying, stopRecording } = renderController(engine);

    const start = controller.startPlayback();
    currentPlay.reject(new Error("current start failed"));

    await expect(start).rejects.toThrow("current start failed");
    expect(interaction.getMode()).toBe("editing");
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(stopRecording).toHaveBeenCalledOnce();
    expect(setPlaying).toHaveBeenLastCalledWith(false);
  });
});
