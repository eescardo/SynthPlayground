export interface AudioDebugPanelViewModelOptions {
  rendererLabel: string;
  open: boolean;
  onToggle: () => void;
}

export interface AudioDebugPanelViewModel {
  dialog: null | {
    ariaLabel: string;
    title: string;
    rendererLabel: string;
  };
  button: {
    ariaLabel: string;
    ariaExpanded: boolean;
    label: string;
    onClick: () => void;
  };
}

export const createAudioDebugPanelViewModel = ({
  rendererLabel,
  open,
  onToggle
}: AudioDebugPanelViewModelOptions): AudioDebugPanelViewModel => ({
  dialog: open
    ? {
        ariaLabel: "Audio renderer debug",
        title: "Audio Debug",
        rendererLabel
      }
    : null,
  button: {
    ariaLabel: "Toggle audio debug panel",
    ariaExpanded: open,
    label: "dbg",
    onClick: onToggle
  }
});
