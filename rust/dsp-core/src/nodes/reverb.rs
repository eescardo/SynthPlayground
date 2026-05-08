use crate::{clamp, ReverbMode};

#[inline(always)]
pub(super) fn reverb_mode_delay_seconds(mode: ReverbMode, line_index: usize, decay: f32) -> f32 {
    let d = clamp(decay, 0.0, 1.0);
    let values = match mode {
        ReverbMode::Room => [
            0.007 + d * 0.006,
            0.011 + d * 0.008,
            0.016 + d * 0.010,
            0.022 + d * 0.012,
        ],
        ReverbMode::Hall => [
            0.037 + d * 0.034,
            0.049 + d * 0.047,
            0.061 + d * 0.059,
            0.079 + d * 0.071,
        ],
        ReverbMode::Plate => [
            0.011 + d * 0.009,
            0.017 + d * 0.011,
            0.023 + d * 0.014,
            0.031 + d * 0.018,
        ],
        ReverbMode::Spring => [
            0.019 + d * 0.006,
            0.027 + d * 0.008,
            0.034 + d * 0.011,
            0.046 + d * 0.014,
        ],
    };
    values[line_index]
}

#[inline(always)]
fn reverb_room_late_delay_seconds(line_index: usize, decay: f32) -> f32 {
    let d = clamp(decay, 0.0, 1.0);
    let values = [
        0.031 + d * 0.014,
        0.043 + d * 0.019,
        0.058 + d * 0.025,
        0.077 + d * 0.033,
    ];
    values[line_index]
}

#[inline(always)]
pub(super) fn reverb_mode_feedback(mode: ReverbMode, decay: f32) -> f32 {
    let d = clamp(decay, 0.0, 1.0).powf(0.72);
    match mode {
        ReverbMode::Room => 0.46 + d * 0.49,
        ReverbMode::Hall => 0.54 + d * 0.43,
        ReverbMode::Plate => 0.58 + d * 0.40,
        ReverbMode::Spring => 0.47 + d * 0.43,
    }
}

#[inline(always)]
pub(super) fn reverb_mode_input_gain(mode: ReverbMode) -> f32 {
    match mode {
        ReverbMode::Room => 0.54,
        ReverbMode::Hall => 0.46,
        ReverbMode::Plate => 0.48,
        ReverbMode::Spring => 0.48,
    }
}

#[inline(always)]
pub(super) fn reverb_mode_wet_gain(mode: ReverbMode) -> f32 {
    match mode {
        ReverbMode::Room => 2.7,
        ReverbMode::Hall => 1.75,
        ReverbMode::Plate => 3.2,
        ReverbMode::Spring => 2.8,
    }
}

#[inline(always)]
pub(super) fn reverb_mode_line_count(mode: ReverbMode) -> usize {
    match mode {
        ReverbMode::Room => 8,
        _ => 4,
    }
}

#[inline(always)]
pub(super) fn reverb_line_delay_seconds(mode: ReverbMode, line_index: usize, decay: f32) -> f32 {
    if line_index < 4 {
        reverb_mode_delay_seconds(mode, line_index, decay)
    } else {
        reverb_room_late_delay_seconds(line_index - 4, decay)
    }
}

#[derive(Clone)]
pub(super) struct ReverbDelayLineBank {
    buffers: Vec<Vec<f32>>,
    lowpass: Vec<f32>,
    write: usize,
}

impl ReverbDelayLineBank {
    pub(super) fn new(mode: ReverbMode, sample_rate: f32) -> Self {
        let mut bank = Self {
            buffers: Vec::new(),
            lowpass: Vec::new(),
            write: 0,
        };
        bank.ensure_line_count(mode, sample_rate);
        bank
    }

    pub(super) fn ensure_line_count(&mut self, mode: ReverbMode, sample_rate: f32) {
        let target_count = reverb_mode_line_count(mode);
        if self.buffers.len() == target_count {
            return;
        }
        let delay_len = ((sample_rate * 0.18) as usize).max(2);
        self.buffers
            .resize_with(target_count, || vec![0.0; delay_len]);
        self.lowpass.resize(target_count, 0.0);
        self.write %= delay_len;
    }

