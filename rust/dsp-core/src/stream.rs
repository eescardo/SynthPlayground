use crate::nodes::RuntimeNode;
use crate::{
    clamp, now_ms, EngineProfileStats, HostSignalIndices, PreviewProbeCaptureSnapshot,
    PreviewProbeCaptureSpec, PreviewProbeFinalSpectrum, PreviewProbeSpectrumFrames, TrackFxSpec,
    TrackSpec, MAX_VOICES,
};
use serde_json::Value;
use std::collections::HashMap;
use wasm_bindgen::JsValue;

const PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES: usize = 4_096;
const PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT: usize = 32;
const PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS: usize = 512;
const PREVIEW_CAPTURE_SPECTRUM_DEFAULT_FRAME_SIZE: usize = 1024;
const PREVIEW_CAPTURE_SPECTRUM_MIN_FRAME_SIZE: usize = 64;
const PREVIEW_CAPTURE_SPECTRUM_MAX_FREQUENCY_HZ: f32 = 24_000.0;

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
struct TrackProbeCaptureState {
    probe_id: String,
    kind: String,
    signal_start: usize,
    duration_samples: usize,
    spectrum_window_size: Option<usize>,
    samples: Vec<f32>,
    spectrum_columns: Vec<Vec<f32>>,
    spectrum_bin_frequencies: Vec<f32>,
    spectrum_analyzed_samples: usize,
    spectrum_emitted_columns: usize,
}

#[derive(Clone)]
pub(crate) struct VoiceRuntime {
    signal_buffers: Vec<f32>,
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
    /// Allocates a fresh voice runtime from the compiled node templates for one track.
    /// Params:
    /// - `signal_count`: number of signal slots that each voice must expose.
    /// - `block_size`: number of frames in the preallocated signal buffer set.
    /// - `node_templates`: compiled node graph copied into each voice instance.
    /// - `random_seed`: initial RNG state used by stochastic modules in this voice.
    fn new(
        signal_count: usize,
        block_size: usize,
        node_templates: &[RuntimeNode],
        random_seed: u32,
    ) -> Self {
        Self {
            signal_buffers: vec![0.0; signal_count.max(1) * block_size.max(1)],
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

    /// Reinitializes an existing voice so it can respond to a new note-on trigger.
    /// Params:
    /// - `node_templates`: compiled node graph to clone back into the voice.
    /// - `note_id`: logical note identifier used to match later note-off events.
    /// - `pitch_voct`: host pitch value in volts-per-octave.
    /// - `velocity`: normalized note-on velocity.
    /// - `sample_time`: song sample where the note starts.
    /// - `random_seed`: per-trigger RNG seed so repeated notes stay deterministic.
    fn reset_for_note_on(
        &mut self,
        note_id: String,
        pitch_voct: f32,
        velocity: f32,
        sample_time: u32,
        random_seed: u32,
    ) {
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
    block_size: usize,
    fx: TrackFxSpec,
    host_signal_indices: HostSignalIndices,
    output_signal_start: usize,
    node_index_by_id: HashMap<String, usize>,
    voices: Vec<VoiceRuntime>,
    track_buffer: Vec<f32>,
    fx_state: TrackFxState,
    base_random_seed: u32,
    note_trigger_count: u32,
    probe_captures: Vec<TrackProbeCaptureState>,
}

impl TrackRuntime {
    /// Builds a track runtime from the serialized track spec and allocates its voice/FX state.
    /// Params:
    /// - `spec`: compiled track description with node graph, host indices, and track FX settings.
    /// - `sample_rate`: global render sample rate used to size delay lines and smoothing state.
    /// - `block_size`: number of frames each render call will process at most.
    /// - `random_seed`: base seed from which per-track and per-voice RNG streams are derived.
    pub(crate) fn from_spec(
        spec: TrackSpec,
        sample_rate: f32,
        block_size: usize,
        random_seed: u32,
    ) -> Result<Self, JsValue> {
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
                    block_size,
                    &node_templates,
                    base_random_seed.wrapping_add((voice_index as u32).wrapping_mul(0x45d9_f3b)),
                )
            })
            .collect();
        Ok(Self {
            mute: spec.mute,
            volume: spec.volume,
            block_size,
            fx: spec.fx,
            host_signal_indices: spec.host_signal_indices,
            output_signal_start: spec.output_signal_index * block_size,
            node_index_by_id,
            voices,
            track_buffer: vec![0.0; block_size.max(1)],
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
            probe_captures: Vec::new(),
        })
    }

