use super::sample_asset::parse_sample_asset;
use super::*;
use serde_json::Value;

impl RuntimeNode {
    /// Adds elapsed processing time into the profiling bucket for this node family.
    /// Params:
    /// - `profile`: aggregate profiling structure updated in place.
    /// - `elapsed_ms`: wall-clock time spent processing the current node invocation.
    pub(crate) fn add_profile_time(&self, profile: &mut EngineProfileStats, elapsed_ms: f64) {
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

    /// Resets dynamic DSP state while preserving each node's current parameter targets.
    /// Params:
    /// - `self`: runtime node whose phase, buffers, or envelope state should be rewound.
    pub(crate) fn reset_dynamic_state(&mut self) {
        match self {
            Self::CVTranspose(node) => {
                node.octaves.reset();
                node.semitones.reset();
                node.cents.reset();
            }
            Self::CVScaler(node) => node.scale.reset(),
            Self::CVMixer2(node) => {
                node.gain1.reset();
                node.gain2.reset();
            }
            Self::VCO(node) => {
                node.phase = 0.0;
                node.pulse_width.reset();
                node.base_tune_cents.reset();
                node.fine_tune_cents.reset();
                node.pwm_amount.reset();
            }
            Self::KarplusStrong(node) => {
                node.decay.reset();
                node.damping.reset();
                node.brightness.reset();
                node.buf.fill(0.0);
                node.write = 0;
                node.current_delay = 64;
                node.last = 0.0;
                node.last_gate = 0.0;
            }
            Self::LFO(node) => {
                node.phase = 0.0;
                node.freq_hz.reset();
                node.pulse_width.reset();
            }
            Self::ADSR(node) => {
                node.attack.reset();
                node.decay.reset();
                node.sustain.reset();
                node.release.reset();
                node.curve.reset();
                node.stage = EnvelopeStage::Idle;
                node.stage_pos = 0.0;
                node.stage_start_level = 0.0;
                node.level = 0.0;
                node.last_gate = 0.0;
            }
            Self::VCA(node) => {
                node.bias.reset();
                node.gain.reset();
            }
            Self::VCF(node) => {
                node.cutoff_hz.reset();
                node.resonance.reset();
                node.cutoff_mod_amount_oct.reset();
                node.lp = 0.0;
                node.bp = 0.0;
            }
            Self::Mixer4(node) => {
                node.gain1.reset();
                node.gain2.reset();
                node.gain3.reset();
                node.gain4.reset();
            }
            Self::Noise(node) => {
                node.gain.reset();
                node.pink = 0.0;
                node.brown = 0.0;
            }
            Self::SamplePlayer(node) => {
                node.gain.reset();
                node.pitch_semis.reset();
                node.position = 0.0;
                node.active = false;
                node.last_gate = 0.0;
            }
            Self::Delay(node) => {
                node.time_ms.reset();
                node.feedback.reset();
                node.mix.reset();
                node.buf.fill(0.0);
                node.write = 0;
            }
            Self::Reverb(node) => {
                node.decay.reset();
                node.tone.reset();
                node.mix.reset();
                node.bank.reset();
            }
            Self::Saturation(node) => {
                node.drive_db.reset();
                node.mix.reset();
            }
            Self::Overdrive(node) => {
                node.drive_db.reset();
                node.tone.reset();
                node.tone_lp = 0.0;
            }
            Self::Compressor(node) => {
                node.squash.reset();
                node.attack_ms.reset();
                node.mix.reset();
                node.env = 0.0;
                node.rms_energy = 0.0;
                node.gain_reduction_db = 0.0;
                node.makeup_gain_db = 0.0;
            }
            Self::Output(node) => node.gain_db.reset(),
        }
    }

    /// Applies a serialized parameter update to this runtime node.
    /// Params:
    /// - `param_id`: parameter name to update on the target node variant.
    /// - `value`: serialized parameter payload that will be parsed into the node's native type.
    pub(crate) fn set_param(&mut self, param_id: &str, value: &Value) {
        match self {
            Self::CVTranspose(node) => match param_id {
                "octaves" => node
                    .octaves
                    .set_target(value_to_f32(Some(value), node.octaves.target)),
                "semitones" => node
                    .semitones
                    .set_target(value_to_f32(Some(value), node.semitones.target)),
                "cents" => node
                    .cents
                    .set_target(value_to_f32(Some(value), node.cents.target)),
                _ => {}
            },
            Self::CVScaler(node) => {
                if param_id == "scale" {
                    node.scale
                        .set_target(value_to_f32(Some(value), node.scale.target));
                }
            }
            Self::CVMixer2(node) => match param_id {
                "gain1" => node
                    .gain1
                    .set_target(value_to_f32(Some(value), node.gain1.target)),
                "gain2" => node
                    .gain2
                    .set_target(value_to_f32(Some(value), node.gain2.target)),
                _ => {}
            },
            Self::VCO(node) => match param_id {
                "wave" => {
                    if let Ok(parsed) = serde_json::from_value::<Wave>(Value::String(
                        value_to_string(Some(value), "sine"),
                    )) {
                        node.wave = parsed;
                    }
                }
                "pulseWidth" => node
                    .pulse_width
                    .set_target(value_to_f32(Some(value), node.pulse_width.target)),
                "baseTuneCents" => node
                    .base_tune_cents
                    .set_target(value_to_f32(Some(value), node.base_tune_cents.target)),
                "fineTuneCents" => node
                    .fine_tune_cents
                    .set_target(value_to_f32(Some(value), node.fine_tune_cents.target)),
                "pwmAmount" => node
                    .pwm_amount
                    .set_target(value_to_f32(Some(value), node.pwm_amount.target)),
                _ => {}
            },
            Self::KarplusStrong(node) => match param_id {
                "decay" => node
                    .decay
                    .set_target(value_to_f32(Some(value), node.decay.target)),
                "damping" => node
                    .damping
                    .set_target(value_to_f32(Some(value), node.damping.target)),
                "brightness" => node
                    .brightness
                    .set_target(value_to_f32(Some(value), node.brightness.target)),
                "excitation" => node.excitation = value_to_string(Some(value), &node.excitation),
                _ => {}
            },
            Self::LFO(node) => match param_id {
                "wave" => {
                    if let Ok(parsed) = serde_json::from_value::<Wave>(Value::String(
                        value_to_string(Some(value), "sine"),
                    )) {
                        node.wave = parsed;
                    }
                }
                "freqHz" => node
                    .freq_hz
                    .set_target(value_to_f32(Some(value), node.freq_hz.target)),
                "pulseWidth" => node
                    .pulse_width
                    .set_target(value_to_f32(Some(value), node.pulse_width.target)),
                "bipolar" => node.bipolar = value_to_bool(Some(value), node.bipolar),
                _ => {}
            },
            Self::ADSR(node) => match param_id {
                "attack" => node.attack.set_target(value_ms_to_seconds(
                    Some(value),
                    node.attack.target * 1000.0,
                )),
                "decay" => node
                    .decay
                    .set_target(value_ms_to_seconds(Some(value), node.decay.target * 1000.0)),
                "sustain" => node
                    .sustain
                    .set_target(value_to_f32(Some(value), node.sustain.target)),
                "release" => node.release.set_target(value_ms_to_seconds(
                    Some(value),
                    node.release.target * 1000.0,
                )),
                "curve" => node
                    .curve
                    .set_target(value_to_f32(Some(value), node.curve.target)),
                "mode" => {
                    if let Ok(parsed) = serde_json::from_value::<AdsrMode>(Value::String(
                        value_to_string(Some(value), "retrigger_from_current"),
                    )) {
                        node.mode = parsed;
                    }
                }
                _ => {}
            },
            Self::VCA(node) => match param_id {
                "bias" => node
                    .bias
                    .set_target(value_to_f32(Some(value), node.bias.target)),
                "gain" => node
                    .gain
                    .set_target(value_to_f32(Some(value), node.gain.target)),
                _ => {}
            },
            Self::VCF(node) => match param_id {
                "type" => {
                    if let Ok(parsed) = serde_json::from_value::<FilterType>(Value::String(
                        value_to_string(Some(value), "lowpass"),
                    )) {
                        node.filter_type = parsed;
                    }
                }
                "cutoffHz" => node
                    .cutoff_hz
                    .set_target(value_to_f32(Some(value), node.cutoff_hz.target)),
                "resonance" => node
                    .resonance
                    .set_target(value_to_f32(Some(value), node.resonance.target)),
                "cutoffModAmountOct" => node
                    .cutoff_mod_amount_oct
                    .set_target(value_to_f32(Some(value), node.cutoff_mod_amount_oct.target)),
                _ => {}
            },
            Self::Mixer4(node) => match param_id {
                "gain1" => node
                    .gain1
                    .set_target(value_to_f32(Some(value), node.gain1.target)),
                "gain2" => node
                    .gain2
                    .set_target(value_to_f32(Some(value), node.gain2.target)),
                "gain3" => node
                    .gain3
                    .set_target(value_to_f32(Some(value), node.gain3.target)),
                "gain4" => node
                    .gain4
                    .set_target(value_to_f32(Some(value), node.gain4.target)),
                _ => {}
            },
            Self::Noise(node) => match param_id {
                "color" => {
                    if let Ok(parsed) = serde_json::from_value::<NoiseColor>(Value::String(
                        value_to_string(Some(value), "white"),
                    )) {
                        node.color = parsed;
                    }
                }
                "gain" => node
                    .gain
                    .set_target(value_to_f32(Some(value), node.gain.target)),
                _ => {}
            },
            Self::SamplePlayer(node) => match param_id {
                "mode" => {
                    if let Ok(parsed) = serde_json::from_value::<SamplePlayerMode>(Value::String(
                        value_to_string(Some(value), "oneshot"),
                    )) {
                        node.mode = parsed;
                    }
                }
                "start" => {
                    node.start_ratio = clamp(value_to_f32(Some(value), node.start_ratio), 0.0, 1.0)
                }
                "end" => {
                    node.end_ratio = clamp(value_to_f32(Some(value), node.end_ratio), 0.0, 1.0)
                }
                "gain" => node
                    .gain
                    .set_target(value_to_f32(Some(value), node.gain.target)),
                "pitchSemis" => node
                    .pitch_semis
                    .set_target(value_to_f32(Some(value), node.pitch_semis.target)),
                "sampleData" => node.asset = parse_sample_asset(Some(value)),
                _ => {}
            },
            Self::Delay(node) => match param_id {
                "timeMs" => node
                    .time_ms
                    .set_target(value_to_f32(Some(value), node.time_ms.target)),
                "feedback" => node
                    .feedback
                    .set_target(value_to_f32(Some(value), node.feedback.target)),
                "mix" => node
                    .mix
                    .set_target(value_to_f32(Some(value), node.mix.target)),
                _ => {}
            },
            Self::Reverb(node) => match param_id {
                "mode" => {
                    if let Ok(parsed) = serde_json::from_value::<ReverbMode>(Value::String(
                        value_to_string(Some(value), "room"),
                    )) {
                        node.mode = parsed;
                    }
                }
                "decay" => node
                    .decay
                    .set_target(value_to_f32(Some(value), node.decay.target)),
                "tone" => node
                    .tone
                    .set_target(value_to_f32(Some(value), node.tone.target)),
                "mix" => node
                    .mix
                    .set_target(value_to_f32(Some(value), node.mix.target)),
                _ => {}
            },
            Self::Saturation(node) => match param_id {
                "driveDb" => node
                    .drive_db
                    .set_target(value_to_f32(Some(value), node.drive_db.target)),
                "mix" => node
                    .mix
                    .set_target(value_to_f32(Some(value), node.mix.target)),
                "type" => {
                    if let Ok(parsed) = serde_json::from_value::<SaturationType>(Value::String(
                        value_to_string(Some(value), "tanh"),
                    )) {
                        node.mode = parsed;
                    }
                }
                _ => {}
            },
            Self::Overdrive(node) => match param_id {
                "driveDb" | "gainDb" => node
                    .drive_db
                    .set_target(value_to_f32(Some(value), node.drive_db.target)),
                "tone" => node
                    .tone
                    .set_target(value_to_f32(Some(value), node.tone.target)),
                "mode" => {
                    if let Ok(parsed) = serde_json::from_value::<OverdriveMode>(Value::String(
                        value_to_string(Some(value), "overdrive"),
                    )) {
                        node.mode = parsed;
                    }
                }
                _ => {}
            },
            Self::Compressor(node) => match param_id {
                "squash" => node
                    .squash
                    .set_target(value_to_f32(Some(value), node.squash.target)),
                "attackMs" => node
                    .attack_ms
                    .set_target(value_to_f32(Some(value), node.attack_ms.target)),
                "mix" => node
                    .mix
                    .set_target(value_to_f32(Some(value), node.mix.target)),
                _ => {}
            },
            Self::Output(node) => match param_id {
                "gainDb" => node
                    .gain_db
                    .set_target(value_to_f32(Some(value), node.gain_db.target)),
                "limiter" => node.limiter = value_to_bool(Some(value), node.limiter),
                _ => {}
            },
        }
    }
}
