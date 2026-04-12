export const createInstrumentEditorPreviewReadyKey = (
  editorSessionKey: string | undefined,
  patchId: string,
  macroValues: Record<string, number>
) => `${editorSessionKey ?? ""}:${patchId}:${JSON.stringify(macroValues)}`;
