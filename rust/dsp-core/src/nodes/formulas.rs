use crate::clamp;

#[inline(always)]
pub(super) fn shape_overdrive_sample(input: f32) -> f32 {
    input.tanh()
}

#[inline(always)]
pub(super) fn shape_fuzz_sample(input: f32) -> f32 {
    let driven = input * 3.2;
    let clipped = if driven >= 0.0 {
        clamp(driven, 0.0, 0.45) / 0.45
    } else {
        clamp(driven, -0.28, 0.0) / 0.28
    };
    let squared = clipped.signum() * clipped.abs().powf(0.42);
    let asymmetric = if squared >= 0.0 {
        squared * 0.88
    } else {
        squared * 1.08
    };
    let broken = asymmetric + asymmetric * asymmetric * asymmetric * 0.12;
    clamp(broken, -1.0, 1.0)
}

#[inline(always)]
pub(super) fn overdrive_tone_alpha(tone: f32) -> f32 {
    let t = clamp(tone, 0.0, 1.0);
    clamp(0.012 + t * t * 0.9, 0.012, 0.92)
}

#[inline(always)]
pub(super) fn overdrive_drive_amount(drive_db: f32) -> f32 {
    clamp(drive_db / 50.0, 0.0, 1.0)
}

#[inline(always)]
pub(super) fn apply_overdrive_tone(input: f32, lowpassed: f32, tone: f32) -> f32 {
    let t = clamp(tone, 0.0, 1.0);
    let makeup = 1.0 + (1.0 - t).powf(1.35) * 2.1;
    let darker = (lowpassed * makeup).tanh();
    input * t + darker * (1.0 - t)
}

#[inline(always)]
pub(super) fn compressor_threshold_db_for_squash(squash: f32) -> f32 {
    let amount = clamp(squash, 0.0, 1.0);
    -5.0 - 43.0 * amount.powf(1.08)
}

#[inline(always)]
pub(super) fn compressor_ratio_for_squash(squash: f32) -> f32 {
    let amount = clamp(squash, 0.0, 1.0);
    1.0 + 19.0 * amount.powf(1.45)
}

#[inline(always)]
pub(super) fn compressor_auto_gain_db_for_squash(squash: f32, attack_ms: f32) -> f32 {
    let amount = clamp(squash, 0.0, 1.0);
    let attack_ratio = (clamp(attack_ms, 10.0, 600.0) / 10.0).ln() / 60.0_f32.ln();
    amount * (30.0 + 8.0 * (1.0 - attack_ratio.powf(0.8)))
}

#[inline(always)]
pub(super) fn compressor_release_ms_for_squash(squash: f32) -> f32 {
    let amount = clamp(squash, 0.0, 1.0);
    260.0 - 150.0 * amount.powf(0.75)
}

#[inline(always)]
pub(super) fn compressor_gain_reduction_db(level_db: f32, threshold_db: f32, ratio: f32) -> f32 {
    let safe_ratio = ratio.max(1.0);
    let knee_db = 12.0;
    let over_threshold_db = level_db - threshold_db;
    let over_db = if over_threshold_db <= -knee_db / 2.0 {
        0.0
    } else if over_threshold_db >= knee_db / 2.0 {
        over_threshold_db
    } else {
        (over_threshold_db + knee_db / 2.0).powi(2) / (2.0 * knee_db)
    };
    over_db * (1.0 - 1.0 / safe_ratio)
}

