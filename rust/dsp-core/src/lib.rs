use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

mod nodes;
mod renderer;
mod stream;

pub use renderer::WasmSubsetEngine;

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

const MAX_VOICES: usize = 8;

#[inline(always)]
fn clamp(x: f32, min: f32, max: f32) -> f32 {
    x.max(min).min(max)
}

#[inline(always)]
fn db_to_gain(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

#[inline(always)]
fn smoothing_alpha(time_ms: f32, sample_rate: f32) -> f32 {
    if time_ms <= 0.0 {
        return 0.0;
    }
    let tau_samples = (time_ms / 1000.0) * sample_rate;
    (-1.0 / tau_samples.max(1.0)).exp()
}

#[inline(always)]
fn voct_to_hz(voct: f32) -> f32 {
    261.625565_f32 * 2.0_f32.powf(voct)
}

/// Samples a single oscillator value for the requested waveform.
/// Params:
/// - `wave`: waveform family to evaluate.
/// - `phase`: normalized cycle position in the range `[0, 1)`.
/// - `pulse_width`: square-wave duty cycle; ignored by other waveforms.
#[inline(always)]
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

    #[inline(always)]
    fn next(&mut self) -> f32 {
        if self.current == self.target {
            return self.current;
        }
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
enum ReverbMode {
    Room,
    Hall,
    Plate,
    Spring,
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
    cv_mixer4_ms: f64,
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
    _track_id: String,
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
struct PreviewProbeCaptureSpec {
    #[serde(rename = "probeId")]
    probe_id: String,
    #[serde(rename = "trackIndex")]
    track_index: usize,
    #[serde(rename = "signalIndex")]
    signal_index: usize,
    #[serde(rename = "durationSamples")]
    duration_samples: usize,
}

#[derive(Clone, Serialize)]
struct PreviewProbeCaptureSnapshot {
    #[serde(rename = "probeId")]
    probe_id: String,
    #[serde(rename = "sampleStride")]
    sample_stride: f32,
    samples: Vec<f32>,
}

#[derive(Clone, Serialize)]
struct PreviewProbeCaptureStateSnapshot {
    #[serde(rename = "capturedSamples")]
    captured_samples: usize,
    captures: Vec<PreviewProbeCaptureSnapshot>,
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

    /// Builds a stable secondary sort key for events that share time and priority.
    /// Params:
    /// - `self`: event whose identifying fields are folded into the fallback sort key.
    fn sort_key(&self) -> String {
        match self {
            EventSpec::NoteOn {
                track_index,
                note_id,
                ..
            }
            | EventSpec::NoteOff {
                track_index,
                note_id,
                ..
            } => {
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
