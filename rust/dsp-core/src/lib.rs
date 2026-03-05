use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn softclip_sample(x: f32, drive: f32) -> f32 {
    let driven = x * drive.max(0.0);
    let clipped = driven.clamp(-1.5, 1.5);
    clipped - (clipped * clipped * clipped) / 3.0
}

#[wasm_bindgen]
pub fn one_pole_step(current: f32, target: f32, alpha: f32) -> f32 {
    current + (target - current) * (1.0 - alpha)
}
