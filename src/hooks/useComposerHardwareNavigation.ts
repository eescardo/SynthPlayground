"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { BaseHardwareNavigationResult } from "@/hooks/useBaseHardwareNavigation";
import { isModifierChord, isPlayheadTabStopFocused, isTextEditingTarget } from "@/hooks/hardwareNavigationUtils";
import {
  ActiveKeyboardPlacement,
  GhostPreviewNote,
  UseHardwareNavigationArgs
} from "@/hooks/useHardwareNavigationTypes";
import {
  findTrackBackspaceTargetNote,
  findTrackNoteAtBeat,
  shiftContentSelectionByBeats,
  trackHasNoteAtBeat,
  upsertKeyboardPlacedNote
} from "@/lib/hardwareNavigation";
import { getNoteSelectionKey } from "@/lib/clipboard";
import { createId } from "@/lib/ids";
import { DEFAULT_NOTE_VELOCITY } from "@/lib/noteDefaults";
import { beatToSample, snapToGrid, snapUpToGrid } from "@/lib/musicTiming";
import { keyToPitch, normalizePhysicalPitchKey, pitchToVoct } from "@/lib/pitch";

const GHOST_PREVIEW_DELAY_MS = 2000;
const TAB_SELECTION_PREVIEW_DELAY_MS = 600;
const HELD_PLACEMENT_PREVIEW_GRID_SPAN = 128;
const HELD_PLACEMENT_PREVIEW_RELEASE_TAIL_GRIDS = 8;

interface UseComposerHardwareNavigationArgs extends UseHardwareNavigationArgs {
  activePlacement: ActiveKeyboardPlacement | null;
  setActivePlacement: Dispatch<SetStateAction<ActiveKeyboardPlacement | null>>;
  base: BaseHardwareNavigationResult;
}

interface ComposerHardwareNavigationResult {
  ghostPreviewNote: GhostPreviewNote | null;
  tabSelectionPreviewNote: { trackId: string; noteId: string } | null;
}

