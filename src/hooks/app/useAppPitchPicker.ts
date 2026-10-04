"use client";

import { useCallback, type RefObject } from "react";
import type { AudioEngine } from "@/audio/engine";
import type { useComposerTransientUi } from "@/hooks/useComposerTransientUi";
import type { usePatchWorkspaceState } from "@/hooks/patch/usePatchWorkspaceState";
import type { useNoteEditor } from "@/hooks/useNoteEditor";
import { usePitchPickerHotkeys } from "@/hooks/usePitchPickerHotkeys";
import { DEFAULT_NOTE_PITCH } from "@/lib/noteDefaults";
import { pitchToVoct } from "@/lib/pitch";
import { createSproutError, toError, type SproutErrorSetter } from "@/lib/sproutErrors";
import type { Project } from "@/types/music";
import { useComposerInteraction } from "@/components/app/ComposerInteraction";

type PitchPickerState = Pick<ReturnType<typeof useComposerTransientUi>, "pitchPicker" | "setPitchPicker">;
type PitchPickerActions = ReturnType<typeof useAppPitchPickerActions>;

export function useAppPitchPickerActions({
  project,
  playing,
  setPitchPicker,
  audioEngineRef,
  setRuntimeError
}: Pick<PitchPickerState, "setPitchPicker"> & {
  project: Project;
  playing: boolean;
  audioEngineRef: RefObject<AudioEngine | null>;
  setRuntimeError: SproutErrorSetter;
}) {
  const { interaction } = useComposerInteraction();
  const previewNoteForPitchPicker = useCallback(
    (trackId: string, noteId: string, pitch: string) => {
      if (playing) {
        return;
      }

      const track = project.tracks.find((entry) => entry.id === trackId);
      const note = track?.notes.find((entry) => entry.id === noteId);
      if (!track || !note) {
        return;
      }

      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(pitch), note.durationBeats, note.velocity)
        .catch((error) => {
          const cause = toError(error);
          setRuntimeError(
            createSproutError({
              source: "audio_playback",
              code: "preview_failed",
              severity: "error",
              message: cause.message,
              error: cause,
              details: { phase: "pitch_picker_preview" }
            })
          );
        });
    },
    [audioEngineRef, playing, project.tracks, setRuntimeError]
  );

  const openPitchPicker = useCallback(
    (trackId: string, noteId: string) => {
      if (interaction.getMode() !== "editing") return;
      setPitchPicker({ trackId, noteId });
      const notePitch = project.tracks
        .find((track) => track.id === trackId)
        ?.notes.find((note) => note.id === noteId)?.pitchStr;
      previewNoteForPitchPicker(trackId, noteId, notePitch ?? DEFAULT_NOTE_PITCH);
    },
    [interaction, previewNoteForPitchPicker, project.tracks, setPitchPicker]
  );

  const closePitchPicker = useCallback(() => {
    setPitchPicker(null);
  }, [setPitchPicker]);

  return { previewNoteForPitchPicker, openPitchPicker, closePitchPicker };
}

// Keep keyboard listener registration at its original place in the root's hook order.
export function useAppPitchPickerHotkeys({
  pitchPicker,
  updateNote,
  previewNoteForPitchPicker,
  closePitchPicker,
  patchWorkspace
}: {
  pitchPicker: PitchPickerState["pitchPicker"];
  updateNote: ReturnType<typeof useNoteEditor>["updateNote"];
  previewNoteForPitchPicker: PitchPickerActions["previewNoteForPitchPicker"];
  closePitchPicker: PitchPickerActions["closePitchPicker"];
  patchWorkspace: Pick<
    ReturnType<typeof usePatchWorkspaceState>,
    "previewPitchPickerOpen" | "setPreviewPitch" | "setPreviewPitchPickerOpen" | "previewSelectedPatchNow"
  >;
}) {
  usePitchPickerHotkeys(
    Boolean(pitchPicker),
    useCallback(
      (pitch: string) => {
        if (!pitchPicker) return;
        updateNote(
          pitchPicker.trackId,
          pitchPicker.noteId,
          { pitchStr: pitch },
          {
            actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
          }
        );
        previewNoteForPitchPicker(pitchPicker.trackId, pitchPicker.noteId, pitch);
        closePitchPicker();
      },
      [closePitchPicker, pitchPicker, previewNoteForPitchPicker, updateNote]
    )
  );

  usePitchPickerHotkeys(
    patchWorkspace.previewPitchPickerOpen,
    useCallback(
      (pitch: string) => {
        patchWorkspace.setPreviewPitch(pitch);
        patchWorkspace.setPreviewPitchPickerOpen(false);
        patchWorkspace.previewSelectedPatchNow(pitch);
      },
      [patchWorkspace]
    )
  );
}