#[inline(always)]
pub(super) fn envelope_curve_progress(t: f32, curve: f32) -> f32 {
    let clamped_t = clamp(t, 0.0, 1.0);
    let clamped_curve = clamp(curve, -1.0, 1.0);
    let exponent = if clamped_curve < 0.0 {
        1.0 + clamped_curve * 0.65
    } else {
        1.0 + clamped_curve * 1.8
    };
    clamped_t.powf(exponent.max(0.35))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct DspFormulaFixtures {
        #[serde(rename = "compressorDerived")]
        compressor_derived: Vec<CompressorDerivedFixture>,
        #[serde(rename = "compressorGainReduction")]
        compressor_gain_reduction: Vec<CompressorGainReductionFixture>,
        #[serde(rename = "adsrCurve")]
        adsr_curve: Vec<AdsrCurveFixture>,
        #[serde(rename = "overdriveShape")]
        overdrive_shape: Vec<OverdriveShapeFixture>,
        #[serde(rename = "overdriveTone")]
        overdrive_tone: Vec<OverdriveToneFixture>,
        #[serde(rename = "overdriveDrive")]
        overdrive_drive: Vec<OverdriveDriveFixture>,
    }

    #[derive(Deserialize)]
    struct CompressorDerivedFixture {
        squash: f32,
        #[serde(rename = "attackMs")]
        attack_ms: f32,
        expected: CompressorDerivedExpected,
    }

    #[derive(Deserialize)]
    struct CompressorDerivedExpected {
        #[serde(rename = "thresholdDb")]
        threshold_db: f32,
        ratio: f32,
        #[serde(rename = "autoGainDb")]
        auto_gain_db: f32,
        #[serde(rename = "releaseMs")]
        release_ms: f32,
    }

    #[derive(Deserialize)]
    struct CompressorGainReductionFixture {
        #[serde(rename = "inputDb")]
        input_db: f32,
        #[serde(rename = "thresholdDb")]
        threshold_db: f32,
        ratio: f32,
        #[serde(rename = "expectedDb")]
        expected_db: f32,
    }

    #[derive(Deserialize)]
    struct AdsrCurveFixture {
        t: f32,
        curve: f32,
        expected: f32,
    }

    #[derive(Deserialize)]
    struct OverdriveShapeFixture {
        input: f32,
        mode: String,
        expected: f32,
    }

    #[derive(Deserialize)]
    struct OverdriveToneFixture {
        input: Option<f32>,
        lowpassed: Option<f32>,
        tone: f32,
        expected: Option<f32>,
        #[serde(rename = "expectedAlpha")]
        expected_alpha: Option<f32>,
    }

    #[derive(Deserialize)]
    struct OverdriveDriveFixture {
        #[serde(rename = "driveDb")]
        drive_db: f32,
        expected: f32,
    }

    fn dsp_formula_fixtures() -> DspFormulaFixtures {
        serde_json::from_str(include_str!(
            "../../../../src/lib/patch/dspFormulaFixtures.json"
        ))
        .expect("shared DSP formula fixtures should parse")
    }

    fn assert_close(actual: f32, expected: f32) {
        assert!(
            (actual - expected).abs() < 0.0001,
            "expected {actual} to be close to {expected}"
        );
    }

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
        assert!(apply_overdrive_tone(0.5, 0.1, 0.0) > 0.25);
        assert!(apply_overdrive_tone(0.5, 0.1, 0.0) < 0.35);
    }

    #[test]
    fn drive_amount_starts_at_identity() {
        assert_eq!(overdrive_drive_amount(0.0), 0.0);
        assert_eq!(overdrive_drive_amount(50.0), 1.0);
    }

    #[test]
    fn compressor_squash_maps_to_pedal_style_controls() {
        assert!((compressor_threshold_db_for_squash(0.0) + 5.0).abs() < 0.001);
        assert!((compressor_threshold_db_for_squash(1.0) + 48.0).abs() < 0.001);
        assert_eq!(compressor_ratio_for_squash(0.0), 1.0);
        assert!((compressor_ratio_for_squash(1.0) - 20.0).abs() < 0.001);
        assert_eq!(compressor_auto_gain_db_for_squash(0.0, 20.0), 0.0);
        assert!((compressor_auto_gain_db_for_squash(1.0, 10.0) - 38.0).abs() < 0.001);
        assert!((compressor_auto_gain_db_for_squash(1.0, 600.0) - 30.0).abs() < 0.001);
        assert!((compressor_release_ms_for_squash(1.0) - 110.0).abs() < 0.001);
    }

    #[test]
    fn compressor_auto_gain_is_monotonic_by_squash() {
        for attack_ms in [10.0, 20.0, 600.0] {
            let mut previous = compressor_auto_gain_db_for_squash(0.0, attack_ms);
            let mut squash = 0.05;
            while squash <= 1.0 {
                let next = compressor_auto_gain_db_for_squash(squash, attack_ms);
                assert!(next >= previous);
                previous = next;
                squash += 0.05;
            }
        }
    }

    #[test]
    fn compressor_gain_reduction_uses_soft_knee_near_threshold() {
        assert!(compressor_gain_reduction_db(-28.0, -24.0, 4.0) > 0.0);
        assert!(compressor_gain_reduction_db(-28.0, -24.0, 4.0) < 1.0);
        assert_eq!(compressor_gain_reduction_db(-12.0, -24.0, 4.0), 9.0);
        assert!(compressor_gain_reduction_db(-24.0, -24.0, 4.0) > 0.0);
        assert!(compressor_gain_reduction_db(-24.0, -24.0, 4.0) < 2.0);
    }

    #[test]
    fn shared_compressor_formula_fixtures_match_runtime_math() {
        let fixtures = dsp_formula_fixtures();
        for fixture in fixtures.compressor_derived {
            assert_close(
                compressor_threshold_db_for_squash(fixture.squash),
                fixture.expected.threshold_db,
            );
            assert_close(
                compressor_ratio_for_squash(fixture.squash),
                fixture.expected.ratio,
            );
            assert_close(
                compressor_auto_gain_db_for_squash(fixture.squash, fixture.attack_ms),
                fixture.expected.auto_gain_db,
            );
            assert_close(
                compressor_release_ms_for_squash(fixture.squash),
                fixture.expected.release_ms,
            );
        }
        for fixture in fixtures.compressor_gain_reduction {
            assert_close(
                compressor_gain_reduction_db(fixture.input_db, fixture.threshold_db, fixture.ratio),
                fixture.expected_db,
            );
        }
    }

    #[test]
    fn shared_adsr_curve_fixtures_match_runtime_math() {
        for fixture in dsp_formula_fixtures().adsr_curve {
            assert_close(
                envelope_curve_progress(fixture.t, fixture.curve),
                fixture.expected,
            );
        }
    }

    #[test]
    fn shared_overdrive_formula_fixtures_match_runtime_math() {
        let fixtures = dsp_formula_fixtures();
        for fixture in fixtures.overdrive_shape {
            let actual = if fixture.mode == "fuzz" {
                shape_fuzz_sample(fixture.input)
            } else {
                shape_overdrive_sample(fixture.input)
            };
            assert_close(actual, fixture.expected);
        }
        for fixture in fixtures.overdrive_drive {
            assert_close(overdrive_drive_amount(fixture.drive_db), fixture.expected);
        }
        for fixture in fixtures.overdrive_tone {
            if let Some(expected_alpha) = fixture.expected_alpha {
                assert_close(overdrive_tone_alpha(fixture.tone), expected_alpha);
            } else {
                assert_close(
                    apply_overdrive_tone(
                        fixture.input.expect("tone fixture input"),
                        fixture.lowpassed.expect("tone fixture lowpassed value"),
                        fixture.tone,
                    ),
                    fixture.expected.expect("tone fixture expected value"),
                );
            }
        }
    }
}
