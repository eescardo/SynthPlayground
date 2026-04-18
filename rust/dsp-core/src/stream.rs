use crate::{clamp, now_ms, EngineProfileStats, HostSignalIndices, TrackFxSpec, TrackSpec, MAX_VOICES};
use crate::nodes::RuntimeNode;
use serde_json::Value;
use std::collections::HashMap;
use wasm_bindgen::JsValue;

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
pub(crate) struct VoiceRuntime {
    signal_values: Vec<f32>,
    nodes: Vec<RuntimeNode>,
    active: bool,
    note_id: Option<String>,
    rms: f32,
    last_triggered_sample_time: u32,
    host_pitch_voct: f32,
    host_gate: f32,
    host_velocity: f32,
    host_modwheel: f32,
    rng_state: u32,
}

impl VoiceRuntime {
    fn new(signal_count: usize, node_templates: &[RuntimeNode], random_seed: u32) -> Self {
        Self {
            signal_values: vec![0.0; signal_count.max(1)],
            nodes: node_templates.to_vec(),
            active: false,
            note_id: None,
            rms: 0.0,
            last_triggered_sample_time: 0,
            host_pitch_voct: 0.0,
            host_gate: 0.0,
            host_velocity: 0.0,
            host_modwheel: 0.0,
            rng_state: random_seed,
        }
    }

    fn reset_for_note_on(
        &mut self,
        node_templates: &[RuntimeNode],
        note_id: String,
        pitch_voct: f32,
        velocity: f32,
        sample_time: u32,
        random_seed: u32,
    ) {
        self.nodes = node_templates.to_vec();
        for node in self.nodes.iter_mut() {
            node.reset_dynamic_state();
        }
        self.active = true;
        self.note_id = Some(note_id);
        self.rms = 0.0;
        self.last_triggered_sample_time = sample_time;
        self.host_pitch_voct = pitch_voct;
        self.host_velocity = velocity;
        self.host_gate = 1.0;
        self.rng_state = random_seed;
    }

    pub(crate) fn reset_to_inactive(&mut self) {
        self.active = false;
        self.note_id = None;
        self.rms = 0.0;
        self.host_gate = 0.0;
    }
}

#[derive(Clone)]
pub(crate) struct TrackRuntime {
    mute: bool,
    volume: f32,
    fx: TrackFxSpec,
    host_signal_indices: HostSignalIndices,
    output_signal_index: usize,
    node_templates: Vec<RuntimeNode>,
    node_index_by_id: HashMap<String, usize>,
    voices: Vec<VoiceRuntime>,
    fx_state: TrackFxState,
    base_random_seed: u32,
    note_trigger_count: u32,
}

impl TrackRuntime {
    pub(crate) fn from_spec(spec: TrackSpec, sample_rate: f32, random_seed: u32) -> Result<Self, JsValue> {
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
        let base_random_seed = random_seed.wrapping_add(spec.track_index as u32);
        let signal_count = spec.signal_count.max(1);
        let voices = (0..MAX_VOICES)
            .map(|voice_index| {
                VoiceRuntime::new(
                    signal_count,
                    &node_templates,
                    base_random_seed.wrapping_add((voice_index as u32).wrapping_mul(0x45d9_f3b)),
                )
            })
            .collect();
        Ok(Self {
            mute: spec.mute,
            volume: spec.volume,
            fx: spec.fx,
            host_signal_indices: spec.host_signal_indices,
            output_signal_index: spec.output_signal_index,
            node_templates,
            node_index_by_id,
            voices,
            fx_state: TrackFxState {
                delay_buf: vec![0.0; (sample_rate as usize) * 3],
                delay_write: 0,
                reverb_comb1: vec![0.0; (sample_rate * 0.031) as usize],
                reverb_comb2: vec![0.0; (sample_rate * 0.047) as usize],
                reverb_idx1: 0,
                reverb_idx2: 0,
                compressor_env: 0.0,
            },
            base_random_seed,
            note_trigger_count: 0,
        })
    }

    fn allocate_voice_index(&self, sample_time: u32) -> usize {
        if let Some(free_index) = self.voices.iter().position(|voice| !voice.active) {
            return free_index;
        }

        let min_age_samples = 960;
        let mut best_index = 0;
        let mut best_score = f32::INFINITY;

        for (index, voice) in self.voices.iter().enumerate() {
            let age = sample_time.saturating_sub(voice.last_triggered_sample_time);
            let age_penalty = if age < min_age_samples { 1000.0 } else { 0.0 };
            let score = voice.rms + age_penalty;
            if score < best_score {
                best_index = index;
                best_score = score;
            }
        }

        best_index
    }

