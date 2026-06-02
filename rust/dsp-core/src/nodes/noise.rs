#[inline(always)]
pub(super) fn next_noise(rng_state: &mut u32) -> f32 {
    *rng_state = rng_state.wrapping_mul(1664525).wrapping_add(1013904223);
    let normalized = ((*rng_state >> 8) as f32) / ((1u32 << 24) - 1) as f32;
    normalized * 2.0 - 1.0
}
