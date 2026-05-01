use crate::{
    clamp, db_to_gain, js_error, one_pole_step, voct_to_hz, waveform_sample, AdsrMode,
    EngineProfileStats, FilterType, HostSignalIndices, NodeSpecRaw, NoiseColor, OverdriveMode,
    SampleAsset, SamplePlayerMode, SaturationType, SmoothParam, Wave,
};
use serde_json::Value;
use std::collections::HashMap;
use wasm_bindgen::JsValue;

fn value_to_f32(value: Option<&Value>, fallback: f32) -> f32 {
    value.and_then(|entry| entry.as_f64()).map(|entry| entry as f32).unwrap_or(fallback)
}

fn value_ms_to_seconds(value: Option<&Value>, fallback_ms: f32) -> f32 {
    value_to_f32(value, fallback_ms) / 1000.0
}

fn value_to_bool(value: Option<&Value>, fallback: bool) -> bool {
    value.and_then(|entry| entry.as_bool()).unwrap_or(fallback)
}

fn value_to_string(value: Option<&Value>, fallback: &str) -> String {
    value
        .and_then(|entry| entry.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| fallback.to_string())
}

#[inline(always)]
fn shape_overdrive_sample(input: f32) -> f32 {
    input.tanh()
}

#[inline(always)]
fn shape_fuzz_sample(input: f32) -> f32 {
    let driven = input * 3.2;
    let clipped = if driven >= 0.0 {
        clamp(driven, 0.0, 0.45) / 0.45
    } else {
        clamp(driven, -0.28, 0.0) / 0.28
    };
    let squared = clipped.signum() * clipped.abs().powf(0.42);
    let asymmetric = if squared >= 0.0 { squared * 0.88 } else { squared * 1.08 };
    let broken = asymmetric + asymmetric * asymmetric * asymmetric * 0.12;
    clamp(broken, -1.0, 1.0)
}

#[inline(always)]
fn overdrive_tone_alpha(tone: f32) -> f32 {
    let t = clamp(tone, 0.0, 1.0);
    clamp(0.012 + t * t * 0.9, 0.012, 0.92)
}

#[inline(always)]
fn overdrive_drive_amount(drive_db: f32) -> f32 {
    clamp(drive_db / 50.0, 0.0, 1.0)
}

#[inline(always)]
fn apply_overdrive_tone(input: f32, lowpassed: f32, tone: f32) -> f32 {
    let t = clamp(tone, 0.0, 1.0);
    let darker = lowpassed * (1.0 + (1.0 - t) * 0.35);
    input * t + darker * (1.0 - t)
}

fn input_index(inputs: &HashMap<String, i32>, key: &str) -> i32 {
    *inputs.get(key).unwrap_or(&-1)
}

#[inline(always)]
fn envelope_curve_progress(t: f32, curve: f32) -> f32 {
    let clamped_t = clamp(t, 0.0, 1.0);
    let clamped_curve = clamp(curve, -1.0, 1.0);
    let exponent = if clamped_curve < 0.0 {
        1.0 + clamped_curve * 0.65
    } else {
        1.0 + clamped_curve * 1.8
    };
    clamped_t.powf(exponent.max(0.35))
}

#[inline(always)]
fn advance_adsr_stage_pos(node: &mut AdsrNode, duration_seconds: f32, sample_rate: f32) -> f32 {
    node.stage_pos = (node.stage_pos + 1.0 / (duration_seconds * sample_rate)).min(1.0);
    node.stage_pos
}

#[inline(always)]
fn signal_start(signal_index: usize, block_size: usize) -> usize {
    signal_index * block_size
}

#[inline(always)]
fn input_start(index: i32, block_size: usize) -> Option<usize> {
    (index >= 0).then(|| index as usize * block_size)
}

#[derive(Clone)]
pub(crate) struct CVTransposeNode {
    out_index: usize,
    input: i32,
    octaves: SmoothParam,
    semitones: SmoothParam,
    cents: SmoothParam,
}

#[derive(Clone)]
pub(crate) struct CVScalerNode {
    out_index: usize,
    input: i32,
    scale: SmoothParam,
}

#[derive(Clone)]
pub(crate) struct CVMixer2Node {
    out_index: usize,
    in1: i32,
    in2: i32,
    gain1: SmoothParam,
    gain2: SmoothParam,
}

#[derive(Clone)]
pub(crate) struct VcoNode {
    out_index: usize,
    pitch: i32,
    fm: i32,
    pwm: i32,
    wave: Wave,
    pulse_width: SmoothParam,
    base_tune_cents: SmoothParam,
    fine_tune_cents: SmoothParam,
    pwm_amount: SmoothParam,
    phase: f64,
}

#[derive(Clone)]
pub(crate) struct KarplusStrongNode {
    out_index: usize,
    pitch: i32,
    gate: i32,
    excite: i32,
    decay: SmoothParam,
    damping: SmoothParam,
    brightness: SmoothParam,
    excitation: String,
    buf: Vec<f32>,
    write: usize,
    current_delay: usize,
    last: f32,
    last_gate: f32,
}

#[derive(Clone)]
pub(crate) struct LfoNode {
    out_index: usize,
    fm: i32,
    wave: Wave,
    freq_hz: SmoothParam,
    pulse_width: SmoothParam,
    bipolar: bool,
    phase: f64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum EnvelopeStage {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone)]
pub(crate) struct AdsrNode {
    out_index: usize,
    gate: i32,
    attack: SmoothParam,
    decay: SmoothParam,
    sustain: SmoothParam,
    release: SmoothParam,
    curve: SmoothParam,
    mode: AdsrMode,
    stage: EnvelopeStage,
    stage_pos: f32,
    stage_start_level: f32,
    level: f32,
    last_gate: f32,
}

#[derive(Clone)]
pub(crate) struct VcaNode {
    out_index: usize,
    input: i32,
    gain_cv: i32,
    bias: SmoothParam,
    gain: SmoothParam,
}

#[derive(Clone)]
pub(crate) struct VcfNode {
    out_index: usize,
    input: i32,
    cutoff_cv: i32,
    filter_type: FilterType,
    cutoff_hz: SmoothParam,
    resonance: SmoothParam,
    cutoff_mod_amount_oct: SmoothParam,
    lp: f32,
    bp: f32,
}

impl VcfNode {
    #[inline(always)]
    fn process_sample(&mut self, input: f32, cutoff_cv: f32, sample_rate_scale: f32) -> f32 {
        let cutoff_effective = clamp(
            self.cutoff_hz.next() * 2.0_f32.powf(cutoff_cv * self.cutoff_mod_amount_oct.next()),
            20.0,
            20000.0
        );
        let damping = clamp(1.0 - self.resonance.next(), 0.001, 1.0);
        let f = clamp(sample_rate_scale * cutoff_effective, 0.001, 0.99);
        let hp = input - self.lp - damping * self.bp;
        self.bp += f * hp;
        self.lp += f * self.bp;
        match self.filter_type {
            FilterType::Lowpass => self.lp,
            FilterType::Highpass => hp,
            FilterType::Bandpass => self.bp,
        }
    }
}

#[derive(Clone)]
pub(crate) struct Mixer4Node {
    out_index: usize,
    in1: i32,
    in2: i32,
    in3: i32,
    in4: i32,
    gain1: SmoothParam,
    gain2: SmoothParam,
    gain3: SmoothParam,
    gain4: SmoothParam,
}

