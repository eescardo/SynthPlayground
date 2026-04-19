export type ComposerRecordPhase = "idle" | "count_in" | "recording";

interface ComposerActionsBarProps {
  recordingDisabled: boolean;
  isPlaying: boolean;
  recordEnabled: boolean;
  recordPhase?: ComposerRecordPhase;
  countInLabel?: string | null;
  canRemoveTrack: boolean;
  onPlay: () => void;
  onStop: () => void;
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
  isPlaying,
  recordEnabled,
  recordPhase,
  countInLabel,
  canRemoveTrack,
  onPlay,
  onStop,
  onToggleRecord,
  onClearProject,
  onAddTrack,
  onRemoveTrack
}: ComposerActionsBarProps) {
  return (
    <section className="composer-actions-bar">
      <div className="composer-actions-bar-group">
        <button disabled={recordingDisabled} onClick={onAddTrack}>Add Track</button>
        <button disabled={recordingDisabled || !canRemoveTrack} onClick={onRemoveTrack}>
          Remove Track
        </button>
      </div>

      <div className="composer-actions-bar-group">
        <button onClick={onPlay} disabled={isPlaying || recordEnabled}>
          Play
        </button>
        <button onClick={onStop} disabled={!isPlaying || recordEnabled}>
          Stop
        </button>
        <RecordButton
          recordEnabled={recordEnabled}
          recordPhase={recordPhase}
          countInLabel={countInLabel}
          onToggleRecord={onToggleRecord}
        />
        <button disabled={recordingDisabled} onClick={onClearProject}>
          Clear
        </button>
      </div>
    </section>
  );
}
