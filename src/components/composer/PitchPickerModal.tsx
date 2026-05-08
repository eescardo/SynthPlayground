import { PianoKeyboard } from "@/components/PianoKeyboard";

interface PitchPickerModalProps {
  open: boolean;
  title: string;
  description: string;
  selectedPitch: string;
  onSelectPitch: (pitch: string) => void;
  onClose: () => void;
}

export function PitchPickerModal({
  open,
  title,
  description,
  selectedPitch,
  onSelectPitch,
  onClose
}: PitchPickerModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="help-modal pitch-picker-modal" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
        <PianoKeyboard minPitch="C1" maxPitch="C7" selectedPitch={selectedPitch} onSelectPitch={onSelectPitch} />
        <div className="pitch-picker-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
