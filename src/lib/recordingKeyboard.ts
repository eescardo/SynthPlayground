interface RecordingKeyboardEvent {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
}

export const shouldStartRecordingKeyboardNote = (event: RecordingKeyboardEvent): boolean =>
  !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey;
