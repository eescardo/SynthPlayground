use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn softclip_sample(x: f32, drive: f32) -> f32 {
    let driven = x * drive.max(0.0);
    let clipped = driven.clamp(-1.5, 1.5);
    clipped - (clipped * clipped * clipped) / 3.0
}

#[wasm_bindgen]
pub fn one_pole_step(current: f32, target: f32, alpha: f32) -> f32 {
    current + (target - current) * (1.0 - alpha)
}

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

fn now_ms() -> f64 {
    js_sys::Date::now()
}

fn clamp(x: f32, min: f32, max: f32) -> f32 {
    x.max(min).min(max)
}

fn db_to_gain(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

fn smoothing_alpha(time_ms: f32, sample_rate: f32) -> f32 {
    if time_ms <= 0.0 {
        return 0.0;
    }
    let tau_samples = (time_ms / 1000.0) * sample_rate;
    (-1.0 / tau_samples.max(1.0)).exp()
}

fn voct_to_hz(voct: f32) -> f32 {
    261.625565_f32 * 2.0_f32.powf(voct)
}

fn waveform_sample(wave: Wave, phase: f32, pulse_width: f32) -> f32 {
    match wave {
        Wave::Sine => (phase * std::f32::consts::PI * 2.0).sin(),
        Wave::Triangle => {
            let t = (phase + 0.25) % 1.0;
            1.0 - 4.0 * ((t - 0.25).round() - (t - 0.25)).abs()
        }
        Wave::Saw => 2.0 * phase - 1.0,
        Wave::Square => {
            if phase < pulse_width {
                1.0
            } else {
                -1.0
            }
        }
    }
}

#[derive(Clone, Copy)]
struct SmoothParam {
    current: f32,
    target: f32,
    alpha: f32,
}

impl SmoothParam {
    fn new(target: f32, smoothing_ms: f32, sample_rate: f32) -> Self {
        Self {
            current: target,
            target,
            alpha: smoothing_alpha(smoothing_ms, sample_rate),
        }
    }

    fn next(&mut self) -> f32 {
        if self.alpha <= 0.0 {
            self.current = self.target;
        } else {
            self.current = one_pole_step(self.current, self.target, self.alpha);
        }
        self.current
    }

    fn reset(&mut self) {
        self.current = self.target;
    }

    fn set_target(&mut self, target: f32) {
        self.target = target;
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Wave {
    Sine,
    Triangle,
    Saw,
    Square,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum AdsrMode {
    RetriggerFromZero,
    RetriggerFromCurrent,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FilterType {
    Lowpass,
    Highpass,
    Bandpass,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum NoiseColor {
    White,
    Pink,
    Brown,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SaturationType {
    Tanh,
    Softclip,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum OverdriveMode {
    Overdrive,
    Fuzz,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum SamplePlayerMode {
    Oneshot,
    Loop,
}

#[derive(Clone)]
struct SampleAsset {
    sample_rate: f32,
    samples: Vec<f32>,
}

#[derive(Clone, Deserialize)]
struct HostSignalIndices {
    pitch: usize,
    gate: usize,
    velocity: usize,
    #[serde(rename = "modWheel")]
    mod_wheel: usize,
}

#[derive(Clone, Deserialize)]
struct TrackFxSpec {
    #[serde(rename = "delayEnabled")]
    delay_enabled: bool,
    #[serde(rename = "reverbEnabled")]
    reverb_enabled: bool,
    #[serde(rename = "saturationEnabled")]
    saturation_enabled: bool,
    #[serde(rename = "compressorEnabled")]
    compressor_enabled: bool,
    #[serde(rename = "delayMix")]
    delay_mix: f32,
    #[serde(rename = "reverbMix")]
    reverb_mix: f32,
    drive: f32,
    compression: f32,
}

#[derive(Clone, Deserialize)]
struct MasterFxSpec {
    #[serde(rename = "compressorEnabled")]
    compressor_enabled: bool,
    #[serde(rename = "limiterEnabled")]
    limiter_enabled: bool,
    #[serde(rename = "makeupGain")]
    makeup_gain: f32,
}

#[derive(Default, Serialize, Clone)]
struct NodeProfileStats {
    cv_transpose_ms: f64,
    cv_scaler_ms: f64,
    cv_mixer2_ms: f64,
    vco_ms: f64,
    karplus_strong_ms: f64,
    lfo_ms: f64,
    adsr_ms: f64,
    vca_ms: f64,
    vcf_ms: f64,
    mixer4_ms: f64,
    noise_ms: f64,
    sample_player_ms: f64,
    delay_ms: f64,
    reverb_ms: f64,
    saturation_ms: f64,
    overdrive_ms: f64,
    compressor_ms: f64,
    output_ms: f64,
}

#[derive(Default, Serialize, Clone)]
struct EngineProfileStats {
    process_block_ms: f64,
    consume_due_events_ms: f64,
    apply_event_ms: f64,
    render_tracks_ms: f64,
    render_track_sample_ms: f64,
    render_dry_sample_ms: f64,
    apply_track_fx_ms: f64,
    apply_master_fx_ms: f64,
    node_process_ms: f64,
    blocks_processed: u64,
    samples_processed: u64,
    events_applied: u64,
    track_samples_rendered: u64,
    node_samples_processed: u64,
    nodes: NodeProfileStats,
}

#[derive(Clone, Deserialize)]
struct NodeSpecRaw {
    id: String,
    #[serde(rename = "typeId")]
    type_id: String,
    #[serde(rename = "outIndex")]
    out_index: usize,
    inputs: HashMap<String, i32>,
    params: HashMap<String, Value>,
}

#[derive(Clone, Deserialize)]
struct TrackSpec {
    #[serde(rename = "trackIndex")]
    track_index: usize,
    #[serde(rename = "trackId")]
    track_id: String,
    volume: f32,
    mute: bool,
    fx: TrackFxSpec,
    #[serde(rename = "signalCount")]
    signal_count: usize,
    #[serde(rename = "hostSignalIndices")]
    host_signal_indices: HostSignalIndices,
    #[serde(rename = "outputSignalIndex")]
    output_signal_index: usize,
    nodes: Vec<NodeSpecRaw>,
}

#[derive(Clone, Deserialize)]
struct ProjectSpec {
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    #[serde(rename = "blockSize")]
    block_size: usize,
    tracks: Vec<TrackSpec>,
    #[serde(rename = "masterFx")]
    master_fx: MasterFxSpec,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "type")]
enum EventSpec {
    NoteOn {
        #[serde(rename = "sampleTime")]
        sample_time: u32,
        #[serde(rename = "trackIndex")]
        track_index: usize,
        #[serde(rename = "noteId")]
        note_id: String,
        #[serde(rename = "pitchVoct")]
        pitch_voct: f32,
        velocity: f32,
    },
    NoteOff {
        #[serde(rename = "sampleTime")]
        sample_time: u32,
        #[serde(rename = "trackIndex")]
        track_index: usize,
        #[serde(rename = "noteId")]
        note_id: String,
        #[serde(rename = "pitchVoct")]
        pitch_voct: f32,
    },
    ParamChange {
        #[serde(rename = "sampleTime")]
        sample_time: u32,
        #[serde(rename = "trackIndex")]
        track_index: usize,
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "paramId")]
        param_id: String,
        value: Value,
    },
    TrackVolumeChange {
        #[serde(rename = "sampleTime")]
        sample_time: u32,
        #[serde(rename = "trackIndex")]
        track_index: usize,
        value: f32,
    },
}

impl EventSpec {
    fn sample_time(&self) -> u32 {
        match self {
            EventSpec::NoteOn { sample_time, .. }
            | EventSpec::NoteOff { sample_time, .. }
            | EventSpec::ParamChange { sample_time, .. }
            | EventSpec::TrackVolumeChange { sample_time, .. } => *sample_time,
        }
    }

    fn type_priority(&self) -> u8 {
        match self {
            EventSpec::NoteOff { .. } => 0,
            EventSpec::ParamChange { .. } | EventSpec::TrackVolumeChange { .. } => 1,
            EventSpec::NoteOn { .. } => 3,
        }
    }

    fn sort_key(&self) -> String {
        match self {
            EventSpec::NoteOn { track_index, note_id, .. } | EventSpec::NoteOff { track_index, note_id, .. } => {
                format!("{}:{}", track_index, note_id)
            }
            EventSpec::ParamChange {
                track_index,
                node_id,
                param_id,
                ..
            } => format!("{}:{}:{}", track_index, node_id, param_id),
            EventSpec::TrackVolumeChange { track_index, .. } => format!("{}:volume", track_index),
        }
    }
}

fn sort_events(events: &mut [EventSpec]) {
    events.sort_by(|left, right| {
        left.sample_time()
            .cmp(&right.sample_time())
            .then_with(|| left.type_priority().cmp(&right.type_priority()))
            .then_with(|| left.sort_key().cmp(&right.sort_key()))
            .then(Ordering::Equal)
    });
}

fn value_to_f32(value: Option<&Value>, fallback: f32) -> f32 {
    value.and_then(|entry| entry.as_f64()).map(|entry| entry as f32).unwrap_or(fallback)
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
struct CVTransposeNode {
    id: String,
    out_index: usize,
    input: i32,
    octaves: SmoothParam,
    semitones: SmoothParam,
    cents: SmoothParam,
}

#[derive(Clone)]
struct CVScalerNode {
    id: String,
    out_index: usize,
    input: i32,
    scale: SmoothParam,
}

#[derive(Clone)]
struct CVMixer2Node {
    id: String,
    out_index: usize,
    in1: i32,
    in2: i32,
    gain1: SmoothParam,
    gain2: SmoothParam,
}

#[derive(Clone)]
struct VcoNode {
    id: String,
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
struct KarplusStrongNode {
    id: String,
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
struct LfoNode {
    id: String,
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
struct AdsrNode {
    id: String,
    out_index: usize,
    gate: i32,
    attack: SmoothParam,
    decay: SmoothParam,
    sustain: SmoothParam,
    release: SmoothParam,
    mode: AdsrMode,
    stage: EnvelopeStage,
    level: f32,
    last_gate: f32,
}

#[derive(Clone)]
struct VcaNode {
    id: String,
    out_index: usize,
    input: i32,
    gain_cv: i32,
    bias: SmoothParam,
    gain: SmoothParam,
}

#[derive(Clone)]
struct VcfNode {
    id: String,
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

#[derive(Clone)]
struct Mixer4Node {
    id: String,
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
struct NoiseNode {
    id: String,
    out_index: usize,
    color: NoiseColor,
    gain: SmoothParam,
    pink: f32,
    brown: f32,
}

#[derive(Clone)]
struct SamplePlayerNode {
    id: String,
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
struct DelayNode {
    id: String,
    out_index: usize,
    input: i32,
    time_ms: SmoothParam,
    feedback: SmoothParam,
    mix: SmoothParam,
    buf: Vec<f32>,
    write: usize,
}

#[derive(Clone)]
struct ReverbNode {
    id: String,
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
struct SaturationNode {
    id: String,
    out_index: usize,
    input: i32,
    drive_db: SmoothParam,
    mix: SmoothParam,
    mode: SaturationType,
}

#[derive(Clone)]
struct OverdriveNode {
    id: String,
    out_index: usize,
    input: i32,
    gain_db: SmoothParam,
    tone: SmoothParam,
    mix: SmoothParam,
    mode: OverdriveMode,
    tone_lp: f32,
}

#[derive(Clone)]
struct CompressorNode {
    id: String,
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
struct OutputNode {
    id: String,
    out_index: usize,
    input: i32,
    gain_db: SmoothParam,
    limiter: bool,
}

#[derive(Clone)]
enum RuntimeNode {
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

#[derive(Clone)]
struct TrackFxState {
    delay_buf: Vec<f32>,
    delay_write: usize,
    reverb_comb1: Vec<f32>,
    reverb_comb2: Vec<f32>,
    reverb_idx1: usize,
    reverb_idx2: usize,
    compressor_env: f32,
}

#[derive(Clone)]
struct TrackRuntime {
    track_index: usize,
    track_id: String,
    mute: bool,
    volume: f32,
    fx: TrackFxSpec,
    host_signal_indices: HostSignalIndices,
    output_signal_index: usize,
    signal_values: Vec<f32>,
    node_templates: Vec<RuntimeNode>,
    nodes: Vec<RuntimeNode>,
    node_index_by_id: HashMap<String, usize>,
    active: bool,
    note_id: Option<String>,
    rms: f32,
    host_pitch_voct: f32,
    host_gate: f32,
    host_velocity: f32,
    host_modwheel: f32,
    fx_state: TrackFxState,
    base_random_seed: u32,
    rng_state: u32,
    note_trigger_count: u32,
}

impl TrackRuntime {
    fn from_spec(spec: TrackSpec, sample_rate: f32, random_seed: u32) -> Result<Self, JsValue> {
        let node_templates = spec
            .nodes
            .iter()
            .map(|node| RuntimeNode::from_raw(node, sample_rate))
            .collect::<Result<Vec<_>, _>>()?;
        let node_index_by_id = spec
            .nodes
            .iter()
            .enumerate()
            .map(|(index, node)| (node.id.clone(), index))
            .collect();
        Ok(Self {
            track_index: spec.track_index,
            track_id: spec.track_id,
            mute: spec.mute,
            volume: spec.volume,
            fx: spec.fx,
            host_signal_indices: spec.host_signal_indices,
            output_signal_index: spec.output_signal_index,
            signal_values: vec![0.0; spec.signal_count.max(1)],
            nodes: node_templates.clone(),
            node_templates,
            node_index_by_id,
            active: false,
            note_id: None,
            rms: 0.0,
            host_pitch_voct: 0.0,
            host_gate: 0.0,
            host_velocity: 0.0,
            host_modwheel: 0.0,
            fx_state: TrackFxState {
                delay_buf: vec![0.0; (sample_rate as usize) * 3],
                delay_write: 0,
                reverb_comb1: vec![0.0; (sample_rate * 0.031) as usize],
                reverb_comb2: vec![0.0; (sample_rate * 0.047) as usize],
                reverb_idx1: 0,
                reverb_idx2: 0,
                compressor_env: 0.0,
            },
            base_random_seed: random_seed.wrapping_add(spec.track_index as u32),
            rng_state: random_seed.wrapping_add(spec.track_index as u32),
            note_trigger_count: 0,
        })
    }

    fn reset_nodes_for_note_on(&mut self) {
        self.nodes = self.node_templates.clone();
        for node in self.nodes.iter_mut() {
            node.reset_dynamic_state();
        }
    }

    fn note_on(&mut self, note_id: String, pitch_voct: f32, velocity: f32) {
        self.active = true;
        self.note_id = Some(note_id);
        self.rms = 0.0;
        self.host_pitch_voct = pitch_voct;
        self.host_velocity = velocity;
        self.host_gate = 1.0;
        self.rng_state = self.base_random_seed.wrapping_add(self.note_trigger_count.wrapping_mul(0x9e37_79b9));
        self.note_trigger_count = self.note_trigger_count.wrapping_add(1);
        self.reset_nodes_for_note_on();
    }

    fn note_off(&mut self, note_id: &str) {
        if self.active && (self.note_id.as_deref() == Some(note_id) || self.note_id.is_none()) {
            self.host_gate = 0.0;
        }
    }

    fn apply_param_change(&mut self, node_id: &str, param_id: &str, value: &Value) {
        if let Some(index) = self.node_index_by_id.get(node_id).copied() {
            if let Some(node) = self.node_templates.get_mut(index) {
                node.set_param(param_id, value);
            }
            if let Some(node) = self.nodes.get_mut(index) {
                node.set_param(param_id, value);
            }
        }
    }

    fn render_track_sample(&mut self, sample_rate: f32, profile: &mut EngineProfileStats, profiling_enabled: bool) -> f32 {
        let dry = if profiling_enabled {
            let started = now_ms();
            let dry = self.render_dry_sample(sample_rate, profile, true);
            profile.render_dry_sample_ms += now_ms() - started;
            dry
        } else {
            self.render_dry_sample(sample_rate, profile, false)
        };
        let processed = if profiling_enabled {
            let started = now_ms();
            let processed = self.apply_track_fx(dry, sample_rate);
            profile.apply_track_fx_ms += now_ms() - started;
            processed
        } else {
            self.apply_track_fx(dry, sample_rate)
        };
        if self.mute {
            return 0.0;
        }
        processed * self.volume
    }

    fn render_dry_sample(&mut self, sample_rate: f32, profile: &mut EngineProfileStats, profiling_enabled: bool) -> f32 {
        if !self.active {
            return 0.0;
        }

        self.signal_values[self.host_signal_indices.pitch] = self.host_pitch_voct;
        self.signal_values[self.host_signal_indices.gate] = self.host_gate;
        self.signal_values[self.host_signal_indices.velocity] = self.host_velocity;
        self.signal_values[self.host_signal_indices.mod_wheel] = self.host_modwheel;

        let mut rng_state = self.rng_state;
        let host_indices = self.host_signal_indices.clone();
        for node in self.nodes.iter_mut() {
            if profiling_enabled {
                let started = now_ms();
                node.process_sample(&mut self.signal_values, &host_indices, sample_rate, &mut rng_state);
                let elapsed = now_ms() - started;
                profile.node_process_ms += elapsed;
                profile.node_samples_processed = profile.node_samples_processed.saturating_add(1);
                node.add_profile_time(profile, elapsed);
            } else {
                node.process_sample(&mut self.signal_values, &host_indices, sample_rate, &mut rng_state);
            }
        }
        self.rng_state = rng_state;

        let sample = *self.signal_values.get(self.output_signal_index).unwrap_or(&0.0);
        if !sample.is_finite() {
            self.active = false;
            self.note_id = None;
            self.host_gate = 0.0;
            self.rms = 0.0;
            return 0.0;
        }
        self.rms = self.rms * 0.995 + sample.abs() * 0.005;
        if self.host_gate < 0.5 && self.rms < 0.0005 {
            self.active = false;
            self.note_id = None;
        }
        sample
    }

    fn apply_track_fx(&mut self, input: f32, sample_rate: f32) -> f32 {
        let fx = &self.fx;
        let state = &mut self.fx_state;
        let mut out = input;

        if fx.delay_enabled {
            let time_samples = clamp((sample_rate * 0.24).floor(), 1.0, (state.delay_buf.len() - 1) as f32) as usize;
            let read_idx = (state.delay_write + state.delay_buf.len() - time_samples) % state.delay_buf.len();
            let delayed = state.delay_buf[read_idx];
            state.delay_buf[state.delay_write] = out + delayed * 0.35;
            state.delay_write = (state.delay_write + 1) % state.delay_buf.len();
            let mix = clamp(fx.delay_mix, 0.0, 1.0);
            out = out * (1.0 - mix) + delayed * mix;
        }

        if fx.reverb_enabled {
            let c1 = state.reverb_comb1[state.reverb_idx1];
            let c2 = state.reverb_comb2[state.reverb_idx2];
            state.reverb_comb1[state.reverb_idx1] = out + c1 * 0.45;
            state.reverb_comb2[state.reverb_idx2] = out + c2 * 0.35;
            state.reverb_idx1 = (state.reverb_idx1 + 1) % state.reverb_comb1.len();
            state.reverb_idx2 = (state.reverb_idx2 + 1) % state.reverb_comb2.len();
            let wet = (c1 + c2) * 0.5;
            let mix = clamp(fx.reverb_mix, 0.0, 1.0);
            out = out * (1.0 - mix) + wet * mix;
        }

        if fx.saturation_enabled {
            let drive = 1.0 + fx.drive * 5.0;
            out = (out * drive).tanh();
        }

        if fx.compressor_enabled {
            let c = clamp(fx.compression, 0.0, 1.0);
            let abs_in = out.abs();
            state.compressor_env = state.compressor_env * 0.995 + abs_in * 0.005;
            let over = (state.compressor_env - 0.2).max(0.0);
            let gain = 1.0 / (1.0 + over * c * 6.0);
            out *= gain;
        }

        if out.is_finite() { out } else { 0.0 }
    }
}

impl RuntimeNode {
    fn add_profile_time(&self, profile: &mut EngineProfileStats, elapsed_ms: f64) {
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

    fn from_raw(raw: &NodeSpecRaw, sample_rate: f32) -> Result<Self, JsValue> {
        let p = &raw.params;
        Ok(match raw.type_id.as_str() {
            "CVTranspose" => Self::CVTranspose(CVTransposeNode {
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                octaves: SmoothParam::new(value_to_f32(p.get("octaves"), 0.0), 10.0, sample_rate),
                semitones: SmoothParam::new(value_to_f32(p.get("semitones"), 0.0), 10.0, sample_rate),
                cents: SmoothParam::new(value_to_f32(p.get("cents"), 0.0), 10.0, sample_rate),
            }),
            "CVScaler" => Self::CVScaler(CVScalerNode {
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                scale: SmoothParam::new(value_to_f32(p.get("scale"), 1.0), 10.0, sample_rate),
            }),
            "CVMixer2" => Self::CVMixer2(CVMixer2Node {
                id: raw.id.clone(),
                out_index: raw.out_index,
                in1: input_index(&raw.inputs, "in1"),
                in2: input_index(&raw.inputs, "in2"),
                gain1: SmoothParam::new(value_to_f32(p.get("gain1"), 1.0), 10.0, sample_rate),
                gain2: SmoothParam::new(value_to_f32(p.get("gain2"), 1.0), 10.0, sample_rate),
            }),
            "VCO" => Self::VCO(VcoNode {
                id: raw.id.clone(),
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
                id: raw.id.clone(),
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
                id: raw.id.clone(),
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
                id: raw.id.clone(),
                out_index: raw.out_index,
                gate: input_index(&raw.inputs, "gate"),
                attack: SmoothParam::new(value_to_f32(p.get("attack"), 0.01), 10.0, sample_rate),
                decay: SmoothParam::new(value_to_f32(p.get("decay"), 0.2), 10.0, sample_rate),
                sustain: SmoothParam::new(value_to_f32(p.get("sustain"), 0.7), 10.0, sample_rate),
                release: SmoothParam::new(value_to_f32(p.get("release"), 0.2), 10.0, sample_rate),
                mode: serde_json::from_value::<AdsrMode>(Value::String(value_to_string(p.get("mode"), "retrigger_from_current")))
                    .map_err(|e| js_error(format!("Invalid ADSR mode: {e}")))?,
                stage: EnvelopeStage::Idle,
                level: 0.0,
                last_gate: 0.0,
            }),
            "VCA" => Self::VCA(VcaNode {
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                gain_cv: input_index(&raw.inputs, "gainCV"),
                bias: SmoothParam::new(value_to_f32(p.get("bias"), 0.0), 10.0, sample_rate),
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 1.0), 10.0, sample_rate),
            }),
            "VCF" => Self::VCF(VcfNode {
                id: raw.id.clone(),
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
                id: raw.id.clone(),
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
                id: raw.id.clone(),
                out_index: raw.out_index,
                color: serde_json::from_value::<NoiseColor>(Value::String(value_to_string(p.get("color"), "white")))
                    .map_err(|e| js_error(format!("Invalid Noise color: {e}")))?,
                gain: SmoothParam::new(value_to_f32(p.get("gain"), 0.3), 10.0, sample_rate),
                pink: 0.0,
                brown: 0.0,
            }),
            "SamplePlayer" => Self::SamplePlayer(SamplePlayerNode {
                id: raw.id.clone(),
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
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                time_ms: SmoothParam::new(value_to_f32(p.get("timeMs"), 300.0), 30.0, sample_rate),
                feedback: SmoothParam::new(value_to_f32(p.get("feedback"), 0.3), 30.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.2), 10.0, sample_rate),
                buf: vec![0.0; (sample_rate as usize) * 2],
                write: 0,
            }),
            "Reverb" => Self::Reverb(ReverbNode {
                id: raw.id.clone(),
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
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                drive_db: SmoothParam::new(value_to_f32(p.get("driveDb"), 6.0), 20.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.5), 10.0, sample_rate),
                mode: serde_json::from_value::<SaturationType>(Value::String(value_to_string(p.get("type"), "tanh")))
                    .map_err(|e| js_error(format!("Invalid Saturation type: {e}")))?,
            }),
            "Overdrive" => Self::Overdrive(OverdriveNode {
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                gain_db: SmoothParam::new(value_to_f32(p.get("gainDb"), 12.0), 20.0, sample_rate),
                tone: SmoothParam::new(value_to_f32(p.get("tone"), 0.5), 20.0, sample_rate),
                mix: SmoothParam::new(value_to_f32(p.get("mix"), 0.6), 10.0, sample_rate),
                mode: serde_json::from_value::<OverdriveMode>(Value::String(value_to_string(p.get("mode"), "overdrive")))
                    .map_err(|e| js_error(format!("Invalid Overdrive mode: {e}")))?,
                tone_lp: 0.0,
            }),
            "Compressor" => Self::Compressor(CompressorNode {
                id: raw.id.clone(),
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
                id: raw.id.clone(),
                out_index: raw.out_index,
                input: input_index(&raw.inputs, "in"),
                gain_db: SmoothParam::new(value_to_f32(p.get("gainDb"), -6.0), 30.0, sample_rate),
                limiter: value_to_bool(p.get("limiter"), true),
            }),
            other => return Err(js_error(format!("Unsupported node type: {other}"))),
        })
    }

    fn reset_dynamic_state(&mut self) {
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
                node.attack.reset(); node.decay.reset(); node.sustain.reset(); node.release.reset();
                node.stage = EnvelopeStage::Idle; node.level = 0.0; node.last_gate = 0.0;
            }
            Self::VCA(node) => { node.bias.reset(); node.gain.reset(); }
            Self::VCF(node) => { node.cutoff_hz.reset(); node.resonance.reset(); node.cutoff_mod_amount_oct.reset(); node.lp = 0.0; node.bp = 0.0; }
            Self::Mixer4(node) => { node.gain1.reset(); node.gain2.reset(); node.gain3.reset(); node.gain4.reset(); }
            Self::Noise(node) => { node.gain.reset(); node.pink = 0.0; node.brown = 0.0; }
            Self::SamplePlayer(node) => { node.gain.reset(); node.pitch_semis.reset(); node.position = 0.0; node.active = false; node.last_gate = 0.0; }
            Self::Delay(node) => { node.time_ms.reset(); node.feedback.reset(); node.mix.reset(); node.buf.fill(0.0); node.write = 0; }
            Self::Reverb(node) => { node.size.reset(); node.decay.reset(); node.damping.reset(); node.mix.reset(); node.c1.fill(0.0); node.c2.fill(0.0); node.i1 = 0; node.i2 = 0; }
            Self::Saturation(node) => { node.drive_db.reset(); node.mix.reset(); }
            Self::Overdrive(node) => { node.gain_db.reset(); node.tone.reset(); node.mix.reset(); node.tone_lp = 0.0; }
            Self::Compressor(node) => { node.threshold_db.reset(); node.ratio.reset(); node.attack_ms.reset(); node.release_ms.reset(); node.makeup_db.reset(); node.mix.reset(); node.env = 0.0; }
            Self::Output(node) => node.gain_db.reset(),
        }
    }

    fn set_param(&mut self, param_id: &str, value: &Value) {
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
                "attack" => node.attack.set_target(value_to_f32(Some(value), node.attack.target)),
                "decay" => node.decay.set_target(value_to_f32(Some(value), node.decay.target)),
                "sustain" => node.sustain.set_target(value_to_f32(Some(value), node.sustain.target)),
                "release" => node.release.set_target(value_to_f32(Some(value), node.release.target)),
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
            Self::Overdrive(node) => match param_id { "gainDb" => node.gain_db.set_target(value_to_f32(Some(value), node.gain_db.target)), "tone" => node.tone.set_target(value_to_f32(Some(value), node.tone.target)), "mix" => node.mix.set_target(value_to_f32(Some(value), node.mix.target)), "mode" => if let Ok(parsed) = serde_json::from_value::<OverdriveMode>(Value::String(value_to_string(Some(value), "overdrive"))) { node.mode = parsed; }, _ => {} },
            Self::Compressor(node) => match param_id { "thresholdDb" => node.threshold_db.set_target(value_to_f32(Some(value), node.threshold_db.target)), "ratio" => node.ratio.set_target(value_to_f32(Some(value), node.ratio.target)), "attackMs" => node.attack_ms.set_target(value_to_f32(Some(value), node.attack_ms.target)), "releaseMs" => node.release_ms.set_target(value_to_f32(Some(value), node.release_ms.target)), "makeupDb" => node.makeup_db.set_target(value_to_f32(Some(value), node.makeup_db.target)), "mix" => node.mix.set_target(value_to_f32(Some(value), node.mix.target)), _ => {} },
            Self::Output(node) => match param_id { "gainDb" => node.gain_db.set_target(value_to_f32(Some(value), node.gain_db.target)), "limiter" => node.limiter = value_to_bool(Some(value), node.limiter), _ => {} },
        }
    }

    fn process_sample(&mut self, signals: &mut [f32], host: &HostSignalIndices, sample_rate: f32, rng_state: &mut u32) {
        match self {
            Self::CVTranspose(node) => {
                let input = read_input(signals, node.input, 0.0);
                signals[node.out_index] = input + node.octaves.next() + node.semitones.next() / 12.0 + node.cents.next() / 1200.0;
            }
            Self::CVScaler(node) => {
                signals[node.out_index] = read_input(signals, node.input, 0.0) * node.scale.next();
            }
            Self::CVMixer2(node) => {
                signals[node.out_index] = read_input(signals, node.in1, 0.0) * node.gain1.next()
                    + read_input(signals, node.in2, 0.0) * node.gain2.next();
            }
            Self::VCO(node) => {
                let pitch = if node.pitch >= 0 { read_input(signals, node.pitch, 0.0) } else { signals[host.pitch] };
                let fm = read_input(signals, node.fm, 0.0);
                let pwm = read_input(signals, node.pwm, 0.0);
                let pulse_width = clamp(node.pulse_width.next() + node.pwm_amount.next() * pwm, 0.05, 0.95);
                let tune_voct = (node.base_tune_cents.next() + node.fine_tune_cents.next()) / 1200.0;
                let hz = voct_to_hz(pitch + fm + tune_voct) as f64;
                node.phase = (node.phase + hz / sample_rate as f64) % 1.0;
                signals[node.out_index] = waveform_sample(node.wave, node.phase as f32, pulse_width);
            }
            Self::KarplusStrong(node) => {
                let pitch = if node.pitch >= 0 { read_input(signals, node.pitch, 0.0) } else { signals[host.pitch] };
                let gate = if node.gate >= 0 { read_input(signals, node.gate, 0.0) } else { signals[host.gate] };
                let excite = read_input(signals, node.excite, 0.0);
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
                signals[node.out_index] = delayed;
            }
            Self::LFO(node) => {
                let fm = read_input(signals, node.fm, 0.0);
                let freq = clamp(node.freq_hz.next() * 2.0_f32.powf(fm), 0.01, 40.0) as f64;
                let pulse_width = node.pulse_width.next();
                node.phase = (node.phase + freq / sample_rate as f64) % 1.0;
                let mut sample = waveform_sample(node.wave, node.phase as f32, pulse_width);
                if !node.bipolar {
                    sample = sample * 0.5 + 0.5;
                }
                signals[node.out_index] = sample;
            }
            Self::ADSR(node) => {
                let gate = if node.gate >= 0 { read_input(signals, node.gate, 0.0) } else { signals[host.gate] };
                let attack = node.attack.next().max(0.0001);
                let decay = node.decay.next().max(0.0001);
                let sustain = clamp(node.sustain.next(), 0.0, 1.0);
                let release = node.release.next().max(0.0001);
                if gate >= 0.5 && node.last_gate < 0.5 {
                    if matches!(node.mode, AdsrMode::RetriggerFromZero) {
                        node.level = 0.0;
                    }
                    node.stage = EnvelopeStage::Attack;
                } else if gate < 0.5 && node.last_gate >= 0.5 {
                    node.stage = EnvelopeStage::Release;
                }
                match node.stage {
                    EnvelopeStage::Attack => {
                        node.level += 1.0 / (attack * sample_rate);
                        if node.level >= 1.0 { node.level = 1.0; node.stage = EnvelopeStage::Decay; }
                    }
                    EnvelopeStage::Decay => {
                        node.level -= (1.0 - sustain) / (decay * sample_rate);
                        if node.level <= sustain { node.level = sustain; node.stage = EnvelopeStage::Sustain; }
                    }
                    EnvelopeStage::Sustain => node.level = sustain,
                    EnvelopeStage::Release => {
                        node.level -= node.level.max(0.001) / (release * sample_rate);
                        if node.level <= 0.0001 { node.level = 0.0; node.stage = EnvelopeStage::Idle; }
                    }
                    EnvelopeStage::Idle => {}
                }
                node.last_gate = gate;
                signals[node.out_index] = clamp(node.level, 0.0, 1.0);
            }
            Self::VCA(node) => {
                let input = read_input(signals, node.input, 0.0);
                let gain_cv = read_input(signals, node.gain_cv, 0.0);
                let gain_cv_norm = if (0.0..=1.0).contains(&gain_cv) { gain_cv } else { gain_cv * 0.5 + 0.5 };
                let gain_eff = clamp(node.bias.next() + node.gain.next() * gain_cv_norm, 0.0, 1.0);
                signals[node.out_index] = input * gain_eff;
            }
            Self::VCF(node) => {
                let input = read_input(signals, node.input, 0.0);
                let cutoff_cv = read_input(signals, node.cutoff_cv, 0.0);
                let cutoff_effective = clamp(node.cutoff_hz.next() * 2.0_f32.powf(cutoff_cv * node.cutoff_mod_amount_oct.next()), 20.0, 20000.0);
                let resonance = clamp(node.resonance.next(), 0.0, 1.0);
                let f = clamp((2.0 * std::f32::consts::PI * cutoff_effective) / sample_rate, 0.001, 0.99);
                let hp = input - node.lp - resonance * node.bp;
                node.bp += f * hp;
                node.lp += f * node.bp;
                signals[node.out_index] = match node.filter_type { FilterType::Lowpass => node.lp, FilterType::Highpass => hp, FilterType::Bandpass => node.bp };
            }
            Self::Mixer4(node) => {
                signals[node.out_index] = read_input(signals, node.in1, 0.0) * node.gain1.next()
                    + read_input(signals, node.in2, 0.0) * node.gain2.next()
                    + read_input(signals, node.in3, 0.0) * node.gain3.next()
                    + read_input(signals, node.in4, 0.0) * node.gain4.next();
            }
            Self::Noise(node) => {
                let white = next_noise(rng_state);
                let sample = match node.color {
                    NoiseColor::White => white,
                    NoiseColor::Pink => { node.pink = 0.98 * node.pink + 0.02 * white; node.pink }
                    NoiseColor::Brown => { node.brown = clamp(node.brown + white * 0.02, -1.0, 1.0); node.brown }
                };
                signals[node.out_index] = sample * node.gain.next();
            }
            Self::SamplePlayer(node) => {
                let gate = if node.gate >= 0 { read_input(signals, node.gate, 0.0) } else { signals[host.gate] };
                let pitch = if node.pitch >= 0 { read_input(signals, node.pitch, 0.0) } else { signals[host.pitch] };
                let Some(asset) = &node.asset else { signals[node.out_index] = 0.0; return; };
                if asset.samples.is_empty() { signals[node.out_index] = 0.0; return; }
                let start_sample = clamp((node.start_ratio * asset.samples.len() as f32).floor(), 0.0, (asset.samples.len() - 1) as f32) as usize;
                let end_sample = clamp((node.end_ratio * asset.samples.len() as f32).ceil(), (start_sample + 1) as f32, asset.samples.len() as f32) as usize;
                let rising_edge = gate >= 0.5 && node.last_gate < 0.5;
                if rising_edge { node.position = start_sample as f32; node.active = true; }
                node.last_gate = gate;
                if matches!(node.mode, SamplePlayerMode::Loop) && gate < 0.5 { node.active = false; }
                if !node.active { signals[node.out_index] = 0.0; return; }
                if node.position >= end_sample as f32 {
                    if matches!(node.mode, SamplePlayerMode::Loop) && gate >= 0.5 {
                        node.position = start_sample as f32 + (node.position - start_sample as f32) % ((end_sample - start_sample).max(1) as f32);
                    } else {
                        node.active = false;
                        signals[node.out_index] = 0.0;
                        return;
                    }
                }
                let sample_index = clamp(node.position, start_sample as f32, (end_sample - 1) as f32);
                let base_index = sample_index.floor() as usize;
                let next_index = (base_index + 1).min(end_sample - 1);
                let frac = sample_index - base_index as f32;
                let current_sample = *asset.samples.get(base_index).unwrap_or(&0.0);
                let next_sample = *asset.samples.get(next_index).unwrap_or(&current_sample);
                signals[node.out_index] = (current_sample + (next_sample - current_sample) * frac) * node.gain.next();
                let pitch_factor = 2.0_f32.powf(pitch + node.pitch_semis.next() / 12.0);
                node.position += pitch_factor * asset.sample_rate / sample_rate;
            }
            Self::Delay(node) => {
                let input = read_input(signals, node.input, 0.0);
                let delay_samples = clamp(((node.time_ms.next() / 1000.0) * sample_rate).floor(), 1.0, (node.buf.len() - 1) as f32) as usize;
                let read_idx = (node.write + node.buf.len() - delay_samples) % node.buf.len();
                let delayed = node.buf[read_idx];
                let feedback = clamp(node.feedback.next(), 0.0, 0.95);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                node.buf[node.write] = input + delayed * feedback;
                node.write = (node.write + 1) % node.buf.len();
                signals[node.out_index] = input * (1.0 - mix) + delayed * mix;
            }
            Self::Reverb(node) => {
                let input = read_input(signals, node.input, 0.0);
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
                signals[node.out_index] = input * (1.0 - mix) + ((c1 + c2) * 0.5) * mix;
            }
            Self::Saturation(node) => {
                let input = read_input(signals, node.input, 0.0);
                let driven = input * db_to_gain(node.drive_db.next());
                let wet = match node.mode {
                    SaturationType::Tanh => driven.tanh(),
                    SaturationType::Softclip => softclip_sample(driven, 1.0),
                };
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                signals[node.out_index] = input * (1.0 - mix) + wet * mix;
            }
            Self::Overdrive(node) => {
                let input = read_input(signals, node.input, 0.0);
                let mut driven = input * db_to_gain(node.gain_db.next());
                driven = match node.mode {
                    OverdriveMode::Fuzz => clamp(driven, -1.0, 1.0).signum() * clamp(driven, -1.0, 1.0).abs().sqrt(),
                    OverdriveMode::Overdrive => driven.tanh(),
                };
                let tone_alpha = clamp(0.01 + node.tone.next() * 0.2, 0.01, 0.3);
                node.tone_lp = node.tone_lp + (driven - node.tone_lp) * tone_alpha;
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                signals[node.out_index] = input * (1.0 - mix) + node.tone_lp * mix;
            }
            Self::Compressor(node) => {
                let input = read_input(signals, node.input, 0.0);
                let abs_in = input.abs();
                let att = smoothing_alpha(node.attack_ms.next().max(0.1), sample_rate);
                let rel = smoothing_alpha(node.release_ms.next().max(1.0), sample_rate);
                node.env = if abs_in > node.env { one_pole_step(node.env, abs_in, att) } else { one_pole_step(node.env, abs_in, rel) };
                let threshold_db = node.threshold_db.next();
                let ratio = node.ratio.next();
                let level_db = 20.0 * node.env.max(0.00001).log10();
                let over = (level_db - threshold_db).max(0.0);
                let reduced_db = over - over / ratio.max(1.0);
                let wet = input * db_to_gain(node.makeup_db.next() - reduced_db);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                signals[node.out_index] = input * (1.0 - mix) + wet * mix;
            }
            Self::Output(node) => {
                let mut sample = read_input(signals, node.input, 0.0) * db_to_gain(node.gain_db.next());
                if node.limiter { sample = sample.tanh(); }
                signals[node.out_index] = sample;
            }
        }
    }
}

fn read_input(signals: &[f32], index: i32, fallback: f32) -> f32 {
    if index >= 0 {
        *signals.get(index as usize).unwrap_or(&fallback)
    } else {
        fallback
    }
}

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

fn next_noise(rng_state: &mut u32) -> f32 {
    *rng_state = rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
    let normalized = ((*rng_state >> 8) as f32) / ((1u32 << 24) - 1) as f32;
    normalized * 2.0 - 1.0
}

#[wasm_bindgen]
pub struct WasmSubsetEngine {
    sample_rate: f32,
    block_size: usize,
    tracks: Vec<TrackRuntime>,
    master_fx: MasterFxSpec,
    master_compressor_env: f32,
    event_queue: Vec<EventSpec>,
    event_cursor: usize,
    song_sample_counter: u32,
    stopped: bool,
    left: Vec<f32>,
    right: Vec<f32>,
    profiling_enabled: bool,
    profile_stats: EngineProfileStats,
}

#[wasm_bindgen]
impl WasmSubsetEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32, block_size: usize) -> Self {
        Self {
            sample_rate: sample_rate as f32,
            block_size,
            tracks: Vec::new(),
            master_fx: MasterFxSpec { compressor_enabled: false, limiter_enabled: true, makeup_gain: 0.0 },
            master_compressor_env: 0.0,
            event_queue: Vec::new(),
            event_cursor: 0,
            song_sample_counter: 0,
            stopped: true,
            left: vec![0.0; block_size],
            right: vec![0.0; block_size],
            profiling_enabled: false,
            profile_stats: EngineProfileStats::default(),
        }
    }

    pub fn start_stream(&mut self, project_json: &str, song_start_sample: u32, events_json: &str, _session_id: u32, random_seed: u32) -> Result<(), JsValue> {
        let project: ProjectSpec = serde_json::from_str(project_json)
            .map_err(|error| js_error(format!("Failed to parse WASM project: {error}")))?;
        let mut events: Vec<EventSpec> = serde_json::from_str(events_json)
            .map_err(|error| js_error(format!("Failed to parse WASM events: {error}")))?;
        sort_events(&mut events);

        self.sample_rate = project.sample_rate as f32;
        self.block_size = project.block_size.max(1);
        self.left = vec![0.0; self.block_size];
        self.right = vec![0.0; self.block_size];
        self.tracks = project
            .tracks
            .into_iter()
            .map(|track| TrackRuntime::from_spec(track, self.sample_rate, random_seed))
            .collect::<Result<Vec<_>, _>>()?;
        self.master_fx = project.master_fx;
        self.master_compressor_env = 0.0;
        self.event_queue = events;
        self.event_cursor = 0;
        self.song_sample_counter = song_start_sample;
        self.stopped = false;
        self.profile_stats = EngineProfileStats::default();
        Ok(())
    }

    pub fn enqueue_events(&mut self, events_json: &str) -> Result<(), JsValue> {
        let mut events: Vec<EventSpec> = serde_json::from_str(events_json)
            .map_err(|error| js_error(format!("Failed to parse appended WASM events: {error}")))?;
        self.event_queue.append(&mut events);
        sort_events(&mut self.event_queue);
        Ok(())
    }

    pub fn process_block(&mut self) -> bool {
        let block_started = if self.profiling_enabled { Some(now_ms()) } else { None };
        self.left.fill(0.0);
        self.right.fill(0.0);
        if self.stopped {
            return true;
        }

        for frame in 0..self.block_size {
            if self.profiling_enabled {
                let started = now_ms();
                self.consume_due_events();
                self.profile_stats.consume_due_events_ms += now_ms() - started;
            } else {
                self.consume_due_events();
            }
            let mut mixed = 0.0_f32;
            if self.profiling_enabled {
                let started = now_ms();
                let sample_rate = self.sample_rate;
                let profile = &mut self.profile_stats;
                for track in self.tracks.iter_mut() {
                    let track_started = now_ms();
                    mixed += track.render_track_sample(sample_rate, profile, true);
                    profile.render_track_sample_ms += now_ms() - track_started;
                    profile.track_samples_rendered = profile.track_samples_rendered.saturating_add(1);
                }
                self.profile_stats.render_tracks_ms += now_ms() - started;
            } else {
                for track in self.tracks.iter_mut() {
                    mixed += track.render_track_sample(self.sample_rate, &mut self.profile_stats, false);
                }
            }
            if self.profiling_enabled {
                let started = now_ms();
                mixed = self.apply_master_fx(mixed);
                self.profile_stats.apply_master_fx_ms += now_ms() - started;
                self.profile_stats.samples_processed = self.profile_stats.samples_processed.saturating_add(1);
            } else {
                mixed = self.apply_master_fx(mixed);
            }
            self.left[frame] = mixed;
            self.right[frame] = mixed;
            self.song_sample_counter = self.song_sample_counter.saturating_add(1);
        }

        if let Some(started) = block_started {
            self.profile_stats.blocks_processed = self.profile_stats.blocks_processed.saturating_add(1);
            self.profile_stats.process_block_ms += now_ms() - started;
        }

        true
    }

    pub fn stop(&mut self) {
        self.stopped = true;
        self.event_queue.clear();
        self.event_cursor = 0;
        for track in self.tracks.iter_mut() {
            track.active = false;
            track.note_id = None;
            track.host_gate = 0.0;
            track.rms = 0.0;
        }
    }

    pub fn left_ptr(&self) -> *const f32 {
        self.left.as_ptr()
    }

    pub fn right_ptr(&self) -> *const f32 {
        self.right.as_ptr()
    }

    pub fn block_size(&self) -> usize {
        self.block_size
    }

    pub fn set_profiling_enabled(&mut self, enabled: bool) {
        self.profiling_enabled = enabled;
        if enabled {
            self.profile_stats = EngineProfileStats::default();
        }
    }

    pub fn reset_profile_stats(&mut self) {
        self.profile_stats = EngineProfileStats::default();
    }

    pub fn profile_stats_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.profile_stats)
            .map_err(|error| js_error(format!("Failed to serialize WASM profile stats: {error}")))
    }
}

impl WasmSubsetEngine {
    fn consume_due_events(&mut self) {
        while self.event_cursor < self.event_queue.len() {
            let event = &self.event_queue[self.event_cursor];
            if event.sample_time() > self.song_sample_counter {
                break;
            }
            self.apply_event(event.clone());
            self.event_cursor += 1;
        }
    }

    fn apply_event(&mut self, event: EventSpec) {
        let started = if self.profiling_enabled { Some(now_ms()) } else { None };
        match event {
            EventSpec::NoteOn { track_index, note_id, pitch_voct, velocity, .. } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.note_on(note_id, pitch_voct, velocity);
                }
            }
            EventSpec::NoteOff { track_index, note_id, .. } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.note_off(&note_id);
                }
            }
            EventSpec::ParamChange { track_index, node_id, param_id, value, .. } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.apply_param_change(&node_id, &param_id, &value);
                }
            }
            EventSpec::TrackVolumeChange { track_index, value, .. } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.volume = clamp(value, 0.0, 2.0);
                }
            }
        }
        if let Some(started) = started {
            self.profile_stats.events_applied = self.profile_stats.events_applied.saturating_add(1);
            self.profile_stats.apply_event_ms += now_ms() - started;
        }
    }

    fn apply_master_fx(&mut self, input: f32) -> f32 {
        let mut out = input;
        if self.master_fx.compressor_enabled {
            let abs_in = out.abs();
            self.master_compressor_env = self.master_compressor_env * 0.996 + abs_in * 0.004;
            let over = (self.master_compressor_env - 0.25).max(0.0);
            let gain = 1.0 / (1.0 + over * 5.0);
            out *= gain;
        }
        out *= db_to_gain(self.master_fx.makeup_gain);
        if self.master_fx.limiter_enabled {
            out = clamp(out, -0.98, 0.98);
        }
        if out.is_finite() { out } else { 0.0 }
    }
}