#[derive(Clone)]
pub(crate) struct NoiseNode {
    out_index: usize,
    color: NoiseColor,
    gain: SmoothParam,
    pink: f32,
    brown: f32,
}

#[derive(Clone)]
pub(crate) struct SamplePlayerNode {
    out_index: usize,
    gate: i32,
    pitch: i32,
    mode: SamplePlayerMode,
    start_ratio: f32,
    end_ratio: f32,
    gain: SmoothParam,
    pitch_semis: SmoothParam,
    asset: Option<SampleAsset>,
    position: f32,
    active: bool,
    last_gate: f32,
}

#[derive(Clone)]
pub(crate) struct DelayNode {
    out_index: usize,
    input: i32,
    time_ms: SmoothParam,
    feedback: SmoothParam,
    mix: SmoothParam,
    buf: Vec<f32>,
    write: usize,
}

#[derive(Clone)]
pub(crate) struct ReverbNode {
    out_index: usize,
    input: i32,
    size: SmoothParam,
    decay: SmoothParam,
    damping: SmoothParam,
    mix: SmoothParam,
    c1: Vec<f32>,
    c2: Vec<f32>,
    i1: usize,
    i2: usize,
}

#[derive(Clone)]
pub(crate) struct SaturationNode {
    out_index: usize,
    input: i32,
    drive_db: SmoothParam,
    mix: SmoothParam,
    mode: SaturationType,
}

#[derive(Clone)]
pub(crate) struct OverdriveNode {
    out_index: usize,
    input: i32,
    drive_db: SmoothParam,
    tone: SmoothParam,
    mode: OverdriveMode,
    tone_lp: f32,
}

#[derive(Clone)]
pub(crate) struct CompressorNode {
    out_index: usize,
    input: i32,
    threshold_db: SmoothParam,
    ratio: SmoothParam,
    attack_ms: SmoothParam,
    release_ms: SmoothParam,
    makeup_db: SmoothParam,
    mix: SmoothParam,
    env: f32,
}

#[derive(Clone)]
pub(crate) struct OutputNode {
    out_index: usize,
    input: i32,
    gain_db: SmoothParam,
    limiter: bool,
}

#[derive(Clone)]
pub(crate) enum RuntimeNode {
    CVTranspose(CVTransposeNode),
    CVScaler(CVScalerNode),
    CVMixer2(CVMixer2Node),
    VCO(VcoNode),
    KarplusStrong(KarplusStrongNode),
    LFO(LfoNode),
    ADSR(AdsrNode),
    VCA(VcaNode),
    VCF(VcfNode),
    Mixer4(Mixer4Node),
    Noise(NoiseNode),
    SamplePlayer(SamplePlayerNode),
    Delay(DelayNode),
    Reverb(ReverbNode),
    Saturation(SaturationNode),
    Overdrive(OverdriveNode),
    Compressor(CompressorNode),
    Output(OutputNode),
}