    /// Configures preview probe capture buffers for this track.
    /// Params:
    /// - `specs`: resolved probe requests, each with a signal index and capture duration in samples.
    pub(crate) fn configure_probe_captures(&mut self, specs: Vec<PreviewProbeCaptureSpec>) {
        self.probe_captures = specs
            .into_iter()
            .map(|spec| TrackProbeCaptureState {
                probe_id: spec.probe_id,
                kind: spec.kind,
                signal_start: spec.signal_index * self.block_size,
                duration_samples: spec.duration_samples,
                spectrum_window_size: spec.spectrum_window_size,
                samples: vec![0.0; spec.duration_samples],
                spectrum_columns: Vec::new(),
                spectrum_bin_frequencies: Vec::new(),
                spectrum_analyzed_samples: 0,
                spectrum_emitted_columns: 0,
            })
            .collect();
    }

    pub(crate) fn clear_probe_captures(&mut self) {
        self.probe_captures.clear();
    }

    pub(crate) fn has_active_voices(&self) -> bool {
        // Used by preview mode to detect when NoteOff plus envelope release has finished
        // and the stream can stop without waiting for the original preview duration.
        self.voices.iter().any(|voice| voice.active)
    }

    /// Clones the current probe capture buffers into a serializable snapshot.
    /// Params:
    /// - `captured_samples`: number of valid samples currently written into each capture buffer.
    pub(crate) fn preview_capture_state_snapshot(
        &mut self,
        captured_samples: usize,
        sample_rate: f32,
        include_final: bool,
    ) -> Vec<PreviewProbeCaptureSnapshot> {
        self.probe_captures
            .iter_mut()
            .map(|capture| {
                let captured_end = captured_samples.min(capture.duration_samples);
                let is_spectrum = capture.kind == "spectrum";
                let samples = if is_spectrum {
                    Vec::new()
                } else {
                    build_preview_capture_snapshot_samples(capture, captured_samples)
                };
                PreviewProbeCaptureSnapshot {
                    probe_id: capture.probe_id.clone(),
                    sample_stride: resolve_preview_capture_snapshot_stride(
                        capture,
                        captured_samples,
                    ),
                    samples,
                    spectrum_frames: update_and_build_preview_capture_spectrum_frames(
                        capture,
                        captured_samples,
                        sample_rate,
                    ),
                    final_spectrum: build_preview_capture_final_spectrum(
                        capture,
                        captured_samples,
                        sample_rate,
                        include_final,
                    ),
                    full_resolution_samples: if include_final && is_spectrum {
                        Some(capture.samples.iter().take(captured_end).copied().collect())
                    } else {
                        None
                    },
                }
            })
            .collect()
    }

    /// Chooses which voice should handle the next note trigger.
    /// Params:
    /// - `sample_time`: current song sample, used to avoid stealing very recently triggered voices.
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