    fn restart_voice(&mut self, voice_index: usize, note_id: String, pitch_voct: f32, velocity: f32, sample_time: u32) {
        let random_seed = self
            .base_random_seed
            .wrapping_add(self.note_trigger_count.wrapping_mul(0x9e37_79b9))
            .wrapping_add((voice_index as u32).wrapping_mul(0x45d9_f3b));
        self.note_trigger_count = self.note_trigger_count.wrapping_add(1);
        self.voices[voice_index].reset_for_note_on(
            &self.node_templates,
            note_id,
            pitch_voct,
            velocity,
            sample_time,
            random_seed,
        );
    }

    pub(crate) fn note_on(&mut self, note_id: String, pitch_voct: f32, velocity: f32, sample_time: u32) {
        if let Some(existing_index) = self
            .voices
            .iter()
            .position(|voice| voice.active && voice.note_id.as_deref() == Some(note_id.as_str()))
        {
            self.restart_voice(existing_index, note_id, pitch_voct, velocity, sample_time);
            return;
        }

        let active_voice_index = self.voices.iter().position(|voice| voice.active);
        let voice_index = if let Some(active_index) = active_voice_index {
            for (index, voice) in self.voices.iter_mut().enumerate() {
                if index != active_index {
                    voice.reset_to_inactive();
                }
            }
            active_index
        } else {
            self.allocate_voice_index(sample_time)
        };

        self.restart_voice(voice_index, note_id, pitch_voct, velocity, sample_time);
    }

    pub(crate) fn note_off(&mut self, note_id: &str) {
        let mut released = false;
        for voice in self.voices.iter_mut() {
            if voice.active && voice.note_id.as_deref() == Some(note_id) {
                voice.host_gate = 0.0;
                released = true;
            }
        }
        if released {
            return;
        }

        for voice in self.voices.iter_mut() {
            if voice.active {
                voice.host_gate = 0.0;
                break;
            }
        }
    }

    pub(crate) fn apply_param_change(&mut self, node_id: &str, param_id: &str, value: &Value) {
        if let Some(index) = self.node_index_by_id.get(node_id).copied() {
            if let Some(node) = self.node_templates.get_mut(index) {
                node.set_param(param_id, value);
            }
            for voice in self.voices.iter_mut() {
                if let Some(node) = voice.nodes.get_mut(index) {
                    node.set_param(param_id, value);
                }
            }
        }
    }

    pub(crate) fn render_track_sample(&mut self, sample_rate: f32, profile: &mut EngineProfileStats, profiling_enabled: bool) -> f32 {
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
        let host_indices = self.host_signal_indices.clone();
        let mut mixed = 0.0;

        for voice in self.voices.iter_mut() {
            if !voice.active {
                continue;
            }

            voice.signal_values[self.host_signal_indices.pitch] = voice.host_pitch_voct;
            voice.signal_values[self.host_signal_indices.gate] = voice.host_gate;
            voice.signal_values[self.host_signal_indices.velocity] = voice.host_velocity;
            voice.signal_values[self.host_signal_indices.mod_wheel] = voice.host_modwheel;

            let mut rng_state = voice.rng_state;
            for node in voice.nodes.iter_mut() {
                if profiling_enabled {
                    let started = now_ms();
                    node.process_sample(&mut voice.signal_values, &host_indices, sample_rate, &mut rng_state);
                    let elapsed = now_ms() - started;
                    profile.node_process_ms += elapsed;
                    profile.node_samples_processed = profile.node_samples_processed.saturating_add(1);
                    node.add_profile_time(profile, elapsed);
                } else {
                    node.process_sample(&mut voice.signal_values, &host_indices, sample_rate, &mut rng_state);
                }
            }
            voice.rng_state = rng_state;

            let sample = *voice.signal_values.get(self.output_signal_index).unwrap_or(&0.0);
            if !sample.is_finite() {
                voice.reset_to_inactive();
                continue;
            }

            voice.rms = voice.rms * 0.995 + sample.abs() * 0.005;
            if voice.host_gate < 0.5 && voice.rms < 0.0005 {
                voice.reset_to_inactive();
            } else {
                mixed += sample;
            }
        }

        mixed
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

    pub(crate) fn stop_all_voices(&mut self) {
        for voice in self.voices.iter_mut() {
            voice.reset_to_inactive();
        }
    }

    pub(crate) fn set_volume(&mut self, value: f32) {
        self.volume = clamp(value, 0.0, 2.0);
    }
}
