import {
  clampProbeMaxFrequencyHz,
  DEFAULT_PROBE_MAX_FREQUENCY_HZ,
  PROBE_MAX_MAX_FREQUENCY_HZ,
  PROBE_MIN_MAX_FREQUENCY_HZ
} from "@/lib/patch/probes";
import { formatPatchEndpointLabel } from "@/components/patch/patchInspectablePorts";
import { buildPitchTrackerClipboardPayload, detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
import { Patch } from "@/types/patch";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";
import { useProjectWorkspaceClipboard, useProjectWorkspaceTransport } from "@/components/ProjectWorkspaceContext";

interface ProbeInspectorSectionProps {
  patch: Patch;
  selectedProbe: PatchWorkspaceProbeState;
  previewCapture?: PreviewProbeCapture;
  previewProgress: number;
  attachingProbeId?: string | null;
  onUpdateProbeSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onUpdateProbeFrequencyView: (probeId: string, maxHz: number) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onClearProbeTarget: (probeId: string) => void;
}

export function ProbeInspectorSection(props: ProbeInspectorSectionProps) {
  const { selectedProbe } = props;
  const onWriteClipboardPayload = useProjectWorkspaceClipboard();
  const { tempo } = useProjectWorkspaceTransport();
  const detectedNotes =
    selectedProbe.kind === "pitch_tracker" ? detectMonophonicPitchNotes(props.previewCapture, tempo) : [];
  const clipboardPayload =
    selectedProbe.kind === "pitch_tracker" ? buildPitchTrackerClipboardPayload(props.patch.id, detectedNotes) : null;

  return (
    <>
      <h4>
        {selectedProbe.name} <small>{selectedProbe.kind}</small>
      </h4>
      <div className="param-row">
        <span>Attachment</span>
        <div className="param-control-stack">
          <code>{formatProbeTarget(props.patch, selectedProbe.target)}</code>
        </div>
        <button type="button" onClick={() => props.onToggleAttachProbe(selectedProbe.id)}>
          {props.attachingProbeId === selectedProbe.id ? "Cancel" : "Attach"}
        </button>
      </div>
      <div className="param-row">
        <span>Expanded</span>
        <div className="param-control-stack">
          <div className="macro-binding-edit-summary">
            {selectedProbe.expanded
              ? "Large probe view is open. Drag it by the header or click the face to collapse it."
              : "Click the probe face to expand it in place."}
          </div>
        </div>
        <button type="button" disabled className="patch-inspector-status-button">
          {selectedProbe.expanded ? "Open" : "Closed"}
        </button>
      </div>
      {selectedProbe.kind === "spectrum" && (
        <>
          <div className="param-row">
            <span>Window</span>
            <div className="param-control-stack">
              <select
                value={selectedProbe.spectrumWindowSize ?? 1024}
                onChange={(event) => props.onUpdateProbeSpectrumWindow(selectedProbe.id, Number(event.target.value))}
              >
                {[256, 512, 1024, 2048].map((windowSize) => (
                  <option key={windowSize} value={windowSize}>
                    {windowSize}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" disabled={!selectedProbe.target} onClick={() => props.onClearProbeTarget(selectedProbe.id)}>
              Clear Target
            </button>
          </div>
          <div className="param-row">
            <span>Max Freq</span>
            <div className="param-control-stack">
              <input
                type="range"
                min={PROBE_MIN_MAX_FREQUENCY_HZ}
                max={PROBE_MAX_MAX_FREQUENCY_HZ}
                step={100}
                value={selectedProbe.frequencyView?.maxHz ?? DEFAULT_PROBE_MAX_FREQUENCY_HZ}
                onChange={(event) => props.onUpdateProbeFrequencyView(selectedProbe.id, clampProbeMaxFrequencyHz(Number(event.target.value)))}
              />
              <div className="macro-binding-edit-summary">
                {`${clampProbeMaxFrequencyHz(selectedProbe.frequencyView?.maxHz ?? DEFAULT_PROBE_MAX_FREQUENCY_HZ).toLocaleString()} Hz top of view. Lower values zoom in on VCF detail.`}
              </div>
            </div>
            <button type="button" disabled={!selectedProbe.target} onClick={() => props.onClearProbeTarget(selectedProbe.id)}>
              Clear Target
            </button>
          </div>
          <p className="muted">
            Spectrum follows the current preview playhead and analyzes the active signal window over time. Narrowing max frequency reallocates the same bins into a tighter band.
          </p>
        </>
      )}
      {selectedProbe.kind === "scope" && (
        <>
          <div className="param-row">
            <span>Signal</span>
            <div className="param-control-stack">
              <div className="macro-binding-edit-summary">
                {props.previewCapture?.samples?.length
                  ? `Normalized from ${props.previewCapture.capturedSamples || props.previewCapture.samples.length} captured samples. Playhead ${Math.round(props.previewProgress * 100)}%.`
                  : "Preview the patch to populate scope data."}
              </div>
            </div>
            <button type="button" disabled={!selectedProbe.target} onClick={() => props.onClearProbeTarget(selectedProbe.id)}>
              Clear Target
            </button>
          </div>
          <p className="muted">
            Scope view normalizes the captured signal so quiet patches still render visibly.
          </p>
        </>
      )}
      {selectedProbe.kind === "pitch_tracker" && (
        <>
          <div className="param-row">
            <span>Detected Notes</span>
            <div className="param-control-stack">
              <div className="macro-binding-edit-summary">
                {detectedNotes.length
                  ? `${detectedNotes.length} monophonic note${detectedNotes.length === 1 ? "" : "s"} detected from the latest preview.`
                  : "Preview the patch to estimate note pitch, onset, and offset from this attached signal."}
              </div>
              {detectedNotes.length > 0 && (
                <div className="pitch-tracker-note-list">
                  {detectedNotes.map((note, index) => (
                    <div key={`${note.pitchStr}_${note.startBeat}_${index}`} className="pitch-tracker-note-row">
                      <strong>{note.pitchStr}</strong>
                      <span>{note.startBeat.toFixed(2)} beat</span>
                      <span>{note.durationBeats.toFixed(2)} beat</span>
                      <span>{Math.round(note.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={!selectedProbe.target}
              onClick={() => props.onClearProbeTarget(selectedProbe.id)}
            >
              Clear Target
            </button>
          </div>
          <div className="param-row">
            <span>Clipboard</span>
            <div className="param-control-stack">
              <div className="macro-binding-edit-summary">
                Copy writes the detected notes using the app’s note clipboard format so they can be pasted into the composer.
              </div>
            </div>
            <button
              type="button"
              disabled={!clipboardPayload || !onWriteClipboardPayload}
              onClick={() => clipboardPayload && onWriteClipboardPayload?.(clipboardPayload)}
            >
              Copy Notes
            </button>
          </div>
          <p className="muted">
            Pitch tracker is intentionally simple and monophonic-only. It works best on a clean lead, bass, or trimmed sample line with obvious gaps between notes.
          </p>
        </>
      )}
    </>
  );
}

function formatProbeTarget(patch: Patch, target?: PatchProbeTarget) {
  if (!target) {
    return "Not attached";
  }
  if (target.kind === "connection") {
    const connection = patch.connections.find((entry) => entry.id === target.connectionId);
    return connection
      ? `${formatPatchEndpointLabel(patch, connection.from)} -> ${formatPatchEndpointLabel(patch, connection.to)}`
      : "Wire target unavailable";
  }
  return `${formatPatchEndpointLabel(patch, target)} (${target.portKind})`;
}
