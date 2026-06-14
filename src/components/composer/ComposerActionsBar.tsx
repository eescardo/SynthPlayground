import { PitchButtonLabel } from "@/components/PitchButtonLabel";
import type { PlaybackStopMode } from "@/hooks/usePlaybackController";
import styles from "./ComposerActionsBar.module.css";

export type ComposerRecordPhase = "idle" | "count_in" | "recording";

interface ComposerActionsBarProps {
  mutationDisabled: boolean;
  recordingActive: boolean;
  runtimeErrorMessage?: string | null;
  isPlaying: boolean;
  recordPhase?: ComposerRecordPhase;
  countInLabel?: string | null;
  pitchPreviewMode: "placement" | "selection";
  pitchPreviewPitch: string;
  playbackStopMode: PlaybackStopMode;
  canRemoveTrack: boolean;
  onOpenPitchPreviewPicker: () => void;
  onPlay: () => void;
  onStop: () => void;
  onTogglePlaybackStopMode: () => void;
  onToggleRecord: () => void;
  onClearProject: () => void;
  onAddTrack: () => void;
  onRemoveTrack: () => void;
}

function RecordButton({
  recordingActive,
  recordPhase,
  countInLabel,
  onToggleRecord
}: Pick<ComposerActionsBarProps, "recordingActive" | "recordPhase" | "countInLabel" | "onToggleRecord">) {
  return (
    <div className="record-button-wrap">
      {recordPhase === "count_in" && countInLabel && (
        <div className="record-countdown-badge" aria-live="polite">
          {countInLabel}
        </div>
      )}
      <button
        type="button"
        className={recordingActive ? "armed toggle-active" : ""}
        aria-pressed={recordingActive}
        onClick={onToggleRecord}
      >
        Record
      </button>
    </div>
  );
}

export function ComposerActionsBar({
  mutationDisabled,
  recordingActive,
  runtimeErrorMessage,
  isPlaying,
  recordPhase,
  countInLabel,
  pitchPreviewMode,
  pitchPreviewPitch,
  playbackStopMode,
  canRemoveTrack,
  onOpenPitchPreviewPicker,
  onPlay,
  onStop,
  onTogglePlaybackStopMode,
  onToggleRecord,
  onClearProject,
  onAddTrack,
  onRemoveTrack
}: ComposerActionsBarProps) {
  const canPlay = !isPlaying && !recordingActive;
  const canStop = isPlaying && !recordingActive;
  const playbackStopModeTooltip =
    playbackStopMode === "reset"
      ? "Reset mode returns to the last set playhead when stopping."
      : "Continue mode pauses at the current playback beat when stopping.";

  return (
    <section className={styles.bar} data-composer-actions-bar="true">
      <div className={styles.group}>
        <button type="button" disabled={mutationDisabled} onClick={onAddTrack}>
          Add Track
        </button>
        <button type="button" disabled={mutationDisabled || !canRemoveTrack} onClick={onRemoveTrack}>
          Remove Track
        </button>
        <button type="button" disabled={mutationDisabled} onClick={onClearProject}>
          Clear Composition
        </button>
      </div>

      <div className={styles.group}>
        <div className={styles.pitchPreviewStack}>
          <div className={styles.toolbarLabeledControl}>
            <span className={styles.toolbarLabeledControlLabel}>Pitch</span>
            <button
              type="button"
              className={styles.previewPitchButton}
              onClick={onOpenPitchPreviewPicker}
              title={pitchPreviewMode === "selection" ? "Selected note pitch" : "Placement pitch"}
              aria-label={`${pitchPreviewMode === "selection" ? "Selected note" : "Placement"} pitch ${pitchPreviewPitch}`}
            >
              <PitchButtonLabel pitch={pitchPreviewPitch} />
            </button>
          </div>
          <div className={styles.pitchPreviewModePill} aria-label={`Pitch preview mode: ${pitchPreviewMode}`}>
            {pitchPreviewMode}
          </div>
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
          recordingActive={recordingActive}
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
