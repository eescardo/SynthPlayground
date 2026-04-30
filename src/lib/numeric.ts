export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, min, max);
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clampBipolar(value: number): number {
  return clamp(value, -1, 1);
}

export function clampRange(min: number, max: number): { min: number; max: number } {
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export type Complex = { re: number; im: number };

export function addComplex(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function subComplex(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function mulComplex(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function divComplex(a: Complex, b: Complex): Complex {
  const denominator = b.re * b.re + b.im * b.im || 1;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator
  };
}
