use crate::{
    clamp, PreviewProbeAdsrEstimate, PreviewProbeFinalScope, PreviewProbeFinalSpectrum,
    PreviewProbeScopeBucket, PreviewProbeSpectrumFrames,
};

const PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES: usize = 4_096;
const PREVIEW_CAPTURE_FINAL_SCOPE_BUCKETS: usize = 512;
const PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT: usize = 32;
const PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS: usize = 512;
const PREVIEW_CAPTURE_FINAL_SPECTRUM_CHUNK_COLUMNS: usize = 4;
const PREVIEW_CAPTURE_SPECTRUM_DEFAULT_FRAME_SIZE: usize = 1024;
const PREVIEW_CAPTURE_SPECTRUM_MIN_FRAME_SIZE: usize = 64;
const PREVIEW_CAPTURE_SPECTRUM_MAX_FREQUENCY_HZ: f32 = 24_000.0;

#[derive(Clone)]
pub(crate) struct TrackProbeCaptureState {
    pub(crate) probe_id: String,
    pub(crate) kind: String,
    pub(crate) signal_start: usize,
    pub(crate) duration_samples: usize,
    pub(crate) spectrum_window_size: Option<usize>,
    pub(crate) samples: Vec<f32>,
    pub(crate) spectrum_columns: Vec<Vec<f32>>,
    pub(crate) spectrum_bin_frequencies: Vec<f32>,
    pub(crate) spectrum_bin_indices: Vec<usize>,
    pub(crate) spectrum_hann_window: Vec<f32>,
    pub(crate) final_spectrum_bin_frequencies: Vec<f32>,
    pub(crate) final_spectrum_hann_window: Vec<f32>,
    pub(crate) spectrum_analyzed_samples: usize,
    pub(crate) spectrum_emitted_columns: usize,
    pub(crate) final_spectrum_emitted_columns: usize,
}