impl RuntimeNode {
    /// Adds elapsed processing time into the profiling bucket for this node family.
    /// Params:
    /// - `profile`: aggregate profiling structure updated in place.
    /// - `elapsed_ms`: wall-clock time spent processing the current node invocation.
    pub(crate) fn add_profile_time(&self, profile: &mut EngineProfileStats, elapsed_ms: f64) {
        match self {
            Self::CVTranspose(_) => profile.nodes.cv_transpose_ms += elapsed_ms,
            Self::CVScaler(_) => profile.nodes.cv_scaler_ms += elapsed_ms,
            Self::CVMixer2(_) => profile.nodes.cv_mixer2_ms += elapsed_ms,
            Self::VCO(_) => profile.nodes.vco_ms += elapsed_ms,
            Self::KarplusStrong(_) => profile.nodes.karplus_strong_ms += elapsed_ms,
            Self::LFO(_) => profile.nodes.lfo_ms += elapsed_ms,
            Self::ADSR(_) => profile.nodes.adsr_ms += elapsed_ms,
            Self::VCA(_) => profile.nodes.vca_ms += elapsed_ms,
            Self::VCF(_) => profile.nodes.vcf_ms += elapsed_ms,
            Self::Mixer4(_) => profile.nodes.mixer4_ms += elapsed_ms,
            Self::Noise(_) => profile.nodes.noise_ms += elapsed_ms,
            Self::SamplePlayer(_) => profile.nodes.sample_player_ms += elapsed_ms,
            Self::Delay(_) => profile.nodes.delay_ms += elapsed_ms,
            Self::Reverb(_) => profile.nodes.reverb_ms += elapsed_ms,
            Self::Saturation(_) => profile.nodes.saturation_ms += elapsed_ms,
            Self::Overdrive(_) => profile.nodes.overdrive_ms += elapsed_ms,
            Self::Compressor(_) => profile.nodes.compressor_ms += elapsed_ms,
            Self::Output(_) => profile.nodes.output_ms += elapsed_ms,
        }
    }

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
                semitones: SmoothParam::new(value_to_f32(p.get("semitones"), 0.0), 10.0, sample_rate),
                cents: SmoothParam::new(value_to_f32(p.get("cents"), 0.0), 10.0, sample_rate),
            }),
            "CVScaler" => Self::CVScaler(CVScalerNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                scale: SmoothParam::new(value_to_f32(p.get("scale"), 1.0), 10.0, sample_rate),
            }),
            "CVMixer2" => Self::CVMixer2(CVMixer2Node {
                out_index: raw.out_index,
                in1: input_index(&raw.inputs, "in1"),
                in2: input_index(&raw.inputs, "in2"),
                gain1: SmoothParam::new(value_to_f32(p.get("gain1"), 1.0), 10.0, sample_rate),
                gain2: SmoothParam::new(value_to_f32(p.get("gain2"), 1.0), 10.0, sample_rate),
            }),
            "VCO" => Self::VCO(VcoNode {
                out_index: raw.out_index,
                pitch: input_index(&raw.inputs, "pitch"),
                fm: input_index(&raw.inputs, "fm"),
                pwm: input_index(&raw.inputs, "pwm"),
                wave: serde_json::from_value::<Wave>(Value::String(value_to_string(p.get("wave"), "sine")))
                    .map_err(|e| js_error(format!("Invalid VCO wave: {e}")))?,
                pulse_width: SmoothParam::new(value_to_f32(p.get("pulseWidth"), 0.5), 20.0, sample_rate),
                base_tune_cents: SmoothParam::new(value_to_f32(p.get("baseTuneCents"), 0.0), 10.0, sample_rate),
                fine_tune_cents: SmoothParam::new(value_to_f32(p.get("fineTuneCents"), 0.0), 10.0, sample_rate),
                pwm_amount: SmoothParam::new(value_to_f32(p.get("pwmAmount"), 0.0), 20.0, sample_rate),
                phase: 0.0,
            }),
            "KarplusStrong" => Self::KarplusStrong(KarplusStrongNode {
                out_index: raw.out_index,
                pitch: input_index(&raw.inputs, "pitch"),
                gate: input_index(&raw.inputs, "gate"),
                excite: input_index(&raw.inputs, "excite"),
                decay: SmoothParam::new(value_to_f32(p.get("decay"), 0.94), 20.0, sample_rate),
                damping: SmoothParam::new(value_to_f32(p.get("damping"), 0.28), 20.0, sample_rate),
                brightness: SmoothParam::new(value_to_f32(p.get("brightness"), 0.72), 20.0, sample_rate),
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
                wave: serde_json::from_value::<Wave>(Value::String(value_to_string(p.get("wave"), "sine")))
                    .map_err(|e| js_error(format!("Invalid LFO wave: {e}")))?,
                freq_hz: SmoothParam::new(value_to_f32(p.get("freqHz"), 1.0), 50.0, sample_rate),
                pulse_width: SmoothParam::new(value_to_f32(p.get("pulseWidth"), 0.5), 20.0, sample_rate),
                bipolar: value_to_bool(p.get("bipolar"), true),
                phase: 0.0,
            }),
            "ADSR" => Self::ADSR(AdsrNode {
                out_index: raw.out_index,
                gate: input_index(&raw.inputs, "gate"),
                attack: SmoothParam::new(value_ms_to_seconds(p.get("attack"), 10.0), 10.0, sample_rate),
                decay: SmoothParam::new(value_ms_to_seconds(p.get("decay"), 200.0), 10.0, sample_rate),
                sustain: SmoothParam::new(value_to_f32(p.get("sustain"), 0.7), 10.0, sample_rate),
                release: SmoothParam::new(value_ms_to_seconds(p.get("release"), 250.0), 10.0, sample_rate),
                curve: SmoothParam::new(value_to_f32(p.get("curve"), 0.0), 10.0, sample_rate),
                mode: serde_json::from_value::<AdsrMode>(Value::String(value_to_string(p.get("mode"), "retrigger_from_current")))
                    .map_err(|e| js_error(format!("Invalid ADSR mode: {e}")))?,
                stage: EnvelopeStage::Idle,
                stage_pos: 0.0,
                stage_start_level: 0.0,
                level: 0.0,
                last_gate: 0.0,
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
                filter_type: serde_json::from_value::<FilterType>(Value::String(value_to_string(p.get("type"), "lowpass")))
                    .map_err(|e| js_error(format!("Invalid VCF type: {e}")))?,
                cutoff_hz: SmoothParam::new(value_to_f32(p.get("cutoffHz"), 1000.0), 20.0, sample_rate),
                resonance: SmoothParam::new(value_to_f32(p.get("resonance"), 0.1), 10.0, sample_rate),
                cutoff_mod_amount_oct: SmoothParam::new(value_to_f32(p.get("cutoffModAmountOct"), 1.0), 10.0, sample_rate),
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
                color: serde_json::from_value::<NoiseColor>(Value::String(value_to_string(p.get("color"), "white")))
                    .map_err(|e| js_error(format!("Invalid Noise color: {e}")))?,
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 0.3), 10.0, sample_rate),
                pink: 0.0,
                brown: 0.0,
            }),
            "SamplePlayer" => Self::SamplePlayer(SamplePlayerNode {
                out_index: raw.out_index,
                gate: input_index(&raw.inputs, "gate"),
                pitch: input_index(&raw.inputs, "pitch"),
                mode: serde_json::from_value::<SamplePlayerMode>(Value::String(value_to_string(p.get("mode"), "oneshot")))
                    .map_err(|e| js_error(format!("Invalid SamplePlayer mode: {e}")))?,
                start_ratio: clamp(value_to_f32(p.get("start"), 0.0), 0.0, 1.0),
                end_ratio: clamp(value_to_f32(p.get("end"), 1.0), 0.0, 1.0),
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 1.0), 10.0, sample_rate),
                pitch_semis: SmoothParam::new(value_to_f32(p.get("pitchSemis"), 0.0), 10.0, sample_rate),
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
            "Reverb" => Self::Reverb(ReverbNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                size: SmoothParam::new(value_to_f32(p.get("size"), 0.5), 50.0, sample_rate),
                decay: SmoothParam::new(value_to_f32(p.get("decay"), 1.5), 50.0, sample_rate),
                damping: SmoothParam::new(value_to_f32(p.get("damping"), 0.4), 50.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.2), 10.0, sample_rate),
                c1: vec![0.0; (sample_rate * 0.029) as usize],
                c2: vec![0.0; (sample_rate * 0.041) as usize],
                i1: 0,
                i2: 0,
            }),
            "Saturation" => Self::Saturation(SaturationNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                drive_db: SmoothParam::new(value_to_f32(p.get("driveDb"), 6.0), 20.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.5), 10.0, sample_rate),
                mode: serde_json::from_value::<SaturationType>(Value::String(value_to_string(p.get("type"), "tanh")))
                    .map_err(|e| js_error(format!("Invalid Saturation type: {e}")))?,
            }),
            "Overdrive" => Self::Overdrive(OverdriveNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                drive_db: SmoothParam::new(value_to_f32(p.get("driveDb").or_else(|| p.get("gainDb")), 12.0), 20.0, sample_rate),
                tone: SmoothParam::new(value_to_f32(p.get("tone"), 0.5), 20.0, sample_rate),
                mode: serde_json::from_value::<OverdriveMode>(Value::String(value_to_string(p.get("mode"), "overdrive")))
                    .map_err(|e| js_error(format!("Invalid Overdrive mode: {e}")))?,
                tone_lp: 0.0,
            }),
            "Compressor" => Self::Compressor(CompressorNode {
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                threshold_db: SmoothParam::new(value_to_f32(p.get("thresholdDb"), -24.0), 50.0, sample_rate),
                ratio: SmoothParam::new(value_to_f32(p.get("ratio"), 4.0), 50.0, sample_rate),
                attack_ms: SmoothParam::new(value_to_f32(p.get("attackMs"), 10.0), 50.0, sample_rate),
                release_ms: SmoothParam::new(value_to_f32(p.get("releaseMs"), 200.0), 50.0, sample_rate),
                makeup_db: SmoothParam::new(value_to_f32(p.get("makeupDb"), 2.0), 50.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 1.0), 10.0, sample_rate),
                env: 0.0,
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

    /// Resets dynamic DSP state while preserving each node's current parameter targets.
    /// Params:
    /// - `self`: runtime node whose phase, buffers, or envelope state should be rewound.
    pub(crate) fn reset_dynamic_state(&mut self) {
        match self {
            Self::CVTranspose(node) => { node.octaves.reset(); node.semitones.reset(); node.cents.reset(); }
            Self::CVScaler(node) => node.scale.reset(),
            Self::CVMixer2(node) => { node.gain1.reset(); node.gain2.reset(); }
            Self::VCO(node) => { node.phase = 0.0; node.pulse_width.reset(); node.base_tune_cents.reset(); node.fine_tune_cents.reset(); node.pwm_amount.reset(); }
            Self::KarplusStrong(node) => {
                node.decay.reset(); node.damping.reset(); node.brightness.reset();
                node.buf.fill(0.0); node.write = 0; node.current_delay = 64; node.last = 0.0; node.last_gate = 0.0;
            }
            Self::LFO(node) => { node.phase = 0.0; node.freq_hz.reset(); node.pulse_width.reset(); }
            Self::ADSR(node) => {
                node.attack.reset(); node.decay.reset(); node.sustain.reset(); node.release.reset(); node.curve.reset();
                node.stage = EnvelopeStage::Idle; node.stage_pos = 0.0; node.stage_start_level = 0.0; node.level = 0.0; node.last_gate = 0.0;
            }
            Self::VCA(node) => { node.bias.reset(); node.gain.reset(); }
            Self::VCF(node) => { node.cutoff_hz.reset(); node.resonance.reset(); node.cutoff_mod_amount_oct.reset(); node.lp = 0.0; node.bp = 0.0; }
            Self::Mixer4(node) => { node.gain1.reset(); node.gain2.reset(); node.gain3.reset(); node.gain4.reset(); }
            Self::Noise(node) => { node.gain.reset(); node.pink = 0.0; node.brown = 0.0; }
            Self::SamplePlayer(node) => { node.gain.reset(); node.pitch_semis.reset(); node.position = 0.0; node.active = false; node.last_gate = 0.0; }
            Self::Delay(node) => { node.time_ms.reset(); node.feedback.reset(); node.mix.reset(); node.buf.fill(0.0); node.write = 0; }
            Self::Reverb(node) => { node.size.reset(); node.decay.reset(); node.damping.reset(); node.mix.reset(); node.c1.fill(0.0); node.c2.fill(0.0); node.i1 = 0; node.i2 = 0; }
            Self::Saturation(node) => { node.drive_db.reset(); node.mix.reset(); }
            Self::Overdrive(node) => { node.drive_db.reset(); node.tone.reset(); node.tone_lp = 0.0; }
            Self::Compressor(node) => { node.threshold_db.reset(); node.ratio.reset(); node.attack_ms.reset(); node.release_ms.reset(); node.makeup_db.reset(); node.mix.reset(); node.env = 0.0; }
            Self::Output(node) => node.gain_db.reset(),
        }
    }

    /// Applies a serialized parameter update to this runtime node.
    /// Params:
    /// - `param_id`: parameter name to update on the target node variant.
    /// - `value`: serialized parameter payload that will be parsed into the node's native type.
    pub(crate) fn set_param(&mut self, param_id: &str, value: &Value) {
        match self {
            Self::CVTranspose(node) => match param_id {
                "octaves" => node.octaves.set_target(value_to_f32(Some(value), node.octaves.target)),
                "semitones" => node.semitones.set_target(value_to_f32(Some(value), node.semitones.target)),
                "cents" => node.cents.set_target(value_to_f32(Some(value), node.cents.target)),
                _ => {}
            },
            Self::CVScaler(node) => if param_id == "scale" { node.scale.set_target(value_to_f32(Some(value), node.scale.target)); },
            Self::CVMixer2(node) => match param_id { "gain1" => node.gain1.set_target(value_to_f32(Some(value), node.gain1.target)), "gain2" => node.gain2.set_target(value_to_f32(Some(value), node.gain2.target)), _ => {} },
            Self::VCO(node) => match param_id {
                "wave" => if let Ok(parsed) = serde_json::from_value::<Wave>(Value::String(value_to_string(Some(value), "sine"))) { node.wave = parsed; },
                "pulseWidth" => node.pulse_width.set_target(value_to_f32(Some(value), node.pulse_width.target)),
                "baseTuneCents" => node.base_tune_cents.set_target(value_to_f32(Some(value), node.base_tune_cents.target)),
                "fineTuneCents" => node.fine_tune_cents.set_target(value_to_f32(Some(value), node.fine_tune_cents.target)),
                "pwmAmount" => node.pwm_amount.set_target(value_to_f32(Some(value), node.pwm_amount.target)),
                _ => {}
            },
            Self::KarplusStrong(node) => match param_id {
                "decay" => node.decay.set_target(value_to_f32(Some(value), node.decay.target)),
                "damping" => node.damping.set_target(value_to_f32(Some(value), node.damping.target)),
                "brightness" => node.brightness.set_target(value_to_f32(Some(value), node.brightness.target)),
                "excitation" => node.excitation = value_to_string(Some(value), &node.excitation),
                _ => {}
            },
            Self::LFO(node) => match param_id {
                "wave" => if let Ok(parsed) = serde_json::from_value::<Wave>(Value::String(value_to_string(Some(value), "sine"))) { node.wave = parsed; },
                "freqHz" => node.freq_hz.set_target(value_to_f32(Some(value), node.freq_hz.target)),
                "pulseWidth" => node.pulse_width.set_target(value_to_f32(Some(value), node.pulse_width.target)),
                "bipolar" => node.bipolar = value_to_bool(Some(value), node.bipolar),
                _ => {}
            },
            Self::ADSR(node) => match param_id {
                "attack" => node.attack.set_target(value_ms_to_seconds(Some(value), node.attack.target * 1000.0)),
                "decay" => node.decay.set_target(value_ms_to_seconds(Some(value), node.decay.target * 1000.0)),
                "sustain" => node.sustain.set_target(value_to_f32(Some(value), node.sustain.target)),
                "release" => node.release.set_target(value_ms_to_seconds(Some(value), node.release.target * 1000.0)),
                "curve" => node.curve.set_target(value_to_f32(Some(value), node.curve.target)),
                "mode" => if let Ok(parsed) = serde_json::from_value::<AdsrMode>(Value::String(value_to_string(Some(value), "retrigger_from_current"))) { node.mode = parsed; },
                _ => {}
            },
            Self::VCA(node) => match param_id { "bias" => node.bias.set_target(value_to_f32(Some(value), node.bias.target)), "gain" => node.gain.set_target(value_to_f32(Some(value), node.gain.target)), _ => {} },
            Self::VCF(node) => match param_id {
                "type" => if let Ok(parsed) = serde_json::from_value::<FilterType>(Value::String(value_to_string(Some(value), "lowpass"))) { node.filter_type = parsed; },
                "cutoffHz" => node.cutoff_hz.set_target(value_to_f32(Some(value), node.cutoff_hz.target)),
                "resonance" => node.resonance.set_target(value_to_f32(Some(value), node.resonance.target)),
                "cutoffModAmountOct" => node.cutoff_mod_amount_oct.set_target(value_to_f32(Some(value), node.cutoff_mod_amount_oct.target)),
                _ => {}
            },
            Self::Mixer4(node) => match param_id {
                "gain1" => node.gain1.set_target(value_to_f32(Some(value), node.gain1.target)),
                "gain2" => node.gain2.set_target(value_to_f32(Some(value), node.gain2.target)),
                "gain3" => node.gain3.set_target(value_to_f32(Some(value), node.gain3.target)),
                "gain4" => node.gain4.set_target(value_to_f32(Some(value), node.gain4.target)),
                _ => {}
            },
            Self::Noise(node) => match param_id {
                "color" => if let Ok(parsed) = serde_json::from_value::<NoiseColor>(Value::String(value_to_string(Some(value), "white"))) { node.color = parsed; },
                "gain" => node.gain.set_target(value_to_f32(Some(value), node.gain.target)),
                _ => {}
            },
            Self::SamplePlayer(node) => match param_id {
                "mode" => if let Ok(parsed) = serde_json::from_value::<SamplePlayerMode>(Value::String(value_to_string(Some(value), "oneshot"))) { node.mode = parsed; },
                "start" => node.start_ratio = clamp(value_to_f32(Some(value), node.start_ratio), 0.0, 1.0),
                "end" => node.end_ratio = clamp(value_to_f32(Some(value), node.end_ratio), 0.0, 1.0),
                "gain" => node.gain.set_target(value_to_f32(Some(value), node.gain.target)),
                "pitchSemis" => node.pitch_semis.set_target(value_to_f32(Some(value), node.pitch_semis.target)),
                "sampleData" => node.asset = parse_sample_asset(Some(value)),
                _ => {}
            },
            Self::Delay(node) => match param_id { "timeMs" => node.time_ms.set_target(value_to_f32(Some(value), node.time_ms.target)), "feedback" => node.feedback.set_target(value_to_f32(Some(value), node.feedback.target)), "mix" => node.mix.set_target(value_to_f32(Some(value), node.mix.target)), _ => {} },
            Self::Reverb(node) => match param_id { "size" => node.size.set_target(value_to_f32(Some(value), node.size.target)), "decay" => node.decay.set_target(value_to_f32(Some(value), node.decay.target)), "damping" => node.damping.set_target(value_to_f32(Some(value), node.damping.target)), "mix" => node.mix.set_target(value_to_f32(Some(value), node.mix.target)), _ => {} },
            Self::Saturation(node) => match param_id { "driveDb" => node.drive_db.set_target(value_to_f32(Some(value), node.drive_db.target)), "mix" => node.mix.set_target(value_to_f32(Some(value), node.mix.target)), "type" => if let Ok(parsed) = serde_json::from_value::<SaturationType>(Value::String(value_to_string(Some(value), "tanh"))) { node.mode = parsed; }, _ => {} },
            Self::Overdrive(node) => match param_id { "driveDb" | "gainDb" => node.drive_db.set_target(value_to_f32(Some(value), node.drive_db.target)), "tone" => node.tone.set_target(value_to_f32(Some(value), node.tone.target)), "mode" => if let Ok(parsed) = serde_json::from_value::<OverdriveMode>(Value::String(value_to_string(Some(value), "overdrive"))) { node.mode = parsed; }, _ => {} },
            Self::Compressor(node) => match param_id { "thresholdDb" => node.threshold_db.set_target(value_to_f32(Some(value), node.threshold_db.target)), "ratio" => node.ratio.set_target(value_to_f32(Some(value), node.ratio.target)), "attackMs" => node.attack_ms.set_target(value_to_f32(Some(value), node.attack_ms.target)), "releaseMs" => node.release_ms.set_target(value_to_f32(Some(value), node.release_ms.target)), "makeupDb" => node.makeup_db.set_target(value_to_f32(Some(value), node.makeup_db.target)), "mix" => node.mix.set_target(value_to_f32(Some(value), node.mix.target)), _ => {} },
            Self::Output(node) => match param_id { "gainDb" => node.gain_db.set_target(value_to_f32(Some(value), node.gain_db.target)), "limiter" => node.limiter = value_to_bool(Some(value), node.limiter), _ => {} },
        }
    }

    /// Processes one contiguous frame range for the current node.
    /// Params:
    /// - `signal_buffers`: signal-major block buffer holding host inputs plus upstream node outputs.
    /// - `block_size`: number of frames in each signal buffer.
    /// - `start_frame`: inclusive frame index to process.
    /// - `end_frame`: exclusive frame index to process.
    /// - `host`: resolved indices for host-driven pitch, gate, velocity, and mod-wheel signals.
    /// - `sample_rate`: global sample rate for time-based calculations.
    /// - `rng_state`: mutable RNG seed shared by stochastic nodes on the current voice.
    pub(crate) fn process_frame_range(
        &mut self,
        signal_buffers: &mut [f32],
        block_size: usize,
        start_frame: usize,
        end_frame: usize,
        host: &HostSignalIndices,
        sample_rate: f32,
        rng_state: &mut u32
    ) {
        match self {
            Self::VCO(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let pitch_start = input_start(node.pitch, block_size);
                let fm_start = input_start(node.fm, block_size);
                let pwm_start = input_start(node.pwm, block_size);
                let host_pitch_start = signal_start(host.pitch, block_size);
                let sample_rate_inv = 1.0 / sample_rate as f64;

                for frame in start_frame..end_frame {
                    let pitch = pitch_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(signal_buffers[host_pitch_start + frame]);
                    let fm = fm_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let pwm = pwm_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let pulse_width = clamp(node.pulse_width.next() + node.pwm_amount.next() * pwm, 0.05, 0.95);
                    let tune_voct = (node.base_tune_cents.next() + node.fine_tune_cents.next()) / 1200.0;
                    let hz = voct_to_hz(pitch + fm + tune_voct) as f64;
                    node.phase = (node.phase + hz * sample_rate_inv) % 1.0;
                    signal_buffers[out_start + frame] = waveform_sample(node.wave, node.phase as f32, pulse_width);
                }
            }
            Self::LFO(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let fm_start = input_start(node.fm, block_size);
                let sample_rate_inv = 1.0 / sample_rate as f64;

                for frame in start_frame..end_frame {
                    let fm = fm_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let freq = clamp(node.freq_hz.next() * 2.0_f32.powf(fm), 0.01, 40.0) as f64;
                    let pulse_width = node.pulse_width.next();
                    node.phase = (node.phase + freq * sample_rate_inv) % 1.0;
                    let mut sample = waveform_sample(node.wave, node.phase as f32, pulse_width);
                    if !node.bipolar {
                        sample = sample * 0.5 + 0.5;
                    }
                    signal_buffers[out_start + frame] = sample;
                }
            }
            Self::ADSR(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let gate_start = input_start(node.gate, block_size);
                let host_gate_start = signal_start(host.gate, block_size);

                for frame in start_frame..end_frame {
                    let gate = gate_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(signal_buffers[host_gate_start + frame]);
                    let attack = node.attack.next().max(0.0001);
                    let decay = node.decay.next().max(0.0001);
                    let sustain = clamp(node.sustain.next(), 0.0, 1.0);
                    let release = node.release.next().max(0.0001);
                    let curve = node.curve.next();
                    if gate >= 0.5 && node.last_gate < 0.5 {
                        if matches!(node.mode, AdsrMode::RetriggerFromZero) {
                            node.level = 0.0;
                        }
                        node.stage_pos = 0.0;
                        node.stage_start_level = node.level;
                        node.stage = EnvelopeStage::Attack;
                    } else if gate < 0.5 && node.last_gate >= 0.5 {
                        node.stage_pos = 0.0;
                        node.stage_start_level = node.level;
                        node.stage = EnvelopeStage::Release;
                    }
                    match node.stage {
                        EnvelopeStage::Attack => {
                            let progress = envelope_curve_progress(advance_adsr_stage_pos(node, attack, sample_rate), curve);
                            node.level = node.stage_start_level + (1.0 - node.stage_start_level) * progress;
                            if node.stage_pos >= 1.0 {
                                node.level = 1.0;
                                node.stage_pos = 0.0;
                                node.stage_start_level = 1.0;
                                node.stage = EnvelopeStage::Decay;
                            }
                        }
                        EnvelopeStage::Decay => {
                            let progress = envelope_curve_progress(advance_adsr_stage_pos(node, decay, sample_rate), curve);
                            node.level = 1.0 - (1.0 - sustain) * progress;
                            if node.stage_pos >= 1.0 {
                                node.level = sustain;
                                node.stage = EnvelopeStage::Sustain;
                            }
                        }
                        EnvelopeStage::Sustain => node.level = sustain,
                        EnvelopeStage::Release => {
                            let progress = envelope_curve_progress(advance_adsr_stage_pos(node, release, sample_rate), curve);
                            node.level = node.stage_start_level * (1.0 - progress);
                            if node.stage_pos >= 1.0 || node.level <= 0.0001 {
                                node.level = 0.0;
                                node.stage = EnvelopeStage::Idle;
                            }
                        }
                        EnvelopeStage::Idle => {}
                    }
                    node.last_gate = gate;
                    signal_buffers[out_start + frame] = clamp(node.level, 0.0, 1.0);
                }
            }
            Self::VCA(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_buffer_start = input_start(node.input, block_size);
                let gain_cv_start = input_start(node.gain_cv, block_size);

                for frame in start_frame..end_frame {
                    let input = input_buffer_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let gain_cv = gain_cv_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let gain_cv_norm = if (0.0..=1.0).contains(&gain_cv) { gain_cv } else { gain_cv * 0.5 + 0.5 };
                    let gain_eff = clamp(node.bias.next() + node.gain.next() * gain_cv_norm, 0.0, 1.0);
                    signal_buffers[out_start + frame] = input * gain_eff;
                }
            }
            Self::VCF(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_buffer_start = input_start(node.input, block_size);
                let cutoff_cv_start = input_start(node.cutoff_cv, block_size);
                let sample_rate_scale = (2.0 * std::f32::consts::PI) / sample_rate;

                for frame in start_frame..end_frame {
                    let input = input_buffer_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let cutoff_cv = cutoff_cv_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    signal_buffers[out_start + frame] = node.process_sample(input, cutoff_cv, sample_rate_scale);
                }
            }
            Self::Mixer4(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let in1_start = input_start(node.in1, block_size);
                let in2_start = input_start(node.in2, block_size);
                let in3_start = input_start(node.in3, block_size);
                let in4_start = input_start(node.in4, block_size);

                for frame in start_frame..end_frame {
                    signal_buffers[out_start + frame] =
                        in1_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0) * node.gain1.next()
                        + in2_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0) * node.gain2.next()
                        + in3_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0) * node.gain3.next()
                        + in4_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0) * node.gain4.next();
                }
            }
            Self::Noise(node) => {
                let out_start = signal_start(node.out_index, block_size);
                for frame in start_frame..end_frame {
                    let white = next_noise(rng_state);
                    let sample = match node.color {
                        NoiseColor::White => white,
                        NoiseColor::Pink => {
                            node.pink = 0.98 * node.pink + 0.02 * white;
                            node.pink
                        }
                        NoiseColor::Brown => {
                            node.brown = clamp(node.brown + white * 0.02, -1.0, 1.0);
                            node.brown
                        }
                    };
                    signal_buffers[out_start + frame] = sample * node.gain.next();
                }
            }
            Self::Saturation(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_start = input_start(node.input, block_size);

                for frame in start_frame..end_frame {
                    let input = input_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let driven = input * db_to_gain(node.drive_db.next());
                    let wet = match node.mode {
                        SaturationType::Tanh => driven.tanh(),
                        SaturationType::Softclip => crate::softclip_sample(driven, 1.0),
                    };
                    let mix = clamp(node.mix.next(), 0.0, 1.0);
                    signal_buffers[out_start + frame] = input * (1.0 - mix) + wet * mix;
                }
            }
            Self::Overdrive(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_start = input_start(node.input, block_size);

                for frame in start_frame..end_frame {
                    let input = input_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                    let drive_db = node.drive_db.next();
                    let drive_amount = overdrive_drive_amount(drive_db);
                    let mut driven = input * db_to_gain(drive_db);
                    driven = match node.mode {
                        OverdriveMode::Fuzz => shape_fuzz_sample(driven),
                        OverdriveMode::Overdrive => shape_overdrive_sample(driven),
                    };
                    let tone = node.tone.next();
                    let tone_alpha = overdrive_tone_alpha(tone);
                    node.tone_lp = node.tone_lp + (driven - node.tone_lp) * tone_alpha;
                    let toned = apply_overdrive_tone(driven, node.tone_lp, tone);
                    signal_buffers[out_start + frame] = input * (1.0 - drive_amount) + toned * drive_amount;
                }
            }
            Self::Output(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_start = input_start(node.input, block_size);

                if node.limiter {
                    for frame in start_frame..end_frame {
                        let input = input_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                        signal_buffers[out_start + frame] = (input * db_to_gain(node.gain_db.next())).tanh();
                    }
                } else {
                    for frame in start_frame..end_frame {
                        let input = input_start.map(|start| signal_buffers[start + frame]).unwrap_or(0.0);
                        signal_buffers[out_start + frame] = input * db_to_gain(node.gain_db.next());
                    }
                }
            }
            _ => {
                for frame in start_frame..end_frame {
                    self.process_frame(signal_buffers, block_size, frame, host, sample_rate, rng_state);
                }
            }
        }
    }

    /// Processes one sample frame for the current node and writes the result into its output signal slot.
    /// Params:
    /// - `signal_buffers`: signal-major block buffer holding host inputs plus upstream node outputs.
    /// - `block_size`: number of frames in each signal buffer.
    /// - `frame`: frame index inside the current block.
    /// - `host`: resolved indices for host-driven pitch, gate, velocity, and mod-wheel signals.
    /// - `sample_rate`: global sample rate for time-based calculations.
    /// - `rng_state`: mutable RNG seed shared by stochastic nodes on the current voice.
    fn process_frame(
        &mut self,
        signal_buffers: &mut [f32],
        block_size: usize,
        frame: usize,
        host: &HostSignalIndices,
        sample_rate: f32,
        rng_state: &mut u32
    ) {
        match self {
            Self::CVTranspose(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input + node.octaves.next() + node.semitones.next() / 12.0 + node.cents.next() / 1200.0;
            }
            Self::CVScaler(node) => {
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0) * node.scale.next();
            }
            Self::CVMixer2(node) => {
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = read_input_frame(signal_buffers, block_size, frame, node.in1, 0.0) * node.gain1.next()
                    + read_input_frame(signal_buffers, block_size, frame, node.in2, 0.0) * node.gain2.next();
            }
            Self::VCO(node) => {
                let pitch = if node.pitch >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.pitch, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.pitch, 0.0)
                };
                let fm = read_input_frame(signal_buffers, block_size, frame, node.fm, 0.0);
                let pwm = read_input_frame(signal_buffers, block_size, frame, node.pwm, 0.0);
                let pulse_width = clamp(node.pulse_width.next() + node.pwm_amount.next() * pwm, 0.05, 0.95);
                let tune_voct = (node.base_tune_cents.next() + node.fine_tune_cents.next()) / 1200.0;
                let hz = voct_to_hz(pitch + fm + tune_voct) as f64;
                node.phase = (node.phase + hz / sample_rate as f64) % 1.0;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = waveform_sample(node.wave, node.phase as f32, pulse_width);
            }
            Self::KarplusStrong(node) => {
                let pitch = if node.pitch >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.pitch, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.pitch, 0.0)
                };
                let gate = if node.gate >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.gate, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.gate, 0.0)
                };
                let excite = read_input_frame(signal_buffers, block_size, frame, node.excite, 0.0);
                let hz = clamp(voct_to_hz(pitch), 20.0, sample_rate * 0.45);
                let delay_samples = clamp((sample_rate / hz).floor(), 2.0, (node.buf.len() - 1) as f32) as usize;
                if gate >= 0.5 && node.last_gate < 0.5 {
                    node.current_delay = delay_samples;
                    let buf_len = node.buf.len();
                    let excite_start = (node.write + buf_len - delay_samples) % buf_len;
                    for j in 0..delay_samples {
                        let mut source = excite;
                        if source == 0.0 {
                            source = if node.excitation == "impulse" { if j == 0 { 1.0 } else { 0.0 } } else { next_noise(rng_state) };
                        }
                        let bright = node.brightness.next();
                        let shaped = source * (0.25 + bright * 0.75);
                        node.buf[(excite_start + j) % buf_len] = shaped;
                    }
                }
                let read_idx = (node.write + node.buf.len() - node.current_delay) % node.buf.len();
                let delayed = node.buf[read_idx];
                let decay = clamp(node.decay.next(), 0.7, 0.999);
                let damping = clamp(node.damping.next(), 0.0, 1.0);
                let filtered = delayed * (1.0 - damping) + node.last * damping;
                node.last = filtered;
                node.buf[node.write] = filtered * decay;
                node.write = (node.write + 1) % node.buf.len();
                node.last_gate = gate;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = delayed;
            }
            Self::LFO(node) => {
                let fm = read_input_frame(signal_buffers, block_size, frame, node.fm, 0.0);
                let freq = clamp(node.freq_hz.next() * 2.0_f32.powf(fm), 0.01, 40.0) as f64;
                let pulse_width = node.pulse_width.next();
                node.phase = (node.phase + freq / sample_rate as f64) % 1.0;
                let mut sample = waveform_sample(node.wave, node.phase as f32, pulse_width);
                if !node.bipolar {
                    sample = sample * 0.5 + 0.5;
                }
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = sample;
            }
            Self::ADSR(node) => {
                let gate = if node.gate >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.gate, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.gate, 0.0)
                };
                let attack = node.attack.next().max(0.0001);
                let decay = node.decay.next().max(0.0001);
                let sustain = clamp(node.sustain.next(), 0.0, 1.0);
                let release = node.release.next().max(0.0001);
                let curve = node.curve.next();
                if gate >= 0.5 && node.last_gate < 0.5 {
                    if matches!(node.mode, AdsrMode::RetriggerFromZero) {
                        node.level = 0.0;
                    }
                    node.stage_pos = 0.0;
                    node.stage_start_level = node.level;
                    node.stage = EnvelopeStage::Attack;
                } else if gate < 0.5 && node.last_gate >= 0.5 {
                    node.stage_pos = 0.0;
                    node.stage_start_level = node.level;
                    node.stage = EnvelopeStage::Release;
                }
                match node.stage {
                    EnvelopeStage::Attack => {
                        let progress = envelope_curve_progress(advance_adsr_stage_pos(node, attack, sample_rate), curve);
                        node.level = node.stage_start_level + (1.0 - node.stage_start_level) * progress;
                        if node.stage_pos >= 1.0 { node.level = 1.0; node.stage_pos = 0.0; node.stage_start_level = 1.0; node.stage = EnvelopeStage::Decay; }
                    }
                    EnvelopeStage::Decay => {
                        let progress = envelope_curve_progress(advance_adsr_stage_pos(node, decay, sample_rate), curve);
                        node.level = 1.0 - (1.0 - sustain) * progress;
                        if node.stage_pos >= 1.0 { node.level = sustain; node.stage = EnvelopeStage::Sustain; }
                    }
                    EnvelopeStage::Sustain => node.level = sustain,
                    EnvelopeStage::Release => {
                        let progress = envelope_curve_progress(advance_adsr_stage_pos(node, release, sample_rate), curve);
                        node.level = node.stage_start_level * (1.0 - progress);
                        if node.stage_pos >= 1.0 || node.level <= 0.0001 { node.level = 0.0; node.stage = EnvelopeStage::Idle; }
                    }
                    EnvelopeStage::Idle => {}
                }
                node.last_gate = gate;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = clamp(node.level, 0.0, 1.0);
            }
            Self::VCA(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let gain_cv = read_input_frame(signal_buffers, block_size, frame, node.gain_cv, 0.0);
                let gain_cv_norm = if (0.0..=1.0).contains(&gain_cv) { gain_cv } else { gain_cv * 0.5 + 0.5 };
                let gain_eff = clamp(node.bias.next() + node.gain.next() * gain_cv_norm, 0.0, 1.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * gain_eff;
            }
            Self::VCF(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let cutoff_cv = read_input_frame(signal_buffers, block_size, frame, node.cutoff_cv, 0.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = node.process_sample(input, cutoff_cv, (2.0 * std::f32::consts::PI) / sample_rate);
            }
            Self::Mixer4(node) => {
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = read_input_frame(signal_buffers, block_size, frame, node.in1, 0.0) * node.gain1.next()
                    + read_input_frame(signal_buffers, block_size, frame, node.in2, 0.0) * node.gain2.next()
                    + read_input_frame(signal_buffers, block_size, frame, node.in3, 0.0) * node.gain3.next()
                    + read_input_frame(signal_buffers, block_size, frame, node.in4, 0.0) * node.gain4.next();
            }
            Self::Noise(node) => {
                let white = next_noise(rng_state);
                let sample = match node.color {
                    NoiseColor::White => white,
                    NoiseColor::Pink => { node.pink = 0.98 * node.pink + 0.02 * white; node.pink }
                    NoiseColor::Brown => { node.brown = clamp(node.brown + white * 0.02, -1.0, 1.0); node.brown }
                };
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = sample * node.gain.next();
            }
            Self::SamplePlayer(node) => {
                let gate = if node.gate >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.gate, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.gate, 0.0)
                };
                let pitch = if node.pitch >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.pitch, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.pitch, 0.0)
                };
                let out = frame_signal_offset(node.out_index, block_size, frame);
                let Some(asset) = &node.asset else { signal_buffers[out] = 0.0; return; };
                if asset.samples.is_empty() { signal_buffers[out] = 0.0; return; }
                let start_sample = clamp((node.start_ratio * asset.samples.len() as f32).floor(), 0.0, (asset.samples.len() - 1) as f32) as usize;
                let end_sample = clamp((node.end_ratio * asset.samples.len() as f32).ceil(), (start_sample + 1) as f32, asset.samples.len() as f32) as usize;
                let rising_edge = gate >= 0.5 && node.last_gate < 0.5;
                if rising_edge { node.position = start_sample as f32; node.active = true; }
                node.last_gate = gate;
                if matches!(node.mode, SamplePlayerMode::Loop) && gate < 0.5 { node.active = false; }
                if !node.active { signal_buffers[out] = 0.0; return; }
                if node.position >= end_sample as f32 {
                    if matches!(node.mode, SamplePlayerMode::Loop) && gate >= 0.5 {
                        node.position = start_sample as f32 + (node.position - start_sample as f32) % ((end_sample - start_sample).max(1) as f32);
                    } else {
                        node.active = false;
                        signal_buffers[out] = 0.0;
                        return;
                    }
                }
                let sample_index = clamp(node.position, start_sample as f32, (end_sample - 1) as f32);
                let base_index = sample_index.floor() as usize;
                let next_index = (base_index + 1).min(end_sample - 1);
                let frac = sample_index - base_index as f32;
                let current_sample = *asset.samples.get(base_index).unwrap_or(&0.0);
                let next_sample = *asset.samples.get(next_index).unwrap_or(&current_sample);
                signal_buffers[out] = (current_sample + (next_sample - current_sample) * frac) * node.gain.next();
                let pitch_factor = 2.0_f32.powf(pitch + node.pitch_semis.next() / 12.0);
                node.position += pitch_factor * asset.sample_rate / sample_rate;
            }
            Self::Delay(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let delay_samples = clamp(((node.time_ms.next() / 1000.0) * sample_rate).floor(), 1.0, (node.buf.len() - 1) as f32) as usize;
                let read_idx = (node.write + node.buf.len() - delay_samples) % node.buf.len();
                let delayed = node.buf[read_idx];
                let feedback = clamp(node.feedback.next(), 0.0, 0.95);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                node.buf[node.write] = input + delayed * feedback;
                node.write = (node.write + 1) % node.buf.len();
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + delayed * mix;
            }
            Self::Reverb(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let size = node.size.next();
                let decay = node.decay.next();
                let damping = node.damping.next();
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                let fb = clamp(0.2 + size * 0.7, 0.0, 0.95) * clamp(decay / 10.0, 0.0, 1.0);
                let c1 = node.c1[node.i1];
                let c2 = node.c2[node.i2];
                node.c1[node.i1] = input + (c1 * fb - c1 * damping * 0.05);
                node.c2[node.i2] = input + (c2 * fb - c2 * damping * 0.05);
                node.i1 = (node.i1 + 1) % node.c1.len();
                node.i2 = (node.i2 + 1) % node.c2.len();
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + ((c1 + c2) * 0.5) * mix;
            }
            Self::Saturation(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let driven = input * db_to_gain(node.drive_db.next());
                let wet = match node.mode {
                    SaturationType::Tanh => driven.tanh(),
                    SaturationType::Softclip => crate::softclip_sample(driven, 1.0),
                };
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + wet * mix;
            }
            Self::Overdrive(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let drive_db = node.drive_db.next();
                let drive_amount = overdrive_drive_amount(drive_db);
                let mut driven = input * db_to_gain(drive_db);
                driven = match node.mode {
                    OverdriveMode::Fuzz => shape_fuzz_sample(driven),
                    OverdriveMode::Overdrive => shape_overdrive_sample(driven),
                };
                let tone = node.tone.next();
                let tone_alpha = overdrive_tone_alpha(tone);
                node.tone_lp = node.tone_lp + (driven - node.tone_lp) * tone_alpha;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                let toned = apply_overdrive_tone(driven, node.tone_lp, tone);
                signal_buffers[out] = input * (1.0 - drive_amount) + toned * drive_amount;
            }
            Self::Compressor(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let abs_in = input.abs();
                let att = crate::smoothing_alpha(node.attack_ms.next().max(0.1), sample_rate);
                let rel = crate::smoothing_alpha(node.release_ms.next().max(1.0), sample_rate);
                node.env = if abs_in > node.env { one_pole_step(node.env, abs_in, att) } else { one_pole_step(node.env, abs_in, rel) };
                let threshold_db = node.threshold_db.next();
                let ratio = node.ratio.next();
                let level_db = 20.0 * node.env.max(0.00001).log10();
                let over = (level_db - threshold_db).max(0.0);
                let reduced_db = over - over / ratio.max(1.0);
                let wet = input * db_to_gain(node.makeup_db.next() - reduced_db);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + wet * mix;
            }
            Self::Output(node) => {
                let mut sample = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0) * db_to_gain(node.gain_db.next());
                if node.limiter { sample = sample.tanh(); }
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = sample;
            }
        }
    }
}