    pub(super) fn reset(&mut self) {
        for buffer in &mut self.buffers {
            buffer.fill(0.0);
        }
        self.lowpass.fill(0.0);
        self.write = 0;
    }

    pub(super) fn read(&self, line_index: usize, delay_seconds: f32, sample_rate: f32) -> f32 {
        let Some(buffer) = self.buffers.get(line_index) else {
            return 0.0;
        };
        let delay_samples = clamp(
            (delay_seconds * sample_rate).floor(),
            1.0,
            (buffer.len() - 1) as f32,
        ) as usize;
        let read_index = (self.write + buffer.len() - delay_samples) % buffer.len();
        buffer[read_index]
    }

    pub(super) fn update_lowpass(&mut self, line_index: usize, target: f32, alpha: f32) {
        if let Some(lowpass) = self.lowpass.get_mut(line_index) {
            *lowpass += (target - *lowpass) * alpha;
        }
    }

    pub(super) fn lp(&self, line_index: usize) -> f32 {
        self.lowpass.get(line_index).copied().unwrap_or(0.0)
    }

    pub(super) fn write_line(&mut self, line_index: usize, value: f32) {
        if let Some(buffer) = self.buffers.get_mut(line_index) {
            buffer[self.write] = clamp(value, -3.0, 3.0);
        }
    }

    pub(super) fn advance(&mut self) {
        if let Some(buffer) = self.buffers.first() {
            self.write = (self.write + 1) % buffer.len();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverb_decay_extends_primary_mode_timing_and_feedback() {
        assert!(
            reverb_mode_delay_seconds(ReverbMode::Room, 3, 1.0)
                > reverb_mode_delay_seconds(ReverbMode::Room, 3, 0.0)
        );
        assert!(
            reverb_mode_feedback(ReverbMode::Room, 1.0)
                > reverb_mode_feedback(ReverbMode::Room, 0.0)
        );
        assert!(reverb_mode_feedback(ReverbMode::Room, 1.0) > 0.9);
        assert!(reverb_mode_feedback(ReverbMode::Hall, 1.0) > 0.95);
        assert!(reverb_mode_feedback(ReverbMode::Plate, 1.0) > 0.9);
        assert!(reverb_mode_feedback(ReverbMode::Spring, 1.0) > 0.85);
    }

    #[test]
    fn reverb_modes_have_distinct_time_profiles() {
        assert!(
            reverb_mode_delay_seconds(ReverbMode::Hall, 3, 1.0)
                > reverb_mode_delay_seconds(ReverbMode::Room, 3, 1.0)
        );
        assert!(
            reverb_mode_delay_seconds(ReverbMode::Plate, 0, 0.5)
                < reverb_mode_delay_seconds(ReverbMode::Hall, 0, 0.5)
        );
        assert!(
            reverb_mode_delay_seconds(ReverbMode::Spring, 1, 0.5)
                > reverb_mode_delay_seconds(ReverbMode::Plate, 1, 0.5)
        );
    }

    #[test]
    fn reverb_delay_bank_allocates_by_mode() {
        let mut bank = ReverbDelayLineBank::new(ReverbMode::Plate, 48_000.0);
        assert_eq!(
            bank.buffers.len(),
            reverb_mode_line_count(ReverbMode::Plate)
        );
        assert_eq!(bank.lowpass.len(), 4);

        bank.ensure_line_count(ReverbMode::Room, 48_000.0);
        assert_eq!(bank.buffers.len(), reverb_mode_line_count(ReverbMode::Room));
        assert_eq!(bank.lowpass.len(), 8);

        bank.ensure_line_count(ReverbMode::Hall, 48_000.0);
        assert_eq!(bank.buffers.len(), reverb_mode_line_count(ReverbMode::Hall));
        assert_eq!(bank.lowpass.len(), 4);
    }
}