pub(crate) fn build_preview_capture_snapshot_samples(
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

pub(crate) fn resolve_preview_capture_snapshot_stride(
    capture: &TrackProbeCaptureState,
    captured_samples: usize,
) -> f32 {
    let captured_end = captured_samples.min(capture.duration_samples);
    if captured_end <= PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES {
        return 1.0;
    }
    captured_end as f32 / PREVIEW_CAPTURE_SNAPSHOT_MAX_SAMPLES as f32
}

pub(crate) fn build_preview_capture_final_scope(
    capture: &TrackProbeCaptureState,
    captured_samples: usize,
    sample_rate: f32,
    include_final: bool,
) -> Option<PreviewProbeFinalScope> {
    if !include_final || capture.kind != "scope" {
        return None;
    }
    let captured_end = captured_samples
        .min(capture.duration_samples)
        .min(capture.samples.len());
    if captured_end == 0 {
        return None;
    }

    let bucket_count = PREVIEW_CAPTURE_FINAL_SCOPE_BUCKETS.min(captured_end.max(1));
    let mut waveform_buckets = Vec::with_capacity(bucket_count);
    let mut envelope_buckets = Vec::with_capacity(bucket_count);
    let mut global_peak = 0.0_f32;

    for bucket in 0..bucket_count {
        let start = ((bucket as f64 / bucket_count as f64) * captured_end as f64).floor() as usize;
        let end = (((bucket + 1) as f64 / bucket_count as f64) * captured_end as f64)
            .floor()
            .max((start + 1) as f64) as usize;
        let end = end.min(captured_end);
        let mut min = f32::INFINITY;
        let mut max = f32::NEG_INFINITY;
        let mut peak = 0.0_f32;

        for sample in capture.samples[start..end].iter().copied() {
            min = min.min(sample);
            max = max.max(sample);
            peak = peak.max(sample.abs());
        }

        if !min.is_finite() || !max.is_finite() {
            min = 0.0;
            max = 0.0;
        }
        global_peak = global_peak.max(peak);
        waveform_buckets.push(PreviewProbeScopeBucket { min, max, peak });
        envelope_buckets.push(peak);
    }

    Some(PreviewProbeFinalScope {
        waveform_buckets,
        envelope_buckets,
        peak: global_peak,
        sample_rate,
        captured_samples: captured_end,
    })
}

pub(crate) fn build_preview_capture_adsr_estimate(
    capture: &TrackProbeCaptureState,
    captured_samples: usize,
    sample_rate: f32,
    include_final: bool,
) -> Option<PreviewProbeAdsrEstimate> {
    if !include_final || capture.kind != "scope" {
        return None;
    }
    let captured_end = captured_samples
        .min(capture.duration_samples)
        .min(capture.samples.len());
    if captured_end <= 0 {
        return None;
    }

    let sample_rate = sample_rate.max(1.0);
    let bucket_count = ((captured_end as f32 / (sample_rate * 0.005).max(1.0)).floor() as usize)
        .clamp(64, 1024)
        .min(captured_end.max(1));
    let envelope = (0..bucket_count)
        .map(|bucket| {
            let start =
                ((bucket as f64 / bucket_count as f64) * captured_end as f64).floor() as usize;
            let end = (((bucket + 1) as f64 / bucket_count as f64) * captured_end as f64)
                .floor()
                .max((start + 1) as f64) as usize;
            let end = end.min(captured_end);
            let sum = capture.samples[start..end]
                .iter()
                .fold(0.0_f32, |total, sample| total + sample.abs());
            sum / (end - start).max(1) as f32
        })
        .collect::<Vec<_>>();

    let peak = capture.samples[..captured_end]
        .iter()
        .fold(0.0_f32, |max, sample| max.max(sample.abs()));
    let envelope_peak = envelope.iter().fold(0.0_f32, |max, value| max.max(*value));
    if peak <= 0.0005 || envelope_peak <= 0.0005 {
        return None;
    }

    let onset_threshold = envelope_peak * 0.05;
    let attack_threshold = envelope_peak * 0.9;
    let release_threshold = envelope_peak * 0.06;
    let onset_bucket = envelope
        .iter()
        .position(|value| *value >= onset_threshold)?;
    let attack_bucket = envelope
        .iter()
        .enumerate()
        .position(|(index, value)| index >= onset_bucket && *value >= attack_threshold)?;
    let release_end_bucket = envelope
        .iter()
        .rposition(|value| *value >= release_threshold)?;
    if release_end_bucket <= attack_bucket {
        return None;
    }

    let sustain_window_start =
        ((bucket_count as f32 * 0.58).floor() as usize).clamp(attack_bucket, bucket_count - 1);
    let sustain_window_end = ((bucket_count as f32 * 0.85).floor() as usize)
        .clamp(sustain_window_start + 1, bucket_count);
    let mut sustain_values = envelope[sustain_window_start..sustain_window_end].to_vec();
    sustain_values.sort_by(|left, right| left.total_cmp(right));
    let sustain = sustain_values
        .get(sustain_values.len() / 2)
        .copied()
        .unwrap_or(peak * 0.5);
    let sustain_ratio = clamp(sustain / peak, 0.0, 1.0);

    let decay_threshold = sustain + (envelope_peak - sustain) * 0.1;
    let decay_bucket = envelope
        .iter()
        .enumerate()
        .position(|(index, value)| index > attack_bucket && *value <= decay_threshold)
        .unwrap_or(sustain_window_start);

    let release_drop_threshold = (sustain * 0.9).max(envelope_peak * 0.06);
    let forward_release_bucket = envelope
        .iter()
        .enumerate()
        .position(|(index, value)| index >= sustain_window_end && *value < release_drop_threshold);
    let mut release_start_bucket = forward_release_bucket
        .map(|bucket| bucket.saturating_sub(1).max(attack_bucket))
        .unwrap_or(attack_bucket);
    if forward_release_bucket.is_none() {
        let release_start_threshold = (sustain * 0.95).max(envelope_peak * 0.06);
        if let Some(bucket) = (attack_bucket + 1..=release_end_bucket)
            .rev()
            .find(|index| envelope[*index] >= release_start_threshold)
        {
            release_start_bucket = bucket;
        }
    }

    let seconds_per_bucket = captured_end as f32 / bucket_count as f32 / sample_rate;
    let attack_seconds = (attack_bucket.saturating_sub(onset_bucket)) as f32 * seconds_per_bucket;
    let decay_seconds = (decay_bucket.saturating_sub(attack_bucket)) as f32 * seconds_per_bucket;
    let release_seconds =
        (release_end_bucket + 1).saturating_sub(release_start_bucket) as f32 * seconds_per_bucket;

    Some(PreviewProbeAdsrEstimate {
        attack_seconds,
        decay_seconds,
        sustain_ratio,
        release_seconds,
        label: format!(
            "A: {}|D: {}|S: {}%|R: {}",
            format_preview_capture_adsr_duration(attack_seconds),
            format_preview_capture_adsr_duration(decay_seconds),
            (sustain_ratio * 100.0).round() as usize,
            format_preview_capture_adsr_duration(release_seconds)
        ),
    })
}

fn format_preview_capture_adsr_duration(seconds: f32) -> String {
    if seconds < 1.0 {
        return format!("{}ms", (seconds * 1000.0).round() as usize);
    }
    if seconds >= 10.0 {
        return format!("{:.0}s", seconds);
    }
    format!("{:.1}s", seconds)
}

pub(crate) fn update_and_build_preview_capture_spectrum_frames(
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
    advance_preview_capture_spectrum_analysis(capture, captured_samples, sample_rate);

    let start_column = capture.spectrum_emitted_columns;
    capture.spectrum_emitted_columns = capture.spectrum_columns.len();

    let columns = &capture.spectrum_columns[start_column..];
    let row_count = capture.spectrum_bin_frequencies.len();
    let values = columns
        .iter()
        .flat_map(|column| column.iter().copied())
        .collect::<Vec<_>>();
    Some(PreviewProbeSpectrumFrames {
        values,
        row_count,
        column_count: columns.len(),
        bin_frequencies: capture.spectrum_bin_frequencies.clone(),
        start_column,
        frame_size,
        sample_rate,
        captured_samples: captured_end,
    })
}

pub(crate) fn advance_preview_capture_spectrum_analysis(
    capture: &mut TrackProbeCaptureState,
    captured_samples: usize,
    sample_rate: f32,
) {
    if capture.kind != "spectrum" {
        return;
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
    if capture.spectrum_bin_indices.is_empty() {
        capture.spectrum_bin_indices = build_preview_capture_spectrum_bin_indices(
            PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT,
            frame_size,
            sample_rate,
        );
    }
    if capture.spectrum_hann_window.is_empty() {
        capture.spectrum_hann_window = build_preview_capture_hann_window(frame_size);
    }
    if captured_end < frame_size || capture.spectrum_analyzed_samples + frame_size > captured_end {
        return;
    }
    let frame_start = capture.spectrum_analyzed_samples;
    let magnitudes = measure_preview_capture_fft_magnitudes(
        &capture.samples,
        frame_start,
        frame_size,
        &capture.spectrum_hann_window,
    );
    capture.spectrum_columns.push(
        capture
            .spectrum_bin_indices
            .iter()
            .map(|bin_index| magnitudes.get(*bin_index).copied().unwrap_or(0.0))
            .collect(),
    );
    capture.spectrum_analyzed_samples = frame_start + frame_size;
}

pub(crate) fn build_preview_capture_final_spectrum(
    capture: &mut TrackProbeCaptureState,
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
    if capture.final_spectrum_bin_frequencies.is_empty() {
        capture.final_spectrum_bin_frequencies =
            build_preview_capture_full_spectrum_bin_frequencies(frame_size, sample_rate);
    }
    if capture.final_spectrum_hann_window.is_empty() {
        capture.final_spectrum_hann_window = build_preview_capture_hann_window(frame_size);
    }
    if source_column_count == 0 {
        let bin_frequencies = capture.final_spectrum_bin_frequencies.clone();
        capture.final_spectrum_emitted_columns = 0;
        return Some(PreviewProbeFinalSpectrum {
            values: Vec::new(),
            row_count: bin_frequencies.len(),
            column_count: 0,
            start_column: 0,
            complete: true,
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
    let start_column = capture
        .final_spectrum_emitted_columns
        .min(output_column_count);
    let end_column =
        (start_column + PREVIEW_CAPTURE_FINAL_SPECTRUM_CHUNK_COLUMNS).min(output_column_count);
    let bin_frequencies = if start_column == 0 {
        capture.final_spectrum_bin_frequencies.clone()
    } else {
        Vec::new()
    };
    let columns = (start_column..end_column)
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
                &capture.final_spectrum_hann_window,
            );
            magnitudes
        })
        .collect::<Vec<_>>();
    capture.final_spectrum_emitted_columns = end_column;
    let requested_frequency_bins = capture.final_spectrum_bin_frequencies.len();
    let values = columns
        .iter()
        .flat_map(|column| column.iter().copied())
        .collect::<Vec<_>>();

    Some(PreviewProbeFinalSpectrum {
        values,
        row_count: requested_frequency_bins,
        column_count: columns.len(),
        start_column,
        complete: end_column >= output_column_count,
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

fn build_preview_capture_hann_window(frame_size: usize) -> Vec<f32> {
    (0..frame_size)
        .map(|index| {
            0.5 - 0.5
                * ((2.0 * std::f32::consts::PI * index as f32)
                    / (frame_size.saturating_sub(1).max(1) as f32))
                    .cos()
        })
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
            spectrum_bin_indices: Vec::new(),
            spectrum_hann_window: Vec::new(),
            final_spectrum_bin_frequencies: Vec::new(),
            final_spectrum_hann_window: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
            final_spectrum_emitted_columns: 0,
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
    fn final_scope_uses_full_resolution_capture_summary() {
        let sample_rate = 48_000.0;
        let sample_count = 8_192;
        let capture = TrackProbeCaptureState {
            probe_id: "probe_1".to_string(),
            kind: "scope".to_string(),
            signal_start: 0,
            duration_samples: sample_count,
            spectrum_window_size: None,
            samples: (0..sample_count)
                .map(|sample| {
                    if sample < sample_count / 2 {
                        0.2
                    } else if sample % 2 == 0 {
                        0.75
                    } else {
                        -0.75
                    }
                })
                .collect(),
            spectrum_columns: Vec::new(),
            spectrum_bin_frequencies: Vec::new(),
            spectrum_bin_indices: Vec::new(),
            spectrum_hann_window: Vec::new(),
            final_spectrum_bin_frequencies: Vec::new(),
            final_spectrum_hann_window: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
            final_spectrum_emitted_columns: 0,
        };

        let final_scope =
            build_preview_capture_final_scope(&capture, sample_count, sample_rate, true).unwrap();

        assert_eq!(
            final_scope.waveform_buckets.len(),
            PREVIEW_CAPTURE_FINAL_SCOPE_BUCKETS
        );
        assert_eq!(
            final_scope.envelope_buckets.len(),
            PREVIEW_CAPTURE_FINAL_SCOPE_BUCKETS
        );
        assert_eq!(final_scope.captured_samples, sample_count);
        assert_eq!(final_scope.sample_rate, sample_rate);
        assert!((final_scope.peak - 0.75).abs() < 0.0001);
        assert!(final_scope.waveform_buckets[0].peak < 0.25);
        assert!(final_scope.waveform_buckets.last().unwrap().peak > 0.7);
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
            spectrum_bin_indices: Vec::new(),
            spectrum_hann_window: Vec::new(),
            final_spectrum_bin_frequencies: Vec::new(),
            final_spectrum_hann_window: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
            final_spectrum_emitted_columns: 0,
        };

        advance_preview_capture_spectrum_analysis(&mut capture, frame_size * 2, sample_rate);
        advance_preview_capture_spectrum_analysis(&mut capture, frame_size * 2, sample_rate);
        let frames = update_and_build_preview_capture_spectrum_frames(
            &mut capture,
            frame_size * 2,
            sample_rate,
        )
        .unwrap();

        assert_eq!(frames.frame_size, frame_size);
        assert_eq!(frames.sample_rate, sample_rate);
        assert_eq!(frames.captured_samples, frame_size * 2);
        assert_eq!(frames.column_count, 2);
        assert_eq!(frames.row_count, PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT);
        assert_eq!(
            frames.values.len(),
            frames.column_count * PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT
        );
        assert_eq!(frames.start_column, 0);
        assert_eq!(capture.spectrum_analyzed_samples, frame_size * 2);
        let repeated_frames = update_and_build_preview_capture_spectrum_frames(
            &mut capture,
            frame_size * 2,
            sample_rate,
        )
        .unwrap();
        assert_eq!(repeated_frames.column_count, 0);
        assert_eq!(repeated_frames.values.len(), 0);
        assert_eq!(repeated_frames.start_column, 2);
        assert_eq!(capture.spectrum_analyzed_samples, frame_size * 2);
        assert_eq!(
            frames.bin_frequencies.len(),
            PREVIEW_CAPTURE_SPECTRUM_BIN_COUNT
        );
        assert!(frames.values.iter().copied().fold(0.0, f32::max) > 0.01);
    }

    #[test]
    fn final_spectrum_uses_higher_frequency_resolution() {
        let frame_size = 256;
        let sample_rate = 48_000.0;
        let mut capture = TrackProbeCaptureState {
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
            spectrum_bin_indices: Vec::new(),
            spectrum_hann_window: Vec::new(),
            final_spectrum_bin_frequencies: Vec::new(),
            final_spectrum_hann_window: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
            final_spectrum_emitted_columns: 0,
        };

        let final_spectrum =
            build_preview_capture_final_spectrum(&mut capture, frame_size * 3, sample_rate, true)
                .unwrap();
        let unique_fft_bins = frame_size / 2 + 1;

        assert_eq!(final_spectrum.requested_frequency_bins, unique_fft_bins);
        assert_eq!(
            final_spectrum.requested_time_columns,
            PREVIEW_CAPTURE_FINAL_SPECTRUM_MAX_COLUMNS
        );
        assert_eq!(final_spectrum.source_column_count, 3);
        assert_eq!(final_spectrum.column_count, 3);
        assert_eq!(final_spectrum.row_count, unique_fft_bins);
        assert_eq!(final_spectrum.start_column, 0);
        assert!(final_spectrum.complete);
        assert_eq!(final_spectrum.values.len(), 3 * unique_fft_bins);
        assert_eq!(final_spectrum.bin_frequencies.len(), unique_fft_bins);
    }

    #[test]
    fn final_spectrum_sends_bin_frequencies_only_on_first_chunk() {
        let frame_size = 256;
        let sample_rate = 48_000.0;
        let unique_fft_bins = frame_size / 2 + 1;
        let mut capture = TrackProbeCaptureState {
            probe_id: "probe_1".to_string(),
            kind: "spectrum".to_string(),
            signal_start: 0,
            duration_samples: frame_size * 6,
            spectrum_window_size: Some(frame_size),
            samples: (0..frame_size * 6)
                .map(|sample| {
                    ((2.0 * std::f32::consts::PI * 220.0 * sample as f32) / sample_rate).sin() * 0.4
                })
                .collect(),
            spectrum_columns: Vec::new(),
            spectrum_bin_frequencies: Vec::new(),
            spectrum_bin_indices: Vec::new(),
            spectrum_hann_window: Vec::new(),
            final_spectrum_bin_frequencies: Vec::new(),
            final_spectrum_hann_window: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
            final_spectrum_emitted_columns: 0,
        };

        let first_chunk =
            build_preview_capture_final_spectrum(&mut capture, frame_size * 6, sample_rate, true)
                .unwrap();
        let second_chunk =
            build_preview_capture_final_spectrum(&mut capture, frame_size * 6, sample_rate, true)
                .unwrap();

        assert_eq!(first_chunk.start_column, 0);
        assert_eq!(first_chunk.bin_frequencies.len(), unique_fft_bins);
        assert_eq!(
            second_chunk.start_column,
            PREVIEW_CAPTURE_FINAL_SPECTRUM_CHUNK_COLUMNS
        );
        assert!(second_chunk.bin_frequencies.is_empty());
        assert_eq!(second_chunk.requested_frequency_bins, unique_fft_bins);
    }

    #[test]
    fn scope_adsr_estimate_uses_full_resolution_capture() {
        let sample_rate = 1_000.0;
        let sample_count = 1_500;
        let capture = TrackProbeCaptureState {
            probe_id: "probe_1".to_string(),
            kind: "scope".to_string(),
            signal_start: 0,
            duration_samples: sample_count,
            spectrum_window_size: None,
            samples: (0..sample_count)
                .map(|sample| {
                    let time = sample as f32 / sample_rate;
                    if time < 0.046 {
                        return 1.0 - (time / 0.046) * 0.62;
                    }
                    if time < 1.42 {
                        return 0.38;
                    }
                    if time < 1.444 {
                        return 0.38 * (1.0 - (time - 1.42) / 0.024);
                    }
                    0.0
                })
                .collect(),
            spectrum_columns: Vec::new(),
            spectrum_bin_frequencies: Vec::new(),
            spectrum_bin_indices: Vec::new(),
            spectrum_hann_window: Vec::new(),
            final_spectrum_bin_frequencies: Vec::new(),
            final_spectrum_hann_window: Vec::new(),
            spectrum_analyzed_samples: 0,
            spectrum_emitted_columns: 0,
            final_spectrum_emitted_columns: 0,
        };

        let estimate =
            build_preview_capture_adsr_estimate(&capture, sample_count, sample_rate, true).unwrap();

        assert!(estimate.sustain_ratio > 0.3);
        assert!(estimate.sustain_ratio < 0.45);
        assert!(estimate.release_seconds > 0.01);
        assert!(estimate.release_seconds < 0.08);
        assert!(estimate.label.contains("S:38%"));
    }
}