export function useComposerHardwareNavigation({
  view,
  projectGridBeats,
  projectTempo,
  selectedTrack,
  playheadBeat,
  playbackEndBeat,
  isPlaying,
  recordPhase,
  pitchPickerOpen,
  previewPitchPickerOpen,
  defaultPitch,
  selectionKind,
  contentSelection,
  selectionActionPopoverCollapsed,
  setSelectedTrackId,
  setPlayheadBeatFromUser,
  setPlayheadBeatPreservingSelection,
  expandSelectionActionPopover,
  toggleTrackMacroPanel,
  deleteNote,
  commitProjectChange,
  audioEngineRef,
  onComposerPlay,
  onComposerStop,
  setRuntimeError,
  activePlacement,
  setActivePlacement,
  tracks,
  base
}: UseComposerHardwareNavigationArgs): ComposerHardwareNavigationResult {
  const isComposerView = view === "composer";
  const isTransportIdle = !isPlaying && recordPhase === "idle";
  const arePitchPickersClosed = !pitchPickerOpen && !previewPitchPickerOpen;
  const hasActivePlacement = activePlacement !== null;
  const hasSelectedTrack = Boolean(selectedTrack);
  const hasNoSelection = selectionKind === "none";

  const [ghostPreviewNote, setGhostPreviewNote] = useState<GhostPreviewNote | null>(null);
  const [tabSelectionPreviewNote, setTabSelectionPreviewNote] = useState<{ trackId: string; noteId: string } | null>(
    null
  );
  const placementRafRef = useRef<number | null>(null);
  const pendingPreviewStartIdsRef = useRef<Set<string>>(new Set());
  const pendingPreviewReleasesRef = useRef<Map<string, { trackId: string; durationBeats: number }>>(new Map());
  const blockedSelectionTransferRef = useRef<{
    direction: -1 | 1;
    selectedNoteKey: string;
    blockingSelectionKey: string;
  } | null>(null);
  const previousSelectionSignatureRef = useRef<string | null>(null);

  const clearBlockedSelectionTransfer = useCallback(() => {
    blockedSelectionTransferRef.current = null;
  }, []);

  const setPlacedNote = useCallback(
    (
      trackId: string,
      noteId: string,
      startBeat: number,
      durationBeats: number,
      pitchStr: string,
      actionKey = `track:${trackId}:keyboard-place:${noteId}`
    ) => {
      commitProjectChange(
        (current) => {
          let changed = false;
          const tracks = current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const nextTrack = upsertKeyboardPlacedNote(track, {
              id: noteId,
              pitchStr,
              startBeat,
              durationBeats
            });
            if (nextTrack !== track) {
              changed = true;
            }
            return nextTrack;
          });
          return changed ? { ...current, tracks } : current;
        },
        { actionKey, coalesce: true }
      );
    },
    [commitProjectChange]
  );

  const dispatchPlacementPreviewRelease = useCallback(
    (trackId: string, noteId: string, durationBeats: number) => {
      const sampleRate = audioEngineRef.current?.getSampleRate() ?? 48_000;
      const noteOffSampleTime = Math.max(1, beatToSample(durationBeats, sampleRate, projectTempo));
      audioEngineRef.current?.sendParamChanges([
        {
          id: `${noteId}_preview_off_${noteOffSampleTime}`,
          type: "NoteOff",
          source: "preview",
          sampleTime: noteOffSampleTime,
          trackId,
          noteId
        }
      ]);
    },
    [audioEngineRef, projectTempo]
  );

  const startPlacementPreview = useCallback(
    (trackId: string, noteId: string, pitchStr: string, startBeat: number) => {
      const previewDurationBeats = Math.max(
        projectGridBeats,
        projectGridBeats * HELD_PLACEMENT_PREVIEW_GRID_SPAN,
        playbackEndBeat - startBeat + projectGridBeats * HELD_PLACEMENT_PREVIEW_RELEASE_TAIL_GRIDS
      );
      pendingPreviewStartIdsRef.current.add(noteId);
      const previewPromise =
        audioEngineRef.current?.previewNote(
          trackId,
          pitchToVoct(pitchStr),
          previewDurationBeats,
          DEFAULT_NOTE_VELOCITY,
          {
            previewId: noteId
          }
        ) ?? Promise.resolve();

      previewPromise
        .catch((error) => setRuntimeError((error as Error).message))
        .finally(() => {
          pendingPreviewStartIdsRef.current.delete(noteId);
          const pendingRelease = pendingPreviewReleasesRef.current.get(noteId);
          if (!pendingRelease) {
            return;
          }
          pendingPreviewReleasesRef.current.delete(noteId);
          dispatchPlacementPreviewRelease(pendingRelease.trackId, noteId, pendingRelease.durationBeats);
        });
    },
    [audioEngineRef, dispatchPlacementPreviewRelease, playbackEndBeat, projectGridBeats, setRuntimeError]
  );

  const releasePlacementPreview = useCallback(
    (trackId: string, noteId: string, durationBeats: number) => {
      if (pendingPreviewStartIdsRef.current.has(noteId)) {
        pendingPreviewReleasesRef.current.set(noteId, { trackId, durationBeats });
        return;
      }
      dispatchPlacementPreviewRelease(trackId, noteId, durationBeats);
    },
    [dispatchPlacementPreviewRelease]
  );

  useEffect(() => {
    clearBlockedSelectionTransfer();
  }, [
    clearBlockedSelectionTransfer,
    contentSelection.automationKeyframeSelectionKeys,
    contentSelection.noteKeys,
    selectionKind
  ]);

  // New content selections should take keyboard ownership away from the playhead.
  useEffect(() => {
    if (!isComposerView || selectionKind !== "content") {
      previousSelectionSignatureRef.current = null;
      return;
    }

    const selectionSignature = JSON.stringify({
      noteKeys: contentSelection.noteKeys,
      automationKeyframeSelectionKeys: contentSelection.automationKeyframeSelectionKeys
    });
    if (selectionSignature === previousSelectionSignatureRef.current) {
      return;
    }
    previousSelectionSignatureRef.current = selectionSignature;

    if (isPlayheadTabStopFocused()) {
      (document.activeElement as HTMLElement | null)?.blur();
    }

    if (contentSelection.noteKeys.length > 0 || contentSelection.automationKeyframeSelectionKeys.length > 0) {
      base.setPlayheadNavigationFocused(false);
      base.focusSelectedContentTabStop();
    }
  }, [base, contentSelection, isComposerView, selectionKind]);

  // Grow the actively placed note while its placement key is held.
  useEffect(() => {
    if (!activePlacement) {
      if (placementRafRef.current !== null) {
        cancelAnimationFrame(placementRafRef.current);
        placementRafRef.current = null;
      }
      return;
    }

    const step = () => {
      const elapsedBeats = ((performance.now() - activePlacement.startedAtMs) / 1000) * (projectTempo / 60);
      const durationBeats = Math.max(projectGridBeats, snapUpToGrid(elapsedBeats, projectGridBeats));
      if (durationBeats !== activePlacement.durationBeats) {
        setPlacedNote(
          activePlacement.trackId,
          activePlacement.noteId,
          activePlacement.startBeat,
          durationBeats,
          activePlacement.pitchStr
        );
        setActivePlacement((current) =>
          current
            ? {
                ...current,
                durationBeats
              }
            : current
        );
      }
      placementRafRef.current = requestAnimationFrame(step);
    };

    placementRafRef.current = requestAnimationFrame(step);
    return () => {
      if (placementRafRef.current !== null) {
        cancelAnimationFrame(placementRafRef.current);
        placementRafRef.current = null;
      }
    };
  }, [activePlacement, projectGridBeats, projectTempo, setActivePlacement, setPlacedNote]);

  // Show the delayed ghost note when the composer is idle over an empty spot.
  useEffect(() => {
    const playheadNavigationActive = base.playheadNavigationFocused || isPlayheadTabStopFocused();
    const canShowGhostPreview =
      isComposerView &&
      hasSelectedTrack &&
      !hasActivePlacement &&
      isTransportIdle &&
      (hasNoSelection || playheadNavigationActive) &&
      arePitchPickersClosed;

    if (!canShowGhostPreview || !selectedTrack) {
      setGhostPreviewNote(null);
      return;
    }

    const snappedPlayheadBeat = Math.max(0, snapToGrid(playheadBeat, projectGridBeats));
    if (trackHasNoteAtBeat(selectedTrack, playheadBeat)) {
      setGhostPreviewNote(null);
      return;
    }

    const nextGhostPreviewNote: GhostPreviewNote = {
      trackId: selectedTrack.id,
      startBeat: snappedPlayheadBeat,
      durationBeats: projectGridBeats,
      pitchStr: defaultPitch,
      anchorPlayheadBeat: playheadBeat
    };

    setGhostPreviewNote((current) => {
      if (!current) {
        return current;
      }
      const sameAnchor =
        current.trackId === nextGhostPreviewNote.trackId &&
        current.startBeat === nextGhostPreviewNote.startBeat &&
        current.anchorPlayheadBeat === nextGhostPreviewNote.anchorPlayheadBeat;
      if (!sameAnchor) {
        return null;
      }
      if (
        current.durationBeats !== nextGhostPreviewNote.durationBeats ||
        current.pitchStr !== nextGhostPreviewNote.pitchStr
      ) {
        return nextGhostPreviewNote;
      }
      return current;
    });

    const ghostAlreadyVisible =
      ghostPreviewNote?.trackId === nextGhostPreviewNote.trackId &&
      ghostPreviewNote.startBeat === nextGhostPreviewNote.startBeat &&
      ghostPreviewNote.anchorPlayheadBeat === nextGhostPreviewNote.anchorPlayheadBeat;
    if (ghostAlreadyVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setGhostPreviewNote(nextGhostPreviewNote);
    }, GHOST_PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    arePitchPickersClosed,
    base.playheadNavigationFocused,
    defaultPitch,
    ghostPreviewNote,
    hasActivePlacement,
    hasNoSelection,
    hasSelectedTrack,
    isComposerView,
    isTransportIdle,
    playheadBeat,
    projectGridBeats,
    selectedTrack
  ]);

  // Show the delayed Tab target preview when playhead navigation is the active focus model.
  useEffect(() => {
    const playheadNavigationActive = base.playheadNavigationFocused || isPlayheadTabStopFocused();
    const canShowTabSelectionPreview =
      isComposerView &&
      hasSelectedTrack &&
      hasNoSelection &&
      playheadNavigationActive &&
      !hasActivePlacement &&
      isTransportIdle &&
      arePitchPickersClosed;

    if (!canShowTabSelectionPreview || !selectedTrack) {
      setTabSelectionPreviewNote(null);
      return;
    }

    const noteAtPlayhead = findTrackNoteAtBeat(selectedTrack, playheadBeat);
    if (!noteAtPlayhead) {
      setTabSelectionPreviewNote(null);
      return;
    }

    const nextPreview = {
      trackId: selectedTrack.id,
      noteId: noteAtPlayhead.id
    };

    if (
      tabSelectionPreviewNote?.trackId === nextPreview.trackId &&
      tabSelectionPreviewNote.noteId === nextPreview.noteId
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTabSelectionPreviewNote(nextPreview);
    }, TAB_SELECTION_PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    arePitchPickersClosed,
    base.playheadNavigationFocused,
    hasActivePlacement,
    hasNoSelection,
    hasSelectedTrack,
    isComposerView,
    isTransportIdle,
    playheadBeat,
    selectedTrack,
    tabSelectionPreviewNote
  ]);

  // Keep the live placement aligned when default pitch changes mid-hold.
  useEffect(() => {
    if (
      !activePlacement ||
      !activePlacement.tracksDefaultPitch ||
      !selectedTrack ||
      selectedTrack.id !== activePlacement.trackId ||
      activePlacement.pitchStr === defaultPitch
    ) {
      return;
    }
    setPlacedNote(
      activePlacement.trackId,
      activePlacement.noteId,
      activePlacement.startBeat,
      activePlacement.durationBeats,
      defaultPitch
    );
    setActivePlacement((current) =>
      current
        ? {
            ...current,
            pitchStr: defaultPitch
          }
        : current
    );
  }, [activePlacement, defaultPitch, selectedTrack, setActivePlacement, setPlacedNote]);

  // Attach composer-only keyboard routing for placement, transport, and timeline navigation.
  useEffect(() => {
    const finishPlacement = () => {
      if (activePlacement) {
        releasePlacementPreview(activePlacement.trackId, activePlacement.noteId, activePlacement.durationBeats);
        setPlayheadBeatFromUser(
          snapToGrid(activePlacement.startBeat + activePlacement.durationBeats, projectGridBeats)
        );
        base.setPlayheadNavigationFocused(true);
      }
      setActivePlacement(null);
    };

    const startPlacement = (pitchStr: string, triggerKey: string, tracksDefaultPitch: boolean) => {
      const canStartPlacement = isComposerView && Boolean(selectedTrack) && isTransportIdle && !hasActivePlacement;
      if (!canStartPlacement || !selectedTrack) {
        return;
      }
      const startBeat = Math.max(0, snapToGrid(playheadBeat, projectGridBeats));
      const noteId = createId("note");
      setPlacedNote(selectedTrack.id, noteId, startBeat, projectGridBeats, pitchStr);
      startPlacementPreview(selectedTrack.id, noteId, pitchStr, startBeat);
      setGhostPreviewNote(null);
      setActivePlacement({
        noteId,
        trackId: selectedTrack.id,
        startBeat,
        durationBeats: projectGridBeats,
        startedAtMs: performance.now(),
        pitchStr,
        triggerKey,
        tracksDefaultPitch
      });
    };

    const nudgePlayhead = (direction: -1 | 1) => {
      const nextBeat =
        direction < 0
          ? Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats))
          : Math.min(playbackEndBeat, snapToGrid(playheadBeat + projectGridBeats, projectGridBeats));
      setPlayheadBeatPreservingSelection(nextBeat);
      base.setPlayheadNavigationFocused(true);
      clearBlockedSelectionTransfer();
    };

    const nudgeContentSelection = (direction: -1 | 1) => {
      let moveResult!: ReturnType<typeof shiftContentSelectionByBeats>;
      commitProjectChange(
        (current) => {
          const nextMoveResult = shiftContentSelectionByBeats(current, contentSelection, direction * projectGridBeats);
          moveResult = nextMoveResult;
          return nextMoveResult.status === "moved" ? nextMoveResult.project : current;
        },
        {
          actionKey: `selection:nudge:${direction < 0 ? "left" : "right"}`,
          coalesce: true
        }
      );

      if (moveResult.status === "moved") {
        clearBlockedSelectionTransfer();
        base.setPlayheadNavigationFocused(false);
        return;
      }

      if (
        contentSelection.noteKeys.length === 1 &&
        contentSelection.automationKeyframeSelectionKeys.length === 0 &&
        moveResult.block.reason === "note"
      ) {
        const selectedNoteKey = contentSelection.noteKeys[0]!;
        const previousBlockedTransfer = blockedSelectionTransferRef.current;
        if (
          previousBlockedTransfer &&
          previousBlockedTransfer.direction === direction &&
          previousBlockedTransfer.selectedNoteKey === selectedNoteKey &&
          previousBlockedTransfer.blockingSelectionKey === moveResult.block.blockingSelectionKey
        ) {
          base.setSingleNoteSelection(moveResult.block.blockingSelectionKey, { keepCollapsed: true });
          clearBlockedSelectionTransfer();
          base.setPlayheadNavigationFocused(false);
          return;
        }

        blockedSelectionTransferRef.current = {
          direction,
          selectedNoteKey,
          blockingSelectionKey: moveResult.block.blockingSelectionKey
        };
        base.setPlayheadNavigationFocused(false);
        return;
      }

      clearBlockedSelectionTransfer();
      base.setPlayheadNavigationFocused(false);
    };

    const handleHorizontalArrowNavigation = (
      event: KeyboardEvent,
      direction: -1 | 1,
      options: {
        playheadNavigationActive: boolean;
        hasContentSelection: boolean;
        hasTimelineSelection: boolean;
        selectionCaptureFocused: boolean;
      }
    ) => {
      const { playheadNavigationActive, hasContentSelection, hasTimelineSelection, selectionCaptureFocused } = options;
      event.preventDefault();
      if (playheadNavigationActive) {
        nudgePlayhead(direction);
        return true;
      }
      if (hasContentSelection) {
        nudgeContentSelection(direction);
        return true;
      }
      if (hasTimelineSelection) {
        if (!selectionCaptureFocused) {
          nudgePlayhead(direction);
          return true;
        }
        base.setPlayheadNavigationFocused(false);
        clearBlockedSelectionTransfer();
        return true;
      }
      nudgePlayhead(direction);
      return true;
    };

    const handleTransportKey = (event: KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") {
        return false;
      }
      event.preventDefault();
      if (event.repeat) {
        return true;
      }
      if (isPlaying) {
        onComposerStop();
      } else if (recordPhase === "idle") {
        onComposerPlay();
      }
      return true;
    };

    const handleMacroPanelKey = (event: KeyboardEvent) => {
      if (!selectedTrack || event.repeat) {
        return false;
      }
      if (event.key === "[" || event.key === "{") {
        event.preventDefault();
        toggleTrackMacroPanel(selectedTrack.id, false);
        return true;
      }
      if (event.key === "]" || event.key === "}") {
        event.preventDefault();
        toggleTrackMacroPanel(selectedTrack.id, true);
        return true;
      }
      return false;
    };

    const handleSelectionEnterKey = (event: KeyboardEvent, selectionOwnsEnter: boolean) => {
      if (event.key !== "Enter" || event.repeat || !selectionActionPopoverCollapsed || !selectionOwnsEnter) {
        return false;
      }
      event.preventDefault();
      expandSelectionActionPopover();
      return true;
    };

    const handleVerticalTrackNavigation = (event: KeyboardEvent, playheadNavigationActive: boolean) => {
      if (!selectedTrack) {
        return false;
      }

      const selectedTrackIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
      if (selectedTrackIndex === -1) {
        return false;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.max(0, selectedTrackIndex - 1)]!.id);
        base.setPlayheadNavigationFocused(playheadNavigationActive);
        clearBlockedSelectionTransfer();
        return true;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.min(tracks.length - 1, selectedTrackIndex + 1)]!.id);
        base.setPlayheadNavigationFocused(playheadNavigationActive);
        clearBlockedSelectionTransfer();
        return true;
      }

      return false;
    };

    const handlePlacementEnterKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return false;
      }
      event.preventDefault();
      if (event.repeat) {
        return true;
      }
      startPlacement(defaultPitch, "Enter", true);
      return true;
    };

    const handlePhysicalPitchPlacementKey = (event: KeyboardEvent, playheadNavigationActive: boolean) => {
      const normalizedTriggerKey = normalizePhysicalPitchKey(event.key);
      if (!normalizedTriggerKey) {
        return false;
      }

      event.preventDefault();
      if (event.repeat || (selectionKind !== "none" && !playheadNavigationActive)) {
        return true;
      }

      const pitchStr = keyToPitch(event.key);
      if (!pitchStr) {
        return true;
      }

      startPlacement(pitchStr, normalizedTriggerKey, false);
      return true;
    };

    const handleBackspaceKey = (event: KeyboardEvent) => {
      if (!selectedTrack || !isTransportIdle || event.key !== "Backspace" || event.repeat) {
        return false;
      }
      event.preventDefault();
      const targetNote = findTrackBackspaceTargetNote(selectedTrack, playheadBeat);
      if (targetNote) {
        deleteNote(selectedTrack.id, targetNote.id);
        setPlayheadBeatFromUser(targetNote.startBeat);
      } else {
        setPlayheadBeatFromUser(Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats)));
      }
      base.setPlayheadNavigationFocused(true);
      clearBlockedSelectionTransfer();
      return true;
    };

    const handleTabNavigation = (
      event: KeyboardEvent,
      options: {
        playheadNavigationActive: boolean;
        hasContentSelection: boolean;
      }
    ) => {
      const { playheadNavigationActive, hasContentSelection } = options;
      if (event.key !== "Tab" || !playheadNavigationActive || !selectedTrack) {
        return false;
      }

      if (event.shiftKey) {
        if (base.focusLastTrackChromeTabStop()) {
          event.preventDefault();
          base.setPlayheadNavigationFocused(false);
          return true;
        }
        return false;
      }

      if (hasContentSelection) {
        event.preventDefault();
        base.setPlayheadNavigationFocused(false);
        base.focusSelectedContentTabStop();
        return true;
      }

      const noteAtPlayhead = findTrackNoteAtBeat(selectedTrack, playheadBeat);
      if (!noteAtPlayhead) {
        return false;
      }

      event.preventDefault();
      base.setSingleNoteSelection(getNoteSelectionKey(selectedTrack.id, noteAtPlayhead.id), { keepCollapsed: true });
      base.setPlayheadNavigationFocused(false);
      base.focusSelectedContentTabStop();
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const playheadDomFocused = target?.classList.contains("track-canvas-playhead-tabstop") ?? false;
      const noteTabStopFocused = target?.classList.contains("track-canvas-note-tabstop") ?? false;
      const selectionPopoverFocused = Boolean(target?.closest(".selection-actions-popover"));
      const selectionCaptureFocused = noteTabStopFocused || selectionPopoverFocused;
      const hasContentSelection =
        selectionKind === "content" &&
        (contentSelection.noteKeys.length > 0 || contentSelection.automationKeyframeSelectionKeys.length > 0);
      const hasTimelineSelection = selectionKind === "timeline";
      const playheadNavigationActive = base.playheadNavigationFocused || playheadDomFocused;
      const canHandleComposerKeyboardShortcut = isComposerView && arePitchPickersClosed;
      const selectionOwnsEnter = selectionKind !== "none" && !playheadNavigationActive;

      if (event.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(event.target) || !canHandleComposerKeyboardShortcut) {
        return;
      }
      if (isModifierChord(event)) {
        return;
      }
      const normalizedPhysicalTriggerKey = normalizePhysicalPitchKey(event.key);
      const isActivePlacementTriggerKey =
        Boolean(activePlacement) &&
        (event.key === activePlacement?.triggerKey ||
          (normalizedPhysicalTriggerKey !== undefined && normalizedPhysicalTriggerKey === activePlacement?.triggerKey));
      if (activePlacement && !isActivePlacementTriggerKey) {
        event.preventDefault();
        return;
      }
      if (!isComposerView) {
        return;
      }

      if (event.key === "ArrowLeft") {
        handleHorizontalArrowNavigation(event, -1, {
          playheadNavigationActive,
          hasContentSelection,
          hasTimelineSelection,
          selectionCaptureFocused
        });
        return;
      }

      if (event.key === "ArrowRight") {
        handleHorizontalArrowNavigation(event, 1, {
          playheadNavigationActive,
          hasContentSelection,
          hasTimelineSelection,
          selectionCaptureFocused
        });
        return;
      }

      if (handleTransportKey(event)) {
        return;
      }

      if (handleMacroPanelKey(event)) {
        return;
      }

      if (handleSelectionEnterKey(event, selectionOwnsEnter)) {
        return;
      }

      if (handleVerticalTrackNavigation(event, playheadNavigationActive)) {
        return;
      }

      if (handlePlacementEnterKey(event)) {
        return;
      }

      if (handlePhysicalPitchPlacementKey(event, playheadNavigationActive)) {
        return;
      }

      if (handleBackspaceKey(event)) {
        return;
      }

      if (!isTransportIdle) {
        return;
      }

      handleTabNavigation(event, { playheadNavigationActive, hasContentSelection });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const normalizedTriggerKey = normalizePhysicalPitchKey(event.key);
      if (
        activePlacement &&
        (event.key === activePlacement.triggerKey ||
          (normalizedTriggerKey !== undefined && normalizedTriggerKey === activePlacement.triggerKey))
      ) {
        finishPlacement();
      }
    };

    const onBlur = () => {
      finishPlacement();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    activePlacement,
    arePitchPickersClosed,
    base,
    clearBlockedSelectionTransfer,
    commitProjectChange,
    contentSelection,
    defaultPitch,
    deleteNote,
    expandSelectionActionPopover,
    hasActivePlacement,
    isComposerView,
    isPlaying,
    isTransportIdle,
    onComposerPlay,
    onComposerStop,
    playbackEndBeat,
    playheadBeat,
    projectGridBeats,
    recordPhase,
    releasePlacementPreview,
    selectionActionPopoverCollapsed,
    selectionKind,
    selectedTrack,
    setActivePlacement,
    setPlacedNote,
    setPlayheadBeatPreservingSelection,
    setPlayheadBeatFromUser,
    setSelectedTrackId,
    startPlacementPreview,
    tracks,
    toggleTrackMacroPanel,
    view
  ]);

  return {
    ghostPreviewNote,
    tabSelectionPreviewNote
  };
}
