import { formatDb, OutputLimiterPreview } from "@/lib/patch/signalHealth";

const OUTPUT_LIMITER_REDUCTION_METER_FULL_SCALE_DB = 18;

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
              ? "Limiter transfer curve. Dashed line is unprocessed level; gold line is the limited output curve; the dot is this preview's current peak."
              : "Preview a note to populate the limiter transfer curve."
          }
        >
          <svg viewBox="0 0 100 44" preserveAspectRatio="none">
            <title>Limiter curve with raw, limited, and current peak indicators</title>
            <path d="M7 37 C 34 35, 60 24, 93 7" className="output-limiter-curve-raw" />
            <path d="M7 37 C 28 34, 54 14, 93 8" className="output-limiter-curve-shaped" />
            {populated && <circle cx={14 + drivenRatio * 72} cy={37 - postRatio * 29} r="3.5" />}
            <text x="10" y="12" className="output-limiter-legend raw">
              raw
            </text>
            <text x="75" y="18" className="output-limiter-legend shaped">
              limited
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