    /// Resets one specific voice slot so it can start a new note immediately.
    /// Params:
    /// - `voice_index`: index into the voice pool to reuse.
    /// - `note_id`: logical note identifier assigned to the restarted voice.
    /// - `pitch_voct`: host pitch value in volts-per-octave.
    /// - `velocity`: normalized note-on velocity.
    /// - `sample_time`: song sample where the note starts.
    fn restart_voice(
        &mut self,
        voice_index: usize,
        note_id: String,
        pitch_voct: f32,
        velocity: f32,
        sample_time: u32,
    ) {
        let random_seed = self
            .base_random_seed
            .wrapping_add(self.note_trigger_count.wrapping_mul(0x9e37_79b9))
            .wrapping_add((voice_index as u32).wrapping_mul(0x45d9_f3b));
        self.note_trigger_count = self.note_trigger_count.wrapping_add(1);
        self.voices[voice_index].reset_for_note_on(
            note_id,
            pitch_voct,
            velocity,
            sample_time,
            random_seed,
        );
    }

    /// Handles note-on voice allocation while preserving the current monophonic track behavior.
    /// Params:
    /// - `note_id`: logical note identifier used to pair the trigger with a later note-off.
    /// - `pitch_voct`: host pitch value in volts-per-octave.
    /// - `velocity`: normalized note-on velocity.
    /// - `sample_time`: song sample where the note starts.
    pub(crate) fn note_on(
        &mut self,
        note_id: String,
        pitch_voct: f32,
        velocity: f32,
        sample_time: u32,
    ) {
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

    /// Releases any active voices that belong to the supplied note id.
    /// Params:
    /// - `note_id`: logical note identifier that should transition into release.
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

    /// Applies a parameter change to every template node and any currently active voice instances.
    /// Params:
    /// - `node_id`: target node identifier within the compiled graph.
    /// - `param_id`: parameter name to update.
    /// - `value`: serialized parameter value to push into the node state.
    pub(crate) fn apply_param_change(&mut self, node_id: &str, param_id: &str, value: &Value) {
        if let Some(index) = self.node_index_by_id.get(node_id).copied() {
            for voice in self.voices.iter_mut() {
                if let Some(node) = voice.nodes.get_mut(index) {
                    node.set_param(param_id, value);
                }
            }
        }
    }

    fn fill_host_signal_buffers(
        voice: &mut VoiceRuntime,
        host_indices: &HostSignalIndices,
        block_size: usize,
        start_frame: usize,
        end_frame: usize,
    ) {
        let pitch_start = host_indices.pitch * block_size;
        let gate_start = host_indices.gate * block_size;
        let velocity_start = host_indices.velocity * block_size;
        let mod_wheel_start = host_indices.mod_wheel * block_size;

        voice.signal_buffers[pitch_start + start_frame..pitch_start + end_frame]
            .fill(voice.host_pitch_voct);
        voice.signal_buffers[gate_start + start_frame..gate_start + end_frame]
            .fill(voice.host_gate);
        voice.signal_buffers[velocity_start + start_frame..velocity_start + end_frame]
            .fill(voice.host_velocity);
        voice.signal_buffers[mod_wheel_start + start_frame..mod_wheel_start + end_frame]
            .fill(voice.host_modwheel);
    }

    /// Renders one track frame range from its voices and optional insert FX.
    /// Params:
    /// - `target_buffer`: shared mix buffer that receives this track's processed output.
    /// - `start_frame`: inclusive frame index inside the current render block.
    /// - `end_frame`: exclusive frame index inside the current render block.
    /// - `sample_rate`: global sample rate for time-based DSP calculations.
    /// - `profile`: profiling accumulator that may be updated during render.
    /// - `profiling_enabled`: whether nested render timings should be recorded.
    /// - `capture_offset`: absolute preview sample index for the start of this render range.
    pub(crate) fn process_track_frames(
        &mut self,
        target_buffer: &mut [f32],
        start_frame: usize,
        end_frame: usize,
        sample_rate: f32,
        profile: &mut EngineProfileStats,
        profiling_enabled: bool,
        capture_offset: usize,
    ) {
        self.track_buffer[start_frame..end_frame].fill(0.0);

        if profiling_enabled {
            let started = now_ms();
            self.render_dry_range(
                start_frame,
                end_frame,
                sample_rate,
                profile,
                true,
                capture_offset,
            );
            profile.render_dry_sample_ms += now_ms() - started;
        } else {
            self.render_dry_range(
                start_frame,
                end_frame,
                sample_rate,
                profile,
                false,
                capture_offset,
            );
        }

        if profiling_enabled {
            let started = now_ms();
            self.apply_track_fx_range(start_frame, end_frame, sample_rate);
            profile.apply_track_fx_ms += now_ms() - started;
        } else {
            self.apply_track_fx_range(start_frame, end_frame, sample_rate);
        }

        profile.track_samples_rendered = profile
            .track_samples_rendered
            .saturating_add((end_frame.saturating_sub(start_frame)) as u64);

        if self.mute {
            return;
        }

        for frame in start_frame..end_frame {
            target_buffer[frame] += self.track_buffer[frame] * self.volume;
        }
    }

    /// Renders the track signal before insert FX by summing all active voices across a frame range.
    /// Params:
    /// - `start_frame`: inclusive frame index inside the current block.
    /// - `end_frame`: exclusive frame index inside the current block.
    /// - `sample_rate`: global sample rate used by the node processors.
    /// - `profile`: profiling accumulator that records node and dry-path timing buckets.
    /// - `profiling_enabled`: whether node timing should be recorded for this render.
    /// - `capture_offset`: absolute preview sample index for the start of this range.
    fn render_dry_range(
        &mut self,
        start_frame: usize,
        end_frame: usize,
        sample_rate: f32,
        profile: &mut EngineProfileStats,
        profiling_enabled: bool,
        capture_offset: usize,
    ) {
        let host_indices = &self.host_signal_indices;

        for voice in self.voices.iter_mut() {
            if !voice.active {
                continue;
            }

            Self::fill_host_signal_buffers(
                voice,
                host_indices,
                self.block_size,
                start_frame,
                end_frame,
            );

            let mut rng_state = voice.rng_state;
            for node in voice.nodes.iter_mut() {
                if profiling_enabled {
                    let started = now_ms();
                    node.process_frame_range(
                        &mut voice.signal_buffers,
                        self.block_size,
                        start_frame,
                        end_frame,
                        host_indices,
                        sample_rate,
                        &mut rng_state,
                    );
                    let elapsed = now_ms() - started;
                    profile.node_process_ms += elapsed;
                    profile.node_samples_processed = profile
                        .node_samples_processed
                        .saturating_add((end_frame.saturating_sub(start_frame)) as u64);
                    node.add_profile_time(profile, elapsed);
                } else {
                    node.process_frame_range(
                        &mut voice.signal_buffers,
                        self.block_size,
                        start_frame,
                        end_frame,
                        host_indices,
                        sample_rate,
                        &mut rng_state,
                    );
                }
            }
            voice.rng_state = rng_state;

            let output_start = self.output_signal_start;
            let mut all_finite = true;
            if self.probe_captures.is_empty() {
                for frame in start_frame..end_frame {
                    let sample = voice.signal_buffers[output_start + frame];
                    if !sample.is_finite() {
                        all_finite = false;
                        break;
                    }
                    voice.rms = voice.rms * 0.995 + sample.abs() * 0.005;
                }
            } else {
                for frame in start_frame..end_frame {
                    let sample = voice.signal_buffers[output_start + frame];
                    if !sample.is_finite() {
                        all_finite = false;
                        break;
                    }

                    let capture_index = capture_offset + (frame - start_frame);
                    for capture in self.probe_captures.iter_mut() {
                        if capture_index < capture.duration_samples {
                            capture.samples[capture_index] +=
                                voice.signal_buffers[capture.signal_start + frame];
                        }
                    }

                    voice.rms = voice.rms * 0.995 + sample.abs() * 0.005;
                }
            }

            if !all_finite {
                voice.signal_buffers[output_start + start_frame..output_start + end_frame]
                    .fill(0.0);
                voice.reset_to_inactive();
                continue;
            }

            if voice.host_gate < 0.5 && voice.rms < 0.0005 {
                voice.reset_to_inactive();
                continue;
            }

            for frame in start_frame..end_frame {
                self.track_buffer[frame] += voice.signal_buffers[output_start + frame];
            }
        }
    }

    /// Applies this track's insert FX chain to one dry input sample.
    /// Params:
    /// - `input`: dry post-voice sample before the track FX chain.
    /// - `sample_rate`: global sample rate used to convert time-based FX settings into samples.
    fn apply_track_fx_sample(&mut self, input: f32, sample_rate: f32) -> f32 {
        let fx = &self.fx;
        let state = &mut self.fx_state;
        let mut out = input;

        if fx.delay_enabled {
            let time_samples = clamp(
                (sample_rate * 0.24).floor(),
                1.0,
                (state.delay_buf.len() - 1) as f32,
            ) as usize;
            let read_idx =
                (state.delay_write + state.delay_buf.len() - time_samples) % state.delay_buf.len();
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

        if out.is_finite() {
            out
        } else {
            0.0
        }
    }

    /// Applies this track's insert FX chain across a contiguous frame range.
    /// Params:
    /// - `start_frame`: inclusive frame index inside the current block.
    /// - `end_frame`: exclusive frame index inside the current block.
    /// - `sample_rate`: global sample rate used to convert time-based FX settings into samples.
    fn apply_track_fx_range(&mut self, start_frame: usize, end_frame: usize, sample_rate: f32) {
        for frame in start_frame..end_frame {
            let input = self.track_buffer[frame];
            self.track_buffer[frame] = self.apply_track_fx_sample(input, sample_rate);
        }
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

fn build_preview_capture_snapshot_samples(
    capture: &TrackProbeCaptureState,
    captured_samples: usize,
) -> Vec<f32> {
    let captured_end = captured_samples.min(capture.duration_samples);
    if captured_end <= PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES {
        return capture.samples.iter().take(captured_end).copied().collect();
    }

    let output_len = PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES;
    let denominator = (output_len - 1) as f64;
    let source_max = (captured_end - 1) as f64;
    (0..output_len)
        .map(|index| {
            let source_index = ((index as f64 / denominator) * source_max).round() as usize;
            capture.samples[source_index]
        })
        .collect()
}

fn resolve_preview_capture_snapshot_stride(
    capture: &TrackProbeCaptureState,
    captured_samples: usize,
) -> f32 {
    let captured_end = captured_samples.min(capture.duration_samples);
    if captured_end <= PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES {
        return 1.0;
    }
    captured_end as f32 / PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES as f32
}

fn update_and_build_preview_capture_spectrum_frames(
    capture: &mut TrackProbeCaptureState,
    captured_samples: usize,
    sample_rate: f32,
) -> Option<PreviewProbeSpectrumFrames> {
    if capture.kind != "spectrum" {
        return None;
    }
    let captured_end = captured_samples.min(capture.duration_samples);
    let frame_size = capture
        .spectrum_window_size
        .unwrap_or(PREVIEW_CAPTURE_SPECTRUM_DEFAULT_FRAME_SIZE)
        .max(PREVIEW_CAPTURE_SPECTRUM_MIN_FRAME_SIZE);
    if capture.spectrum_bin_frequencies.is_empty() {
        capture.spectrum_bin_frequencies = build_preview_capture_spectrum_bin_frequencies(
            PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT,
            frame_size,
            sample_rate,
        );
    }
    if captured_end < frame_size {
        let start_column = capture.spectrum_emitted_columns;
        capture.spectrum_emitted_columns = capture.spectrum_columns.len();
        return Some(PreviewProbeSpectrumFrames {
            columns: capture.spectrum_columns[start_column..].to_vec(),
            bin_frequencies: capture.spectrum_bin_frequencies.clone(),
            start_column,
            frame_size,
            sample_rate,
            captured_samples: captured_end,
        });
    }

    let bin_indices = build_preview_capture_spectrum_bin_indices(
        PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT,
        frame_size,
        sample_rate,
    );
    let hann_window = (0..frame_size)
        .map(|index| {
            0.5 - 0.5
                * ((2.0 * std::f32::consts::PI * index as f32)
                    / (frame_size.saturating_sub(1).max(1) as f32))
                    .cos()
        })
        .collect::<Vec<_>>();
    let mut frame_start = capture.spectrum_analyzed_samples;
    while frame_start + frame_size <= captured_end {
        let magnitudes = measure_preview_capture_fft_magnitudes(
            &capture.samples,
            frame_start,
            frame_size,
            &hann_window,
        );
        capture.spectrum_columns.push(
            bin_indices
                .iter()
                .map(|bin_index| magnitudes.get(*bin_index).copied().unwrap_or(0.0))
                .collect(),
        );
        frame_start += frame_size;
    }
    capture.spectrum_analyzed_samples = frame_start;
    let start_column = capture.spectrum_emitted_columns;
    capture.spectrum_emitted_columns = capture.spectrum_columns.len();

    Some(PreviewProbeSpectrumFrames {
        columns: capture.spectrum_columns[start_column..].to_vec(),
        bin_frequencies: capture.spectrum_bin_frequencies.clone(),
        start_column,
        frame_size,
        sample_rate,
        captured_samples: captured_end,
    })
}

fn build_preview_capture_final_spectrum(
    capture: &TrackProbeCaptureState,
    captured_samples: usize,
    sample_rate: f32,
    include_final: bool,
) -> Option<PreviewProbeFinalSpectrum> {
    if !include_final || capture.kind != "spectrum" {
        return None;
    }
    let captured_end = captured_samples.min(capture.duration_samples);
    let frame_size = capture
        .spectrum_window_size
        .unwrap_or(PREVIEW_CAPTURE_SPECTRUM_DEFAULT_FRAME_SIZE)
        .max(PREVIEW_CAPTURE_SPECTRUM_MIN_FRAME_SIZE);
    let source_column_count = captured_end / frame_size;
    if source_column_count == 0 {
        let bin_frequencies =
            build_preview_capture_full_spectrum_bin_frequencies(frame_size, sample_rate);
        return Some(PreviewProbeFinalSpectrum {
            columns: Vec::new(),
            requested_frequency_bins: bin_frequencies.len(),
            bin_frequencies,
            frame_size,
            sample_rate,
            captured_samples: captured_end,
            requested_time_columns: PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS,
            source_column_count,
        });
    }

    let output_column_count = source_column_count.min(PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS);
    let bin_frequencies =
        build_preview_capture_full_spectrum_bin_frequencies(frame_size, sample_rate);
    let hann_window = (0..frame_size)
        .map(|index| {
            0.5 - 0.5
                * ((2.0 * std::f32::consts::PI * index as f32)
                    / (frame_size.saturating_sub(1).max(1) as f32))
                    .cos()
        })
        .collect::<Vec<_>>();
    let columns = (0..output_column_count)
        .map(|column_index| {
            let source_column_index = if output_column_count <= 1 {
                0
            } else {
                (((column_index as f64 / (output_column_count - 1) as f64)
                    * (source_column_count - 1) as f64)
                    .round() as usize)
                    .min(source_column_count - 1)
            };
            let frame_start = source_column_index * frame_size;
            let magnitudes = measure_preview_capture_fft_magnitudes(
                &capture.samples,
                frame_start,
                frame_size,
                &hann_window,
            );
            magnitudes
        })
        .collect();
    let requested_frequency_bins = bin_frequencies.len();

    Some(PreviewProbeFinalSpectrum {
        columns,
        bin_frequencies,
        frame_size,
        sample_rate,
        captured_samples: captured_end,
        requested_time_columns: PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS,
        requested_frequency_bins,
        source_column_count,
    })
}

fn build_preview_capture_full_spectrum_bin_frequencies(
    frame_size: usize,
    sample_rate: f32,
) -> Vec<f32> {
    (0..=frame_size / 2)
        .map(|bin_index| (bin_index as f32 * sample_rate) / frame_size as f32)
        .collect()
}

fn build_preview_capture_spectrum_bin_indices(
    bin_count: usize,
    frame_size: usize,
    sample_rate: f32,
) -> Vec<usize> {
    let max_frequency = PREVIEW_CAPTURE_SPECTRUM_MAX_FREQUENCY_HZ.min(sample_rate / 2.0);
    let max_bin = (((max_frequency / sample_rate) * frame_size as f32).floor() as usize).max(2);
    (0..bin_count)
        .map(|index| {
            ((((index as f32 + 0.5) / bin_count as f32).powi(2) * max_bin as f32).floor() as usize)
                .max(1)
                .min(frame_size / 2)
        })
        .collect()
}

fn build_preview_capture_spectrum_bin_frequencies(
    bin_count: usize,
    frame_size: usize,
    sample_rate: f32,
) -> Vec<f32> {
    build_preview_capture_spectrum_bin_indices(bin_count, frame_size, sample_rate)
        .iter()
        .map(|bin_index| (*bin_index as f32 * sample_rate) / frame_size as f32)
        .collect()
}

fn measure_preview_capture_fft_magnitudes(
    samples: &[f32],
    frame_start: usize,
    frame_size: usize,
    hann_window: &[f32],
) -> Vec<f32> {
    let mut real = vec![0.0; frame_size];
    let mut imag = vec![0.0; frame_size];
    for index in 0..frame_size {
        real[index] = samples.get(frame_start + index).copied().unwrap_or(0.0) * hann_window[index];
    }

    run_radix2_fft(&mut real, &mut imag);

    (0..=frame_size / 2)
        .map(|index| {
            (real[index] * real[index] + imag[index] * imag[index]).sqrt() / frame_size as f32
        })
        .collect()
}

fn run_radix2_fft(real: &mut [f32], imag: &mut [f32]) {
    let len = real.len();
    if len <= 1 {
        return;
    }

    let mut j = 0;
    for i in 1..len {
        let mut bit = len >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            real.swap(i, j);
            imag.swap(i, j);
        }
    }

    let mut size = 2;
    while size <= len {
        let half_size = size / 2;
        let theta = -2.0 * std::f32::consts::PI / size as f32;
        let phase_step_real = theta.cos();
        let phase_step_imag = theta.sin();

        for start in (0..len).step_by(size) {
            let mut phase_real = 1.0;
            let mut phase_imag = 0.0;
            for offset in 0..half_size {
                let even = start + offset;
                let odd = even + half_size;
                let temp_real = phase_real * real[odd] - phase_imag * imag[odd];
                let temp_imag = phase_real * imag[odd] + phase_imag * real[odd];

                real[odd] = real[even] - temp_real;
                imag[odd] = imag[even] - temp_imag;
                real[even] += temp_real;
                imag[even] += temp_imag;

                let next_phase_real = phase_real * phase_step_real - phase_imag * phase_step_imag;
                phase_imag = phase_real * phase_step_imag + phase_imag * phase_step_real;
                phase_real = next_phase_real;
            }
        }

        size *= 2;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_capture_snapshots_use_a_bounded_whole_capture_summary() {
        let capture = TrackProbeCaptureState {
            probe_id: "probe_1".to_string(),
            kind: "scope".to_string(),
            signal_start: 0,
            duration_samples: PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES + 32,
            spectrum_window_size: None,
            samples: (0..PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES + 32)
                .map(|sample| sample as f32)
                .collect(),
            spectrum_columns: Vec::new(),
            spectrum_bin_frequencies: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
        };

        let samples = build_preview_capture_snapshot_samples(
            &capture,
            PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES + 32,
        );

        assert_eq!(samples.len(), PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES);
        assert_eq!(samples.first().copied(), Some(0.0));
        assert_eq!(
            samples.last().copied(),
            Some((PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES + 31) as f32)
        );
        assert!(
            resolve_preview_capture_snapshot_stride(
                &capture,
                PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES + 32
            ) > 1.0
        );
    }

    #[test]
    fn spectrum_probe_snapshots_use_source_rate_frames() {
        let frame_size = 1024;
        let sample_rate = 48_000.0;
        let mut capture = TrackProbeCaptureState {
            probe_id: "probe_1".to_string(),
            kind: "spectrum".to_string(),
            signal_start: 0,
            duration_samples: frame_size * 2,
            spectrum_window_size: Some(frame_size),
            samples: (0..frame_size * 2)
                .map(|sample| {
                    ((2.0 * std::f32::consts::PI * 440.0 * sample as f32) / sample_rate).sin() * 0.4
                })
                .collect(),
            spectrum_columns: Vec::new(),
            spectrum_bin_frequencies: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
        };

        let frames = update_and_build_preview_capture_spectrum_frames(
            &mut capture,
            frame_size * 2,
            sample_rate,
        )
        .unwrap();

        assert_eq!(frames.frame_size, frame_size);
        assert_eq!(frames.sample_rate, sample_rate);
        assert_eq!(frames.captured_samples, frame_size * 2);
        assert_eq!(frames.columns.len(), 2);
        assert_eq!(frames.start_column, 0);
        assert_eq!(capture.spectrum_analyzed_samples, frame_size * 2);
        let repeated_frames = update_and_build_preview_capture_spectrum_frames(
            &mut capture,
            frame_size * 2,
            sample_rate,
        )
        .unwrap();
        assert_eq!(repeated_frames.columns.len(), 0);
        assert_eq!(repeated_frames.start_column, 2);
        assert_eq!(capture.spectrum_analyzed_samples, frame_size * 2);
        assert_eq!(
            frames.bin_frequencies.len(),
            PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT
        );
        assert!(frames.columns[0].iter().copied().fold(0.0, f32::max) > 0.01);
    }

    #[test]
    fn final_spectrum_uses_higher_frequency_resolution_and_full_samples() {
        let frame_size = 256;
        let sample_rate = 48_000.0;
        let capture = TrackProbeCaptureState {
            probe_id: "probe_1".to_string(),
            kind: "spectrum".to_string(),
            signal_start: 0,
            duration_samples: frame_size * 3,
            spectrum_window_size: Some(frame_size),
            samples: (0..frame_size * 3)
                .map(|sample| {
                    ((2.0 * std::f32::consts::PI * 220.0 * sample as f32) / sample_rate).sin() * 0.4
                })
                .collect(),
            spectrum_columns: Vec::new(),
            spectrum_bin_frequencies: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
        };

        let final_spectrum =
            build_preview_capture_final_spectrum(&capture, frame_size * 3, sample_rate, true)
                .unwrap();
        let full_resolution_samples = capture
            .samples
            .iter()
            .take(frame_size * 3)
            .copied()
            .collect::<Vec<_>>();
        let unique_fft_bins = frame_size / 2 + 1;

        assert_eq!(final_spectrum.requested_frequency_bins, unique_fft_bins);
        assert_eq!(
            final_spectrum.requested_time_columns,
            PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS
        );
        assert_eq!(final_spectrum.source_column_count, 3);
        assert_eq!(final_spectrum.columns.len(), 3);
        assert_eq!(final_spectrum.columns[0].len(), unique_fft_bins);
        assert_eq!(final_spectrum.bin_frequencies.len(), unique_fft_bins);
        assert_eq!(full_resolution_samples.len(), frame_size * 3);
    }
}
