import {
  clampProbeMaxFrequencyHz,
  DEFAULT_PROBE_MAX_FREQUENCY_HZ,
  PROBE_MAX_MAX_FREQUENCY_HZ,
  PROBE_MIN_MAX_FREQUENCY_HZ
} from "@/lib/patch/probes";
import { Patch } from "@/types/patch";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

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
      ? `${connection.from.nodeId}.${connection.from.portId} -> ${connection.to.nodeId}.${connection.to.portId}`
      : "Wire target unavailable";
  }
  return `${target.nodeId}.${target.portId} (${target.portKind})`;
}
