use super::{formulas::*, reverb::*, sample_asset::next_noise, *};

#[inline(always)]
fn advance_adsr_stage_pos(node: &mut AdsrNode, duration_seconds: f32, sample_rate: f32) -> f32 {
    node.stage_pos = (node.stage_pos + 1.0 / (duration_seconds * sample_rate)).min(1.0);
    node.stage_pos
}

#[inline(always)]
fn adsr_curve_progress(node: &mut AdsrNode, t: f32, curve: f32) -> f32 {
    if curve != node.cached_curve {
        node.cached_curve = curve;
        node.cached_curve_exponent = envelope_curve_exponent(curve);
    }
    envelope_curve_progress_with_exponent(t, node.cached_curve_exponent)
}

#[inline(always)]
fn signal_start(signal_index: usize, block_size: usize) -> usize {
    signal_index * block_size
}

#[inline(always)]
fn input_start(index: i32, block_size: usize) -> Option<usize> {
    (index >= 0).then(|| index as usize * block_size)
}

impl RuntimeNode {
    /// Processes one contiguous frame range for the current node.
    /// Params:
    /// - `signal_buffers`: signal-major block buffer holding host inputs plus upstream node outputs.
    /// - `block_size`: number of frames in each signal buffer.
    /// - `start_frame`: inclusive frame index to process.
    /// - `end_frame`: exclusive frame index to process.
    /// - `host`: resolved indices for host-driven pitch, gate, velocity, and mod-wheel signals.
    /// - `sample_rate`: global sample rate for time-based calculations.
    /// - `rng_state`: mutable RNG seed shared by stochastic nodes on the current voice.
    pub(crate) fn process_frame_range(
        &mut self,
        signal_buffers: &mut [f32],
        block_size: usize,
        start_frame: usize,
        end_frame: usize,
        host: &HostSignalIndices,
        sample_rate: f32,
        rng_state: &mut u32,
    ) {
        match self {
            Self::VCO(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let pitch_start = input_start(node.pitch, block_size);
                let fm_start = input_start(node.fm, block_size);
                let pwm_start = input_start(node.pwm, block_size);
                let host_pitch_start = signal_start(host.pitch, block_size);
                let sample_rate_inv = 1.0 / sample_rate as f64;

                for frame in start_frame..end_frame {
                    let pitch = pitch_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(signal_buffers[host_pitch_start + frame]);
                    let fm = fm_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let pwm = pwm_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let pulse_width = clamp(
                        node.pulse_width.next() + node.pwm_amount.next() * pwm,
                        0.05,
                        0.95,
                    );
                    let tune_voct =
                        (node.base_tune_cents.next() + node.fine_tune_cents.next()) / 1200.0;
                    let hz = voct_to_hz(pitch + fm + tune_voct) as f64;
                    node.phase = (node.phase + hz * sample_rate_inv) % 1.0;
                    signal_buffers[out_start + frame] =
                        waveform_sample(node.wave, node.phase as f32, pulse_width);
                }
            }
            Self::LFO(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let fm_start = input_start(node.fm, block_size);
                let sample_rate_inv = 1.0 / sample_rate as f64;

                for frame in start_frame..end_frame {
                    let fm = fm_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let freq = clamp(node.freq_hz.next() * 2.0_f32.powf(fm), 0.01, 40.0) as f64;
                    let pulse_width = node.pulse_width.next();
                    node.phase = (node.phase + freq * sample_rate_inv) % 1.0;
                    let mut sample = waveform_sample(node.wave, node.phase as f32, pulse_width);
                    if !node.bipolar {
                        sample = sample * 0.5 + 0.5;
                    }
                    signal_buffers[out_start + frame] = sample;
                }
            }
            Self::ADSR(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let gate_start = input_start(node.gate, block_size);
                let host_gate_start = signal_start(host.gate, block_size);

                for frame in start_frame..end_frame {
                    let gate = gate_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(signal_buffers[host_gate_start + frame]);
                    let attack = node.attack.next().max(0.0001);
                    let decay = node.decay.next().max(0.0001);
                    let sustain = clamp(node.sustain.next(), 0.0, 1.0);
                    let release = node.release.next().max(0.0001);
                    let curve = node.curve.next();
                    if gate >= 0.5 && node.last_gate < 0.5 {
                        if matches!(node.mode, AdsrMode::RetriggerFromZero) {
                            node.level = 0.0;
                        }
                        node.stage_pos = 0.0;
                        node.stage_start_level = node.level;
                        node.stage = EnvelopeStage::Attack;
                    } else if gate < 0.5 && node.last_gate >= 0.5 {
                        node.stage_pos = 0.0;
                        node.stage_start_level = node.level;
                        node.stage = EnvelopeStage::Release;
                    }
                    match node.stage {
                        EnvelopeStage::Attack => {
                            let stage_pos = advance_adsr_stage_pos(node, attack, sample_rate);
                            let progress = adsr_curve_progress(node, stage_pos, curve);
                            node.level =
                                node.stage_start_level + (1.0 - node.stage_start_level) * progress;
                            if node.stage_pos >= 1.0 {
                                node.level = 1.0;
                                node.stage_pos = 0.0;
                                node.stage_start_level = 1.0;
                                node.stage = EnvelopeStage::Decay;
                            }
                        }
                        EnvelopeStage::Decay => {
                            let stage_pos = advance_adsr_stage_pos(node, decay, sample_rate);
                            let progress = adsr_curve_progress(node, stage_pos, curve);
                            node.level = 1.0 - (1.0 - sustain) * progress;
                            if node.stage_pos >= 1.0 {
                                node.level = sustain;
                                node.stage = EnvelopeStage::Sustain;
                            }
                        }
                        EnvelopeStage::Sustain => node.level = sustain,
                        EnvelopeStage::Release => {
                            let stage_pos = advance_adsr_stage_pos(node, release, sample_rate);
                            let progress = adsr_curve_progress(node, stage_pos, curve);
                            node.level = node.stage_start_level * (1.0 - progress);
                            if node.stage_pos >= 1.0 || node.level <= 0.0001 {
                                node.level = 0.0;
                                node.stage = EnvelopeStage::Idle;
                            }
                        }
                        EnvelopeStage::Idle => {}
                    }
                    node.last_gate = gate;
                    signal_buffers[out_start + frame] = clamp(node.level, 0.0, 1.0);
                }
            }
            Self::VCA(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_buffer_start = input_start(node.input, block_size);
                let gain_cv_start = input_start(node.gain_cv, block_size);

                for frame in start_frame..end_frame {
                    let input = input_buffer_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let gain_cv = gain_cv_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let gain_cv_norm = if (0.0..=1.0).contains(&gain_cv) {
                        gain_cv
                    } else {
                        gain_cv * 0.5 + 0.5
                    };
                    let gain_eff =
                        clamp(node.bias.next() + node.gain.next() * gain_cv_norm, 0.0, 1.0);
                    signal_buffers[out_start + frame] = input * gain_eff;
                }
            }
            Self::VCF(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_buffer_start = input_start(node.input, block_size);
                let cutoff_cv_start = input_start(node.cutoff_cv, block_size);
                let sample_rate_scale = (2.0 * std::f32::consts::PI) / sample_rate;

                for frame in start_frame..end_frame {
                    let input = input_buffer_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let cutoff_cv = cutoff_cv_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    signal_buffers[out_start + frame] =
                        node.process_sample(input, cutoff_cv, sample_rate_scale);
                }
            }
            Self::Mixer4(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let in1_start = input_start(node.in1, block_size);
                let in2_start = input_start(node.in2, block_size);
                let in3_start = input_start(node.in3, block_size);
                let in4_start = input_start(node.in4, block_size);

                for frame in start_frame..end_frame {
                    signal_buffers[out_start + frame] = in1_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0)
                        * node.gain1.next()
                        + in2_start
                            .map(|start| signal_buffers[start + frame])
                            .unwrap_or(0.0)
                            * node.gain2.next()
                        + in3_start
                            .map(|start| signal_buffers[start + frame])
                            .unwrap_or(0.0)
                            * node.gain3.next()
                        + in4_start
                            .map(|start| signal_buffers[start + frame])
                            .unwrap_or(0.0)
                            * node.gain4.next();
                }
            }
            Self::Noise(node) => {
                let out_start = signal_start(node.out_index, block_size);
                for frame in start_frame..end_frame {
                    let white = next_noise(rng_state);
                    let sample = match node.color {
                        NoiseColor::White => white,
                        NoiseColor::Pink => {
                            node.pink = 0.98 * node.pink + 0.02 * white;
                            node.pink
                        }
                        NoiseColor::Brown => {
                            node.brown = clamp(node.brown + white * 0.02, -1.0, 1.0);
                            node.brown
                        }
                    };
                    signal_buffers[out_start + frame] = sample * node.gain.next();
                }
            }
            Self::Saturation(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_start = input_start(node.input, block_size);

                for frame in start_frame..end_frame {
                    let input = input_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let driven = input * db_to_gain(node.drive_db.next());
                    let wet = match node.mode {
                        SaturationType::Tanh => driven.tanh(),
                        SaturationType::Softclip => crate::softclip_sample(driven, 1.0),
                    };
                    let mix = clamp(node.mix.next(), 0.0, 1.0);
                    signal_buffers[out_start + frame] = input * (1.0 - mix) + wet * mix;
                }
            }
            Self::Overdrive(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_start = input_start(node.input, block_size);

                for frame in start_frame..end_frame {
                    let input = input_start
                        .map(|start| signal_buffers[start + frame])
                        .unwrap_or(0.0);
                    let drive_db = node.drive_db.next();
                    let drive_amount = overdrive_drive_amount(drive_db);
                    let mut driven = input * db_to_gain(drive_db);
                    driven = match node.mode {
                        OverdriveMode::Fuzz => shape_fuzz_sample(driven),
                        OverdriveMode::Overdrive => shape_overdrive_sample(driven),
                    };
                    let tone = node.tone.next();
                    let tone_alpha = overdrive_tone_alpha(tone);
                    node.tone_lp = node.tone_lp + (driven - node.tone_lp) * tone_alpha;
                    let toned = apply_overdrive_tone(driven, node.tone_lp, tone);
                    signal_buffers[out_start + frame] =
                        input * (1.0 - drive_amount) + toned * drive_amount;
                }
            }
            Self::Output(node) => {
                let out_start = signal_start(node.out_index, block_size);
                let input_start = input_start(node.input, block_size);

                if node.limiter {
                    for frame in start_frame..end_frame {
                        let input = input_start
                            .map(|start| signal_buffers[start + frame])
                            .unwrap_or(0.0);
                        signal_buffers[out_start + frame] =
                            (input * db_to_gain(node.gain_db.next())).tanh();
                    }
                } else {
                    for frame in start_frame..end_frame {
                        let input = input_start
                            .map(|start| signal_buffers[start + frame])
                            .unwrap_or(0.0);
                        signal_buffers[out_start + frame] = input * db_to_gain(node.gain_db.next());
                    }
                }
            }
            _ => {
                for frame in start_frame..end_frame {
                    self.process_frame(
                        signal_buffers,
                        block_size,
                        frame,
                        host,
                        sample_rate,
                        rng_state,
                    );
                }
            }
        }
    }

    /// Processes one sample frame for the current node and writes the result into its output signal slot.
    /// Params:
    /// - `signal_buffers`: signal-major block buffer holding host inputs plus upstream node outputs.
    /// - `block_size`: number of frames in each signal buffer.
    /// - `frame`: frame index inside the current block.
    /// - `host`: resolved indices for host-driven pitch, gate, velocity, and mod-wheel signals.
    /// - `sample_rate`: global sample rate for time-based calculations.
    /// - `rng_state`: mutable RNG seed shared by stochastic nodes on the current voice.
    fn process_frame(
        &mut self,
        signal_buffers: &mut [f32],
        block_size: usize,
        frame: usize,
        host: &HostSignalIndices,
        sample_rate: f32,
        rng_state: &mut u32,
    ) {
        match self {
            Self::CVTranspose(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input
                    + node.octaves.next()
                    + node.semitones.next() / 12.0
                    + node.cents.next() / 1200.0;
            }
            Self::CVScaler(node) => {
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] =
                    read_input_frame(signal_buffers, block_size, frame, node.input, 0.0)
                        * node.scale.next();
            }
            Self::CVMixer2(node) => {
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] =
                    read_input_frame(signal_buffers, block_size, frame, node.in1, 0.0)
                        * node.gain1.next()
                        + read_input_frame(signal_buffers, block_size, frame, node.in2, 0.0)
                            * node.gain2.next();
            }
            Self::VCO(node) => {
                let pitch = if node.pitch >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.pitch, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.pitch, 0.0)
                };
                let fm = read_input_frame(signal_buffers, block_size, frame, node.fm, 0.0);
                let pwm = read_input_frame(signal_buffers, block_size, frame, node.pwm, 0.0);
                let pulse_width = clamp(
                    node.pulse_width.next() + node.pwm_amount.next() * pwm,
                    0.05,
                    0.95,
                );
                let tune_voct =
                    (node.base_tune_cents.next() + node.fine_tune_cents.next()) / 1200.0;
                let hz = voct_to_hz(pitch + fm + tune_voct) as f64;
                node.phase = (node.phase + hz / sample_rate as f64) % 1.0;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = waveform_sample(node.wave, node.phase as f32, pulse_width);
            }
            Self::KarplusStrong(node) => {
                let pitch = if node.pitch >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.pitch, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.pitch, 0.0)
                };
                let gate = if node.gate >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.gate, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.gate, 0.0)
                };
                let excite = read_input_frame(signal_buffers, block_size, frame, node.excite, 0.0);
                let hz = clamp(voct_to_hz(pitch), 20.0, sample_rate * 0.45);
                let delay_samples =
                    clamp((sample_rate / hz).floor(), 2.0, (node.buf.len() - 1) as f32) as usize;
                if gate >= 0.5 && node.last_gate < 0.5 {
                    node.current_delay = delay_samples;
                    let buf_len = node.buf.len();
                    let excite_start = (node.write + buf_len - delay_samples) % buf_len;
                    for j in 0..delay_samples {
                        let mut source = excite;
                        if source == 0.0 {
                            source = if node.excitation == "impulse" {
                                if j == 0 {
                                    1.0
                                } else {
                                    0.0
                                }
                            } else {
                                next_noise(rng_state)
                            };
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
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = delayed;
            }
            Self::LFO(node) => {
                let fm = read_input_frame(signal_buffers, block_size, frame, node.fm, 0.0);
                let freq = clamp(node.freq_hz.next() * 2.0_f32.powf(fm), 0.01, 40.0) as f64;
                let pulse_width = node.pulse_width.next();
                node.phase = (node.phase + freq / sample_rate as f64) % 1.0;
                let mut sample = waveform_sample(node.wave, node.phase as f32, pulse_width);
                if !node.bipolar {
                    sample = sample * 0.5 + 0.5;
                }
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = sample;
            }
            Self::ADSR(node) => {
                let gate = if node.gate >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.gate, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.gate, 0.0)
                };
                let attack = node.attack.next().max(0.0001);
                let decay = node.decay.next().max(0.0001);
                let sustain = clamp(node.sustain.next(), 0.0, 1.0);
                let release = node.release.next().max(0.0001);
                let curve = node.curve.next();
                if gate >= 0.5 && node.last_gate < 0.5 {
                    if matches!(node.mode, AdsrMode::RetriggerFromZero) {
                        node.level = 0.0;
                    }
                    node.stage_pos = 0.0;
                    node.stage_start_level = node.level;
                    node.stage = EnvelopeStage::Attack;
                } else if gate < 0.5 && node.last_gate >= 0.5 {
                    node.stage_pos = 0.0;
                    node.stage_start_level = node.level;
                    node.stage = EnvelopeStage::Release;
                }
                match node.stage {
                    EnvelopeStage::Attack => {
                        let stage_pos = advance_adsr_stage_pos(node, attack, sample_rate);
                        let progress = adsr_curve_progress(node, stage_pos, curve);
                        node.level =
                            node.stage_start_level + (1.0 - node.stage_start_level) * progress;
                        if node.stage_pos >= 1.0 {
                            node.level = 1.0;
                            node.stage_pos = 0.0;
                            node.stage_start_level = 1.0;
                            node.stage = EnvelopeStage::Decay;
                        }
                    }
                    EnvelopeStage::Decay => {
                        let stage_pos = advance_adsr_stage_pos(node, decay, sample_rate);
                        let progress = adsr_curve_progress(node, stage_pos, curve);
                        node.level = 1.0 - (1.0 - sustain) * progress;
                        if node.stage_pos >= 1.0 {
                            node.level = sustain;
                            node.stage = EnvelopeStage::Sustain;
                        }
                    }
                    EnvelopeStage::Sustain => node.level = sustain,
                    EnvelopeStage::Release => {
                        let stage_pos = advance_adsr_stage_pos(node, release, sample_rate);
                        let progress = adsr_curve_progress(node, stage_pos, curve);
                        node.level = node.stage_start_level * (1.0 - progress);
                        if node.stage_pos >= 1.0 || node.level <= 0.0001 {
                            node.level = 0.0;
                            node.stage = EnvelopeStage::Idle;
                        }
                    }
                    EnvelopeStage::Idle => {}
                }
                node.last_gate = gate;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = clamp(node.level, 0.0, 1.0);
            }
            Self::VCA(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let gain_cv =
                    read_input_frame(signal_buffers, block_size, frame, node.gain_cv, 0.0);
                let gain_cv_norm = if (0.0..=1.0).contains(&gain_cv) {
                    gain_cv
                } else {
                    gain_cv * 0.5 + 0.5
                };
                let gain_eff = clamp(node.bias.next() + node.gain.next() * gain_cv_norm, 0.0, 1.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * gain_eff;
            }
            Self::VCF(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let cutoff_cv =
                    read_input_frame(signal_buffers, block_size, frame, node.cutoff_cv, 0.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = node.process_sample(
                    input,
                    cutoff_cv,
                    (2.0 * std::f32::consts::PI) / sample_rate,
                );
            }
            Self::Mixer4(node) => {
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] =
                    read_input_frame(signal_buffers, block_size, frame, node.in1, 0.0)
                        * node.gain1.next()
                        + read_input_frame(signal_buffers, block_size, frame, node.in2, 0.0)
                            * node.gain2.next()
                        + read_input_frame(signal_buffers, block_size, frame, node.in3, 0.0)
                            * node.gain3.next()
                        + read_input_frame(signal_buffers, block_size, frame, node.in4, 0.0)
                            * node.gain4.next();
            }
            Self::Noise(node) => {
                let white = next_noise(rng_state);
                let sample = match node.color {
                    NoiseColor::White => white,
                    NoiseColor::Pink => {
                        node.pink = 0.98 * node.pink + 0.02 * white;
                        node.pink
                    }
                    NoiseColor::Brown => {
                        node.brown = clamp(node.brown + white * 0.02, -1.0, 1.0);
                        node.brown
                    }
                };
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = sample * node.gain.next();
            }
            Self::SamplePlayer(node) => {
                let gate = if node.gate >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.gate, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.gate, 0.0)
                };
                let pitch = if node.pitch >= 0 {
                    read_input_frame(signal_buffers, block_size, frame, node.pitch, 0.0)
                } else {
                    read_signal_frame(signal_buffers, block_size, frame, host.pitch, 0.0)
                };
                let out = frame_signal_offset(node.out_index, block_size, frame);
                let Some(asset) = &node.asset else {
                    signal_buffers[out] = 0.0;
                    return;
                };
                if asset.samples.is_empty() {
                    signal_buffers[out] = 0.0;
                    return;
                }
                let start_sample = clamp(
                    (node.start_ratio * asset.samples.len() as f32).floor(),
                    0.0,
                    (asset.samples.len() - 1) as f32,
                ) as usize;
                let end_sample = clamp(
                    (node.end_ratio * asset.samples.len() as f32).ceil(),
                    (start_sample + 1) as f32,
                    asset.samples.len() as f32,
                ) as usize;
                let rising_edge = gate >= 0.5 && node.last_gate < 0.5;
                if rising_edge {
                    node.position = start_sample as f32;
                    node.active = true;
                }
                node.last_gate = gate;
                if matches!(node.mode, SamplePlayerMode::Loop) && gate < 0.5 {
                    node.active = false;
                }
                if !node.active {
                    signal_buffers[out] = 0.0;
                    return;
                }
                if node.position >= end_sample as f32 {
                    if matches!(node.mode, SamplePlayerMode::Loop) && gate >= 0.5 {
                        node.position = start_sample as f32
                            + (node.position - start_sample as f32)
                                % ((end_sample - start_sample).max(1) as f32);
                    } else {
                        node.active = false;
                        signal_buffers[out] = 0.0;
                        return;
                    }
                }
                let sample_index =
                    clamp(node.position, start_sample as f32, (end_sample - 1) as f32);
                let base_index = sample_index.floor() as usize;
                let next_index = (base_index + 1).min(end_sample - 1);
                let frac = sample_index - base_index as f32;
                let current_sample = *asset.samples.get(base_index).unwrap_or(&0.0);
                let next_sample = *asset.samples.get(next_index).unwrap_or(&current_sample);
                signal_buffers[out] =
                    (current_sample + (next_sample - current_sample) * frac) * node.gain.next();
                let pitch_factor = 2.0_f32.powf(pitch + node.pitch_semis.next() / 12.0);
                node.position += pitch_factor * asset.sample_rate / sample_rate;
            }
            Self::Delay(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let delay_samples = clamp(
                    ((node.time_ms.next() / 1000.0) * sample_rate).floor(),
                    1.0,
                    (node.buf.len() - 1) as f32,
                ) as usize;
                let read_idx = (node.write + node.buf.len() - delay_samples) % node.buf.len();
                let delayed = node.buf[read_idx];
                let feedback = clamp(node.feedback.next(), 0.0, 0.95);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                node.buf[node.write] = input + delayed * feedback;
                node.write = (node.write + 1) % node.buf.len();
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + delayed * mix;
            }
            Self::Reverb(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let decay = clamp(node.decay.next(), 0.0, 1.0);
                let tone = clamp(node.tone.next(), 0.0, 1.0);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                node.bank.ensure_line_count(node.mode, sample_rate);
                let line_count = reverb_mode_line_count(node.mode);
                let tone_alpha = 0.035 + tone.powf(1.7) * 0.74;
                let mut delayed = [0.0; 8];
                for line_index in 0..line_count {
                    let value = node.bank.read(
                        line_index,
                        reverb_line_delay_seconds(node.mode, line_index, decay),
                        sample_rate,
                    );
                    delayed[line_index] = value;
                    node.bank.update_lowpass(line_index, value, tone_alpha);
                }
                let lp = [
                    node.bank.lp(0),
                    node.bank.lp(1),
                    node.bank.lp(2),
                    node.bank.lp(3),
                    node.bank.lp(4),
                    node.bank.lp(5),
                    node.bank.lp(6),
                    node.bank.lp(7),
                ];
                let fb = reverb_mode_feedback(node.mode, decay);
                let input_gain = reverb_mode_input_gain(node.mode);
                let (f1, f2, f3, f4) = match node.mode {
                    ReverbMode::Room => (
                        lp[0] * 0.46 + lp[1] * 0.22 + lp[4] * 0.2 - lp[6] * 0.08,
                        lp[1] * 0.42 + lp[2] * 0.22 + lp[5] * 0.22 + lp[0] * 0.08,
                        lp[2] * 0.4 + lp[3] * 0.2 + lp[6] * 0.24 - lp[1] * 0.1,
                        lp[3] * 0.38 + lp[0] * 0.22 + lp[7] * 0.24 + lp[2] * 0.08,
                    ),
                    ReverbMode::Plate => (
                        lp[0] * 0.52 + lp[1] * 0.24 + lp[2] * 0.08,
                        lp[1] * 0.5 + lp[2] * 0.24 + lp[3] * 0.08,
                        lp[2] * 0.48 + lp[3] * 0.24 + lp[0] * 0.08,
                        lp[3] * 0.5 + lp[0] * 0.24 + lp[1] * 0.08,
                    ),
                    ReverbMode::Spring => (
                        lp[0] * 0.76 - lp[1] * 0.26,
                        lp[1] * 0.52 + lp[2] * 0.32,
                        lp[2] * 0.74 - lp[3] * 0.34,
                        lp[3] * 0.48 + lp[0] * 0.3,
                    ),
                    ReverbMode::Hall => (
                        lp[0] * 0.64 + lp[1] * 0.18,
                        lp[1] * 0.62 + lp[2] * 0.2,
                        lp[2] * 0.6 + lp[3] * 0.2,
                        lp[3] * 0.58 + lp[0] * 0.22,
                    ),
                };
                node.bank.write_line(0, input * input_gain + f1 * fb);
                node.bank.write_line(1, input * input_gain + f2 * fb);
                node.bank.write_line(2, input * input_gain + f3 * fb);
                node.bank.write_line(3, input * input_gain + f4 * fb);
                if matches!(node.mode, ReverbMode::Room) {
                    node.bank.write_line(
                        4,
                        input * input_gain * 0.7
                            + (lp[4] * 0.38 + lp[1] * 0.24 + lp[5] * 0.16 - lp[0] * 0.08) * fb,
                    );
                    node.bank.write_line(
                        5,
                        input * input_gain * 0.66
                            + (lp[5] * 0.36 + lp[2] * 0.24 + lp[6] * 0.18 + lp[3] * 0.08) * fb,
                    );
                    node.bank.write_line(
                        6,
                        input * input_gain * 0.62
                            + (lp[6] * 0.34 + lp[3] * 0.24 + lp[7] * 0.2 - lp[1] * 0.08) * fb,
                    );
                    node.bank.write_line(
                        7,
                        input * input_gain * 0.58
                            + (lp[7] * 0.32 + lp[0] * 0.24 + lp[4] * 0.22 + lp[2] * 0.08) * fb,
                    );
                }
                node.bank.advance();
                let wet = match node.mode {
                    ReverbMode::Spring => {
                        (delayed[0] - delayed[1] + delayed[2] - delayed[3]) * 0.26
                    }
                    ReverbMode::Room => {
                        delayed[0] * 0.24 - delayed[1] * 0.12
                            + delayed[2] * 0.2
                            + delayed[3] * 0.12
                            + delayed[4] * 0.12
                            - delayed[5] * 0.08
                            + delayed[6] * 0.14
                            + delayed[7] * 0.1
                    }
                    ReverbMode::Plate => (delayed[0] + delayed[1] + delayed[2] + delayed[3]) * 0.28,
                    _ => (delayed[0] + delayed[1] + delayed[2] + delayed[3]) * 0.25,
                } * reverb_mode_wet_gain(node.mode, decay);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + wet.tanh() * mix;
            }
            Self::Saturation(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let driven = input * db_to_gain(node.drive_db.next());
                let wet = match node.mode {
                    SaturationType::Tanh => driven.tanh(),
                    SaturationType::Softclip => crate::softclip_sample(driven, 1.0),
                };
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + wet * mix;
            }
            Self::Overdrive(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let drive_db = node.drive_db.next();
                let drive_amount = overdrive_drive_amount(drive_db);
                let mut driven = input * db_to_gain(drive_db);
                driven = match node.mode {
                    OverdriveMode::Fuzz => shape_fuzz_sample(driven),
                    OverdriveMode::Overdrive => shape_overdrive_sample(driven),
                };
                let tone = node.tone.next();
                let tone_alpha = overdrive_tone_alpha(tone);
                node.tone_lp = node.tone_lp + (driven - node.tone_lp) * tone_alpha;
                let out = frame_signal_offset(node.out_index, block_size, frame);
                let toned = apply_overdrive_tone(driven, node.tone_lp, tone);
                signal_buffers[out] = input * (1.0 - drive_amount) + toned * drive_amount;
            }
            Self::Compressor(node) => {
                let input = read_input_frame(signal_buffers, block_size, frame, node.input, 0.0);
                let squash = node.squash.next();
                let threshold_db = compressor_threshold_db_for_squash(squash);
                let ratio = compressor_ratio_for_squash(squash);
                let rms_alpha = crate::smoothing_alpha(8.0, sample_rate);
                node.rms_energy = one_pole_step(node.rms_energy, input * input, rms_alpha);
                let rms_in = node.rms_energy.max(0.0).sqrt();
                let effective_attack_ms = node.attack_ms.next().max(1.0);
                let att = crate::smoothing_alpha(effective_attack_ms, sample_rate);
                let rel = crate::smoothing_alpha(
                    compressor_release_ms_for_squash(squash).max(1.0),
                    sample_rate,
                );
                node.env = if rms_in > node.env {
                    one_pole_step(node.env, rms_in, att)
                } else {
                    one_pole_step(node.env, rms_in, rel)
                };
                let level_db = 20.0 * node.env.max(0.00001).log10();
                let target_reduction_db =
                    compressor_gain_reduction_db(level_db, threshold_db, ratio);
                let gain_alpha = if target_reduction_db > node.gain_reduction_db {
                    crate::smoothing_alpha(effective_attack_ms.max(8.0) * 0.35, sample_rate)
                } else {
                    crate::smoothing_alpha(35.0, sample_rate)
                };
                node.gain_reduction_db =
                    one_pole_step(node.gain_reduction_db, target_reduction_db, gain_alpha);
                let makeup_ceiling_db =
                    compressor_auto_gain_db_for_squash(squash, effective_attack_ms);
                let target_makeup_db = node.gain_reduction_db.min(makeup_ceiling_db);
                let makeup_alpha = if target_makeup_db > node.makeup_gain_db {
                    crate::smoothing_alpha(90.0, sample_rate)
                } else {
                    crate::smoothing_alpha(45.0, sample_rate)
                };
                node.makeup_gain_db =
                    one_pole_step(node.makeup_gain_db, target_makeup_db, makeup_alpha);
                let wet = input * db_to_gain(node.makeup_gain_db - node.gain_reduction_db);
                let mix = clamp(node.mix.next(), 0.0, 1.0);
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = input * (1.0 - mix) + wet * mix;
            }
            Self::Output(node) => {
                let mut sample =
                    read_input_frame(signal_buffers, block_size, frame, node.input, 0.0)
                        * db_to_gain(node.gain_db.next());
                if node.limiter {
                    sample = sample.tanh();
                }
                let out = frame_signal_offset(node.out_index, block_size, frame);
                signal_buffers[out] = sample;
            }
        }
    }
}

#[inline(always)]
fn frame_signal_offset(signal_index: usize, block_size: usize, frame: usize) -> usize {
    signal_index * block_size + frame
}

#[inline(always)]
fn read_signal_frame(
    signal_buffers: &[f32],
    block_size: usize,
    frame: usize,
    signal_index: usize,
    fallback: f32,
) -> f32 {
    *signal_buffers
        .get(frame_signal_offset(signal_index, block_size, frame))
        .unwrap_or(&fallback)
}

#[inline(always)]
fn read_input_frame(
    signal_buffers: &[f32],
    block_size: usize,
    frame: usize,
    index: i32,
    fallback: f32,
) -> f32 {
    if index >= 0 {
        *signal_buffers
            .get(frame_signal_offset(index as usize, block_size, frame))
            .unwrap_or(&fallback)
    } else {
        fallback
    }
}
