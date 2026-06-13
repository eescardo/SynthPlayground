use crate::stream::TrackRuntime;
use crate::{
    build_sample_asset, clamp, db_to_gain, js_error, now_ms, sort_events, EngineProfileStats,
    EventSpec, MasterFxSpec, PreviewProbeCaptureSpec, PreviewProbeCaptureStateSnapshot,
    ProjectSpec, SampleAsset,
};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

fn pending_track_sample_assets(
    assets_by_track: &mut Vec<HashMap<String, SampleAsset>>,
    track_index: usize,
) -> &mut HashMap<String, SampleAsset> {
    if assets_by_track.len() <= track_index {
        assets_by_track.resize_with(track_index + 1, HashMap::new);
    }
    &mut assets_by_track[track_index]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stereo_energy(engine: &WasmSubsetEngine) -> (f32, f32) {
        (
            engine.left.iter().map(|sample| sample * sample).sum(),
            engine.right.iter().map(|sample| sample * sample).sum(),
        )
    }

    fn test_project_json(pan: f32) -> String {
        json!({
            "sampleRate": 48000,
            "blockSize": 128,
            "masterFx": {
                "compressorEnabled": false,
                "limiterEnabled": false,
                "makeupGain": 0.0
            },
            "tracks": [{
                "trackIndex": 0,
                "trackId": "track_1",
                "volume": 1.0,
                "pan": pan,
                "fx": {
                    "delayEnabled": false,
                    "reverbEnabled": false,
                    "saturationEnabled": false,
                    "compressorEnabled": false,
                    "delayMix": 0.0,
                    "reverbMix": 0.0,
                    "drive": 0.0,
                    "compression": 0.0
                },
                "signalCount": 5,
                "hostSignalIndices": {
                    "pitch": 0,
                    "gate": 1,
                    "velocity": 2,
                    "modWheel": 3
                },
                "outputSignalIndex": 4,
                "nodes": [{
                    "id": "osc",
                    "typeId": "VCO",
                    "outIndex": 4,
                    "inputs": {
                        "pitch": 0,
                        "fm": -1,
                        "pwm": -1
                    },
                    "params": {
                        "wave": "sine"
                    }
                }]
            }]
        })
        .to_string()
    }

    #[test]
    fn track_pan_controls_left_right_render_energy() {
        let mut engine = WasmSubsetEngine::new(48_000, 128);
        let initial_events = json!([{
            "type": "NoteOn",
            "sampleTime": 0,
            "trackIndex": 0,
            "noteId": "note_1",
            "pitchVoct": 0.0,
            "velocity": 1.0
        }])
        .to_string();

        engine
            .start_stream(&test_project_json(0.0), 0, &initial_events, 1, 1234)
            .expect("test project should start");
        engine.process_block();
        let (left_energy, right_energy) = stereo_energy(&engine);
        assert!(left_energy > 0.01);
        assert!(right_energy < left_energy * 0.001);

        let pan_right_events = json!([{
            "type": "TrackPanChange",
            "sampleTime": 128,
            "trackIndex": 0,
            "value": 1.0
        }])
        .to_string();
        engine
            .enqueue_events(&pan_right_events)
            .expect("pan event should enqueue");
        engine.process_block();
        let (left_energy, right_energy) = stereo_energy(&engine);
        assert!(right_energy > 0.01);
        assert!(left_energy < right_energy * 0.001);
    }
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
    preview_capture_sample_count: usize,
    profiling_enabled: bool,
    profile_stats: EngineProfileStats,
    pending_sample_assets_by_track: Vec<HashMap<String, SampleAsset>>,
}

#[wasm_bindgen]
impl WasmSubsetEngine {
    #[wasm_bindgen(constructor)]
    /// Creates a renderer with empty output buffers and no loaded project state.
    /// Params:
    /// - `sample_rate`: initial sample rate used until a project stream is started.
    /// - `block_size`: number of samples each `process_block` call writes into the output buffers.
    pub fn new(sample_rate: u32, block_size: usize) -> Self {
        Self {
            sample_rate: sample_rate as f32,
            block_size,
            tracks: Vec::new(),
            master_fx: MasterFxSpec {
                compressor_enabled: false,
                limiter_enabled: true,
                makeup_gain: 0.0,
            },
            master_compressor_env: 0.0,
            event_queue: Vec::new(),
            event_cursor: 0,
            song_sample_counter: 0,
            stopped: true,
            left: vec![0.0; block_size],
            right: vec![0.0; block_size],
            preview_capture_sample_count: 0,
            profiling_enabled: false,
            profile_stats: EngineProfileStats::default(),
            pending_sample_assets_by_track: Vec::new(),
        }
    }

