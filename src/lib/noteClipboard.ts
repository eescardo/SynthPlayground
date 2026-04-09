// Clipboard payloads always store notes and macro automation keyframe data grouped by track,
// normalized so copied beats are relative to the copied beat window. A regular content selection
// includes only tracks that contain selected notes or automation, while an "all tracks" selection
// includes every track, including empty ones.

export type { ClipboardAutomationKeyframeData, ClipboardAutomationLaneData } from "@/lib/automationTimelineEditing";
export type { SelectionActionScope, EditorSelectionState } from "@/lib/editorSelection";
export {
  clearEditorSelection,
  createEmptyEditorSelection,
  filterEditorSelectionToProject,
  getEditorSelectionBeatRange,
  getEditorSelectionSourceTrackId,
  hasContentSelection,
  setEditorContentSelection,
  setEditorSelectionActionScopePreview,
  setEditorSelectionMarqueeActive,
  setEditorTimelineSelection
} from "@/lib/editorSelection";
export {
  applyNoteClipboardInsert,
  applyNoteClipboardInsertAllTracks,
  applyNoteClipboardPaste,
  cutBeatRangeAcrossAllTracks,
  deleteSelectedAutomationKeyframes,
  eraseAutomationInRangeForTracks
} from "@/lib/noteClipboardApply";
export type { AppliedNoteClipboardPaste } from "@/lib/noteClipboardApply";
export type { NoteClipboardPayload, SerializedNoteClipboardPayload } from "@/lib/noteClipboardPayload";
export {
  buildAllTracksClipboardPayload,
  buildNoteClipboardPayload,
  parseNoteClipboardPayload,
  serializeNoteClipboardPayload
} from "@/lib/noteClipboardPayload";
export type { BeatRange, ContentSelection } from "@/lib/noteClipboardSelection";
export {
  EMPTY_CONTENT_SELECTION,
  getAutomationSelectionKey,
  getContentSelectionLabel,
  getNoteSelectionKey,
  getSelectedAutomationIdsByTrackId,
  getSelectedNoteIdsByTrackId,
  getSelectedTrackIds,
  getSelectionBeatRange,
  getSelectionSourceTrackId,
  parseAutomationSelectionKey,
  parseNoteSelectionKey
} from "@/lib/noteClipboardSelection";
