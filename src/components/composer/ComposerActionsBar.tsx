import { PitchButtonLabel } from "@/components/PitchButtonLabel";
import type { PlaybackStopMode } from "@/hooks/usePlaybackController";
import styles from "./ComposerActionsBar.module.css";

export type ComposerRecordPhase = "idle" | "count_in" | "recording";

interface ComposerActionsBarProps {
  recordingDisabled: boolean;
  runtimeErrorMessage?: string | null;
  isPlaying: boolean;
  recordEnabled: boolean;
  recordPhase?: ComposerRecordPhase;
  countInLabel?: string | null;
  defaultPitch: string;
  playbackStopMode: PlaybackStopMode;
  canRemoveTrack: boolean;
  onOpenDefaultPitchPicker: () => void;
  onPlay: () => void;
  onStop: () => void;
  onTogglePlaybackStopMode: () => void;
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
  playbackStopMode,
  canRemoveTrack,
  onOpenDefaultPitchPicker,
  onPlay,
  onStop,
  onTogglePlaybackStopMode,
  onToggleRecord,
  onClearProject,
  onAddTrack,
  onRemoveTrack
}: ComposerActionsBarProps) {
  const canPlay = !isPlaying && !recordEnabled;
  const canStop = isPlaying && !recordEnabled;
  const playbackStopModeTooltip =
    playbackStopMode === "reset"
      ? "Reset mode returns to the last set playhead when stopping."
      : "Continue mode pauses at the current playback beat when stopping.";

  return (
    <section className={styles.bar} data-composer-actions-bar="true">
      <div className={styles.group}>
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

      <div className={styles.group}>
        <div className={styles.toolbarLabeledControl}>
          <span className={styles.toolbarLabeledControlLabel}>Pitch</span>
          <button
            type="button"
            className={styles.previewPitchButton}
            onClick={onOpenDefaultPitchPicker}
            title="Default pitch"
            aria-label={`Default pitch ${defaultPitch}`}
          >
            <PitchButtonLabel pitch={defaultPitch} />
          </button>
        </div>
        <button
          type="button"
          className={canPlay ? styles.transportPlayButtonEnabled : undefined}
          onClick={onPlay}
          disabled={!canPlay}
        >
          Play
        </button>
        <div className={styles.stopControlStack}>
          <button
            type="button"
            className={canStop ? styles.transportStopButtonEnabled : undefined}
            onClick={onStop}
            disabled={!canStop}
          >
            Stop
          </button>
          <button
            type="button"
            className={styles.playbackStopModePill}
            title={playbackStopModeTooltip}
            aria-label={`Playback stop mode: ${playbackStopMode}. ${playbackStopModeTooltip}`}
            aria-pressed={playbackStopMode === "continue"}
            onClick={onTogglePlaybackStopMode}
          >
            {playbackStopMode}
          </button>
        </div>
        <RecordButton
          recordEnabled={recordEnabled}
          recordPhase={recordPhase}
          countInLabel={countInLabel}
          onToggleRecord={onToggleRecord}
        />
      </div>
      {runtimeErrorMessage ? (
        <p className={`${styles.status} error`} role="alert">
          {runtimeErrorMessage}
        </p>
      ) : null}
    </section>
  );
}