    /// Loads a compiled project and resets the engine for a brand-new stream session.
    /// Params:
    /// - `project_json`: serialized `ProjectSpec` containing tracks, node graphs, and FX settings.
    /// - `song_start_sample`: absolute song position where rendering should begin.
    /// - `events_json`: serialized event queue already compiled for the WASM runtime.
    /// - `_session_id`: reserved transport session identifier kept for JS/WASM API parity.
    /// - `random_seed`: base seed used to derive deterministic track and voice RNG state.
    pub fn start_stream(
        &mut self,
        project_json: &str,
        song_start_sample: u32,
        events_json: &str,
        _session_id: u32,
        random_seed: u32,
    ) -> Result<(), JsValue> {
        let project: ProjectSpec = serde_json::from_str(project_json)
            .map_err(|error| js_error(format!("Failed to parse WASM project: {error}")))?;
        let mut events: Vec<EventSpec> = serde_json::from_str(events_json)
            .map_err(|error| js_error(format!("Failed to parse WASM events: {error}")))?;
        sort_events(&mut events);

        self.sample_rate = project.sample_rate as f32;
        self.block_size = project.block_size.max(1);
        self.left.resize(self.block_size, 0.0);
        self.right.resize(self.block_size, 0.0);
        self.left.fill(0.0);
        self.right.fill(0.0);
        let tracks = project
            .tracks
            .into_iter()
            .enumerate()
            .map(|track| {
                let (track_index, track) = track;
                TrackRuntime::from_spec(
                    track,
                    self.sample_rate,
                    self.block_size,
                    random_seed,
                    self.pending_sample_assets_by_track.get(track_index),
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.tracks = tracks;
        self.pending_sample_assets_by_track.clear();
        self.master_fx = project.master_fx;
        self.master_compressor_env = 0.0;
        self.event_queue = events;
        self.event_cursor = 0;
        self.song_sample_counter = song_start_sample;
        self.preview_capture_sample_count = 0;
        self.stopped = false;
        self.profile_stats = EngineProfileStats::default();
        Ok(())
    }

    /// Appends precompiled events to the current stream and keeps the queue sorted by sample time.
    /// Params:
    /// - `events_json`: serialized event slice to merge into the live queue.
    pub fn enqueue_events(&mut self, events_json: &str) -> Result<(), JsValue> {
        let mut events: Vec<EventSpec> = serde_json::from_str(events_json)
            .map_err(|error| js_error(format!("Failed to parse appended WASM events: {error}")))?;
        self.event_queue.append(&mut events);
        sort_events(&mut self.event_queue);
        Ok(())
    }

    pub fn set_sample_asset(
        &mut self,
        track_index: usize,
        node_id: &str,
        sample_rate: f32,
        samples: &[f32],
    ) -> Result<(), JsValue> {
        let track = self.tracks.get_mut(track_index).ok_or_else(|| {
            js_error(format!(
                "Unknown track index for sample asset: {track_index}"
            ))
        })?;
        track.set_sample_asset(node_id, sample_rate, samples);
        Ok(())
    }

    pub fn stage_sample_asset(
        &mut self,
        track_index: usize,
        node_id: &str,
        sample_rate: f32,
        samples: &[f32],
    ) -> Result<(), JsValue> {
        let track_assets =
            pending_track_sample_assets(&mut self.pending_sample_assets_by_track, track_index);
        if let Some(asset) = build_sample_asset(sample_rate, samples) {
            track_assets.insert(node_id.to_string(), asset);
        } else {
            track_assets.remove(node_id);
        }
        Ok(())
    }

    /// Installs preview probe capture requests on the currently loaded tracks.
    /// Params:
    /// - `capture_json`: serialized probe specs with resolved track indices and signal indices.
    pub fn configure_preview_probe_capture(&mut self, capture_json: &str) -> Result<(), JsValue> {
        let captures: Vec<PreviewProbeCaptureSpec> =
            serde_json::from_str(capture_json).map_err(|error| {
                js_error(format!(
                    "Failed to parse preview probe capture specs: {error}"
                ))
            })?;
        for track in self.tracks.iter_mut() {
            track.clear_probe_captures();
        }
        let mut captures_by_track: Vec<Vec<PreviewProbeCaptureSpec>> =
            vec![Vec::new(); self.tracks.len()];
        for capture in captures.into_iter() {
            if let Some(track_captures) = captures_by_track.get_mut(capture.track_index) {
                track_captures.push(capture);
            }
        }
        for (track_index, track_captures) in captures_by_track.into_iter().enumerate() {
            if !track_captures.is_empty() {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.configure_probe_captures(track_captures);
                }
            }
        }
        self.preview_capture_sample_count = 0;
        Ok(())
    }

    /// Serializes the probe capture buffers accumulated so far for the active preview.
    /// Params:
    /// - `self`: engine whose tracks currently own the capture buffers.
    pub fn preview_capture_state_json(
        &mut self,
        include_final: bool,
        include_samples: Option<bool>,
    ) -> Result<String, JsValue> {
        let include_samples = include_samples.unwrap_or(true);
        let captures = self
            .tracks
            .iter_mut()
            .flat_map(|track| {
                track.preview_capture_state_snapshot(
                    self.preview_capture_sample_count,
                    self.sample_rate,
                    include_final,
                    include_samples,
                )
            })
            .collect();
        serde_json::to_string(&PreviewProbeCaptureStateSnapshot {
            captured_samples: self.preview_capture_sample_count,
            captures,
        })
        .map_err(|error| {
            js_error(format!(
                "Failed to serialize preview capture state: {error}"
            ))
        })
    }

    pub fn preview_capture_sample_count(&self) -> usize {
        self.preview_capture_sample_count
    }

    pub fn preview_capture_samples_ptr(&self, probe_id: &str) -> *const f32 {
        self.tracks
            .iter()
            .map(|track| track.probe_capture_samples_ptr(probe_id))
            .find(|ptr| !ptr.is_null())
            .unwrap_or(std::ptr::null())
    }

    pub fn preview_capture_samples_len(&self, probe_id: &str) -> usize {
        self.tracks
            .iter()
            .map(|track| {
                track.probe_capture_samples_len(probe_id, self.preview_capture_sample_count)
            })
            .find(|length| *length > 0)
            .unwrap_or(0)
    }

    pub fn has_active_voices(&self) -> bool {
        // Preview streams intentionally allow a long timeout for held notes; this lets the
        // JS wrapper stop early once every released voice has actually decayed to silence.
        self.tracks.iter().any(TrackRuntime::has_active_voices)
    }

    fn next_pending_event_sample(&self) -> Option<u32> {
        self.event_queue
            .get(self.event_cursor)
            .map(EventSpec::sample_time)
    }

    fn apply_master_fx_range(&mut self, start_frame: usize, end_frame: usize) {
        for frame in start_frame..end_frame {
            let (left, right) = self.apply_master_fx_pair(self.left[frame], self.right[frame]);
            self.left[frame] = left;
            self.right[frame] = right;
        }
    }

    /// Renders one audio block by consuming due events, summing track output, and applying master FX.
    /// Params:
    /// - `self`: engine containing the live stream state, output buffers, and optional profiling counters.
    pub fn process_block(&mut self) -> bool {
        let block_started = if self.profiling_enabled {
            Some(now_ms())
        } else {
            None
        };
        self.left.fill(0.0);
        self.right.fill(0.0);
        if self.stopped {
            return true;
        }

        let mut frame = 0;
        while frame < self.block_size {
            if self.profiling_enabled {
                let started = now_ms();
                self.consume_due_events();
                self.profile_stats.consume_due_events_ms += now_ms() - started;
            } else {
                self.consume_due_events();
            }

            let mut segment_end = self.block_size;
            if let Some(next_event_sample) = self.next_pending_event_sample() {
                if next_event_sample > self.song_sample_counter {
                    let frames_until_event =
                        (next_event_sample - self.song_sample_counter).max(1) as usize;
                    segment_end = segment_end.min(frame + frames_until_event);
                }
            }
            if segment_end <= frame {
                segment_end = frame + 1;
            }

            if self.profiling_enabled {
                let started = now_ms();
                let sample_rate = self.sample_rate;
                let profile = &mut self.profile_stats;
                let capture_offset = self.preview_capture_sample_count;
                for track in self.tracks.iter_mut() {
                    let track_started = now_ms();
                    track.process_track_frames(
                        &mut self.left,
                        &mut self.right,
                        frame,
                        segment_end,
                        sample_rate,
                        profile,
                        true,
                        capture_offset,
                    );
                    profile.render_track_sample_ms += now_ms() - track_started;
                }
                self.profile_stats.render_tracks_ms += now_ms() - started;
            } else {
                let capture_offset = self.preview_capture_sample_count;
                for track in self.tracks.iter_mut() {
                    track.process_track_frames(
                        &mut self.left,
                        &mut self.right,
                        frame,
                        segment_end,
                        self.sample_rate,
                        &mut self.profile_stats,
                        false,
                        capture_offset,
                    );
                }
            }
            if self.profiling_enabled {
                let started = now_ms();
                self.apply_master_fx_range(frame, segment_end);
                self.profile_stats.apply_master_fx_ms += now_ms() - started;
                self.profile_stats.samples_processed = self
                    .profile_stats
                    .samples_processed
                    .saturating_add((segment_end.saturating_sub(frame)) as u64);
            } else {
                self.apply_master_fx_range(frame, segment_end);
            }
            let rendered_frames = segment_end.saturating_sub(frame) as u32;
            self.song_sample_counter = self.song_sample_counter.saturating_add(rendered_frames);
            self.preview_capture_sample_count = self
                .preview_capture_sample_count
                .saturating_add(rendered_frames as usize);
            for track in self.tracks.iter_mut() {
                track.advance_probe_capture_analysis(
                    self.preview_capture_sample_count,
                    self.sample_rate,
                );
            }
            frame = segment_end;
        }

        if let Some(started) = block_started {
            self.profile_stats.blocks_processed =
                self.profile_stats.blocks_processed.saturating_add(1);
            self.profile_stats.process_block_ms += now_ms() - started;
        }

        true
    }

    pub fn stop(&mut self) {
        self.stopped = true;
        self.event_queue.clear();
        self.event_cursor = 0;
        self.preview_capture_sample_count = 0;
        for track in self.tracks.iter_mut() {
            track.stop_all_voices();
            track.clear_probe_captures();
        }
    }

    pub fn stop_track(&mut self, track_index: usize) {
        if let Some(track) = self.tracks.get_mut(track_index) {
            track.stop_all_voices();
            track.set_volume(0.0);
        }

        let previous_cursor = self.event_cursor;
        let mut next_cursor = 0;
        let mut event_index = 0;
        self.event_queue.retain(|event| {
            let keep = event.track_index() != track_index;
            if keep && event_index < previous_cursor {
                next_cursor += 1;
            }
            event_index += 1;
            keep
        });
        self.event_cursor = next_cursor.min(self.event_queue.len());
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
            if self.event_queue[self.event_cursor].sample_time() > self.song_sample_counter {
                break;
            }
            let event = self.event_queue[self.event_cursor].clone();
            self.apply_event(event);
            self.event_cursor += 1;
        }
    }

    /// Applies a single scheduled event to the live stream state.
    /// Params:
    /// - `event`: precompiled event whose target track, note, or parameter should be updated immediately.
    fn apply_event(&mut self, event: EventSpec) {
        let started = if self.profiling_enabled {
            Some(now_ms())
        } else {
            None
        };
        match event {
            EventSpec::NoteOn {
                track_index,
                note_id,
                pitch_voct,
                velocity,
                sample_time,
            } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.note_on(note_id, pitch_voct, velocity, sample_time);
                }
            }
            EventSpec::NoteOff {
                track_index,
                note_id,
                ..
            } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.note_off(&note_id);
                }
            }
            EventSpec::ParamChange {
                track_index,
                node_id,
                param_id,
                value,
                ..
            } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.apply_param_change(&node_id, &param_id, &value);
                }
            }
            EventSpec::TrackVolumeChange {
                track_index, value, ..
            } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.set_volume(value);
                }
            }
            EventSpec::TrackPanChange {
                track_index, value, ..
            } => {
                if let Some(track) = self.tracks.get_mut(track_index) {
                    track.set_pan(value);
                }
            }
        }
        if let Some(started) = started {
            self.profile_stats.events_applied = self.profile_stats.events_applied.saturating_add(1);
            self.profile_stats.apply_event_ms += now_ms() - started;
        }
    }

    /// Applies master-bus dynamics and limiting after all tracks have been mixed together.
    /// Params:
    /// - `left`: left mix sample produced by summing the per-track outputs for the current frame.
    /// - `right`: right mix sample produced by summing the per-track outputs for the current frame.
    fn apply_master_fx_pair(&mut self, left: f32, right: f32) -> (f32, f32) {
        let mut out_left = left;
        let mut out_right = right;
        if self.master_fx.compressor_enabled {
            let abs_in = out_left.abs().max(out_right.abs());
            self.master_compressor_env = self.master_compressor_env * 0.996 + abs_in * 0.004;
            let over = (self.master_compressor_env - 0.25).max(0.0);
            let gain = 1.0 / (1.0 + over * 5.0);
            out_left *= gain;
            out_right *= gain;
        }
        let makeup_gain = db_to_gain(self.master_fx.makeup_gain);
        out_left *= makeup_gain;
        out_right *= makeup_gain;
        if self.master_fx.limiter_enabled {
            out_left = clamp(out_left, -0.98, 0.98);
            out_right = clamp(out_right, -0.98, 0.98);
        }
        (
            if out_left.is_finite() { out_left } else { 0.0 },
            if out_right.is_finite() {
                out_right
            } else {
                0.0
            },
        )
    }
}
