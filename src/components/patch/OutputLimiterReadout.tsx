import { formatDb, OutputLimiterPreview } from "@/lib/patch/signalHealth";

const OUTPUT_LIMITER_REDUCTION_METER_FULL_SCALE_DB = 18;
const OUTPUT_LIMITER_TRANSFER_INPUT_FULL_SCALE = 2;
const OUTPUT_LIMITER_TRANSFER_OUTPUT_FULL_SCALE = 1;
const OUTPUT_LIMITER_TRANSFER_GRAPH = {
  left: 7,
  right: 93,
  top: 7,
  bottom: 37
};

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatReductionDb(
  preview: OutputLimiterPreview | null | undefined,
  populated: boolean,
  limiterEnabled: boolean
) {
  return populated && limiterEnabled ? `${(preview?.reductionDb ?? 0).toFixed(1)} dB` : "0.0 dB";
}

function resolveUnityReferencePath() {
  return `M${OUTPUT_LIMITER_TRANSFER_GRAPH.left} ${OUTPUT_LIMITER_TRANSFER_GRAPH.bottom} L${OUTPUT_LIMITER_TRANSFER_GRAPH.right} ${OUTPUT_LIMITER_TRANSFER_GRAPH.top}`;
}

function resolveLimiterTransferPath(limiterEnabled: boolean, transfer: (input: number) => number) {
  const points = Array.from({ length: 32 }, (_, index) => {
    const ratio = index / 31;
    const input = ratio * OUTPUT_LIMITER_TRANSFER_INPUT_FULL_SCALE;
    const output = limiterEnabled ? transfer(input) : input;
    const x =
      OUTPUT_LIMITER_TRANSFER_GRAPH.left +
      ratio * (OUTPUT_LIMITER_TRANSFER_GRAPH.right - OUTPUT_LIMITER_TRANSFER_GRAPH.left);
    const y =
      OUTPUT_LIMITER_TRANSFER_GRAPH.bottom -
      clampRatio(output / OUTPUT_LIMITER_TRANSFER_OUTPUT_FULL_SCALE) *
        (OUTPUT_LIMITER_TRANSFER_GRAPH.bottom - OUTPUT_LIMITER_TRANSFER_GRAPH.top);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return points.join(" ");
}

function resolvePreviewPoint(prePeak: number, postPeak: number) {
  const inputRatio = clampRatio(prePeak / OUTPUT_LIMITER_TRANSFER_INPUT_FULL_SCALE);
  const outputRatio = clampRatio(postPeak / OUTPUT_LIMITER_TRANSFER_OUTPUT_FULL_SCALE);
  return {
    x:
      OUTPUT_LIMITER_TRANSFER_GRAPH.left +
      inputRatio * (OUTPUT_LIMITER_TRANSFER_GRAPH.right - OUTPUT_LIMITER_TRANSFER_GRAPH.left),
    y:
      OUTPUT_LIMITER_TRANSFER_GRAPH.bottom -
      outputRatio * (OUTPUT_LIMITER_TRANSFER_GRAPH.bottom - OUTPUT_LIMITER_TRANSFER_GRAPH.top)
  };
}

export function OutputLimiterReadout({ preview }: { preview?: OutputLimiterPreview | null }) {
  const populated = Boolean(preview?.populated);
  const limiterEnabled = preview?.limiterEnabled !== false;
  const reductionAverageRatio = populated
    ? clampRatio(Math.abs(preview?.reductionAverageDb ?? 0) / OUTPUT_LIMITER_REDUCTION_METER_FULL_SCALE_DB)
    : 0;
  const reductionPeakRatio = populated
    ? clampRatio(Math.abs(preview?.reductionDb ?? 0) / OUTPUT_LIMITER_REDUCTION_METER_FULL_SCALE_DB)
    : 0;
  const drivenRatio = populated ? clampRatio(preview?.drivenPeak ?? 0) : 0;
  const drivenRmsRatio = populated ? clampRatio(preview?.drivenRms ?? 0) : 0;
  const postRatio = populated ? clampRatio(preview?.postPeak ?? 0) : 0;
  const postRmsRatio = populated ? clampRatio(preview?.postRms ?? 0) : 0;
  const reductionDb = formatReductionDb(preview, populated, limiterEnabled);
  const previewPoint = resolvePreviewPoint(preview?.drivenPeak ?? 0, preview?.postPeak ?? 0);
  const unityReferencePath = resolveUnityReferencePath();
  const limitedTransferPath = resolveLimiterTransferPath(limiterEnabled, Math.tanh);
  const previewPointTitle = populated
    ? `Preview peak: PRE ${formatDb(preview?.drivenPeakDb ?? 0)} -> POST ${formatDb(
        preview?.postPeakDb ?? 0
      )}. This point plots the measured peak before and after the output limiter.`
    : "Preview a note to place the measured peak point.";
  return (
    <div
      className={`param-row output-limiter-readout${preview?.nearClipActive ? " active" : ""}${
        !limiterEnabled ? " disabled" : ""
      }${!populated ? " empty" : ""}`}
    >
      <div className="param-row-header">
        <span className="param-name">Limiter Activity</span>
        <span className="output-limiter-pill">{limiterEnabled ? "Limiter on" : "Limiter off"}</span>
      </div>
      <div className="output-limiter-visual">
        <div
          className="output-limiter-meter"
          title="Pre level: limiter input after the configured output gain, before limiting. The soft fill is peak; the solid line is RMS."
        >
          <span style={{ height: `${drivenRatio * 100}%` }} />
          <i style={{ bottom: `${drivenRmsRatio * 100}%` }} />
          <strong>PRE</strong>
        </div>
        <div
          className="output-limiter-curve"
          title={
            populated
              ? "Limiter transfer curve. Dashed line is the no-limiter reference; gold line is the output node transfer function."
              : "Preview a note to populate the limiter transfer curve."
          }
        >
          <svg viewBox="0 0 100 44" preserveAspectRatio="none">
            <title>Limiter curve with no-limiter reference, actual transfer function, and measured peak point</title>
            <path d={unityReferencePath} className="output-limiter-curve-raw">
              <title>Unity reference: a straight trend where output rises with input.</title>
            </path>
            <path d={limitedTransferPath} className="output-limiter-curve-shaped">
              <title>
                {limiterEnabled
                  ? "Actual limiter transfer: output = tanh(pre-limiter input)."
                  : "Limiter is off, so the transfer follows the no-limiter reference."}
              </title>
            </path>
            {populated && (
              <circle cx={previewPoint.x} cy={previewPoint.y} r="3.5">
                <title>{previewPointTitle}</title>
              </circle>
            )}
            <text x="10" y="12" className="output-limiter-legend raw">
              no limit
            </text>
            <text x="75" y="18" className="output-limiter-legend shaped">
              tanh
            </text>
            <text x="5" y="41" className="output-limiter-axis-label">
              in
            </text>
            <text x="91" y="41" className="output-limiter-axis-label">
              out
            </text>
          </svg>
        </div>
        <div
          className="output-limiter-meter post"
          title="Post level: final output after gain and limiter. The soft fill is peak; the solid line is RMS."
        >
          <span style={{ height: `${postRatio * 100}%` }} />
          <i style={{ bottom: `${postRmsRatio * 100}%` }} />
          <strong>POST</strong>
        </div>
      </div>
      <div
        className="output-limiter-reduction-row"
        title="Gain reduction amount: wider means the limiter pulled the preview peak down more."
      >
        <span>Gain reduction</span>
        <div className="output-limiter-reduction-track">
          <div className="output-limiter-reduction ghost" style={{ width: `${reductionPeakRatio * 100}%` }} />
          <div className="output-limiter-reduction" style={{ width: `${reductionAverageRatio * 100}%` }} />
        </div>
        <strong>{reductionDb}</strong>
      </div>
      <div className="output-limiter-grid">
        <span>Output gain</span>
        <strong>
          {preview ? `${preview.gainDb.toFixed(1)} dB` : "--"} <em>target: taste</em>
        </strong>
        <span>Pre peak</span>
        <strong>
          {populated ? formatDb(preview?.drivenPeakDb ?? 0) : "--"} <em>max: 0.0 dB</em>
        </strong>
        <span>Post peak</span>
        <strong>
          {populated ? formatDb(preview?.postPeakDb ?? 0) : "--"} <em>ideal: -1 to -3 dB</em>
        </strong>
        <span>Reduction</span>
        <strong>
          {reductionDb} <em>ideal: 0 to -3 dB</em>
        </strong>
        <span>Near clip</span>
        <strong>
          {populated ? (preview?.post?.nearClipCount ?? 0) : "--"} <em>ideal: 0</em>
        </strong>
      </div>
      {!populated && <div className="output-limiter-empty">Preview a note to populate output limiter metering.</div>}
    </div>
  );
}
