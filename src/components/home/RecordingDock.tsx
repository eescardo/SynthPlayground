import { PianoKeyboard } from "@/components/PianoKeyboard";
import { Project } from "@/types/music";

interface RecordingDockProps {
  open: boolean;
  track: Project["tracks"][number] | undefined;
  title: string;
  statusText: string;
  pressedPitches: string[];
  onPressStart: (pitch: string) => void;
  onPressEnd: (pitch: string) => void;
}

export function RecordingDock({
  open,
  track,
  title,
  statusText,
  pressedPitches,
  onPressStart,
  onPressEnd
}: RecordingDockProps) {
  if (!open || !track) {
    return null;
  }

  return (
    <section className="recording-dock">
      <div className="recording-dock-header">
        <div>
          <strong>{title}</strong>
          <span className="recording-dock-subtitle">
            {track.name} · {track.instrumentPatchId.replace("preset_", "")}
          </span>
        </div>
        <div className="recording-dock-status">{statusText}</div>
      </div>
      <PianoKeyboard
        minPitch="C2"
        maxPitch="C7"
        pressedPitches={pressedPitches}
        onSelectPitch={() => {}}
        onPressStart={onPressStart}
        onPressEnd={onPressEnd}
      />
    </section>
  );
}
