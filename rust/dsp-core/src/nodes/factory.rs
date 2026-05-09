use super::sample_asset::parse_sample_asset;
use super::*;
use crate::nodes::reverb::reverb_mode_wet_gain;
use crate::{js_error, NodeSpecRaw};
use serde_json::Value;
use wasm_bindgen::JsValue;

impl RuntimeNode {
    /// Converts one serialized node spec into its runtime DSP representation.
    /// Params:
    /// - `raw`: compiled node spec with resolved port indices and serialized parameter values.
    /// - `sample_rate`: global sample rate used to size buffers and smoothing state.
    pub(crate) fn from_raw(raw: &NodeSpecRaw, sample_rate: f32) -> Result<Self, JsValue> {
        let p = &raw.params;
        Ok(match raw.type_id.as_str() {
            "CVTranspose" => Self::CVTranspose(CVTransposeNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                octaves: SmoothParam::new(value_to_f32(p.get("octaves"), 0.0), 10.0, sample_rate),
                semitones: SmoothParam::new(
                    value_to_f32(p.get("semitones"), 0.0),
                    10.0,
                    sample_rate,
                ),
                cents: SmoothParam::new(value_to_f32(p.get("cents"), 0.0), 10.0, sample_rate),
            }),
            "CVScaler" => Self::CVScaler(CVScalerNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                scale: SmoothParam::new(value_to_f32(p.get("scale"), 1.0), 10.0, sample_rate),
            }),
            "CVMixer4" => Self::CVMixer4(CVMixer4Node {
                out_index: raw.out_index,
                in1: input_index(&raw.inputs, "in1"),
                in2: input_index(&raw.inputs, "in2"),
                in3: input_index(&raw.inputs, "in3"),
                in4: input_index(&raw.inputs, "in4"),
                gain1: SmoothParam::new(value_to_f32(p.get("gain1"), 1.0), 10.0, sample_rate),
                gain2: SmoothParam::new(value_to_f32(p.get("gain2"), 1.0), 10.0, sample_rate),
                gain3: SmoothParam::new(value_to_f32(p.get("gain3"), 1.0), 10.0, sample_rate),
                gain4: SmoothParam::new(value_to_f32(p.get("gain4"), 1.0), 10.0, sample_rate),
            }),
            "VCO" => Self::VCO(VcoNode {
                out_index: raw.out_index,
                pitch: input_index(&raw.inputs, "pitch"),
                fm: input_index(&raw.inputs, "fm"),
                pwm: input_index(&raw.inputs, "pwm"),
                wave: serde_json::from_value::<Wave>(Value::String(value_to_string(
                    p.get("wave"),
                    "sine",
                )))
                .map_err(|e| js_error(format!("Invalid VCO wave: {e}")))?,
                pulse_width: SmoothParam::new(
                    value_to_f32(p.get("pulseWidth"), 0.5),
                    20.0,
                    sample_rate,
                ),
                base_tune_cents: SmoothParam::new(
                    value_to_f32(p.get("baseTuneCents"), 0.0),
                    10.0,
                    sample_rate,
                ),
                fine_tune_cents: SmoothParam::new(
                    value_to_f32(p.get("fineTuneCents"), 0.0),
                    10.0,
                    sample_rate,
                ),
                pwm_amount: SmoothParam::new(
                    value_to_f32(p.get("pwmAmount"), 0.0),
                    20.0,
                    sample_rate,
                ),
                phase: 0.0,
            }),
            "KarplusStrong" => Self::KarplusStrong(KarplusStrongNode {
                out_index: raw.out_index,
                pitch: input_index(&raw.inputs, "pitch"),
                gate: input_index(&raw.inputs, "gate"),
                excite: input_index(&raw.inputs, "excite"),
                decay: SmoothParam::new(value_to_f32(p.get("decay"), 0.94), 20.0, sample_rate),
                damping: SmoothParam::new(value_to_f32(p.get("damping"), 0.28), 20.0, sample_rate),
                brightness: SmoothParam::new(
                    value_to_f32(p.get("brightness"), 0.72),
                    20.0,
                    sample_rate,
                ),
                excitation: value_to_string(p.get("excitation"), "noise"),
                buf: vec![0.0; (sample_rate as usize) * 2],
                write: 0,
                current_delay: 64,
                last: 0.0,
                last_gate: 0.0,
            }),
            "LFO" => Self::LFO(LfoNode {
                out_index: raw.out_index,
                fm: input_index(&raw.inputs, "fm"),
                wave: serde_json::from_value::<Wave>(Value::String(value_to_string(
                    p.get("wave"),
                    "sine",
                )))
                .map_err(|e| js_error(format!("Invalid LFO wave: {e}")))?,
                freq_hz: SmoothParam::new(value_to_f32(p.get("freqHz"), 1.0), 50.0, sample_rate),
                pulse_width: SmoothParam::new(
                    value_to_f32(p.get("pulseWidth"), 0.5),
                    20.0,
                    sample_rate,
                ),
                bipolar: value_to_bool(p.get("bipolar"), true),
                phase: 0.0,
            }),
            "ADSR" => Self::ADSR(AdsrNode {
                out_index: raw.out_index,
                gate: input_index(&raw.inputs, "gate"),
                attack: SmoothParam::new(
                    value_ms_to_seconds(p.get("attack"), 10.0),
                    10.0,
                    sample_rate,
                ),
                decay: SmoothParam::new(
                    value_ms_to_seconds(p.get("decay"), 200.0),
                    10.0,
                    sample_rate,
                ),
                sustain: SmoothParam::new(value_to_f32(p.get("sustain"), 0.7), 10.0, sample_rate),
                release: SmoothParam::new(
                    value_ms_to_seconds(p.get("release"), 250.0),
                    10.0,
                    sample_rate,
                ),
                curve: SmoothParam::new(value_to_f32(p.get("curve"), 0.0), 10.0, sample_rate),
                mode: serde_json::from_value::<AdsrMode>(Value::String(value_to_string(
                    p.get("mode"),
                    "retrigger_from_current",
                )))
                .map_err(|e| js_error(format!("Invalid ADSR mode: {e}")))?,
                stage: EnvelopeStage::Idle,
                stage_pos: 0.0,
                stage_start_level: 0.0,
                level: 0.0,
                last_gate: 0.0,
                cached_curve: f32::NAN,
                cached_curve_exponent: 1.0,
            }),
            "VCA" => Self::VCA(VcaNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                gain_cv: input_index(&raw.inputs, "gainCV"),
                bias: SmoothParam::new(value_to_f32(p.get("bias"), 0.0), 10.0, sample_rate),
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 1.0), 10.0, sample_rate),
            }),
            "VCF" => Self::VCF(VcfNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                cutoff_cv: input_index(&raw.inputs, "cutoffCV"),
                filter_type: serde_json::from_value::<FilterType>(Value::String(value_to_string(
                    p.get("type"),
                    "lowpass",
                )))
                .map_err(|e| js_error(format!("Invalid VCF type: {e}")))?,
                cutoff_hz: SmoothParam::new(
                    value_to_f32(p.get("cutoffHz"), 1000.0),
                    20.0,
                    sample_rate,
                ),
                resonance: SmoothParam::new(
                    value_to_f32(p.get("resonance"), 0.1),
                    10.0,
                    sample_rate,
                ),
                cutoff_mod_amount_oct: SmoothParam::new(
                    value_to_f32(p.get("cutoffModAmountOct"), 1.0),
                    10.0,
                    sample_rate,
                ),
                lp: 0.0,
                bp: 0.0,
            }),
            "Mixer4" => Self::Mixer4(Mixer4Node {
                out_index: raw.out_index,
                in1: input_index(&raw.inputs, "in1"),
                in2: input_index(&raw.inputs, "in2"),
                in3: input_index(&raw.inputs, "in3"),
                in4: input_index(&raw.inputs, "in4"),
                gain1: SmoothParam::new(value_to_f32(p.get("gain1"), 1.0), 10.0, sample_rate),
                gain2: SmoothParam::new(value_to_f32(p.get("gain2"), 1.0), 10.0, sample_rate),
                gain3: SmoothParam::new(value_to_f32(p.get("gain3"), 1.0), 10.0, sample_rate),
                gain4: SmoothParam::new(value_to_f32(p.get("gain4"), 1.0), 10.0, sample_rate),
            }),
            "Noise" => Self::Noise(NoiseNode {
                out_index: raw.out_index,
                color: serde_json::from_value::<NoiseColor>(Value::String(value_to_string(
                    p.get("color"),
                    "white",
                )))
                .map_err(|e| js_error(format!("Invalid Noise color: {e}")))?,
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 0.3), 10.0, sample_rate),
                pink: 0.0,
                brown: 0.0,
            }),
            "SamplePlayer" => Self::SamplePlayer(SamplePlayerNode {
                out_index: raw.out_index,
                gate: input_index(&raw.inputs, "gate"),
                pitch: input_index(&raw.inputs, "pitch"),
                mode: serde_json::from_value::<SamplePlayerMode>(Value::String(value_to_string(
                    p.get("mode"),
                    "oneshot",
                )))
                .map_err(|e| js_error(format!("Invalid SamplePlayer mode: {e}")))?,
                start_ratio: clamp(value_to_f32(p.get("start"), 0.0), 0.0, 1.0),
                end_ratio: clamp(value_to_f32(p.get("end"), 1.0), 0.0, 1.0),
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 1.0), 10.0, sample_rate),
                pitch_semis: SmoothParam::new(
                    value_to_f32(p.get("pitchSemis"), 0.0),
                    10.0,
                    sample_rate,
                ),
                asset: parse_sample_asset(p.get("sampleData")),
                position: 0.0,
                active: false,
                last_gate: 0.0,
            }),
            "Delay" => Self::Delay(DelayNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                time_ms: SmoothParam::new(value_to_f32(p.get("timeMs"), 300.0), 30.0, sample_rate),
                feedback: SmoothParam::new(value_to_f32(p.get("feedback"), 0.3), 30.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.2), 10.0, sample_rate),
                buf: vec![0.0; (sample_rate as usize) * 2],
                write: 0,
            }),
            "Reverb" => {
                let mode = serde_json::from_value::<ReverbMode>(Value::String(value_to_string(
                    p.get("mode"),
                    "room",
                )))
                .map_err(|e| js_error(format!("Invalid Reverb mode: {e}")))?;
                Self::Reverb(ReverbNode {
                    out_index: raw.out_index,
                    input: input_index(&raw.inputs, "in"),
                    mode,
                    decay: SmoothParam::new(value_to_f32(p.get("decay"), 0.45), 50.0, sample_rate),
                    tone: SmoothParam::new(value_to_f32(p.get("tone"), 0.55), 50.0, sample_rate),
                    mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.25), 10.0, sample_rate),
                    bank: ReverbDelayLineBank::new(mode, sample_rate),
                    cached_wet_gain_decay: f32::NAN,
                    cached_wet_gain: reverb_mode_wet_gain(mode, value_to_f32(p.get("decay"), 0.45)),
                })
            }
            "Saturation" => Self::Saturation(SaturationNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                drive_db: SmoothParam::new(value_to_f32(p.get("driveDb"), 6.0), 20.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.5), 10.0, sample_rate),
                mode: serde_json::from_value::<SaturationType>(Value::String(value_to_string(
                    p.get("type"),
                    "tanh",
                )))
                .map_err(|e| js_error(format!("Invalid Saturation type: {e}")))?,
            }),
            "Overdrive" => Self::Overdrive(OverdriveNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                drive_db: SmoothParam::new(
                    value_to_f32(p.get("driveDb").or_else(|| p.get("gainDb")), 12.0),
                    20.0,
                    sample_rate,
                ),
                tone: SmoothParam::new(value_to_f32(p.get("tone"), 0.5), 20.0, sample_rate),
                mode: serde_json::from_value::<OverdriveMode>(Value::String(value_to_string(
                    p.get("mode"),
                    "overdrive",
                )))
                .map_err(|e| js_error(format!("Invalid Overdrive mode: {e}")))?,
                tone_lp: 0.0,
            }),
            "Compressor" => Self::Compressor(CompressorNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                squash: SmoothParam::new(value_to_f32(p.get("squash"), 0.5), 50.0, sample_rate),
                attack_ms: SmoothParam::new(
                    value_to_f32(p.get("attackMs"), 20.0),
                    50.0,
                    sample_rate,
                ),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.55), 10.0, sample_rate),
                env: 0.0,
                rms_energy: 0.0,
                gain_reduction_db: 0.0,
                makeup_gain_db: 0.0,
            }),
            "Output" => Self::Output(OutputNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                gain_db: SmoothParam::new(value_to_f32(p.get("gainDb"), -6.0), 30.0, sample_rate),
                limiter: value_to_bool(p.get("limiter"), true),
            }),
            other => return Err(js_error(format!("Unsupported node type: {other}"))),
        })
    }
}