#[inline(always)]
fn frame_signal_offset(signal_index: usize, block_size: usize, frame: usize) -> usize {
    signal_index * block_size + frame
}

#[inline(always)]
fn read_signal_frame(signal_buffers: &[f32], block_size: usize, frame: usize, signal_index: usize, fallback: f32) -> f32 {
    *signal_buffers.get(frame_signal_offset(signal_index, block_size, frame)).unwrap_or(&fallback)
}

#[inline(always)]
fn read_input_frame(signal_buffers: &[f32], block_size: usize, frame: usize, index: i32, fallback: f32) -> f32 {
    if index >= 0 {
        *signal_buffers
            .get(frame_signal_offset(index as usize, block_size, frame))
            .unwrap_or(&fallback)
    } else {
        fallback
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_overdrive_tone, overdrive_drive_amount, overdrive_tone_alpha, shape_fuzz_sample, shape_overdrive_sample};

    #[test]
    fn fuzz_shaper_is_harder_and_asymmetric() {
        assert!(shape_fuzz_sample(0.5) > shape_overdrive_sample(0.5));
        assert!(shape_fuzz_sample(-0.5).abs() > shape_overdrive_sample(-0.5).abs());
        assert!(shape_fuzz_sample(-0.5).abs() > shape_fuzz_sample(0.5).abs() * 0.95);
        assert_eq!(shape_fuzz_sample(0.0), 0.0);
    }

    #[test]
    fn tone_alpha_reaches_a_brighter_range() {
        assert!(overdrive_tone_alpha(0.0) < 0.05);
        assert!(overdrive_tone_alpha(1.0) > 0.7);
    }

    #[test]
    fn tone_blend_leaves_bright_setting_unchanged() {
        assert_eq!(apply_overdrive_tone(0.5, 0.1, 1.0), 0.5);
        assert!(apply_overdrive_tone(0.5, 0.1, 0.0) < 0.2);
    }

    #[test]
    fn drive_amount_starts_at_identity() {
        assert_eq!(overdrive_drive_amount(0.0), 0.0);
        assert_eq!(overdrive_drive_amount(50.0), 1.0);
    }
}

/// Parses the serialized embedded sample payload used by `SamplePlayer`.
/// Params:
/// - `value`: optional JSON string containing versioned sample metadata and PCM values.
fn parse_sample_asset(value: Option<&Value>) -> Option<SampleAsset> {
    let raw = value?.as_str()?;
    if raw.is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(raw).ok()?;
    if parsed.get("version")?.as_i64()? != 1 {
        return None;
    }
    let sample_rate = parsed.get("sampleRate")?.as_f64()? as f32;
    let samples = parsed
        .get("samples")?
        .as_array()?
        .iter()
        .map(|sample| sample.as_f64().unwrap_or(0.0) as f32)
        .collect::<Vec<_>>();
    Some(SampleAsset { sample_rate, samples })
}

#[inline(always)]
fn next_noise(rng_state: &mut u32) -> f32 {
    *rng_state = rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
    let normalized = ((*rng_state >> 8) as f32) / ((1u32 << 24) - 1) as f32;
    normalized * 2.0 - 1.0
}
