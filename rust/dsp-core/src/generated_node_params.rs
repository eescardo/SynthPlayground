// Generated from src/lib/patch/moduleRegistry.ts by scripts/generate-rust-node-params.ts.
// Do not edit by hand.

#![allow(dead_code)]

pub(crate) mod cv_transpose {
    pub(crate) const OCTAVES_MIN: f32 = -4.0;
    pub(crate) const OCTAVES_MAX: f32 = 4.0;
    pub(crate) const OCTAVES_DEFAULT: f32 = 0.0;
    pub(crate) const OCTAVES_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const SEMITONES_MIN: f32 = -11.0;
    pub(crate) const SEMITONES_MAX: f32 = 11.0;
    pub(crate) const SEMITONES_DEFAULT: f32 = 0.0;
    pub(crate) const SEMITONES_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const CENTS_MIN: f32 = -100.0;
    pub(crate) const CENTS_MAX: f32 = 100.0;
    pub(crate) const CENTS_DEFAULT: f32 = 0.0;
    pub(crate) const CENTS_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod cv_scaler {
    pub(crate) const SCALE_MIN: f32 = -2.0;
    pub(crate) const SCALE_MAX: f32 = 2.0;
    pub(crate) const SCALE_DEFAULT: f32 = 1.0;
    pub(crate) const SCALE_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod cv_mixer4 {
    pub(crate) const GAIN1_MIN: f32 = -2.0;
    pub(crate) const GAIN1_MAX: f32 = 2.0;
    pub(crate) const GAIN1_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN1_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN2_MIN: f32 = -2.0;
    pub(crate) const GAIN2_MAX: f32 = 2.0;
    pub(crate) const GAIN2_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN2_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN3_MIN: f32 = -2.0;
    pub(crate) const GAIN3_MAX: f32 = 2.0;
    pub(crate) const GAIN3_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN3_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN4_MIN: f32 = -2.0;
    pub(crate) const GAIN4_MAX: f32 = 2.0;
    pub(crate) const GAIN4_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN4_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod vco {
    pub(crate) const PULSE_WIDTH_MIN: f32 = 0.05;
    pub(crate) const PULSE_WIDTH_MAX: f32 = 0.95;
    pub(crate) const PULSE_WIDTH_DEFAULT: f32 = 0.5;
    pub(crate) const PULSE_WIDTH_SMOOTHING_MS: f32 = 20.0;
    pub(crate) const BASE_TUNE_CENTS_MIN: f32 = -1200.0;
    pub(crate) const BASE_TUNE_CENTS_MAX: f32 = 1200.0;
    pub(crate) const BASE_TUNE_CENTS_DEFAULT: f32 = 0.0;
    pub(crate) const BASE_TUNE_CENTS_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const FINE_TUNE_CENTS_MIN: f32 = -100.0;
    pub(crate) const FINE_TUNE_CENTS_MAX: f32 = 100.0;
    pub(crate) const FINE_TUNE_CENTS_DEFAULT: f32 = 0.0;
    pub(crate) const FINE_TUNE_CENTS_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const PWM_AMOUNT_MIN: f32 = 0.0;
    pub(crate) const PWM_AMOUNT_MAX: f32 = 0.5;
    pub(crate) const PWM_AMOUNT_DEFAULT: f32 = 0.0;
    pub(crate) const PWM_AMOUNT_SMOOTHING_MS: f32 = 20.0;
}

pub(crate) mod karplus_strong {
    pub(crate) const DECAY_MIN: f32 = 0.7;
    pub(crate) const DECAY_MAX: f32 = 0.999;
    pub(crate) const DECAY_DEFAULT: f32 = 0.94;
    pub(crate) const DECAY_SMOOTHING_MS: f32 = 20.0;
    pub(crate) const DAMPING_MIN: f32 = 0.0;
    pub(crate) const DAMPING_MAX: f32 = 1.0;
    pub(crate) const DAMPING_DEFAULT: f32 = 0.28;
    pub(crate) const DAMPING_SMOOTHING_MS: f32 = 20.0;
    pub(crate) const BRIGHTNESS_MIN: f32 = 0.0;
    pub(crate) const BRIGHTNESS_MAX: f32 = 1.0;
    pub(crate) const BRIGHTNESS_DEFAULT: f32 = 0.72;
    pub(crate) const BRIGHTNESS_SMOOTHING_MS: f32 = 20.0;
}

pub(crate) mod lfo {
    pub(crate) const FREQ_HZ_MIN: f32 = 0.01;
    pub(crate) const FREQ_HZ_MAX: f32 = 40.0;
    pub(crate) const FREQ_HZ_DEFAULT: f32 = 3.0;
    pub(crate) const FREQ_HZ_SMOOTHING_MS: f32 = 50.0;
    pub(crate) const PULSE_WIDTH_MIN: f32 = 0.05;
    pub(crate) const PULSE_WIDTH_MAX: f32 = 0.95;
    pub(crate) const PULSE_WIDTH_DEFAULT: f32 = 0.5;
    pub(crate) const PULSE_WIDTH_SMOOTHING_MS: f32 = 20.0;
}

pub(crate) mod adsr {
    pub(crate) const ATTACK_MIN: f32 = 0.0;
    pub(crate) const ATTACK_MAX: f32 = 10000.0;
    pub(crate) const ATTACK_DEFAULT: f32 = 10.0;
    pub(crate) const ATTACK_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const DECAY_MIN: f32 = 0.0;
    pub(crate) const DECAY_MAX: f32 = 10000.0;
    pub(crate) const DECAY_DEFAULT: f32 = 200.0;
    pub(crate) const DECAY_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const SUSTAIN_MIN: f32 = 0.0;
    pub(crate) const SUSTAIN_MAX: f32 = 1.0;
    pub(crate) const SUSTAIN_DEFAULT: f32 = 0.7;
    pub(crate) const SUSTAIN_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const RELEASE_MIN: f32 = 0.0;
    pub(crate) const RELEASE_MAX: f32 = 10000.0;
    pub(crate) const RELEASE_DEFAULT: f32 = 250.0;
    pub(crate) const RELEASE_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const CURVE_MIN: f32 = -1.0;
    pub(crate) const CURVE_MAX: f32 = 1.0;
    pub(crate) const CURVE_DEFAULT: f32 = 0.0;
    pub(crate) const CURVE_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod vca {
    pub(crate) const BIAS_MIN: f32 = 0.0;
    pub(crate) const BIAS_MAX: f32 = 2.0;
    pub(crate) const BIAS_DEFAULT: f32 = 0.0;
    pub(crate) const BIAS_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN_MIN: f32 = 0.0;
    pub(crate) const GAIN_MAX: f32 = 2.0;
    pub(crate) const GAIN_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod vcf {
    pub(crate) const CUTOFF_HZ_MIN: f32 = 20.0;
    pub(crate) const CUTOFF_HZ_MAX: f32 = 20000.0;
    pub(crate) const CUTOFF_HZ_DEFAULT: f32 = 1000.0;
    pub(crate) const CUTOFF_HZ_SMOOTHING_MS: f32 = 20.0;
    pub(crate) const RESONANCE_MIN: f32 = 0.0;
    pub(crate) const RESONANCE_MAX: f32 = 1.0;
    pub(crate) const RESONANCE_DEFAULT: f32 = 0.1;
    pub(crate) const RESONANCE_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const CUTOFF_MOD_AMOUNT_OCT_MIN: f32 = 0.0;
    pub(crate) const CUTOFF_MOD_AMOUNT_OCT_MAX: f32 = 6.0;
    pub(crate) const CUTOFF_MOD_AMOUNT_OCT_DEFAULT: f32 = 1.0;
    pub(crate) const CUTOFF_MOD_AMOUNT_OCT_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod mixer4 {
    pub(crate) const GAIN1_MIN: f32 = 0.0;
    pub(crate) const GAIN1_MAX: f32 = 1.0;
    pub(crate) const GAIN1_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN1_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN2_MIN: f32 = 0.0;
    pub(crate) const GAIN2_MAX: f32 = 1.0;
    pub(crate) const GAIN2_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN2_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN3_MIN: f32 = 0.0;
    pub(crate) const GAIN3_MAX: f32 = 1.0;
    pub(crate) const GAIN3_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN3_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const GAIN4_MIN: f32 = 0.0;
    pub(crate) const GAIN4_MAX: f32 = 1.0;
    pub(crate) const GAIN4_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN4_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod sample_player {
    pub(crate) const START_MIN: f32 = 0.0;
    pub(crate) const START_MAX: f32 = 1.0;
    pub(crate) const START_DEFAULT: f32 = 0.0;
    pub(crate) const END_MIN: f32 = 0.0;
    pub(crate) const END_MAX: f32 = 1.0;
    pub(crate) const END_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN_MIN: f32 = 0.0;
    pub(crate) const GAIN_MAX: f32 = 1.0;
    pub(crate) const GAIN_DEFAULT: f32 = 1.0;
    pub(crate) const GAIN_SMOOTHING_MS: f32 = 10.0;
    pub(crate) const PITCH_SEMIS_MIN: f32 = -48.0;
    pub(crate) const PITCH_SEMIS_MAX: f32 = 48.0;
    pub(crate) const PITCH_SEMIS_DEFAULT: f32 = 0.0;
    pub(crate) const PITCH_SEMIS_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod noise {
    pub(crate) const GAIN_MIN: f32 = 0.0;
    pub(crate) const GAIN_MAX: f32 = 1.0;
    pub(crate) const GAIN_DEFAULT: f32 = 0.3;
    pub(crate) const GAIN_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod delay {
    pub(crate) const TIME_MS_MIN: f32 = 1.0;
    pub(crate) const TIME_MS_MAX: f32 = 2000.0;
    pub(crate) const TIME_MS_DEFAULT: f32 = 300.0;
    pub(crate) const TIME_MS_SMOOTHING_MS: f32 = 30.0;
    pub(crate) const FEEDBACK_MIN: f32 = 0.0;
    pub(crate) const FEEDBACK_MAX: f32 = 0.95;
    pub(crate) const FEEDBACK_DEFAULT: f32 = 0.3;
    pub(crate) const FEEDBACK_SMOOTHING_MS: f32 = 30.0;
    pub(crate) const MIX_MIN: f32 = 0.0;
    pub(crate) const MIX_MAX: f32 = 1.0;
    pub(crate) const MIX_DEFAULT: f32 = 0.2;
    pub(crate) const MIX_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod reverb {
    pub(crate) const DECAY_MIN: f32 = 0.0;
    pub(crate) const DECAY_MAX: f32 = 1.0;
    pub(crate) const DECAY_DEFAULT: f32 = 0.45;
    pub(crate) const DECAY_SMOOTHING_MS: f32 = 50.0;
    pub(crate) const TONE_MIN: f32 = 0.0;
    pub(crate) const TONE_MAX: f32 = 1.0;
    pub(crate) const TONE_DEFAULT: f32 = 0.55;
    pub(crate) const TONE_SMOOTHING_MS: f32 = 50.0;
    pub(crate) const MIX_MIN: f32 = 0.0;
    pub(crate) const MIX_MAX: f32 = 1.0;
    pub(crate) const MIX_DEFAULT: f32 = 0.25;
    pub(crate) const MIX_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod saturation {
    pub(crate) const DRIVE_DB_MIN: f32 = 0.0;
    pub(crate) const DRIVE_DB_MAX: f32 = 24.0;
    pub(crate) const DRIVE_DB_DEFAULT: f32 = 6.0;
    pub(crate) const DRIVE_DB_SMOOTHING_MS: f32 = 20.0;
    pub(crate) const MIX_MIN: f32 = 0.0;
    pub(crate) const MIX_MAX: f32 = 1.0;
    pub(crate) const MIX_DEFAULT: f32 = 0.5;
    pub(crate) const MIX_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod overdrive {
    pub(crate) const DRIVE_DB_MIN: f32 = 0.0;
    pub(crate) const DRIVE_DB_MAX: f32 = 50.0;
    pub(crate) const DRIVE_DB_DEFAULT: f32 = 12.0;
    pub(crate) const DRIVE_DB_SMOOTHING_MS: f32 = 20.0;
    pub(crate) const TONE_MIN: f32 = 0.0;
    pub(crate) const TONE_MAX: f32 = 1.0;
    pub(crate) const TONE_DEFAULT: f32 = 0.5;
    pub(crate) const TONE_SMOOTHING_MS: f32 = 20.0;
}

pub(crate) mod compressor {
    pub(crate) const SQUASH_MIN: f32 = 0.0;
    pub(crate) const SQUASH_MAX: f32 = 1.0;
    pub(crate) const SQUASH_DEFAULT: f32 = 0.5;
    pub(crate) const SQUASH_SMOOTHING_MS: f32 = 50.0;
    pub(crate) const ATTACK_MS_MIN: f32 = 10.0;
    pub(crate) const ATTACK_MS_MAX: f32 = 600.0;
    pub(crate) const ATTACK_MS_DEFAULT: f32 = 20.0;
    pub(crate) const ATTACK_MS_SMOOTHING_MS: f32 = 50.0;
    pub(crate) const MIX_MIN: f32 = 0.0;
    pub(crate) const MIX_MAX: f32 = 1.0;
    pub(crate) const MIX_DEFAULT: f32 = 0.55;
    pub(crate) const MIX_SMOOTHING_MS: f32 = 10.0;
}

pub(crate) mod output {
    pub(crate) const GAIN_DB_MIN: f32 = -60.0;
    pub(crate) const GAIN_DB_MAX: f32 = 6.0;
    pub(crate) const GAIN_DB_DEFAULT: f32 = -6.0;
    pub(crate) const GAIN_DB_SMOOTHING_MS: f32 = 30.0;
}
