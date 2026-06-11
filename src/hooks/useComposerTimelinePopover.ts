import { Dispatch, SetStateAction, useCallback, useMemo } from "react";
import { TimelineActionsPopoverRequest } from "@/components/tracks/TrackCanvas";
import { clearEditorSelection, EditorSelectionState, setEditorSelectionActionScopePreview } from "@/lib/clipboard";
import { clearCompositionEndBeat, setCompositionEndBeat } from "@/lib/compositionEnd";
import { expandLoopRegionToNotes, getSanitizedLoopMarkers, getUniqueMatchedLoopRegionAtBeat } from "@/lib/looping";
import { getProjectTimelineEndBeat } from "@/lib/macroAutomation";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: {
    actionKey?: string;
    coalesce?: boolean;
    onCommitted?: (project: Project) => void;
    skipHistory?: boolean;
  }
) => void;

interface UseComposerTimelinePopoverOptions {
  closeExplodeSelectionDialog: () => void;
  commitProjectChange: CommitProjectChange;
  playbackEndBeat: number;
  project: Project;
  setEditorSelection: Dispatch<SetStateAction<EditorSelectionState>>;
  setPitchPicker: (value: null) => void;
  setSelectionActionPopoverMode: (mode: "collapsed" | "expanded") => void;
  setTimelineActionsPopover: Dispatch<SetStateAction<TimelineActionsPopoverRequest | null>>;
  syncNoteClipboardPayload: () => void | Promise<void>;
  timelineActionsPopover: TimelineActionsPopoverRequest | null;
}

export function useComposerTimelinePopover({
  closeExplodeSelectionDialog,
  commitProjectChange,
  playbackEndBeat,
  project,
  setEditorSelection,
  setPitchPicker,
  setSelectionActionPopoverMode,
  setTimelineActionsPopover,
  syncNoteClipboardPayload,
  timelineActionsPopover
}: UseComposerTimelinePopoverOptions) {
  const timelineMarkersAtBeat = useMemo(
    () =>
      timelineActionsPopover
        ? getSanitizedLoopMarkers(project.global.loop).filter(
            (marker) => Math.abs(marker.beat - timelineActionsPopover.beat) < 1e-9
          )
        : [],
    [project.global.loop, timelineActionsPopover]
  );
  const startMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "start");
  const endMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "end");
  const expandableLoopRegion = useMemo(
    () =>
      timelineActionsPopover
        ? getUniqueMatchedLoopRegionAtBeat(project.global.loop, timelineActionsPopover.beat)
        : null,
    [project.global.loop, timelineActionsPopover]
  );

  const expandSelectedLoopToNotes = useCallback(() => {
    if (!expandableLoopRegion) {
      return;
    }
    commitProjectChange((current) => expandLoopRegionToNotes(current, expandableLoopRegion), {
      actionKey: `global:loop:expand:${expandableLoopRegion.startMarkerId}`
    });
    setTimelineActionsPopover(null);
  }, [commitProjectChange, expandableLoopRegion, setTimelineActionsPopover]);

  const toggleCompositionEndFollow = useCallback(
    (follow: boolean) => {
      commitProjectChange(
        (current) =>
          follow
            ? clearCompositionEndBeat(current)
            : setCompositionEndBeat(current, getProjectTimelineEndBeat(current)),
        { actionKey: "composition-end:follow-toggle" }
      );
    },
    [commitProjectChange]
  );

  const updateCompositionEndBeat = useCallback(
    (beat: number) => {
      const previousEndBeat = playbackEndBeat;
      let nextPopoverBeat = previousEndBeat;
      commitProjectChange((current) => setCompositionEndBeat(current, beat), {
        actionKey: "composition-end:beat",
        coalesce: true,
        onCommitted: (nextProject) => {
          nextPopoverBeat = getProjectTimelineEndBeat(nextProject);
        }
      });
      setTimelineActionsPopover((current) => {
        if (!current) {
          return current;
        }
        const lockedToCompositionEnd =
          current.anchor === "composition-end" || Math.abs(current.beat - previousEndBeat) < 1e-9;
        return lockedToCompositionEnd ? { ...current, beat: nextPopoverBeat, anchor: "composition-end" } : current;
      });
    },
    [commitProjectChange, playbackEndBeat, setTimelineActionsPopover]
  );

  const requestTimelineActionsPopover = useCallback(
    (request: TimelineActionsPopoverRequest) => {
      setTimelineActionsPopover(request);
      setPitchPicker(null);
      closeExplodeSelectionDialog();
      setEditorSelection(clearEditorSelection());
      setSelectionActionPopoverMode("expanded");
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
      void syncNoteClipboardPayload();
    },
    [
      closeExplodeSelectionDialog,
      setEditorSelection,
      setPitchPicker,
      setSelectionActionPopoverMode,
      setTimelineActionsPopover,
      syncNoteClipboardPayload
    ]
  );

  return {
    endMarkerAtTimelineBeat,
    expandableLoopRegion,
    expandSelectedLoopToNotes,
    requestTimelineActionsPopover,
    startMarkerAtTimelineBeat,
    toggleCompositionEndFollow,
    updateCompositionEndBeat
  };
}
