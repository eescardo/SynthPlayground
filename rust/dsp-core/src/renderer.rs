use crate::{
    clamp, db_to_gain, js_error, now_ms, sort_events, EngineProfileStats, EventSpec,
    MasterFxSpec, PreviewProbeCaptureSpec, PreviewProbeCaptureStateSnapshot, ProjectSpec,
};
use crate::stream::TrackRuntime;
use wasm_bindgen::prelude::*;

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
            preview_capture_sample_count: 0,
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
        self.preview_capture_sample_count = 0;
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

    pub fn configure_preview_probe_capture(&mut self, capture_json: &str) -> Result<(), JsValue> {
        let captures: Vec<PreviewProbeCaptureSpec> = serde_json::from_str(capture_json)
            .map_err(|error| js_error(format!("Failed to parse preview probe capture specs: {error}")))?;
        for track in self.tracks.iter_mut() {
            track.clear_probe_captures();
        }
        let mut captures_by_track: Vec<Vec<PreviewProbeCaptureSpec>> = vec![Vec::new(); self.tracks.len()];
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

    pub fn preview_capture_state_json(&self) -> Result<String, JsValue> {
        let captures = self
            .tracks
            .iter()
            .flat_map(|track| track.preview_capture_state_snapshot(self.preview_capture_sample_count))
            .collect();
        serde_json::to_string(&PreviewProbeCaptureStateSnapshot {
            captured_samples: self.preview_capture_sample_count,
            captures,
        })
        .map_err(|error| js_error(format!("Failed to serialize preview capture state: {error}")))
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
                let capture_sample_index = self.preview_capture_sample_count;
                for track in self.tracks.iter_mut() {
                    let track_started = now_ms();
                    mixed += track.render_track_sample(sample_rate, profile, true, Some(capture_sample_index));
                    profile.render_track_sample_ms += now_ms() - track_started;
                    profile.track_samples_rendered = profile.track_samples_rendered.saturating_add(1);
                }
                self.profile_stats.render_tracks_ms += now_ms() - started;
            } else {
                let capture_sample_index = self.preview_capture_sample_count;
                for track in self.tracks.iter_mut() {
                    mixed += track.render_track_sample(self.sample_rate, &mut self.profile_stats, false, Some(capture_sample_index));
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
            self.preview_capture_sample_count = self.preview_capture_sample_count.saturating_add(1);
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
        self.preview_capture_sample_count = 0;
        for track in self.tracks.iter_mut() {
            track.stop_all_voices();
            track.clear_probe_captures();
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
                    track.set_volume(value);
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
