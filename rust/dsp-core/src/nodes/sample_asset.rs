use crate::SampleAsset;
use serde_json::Value;

/// Parses the serialized embedded sample payload used by `SamplePlayer`.
/// Params:
/// - `value`: optional JSON string containing versioned sample metadata and PCM values.
pub(super) fn parse_sample_asset(value: Option<&Value>) -> Option<SampleAsset> {
    let raw = value?.as_str()?;
    if raw.is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(raw).ok()?;
    if parsed.get("version")?.as_i64()? != 1 {
        return None;
    }
    let sample_rate = parsed.get("sampleRate")?.as_f64()? as f32;
    let samples = parsed
        .get("samples")?
        .as_array()?
        .iter()
        .map(|sample| sample.as_f64().unwrap_or(0.0) as f32)
        .collect::<Vec<_>>();
    Some(SampleAsset {
        sample_rate,
        samples,
    })
}

#[inline(always)]
pub(super) fn next_noise(rng_state: &mut u32) -> f32 {
    *rng_state = rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
    let normalized = ((*rng_state >> 8) as f32) / ((1u32 << 24) - 1) as f32;
    normalized * 2.0 - 1.0
}
