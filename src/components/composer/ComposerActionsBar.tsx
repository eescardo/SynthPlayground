import { PitchButtonLabel } from "@/components/PitchButtonLabel";
import type { PlaybackStopMode } from "@/hooks/usePlaybackController";

export type ComposerRecordPhase = "idle" | "count_in" | "recording";

interface ComposerActionsBarProps {
  recordingDisabled: boolean;
  runtimeErrorMessage?: string | null;
  isPlaying: boolean;
  recordEnabled: boolean;
  recordPhase?: ComposerRecordPhase;
  countInLabel?: string | null;
  defaultPitch: string;
  playMode: PlaybackStopMode;
  canRemoveTrack: boolean;
  onOpenDefaultPitchPicker: () => void;
  onPlay: () => void;
  onStop: () => void;
  onTogglePlayMode: () => void;
  onToggleRecord: () => void;
  onClearProject: () => void;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
}

function RecordButton({
  recordEnabled,
  recordPhase,
  countInLabel,
  onToggleRecord
}: Pick<ComposerActionsBarProps, "recordEnabled" | "recordPhase" | "countInLabel" | "onToggleRecord">) {
  return (
    <div className="record-button-wrap">
      {recordPhase === "count_in" && countInLabel && (
        <div className="record-countdown-badge" aria-live="polite">
          {countInLabel}
        </div>
      )}
      <button
        type="button"
        className={recordEnabled ? "armed toggle-active" : ""}
        aria-pressed={recordEnabled}
        onClick={onToggleRecord}
      >
        Record
      </button>
    </div>
  );
}

export function ComposerActionsBar({
  recordingDisabled,
  runtimeErrorMessage,
  isPlaying,
  recordEnabled,
  recordPhase,
  countInLabel,
  defaultPitch,
  playMode,
  canRemoveTrack,
  onOpenDefaultPitchPicker,
  onPlay,
  onStop,
  onTogglePlayMode,
  onToggleRecord,
  onClearProject,
  onAddTrack,
  onRemoveTrack
}: ComposerActionsBarProps) {
  const canPlay = !isPlaying && !recordEnabled;
  const canStop = isPlaying && !recordEnabled;
  const playModeTooltip =
    playMode === "reset"
      ? "Reset mode returns to the last set playhead when stopping."
      : "Continue mode pauses at the current playback beat when stopping.";

  return (
    <section className="composer-actions-bar">
      <div className="composer-actions-bar-group">
        <button type="button" disabled={recordingDisabled} onClick={onAddTrack}>
          Add Track
        </button>
        <button type="button" disabled={recordingDisabled || !canRemoveTrack} onClick={onRemoveTrack}>
          Remove Track
        </button>
        <button type="button" disabled={recordingDisabled} onClick={onClearProject}>
          Clear Composition
        </button>
      </div>

      <div className="composer-actions-bar-group">
        <div className="toolbar-labeled-control">
          <span className="toolbar-labeled-control-label">Pitch</span>
          <button
            type="button"
            className="preview-pitch-button"
            onClick={onOpenDefaultPitchPicker}
            title="Default pitch"
            aria-label={`Default pitch ${defaultPitch}`}
          >
            <PitchButtonLabel pitch={defaultPitch} />
          </button>
        </div>
        <div className="play-control-stack">
          <button
            type="button"
            className={canPlay ? "transport-play-button transport-play-button-enabled" : "transport-play-button"}
            onClick={onPlay}
            disabled={!canPlay}
          >
            Play
          </button>
          <button
            type="button"
            className="play-mode-pill"
            title={playModeTooltip}
            aria-label={`Play mode: ${playMode}. ${playModeTooltip}`}
            aria-pressed={playMode === "continue"}
            onClick={onTogglePlayMode}
          >
            {playMode}
          </button>
        </div>
        <button
          type="button"
          className={canStop ? "transport-stop-button transport-stop-button-enabled" : "transport-stop-button"}
          onClick={onStop}
          disabled={!canStop}
        >
          Stop
        </button>
        <RecordButton
          recordEnabled={recordEnabled}
          recordPhase={recordPhase}
          countInLabel={countInLabel}
          onToggleRecord={onToggleRecord}
        />
      </div>
      {runtimeErrorMessage ? (
        <p className="composer-actions-status error" role="alert">
          {runtimeErrorMessage}
        </p>
      ) : null}
    </section>
  );
}
