use crate::{
    clamp, db_to_gain, one_pole_step, voct_to_hz, waveform_sample, AdsrMode, EngineProfileStats,
    FilterType, HostSignalIndices, NoiseColor, OverdriveMode, ReverbMode, SampleAsset,
    SamplePlayerMode, SaturationType, SmoothParam, Wave,
};
use serde_json::Value;
use std::collections::HashMap;

mod control;
mod factory;
mod formulas;
mod process;
mod reverb;
mod sample_asset;

use reverb::ReverbDelayLineBank;

fn value_to_f32(value: Option<&Value>, fallback: f32) -> f32 {
    value
        .and_then(|entry| entry.as_f64())
        .map(|entry| entry as f32)
        .unwrap_or(fallback)
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

fn input_index(inputs: &HashMap<String, i32>, key: &str) -> i32 {
    *inputs.get(key).unwrap_or(&-1)
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
    cached_curve: f32,
    cached_curve_exponent: f32,
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
            20000.0,
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
    mode: ReverbMode,
    decay: SmoothParam,
    tone: SmoothParam,
    mix: SmoothParam,
    bank: ReverbDelayLineBank,
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
    squash: SmoothParam,
    attack_ms: SmoothParam,
    mix: SmoothParam,
    env: f32,
    rms_energy: f32,
    gain_reduction_db: f32,
    makeup_gain_db: f32,
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
