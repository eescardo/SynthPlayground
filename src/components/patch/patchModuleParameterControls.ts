export interface MagneticSliderSnap {
  point: number;
  radius: number;
}

export function applyMagneticSliderSnap(value: number, snap?: MagneticSliderSnap) {
  if (!snap) {
    return value;
  }
  return Math.abs(value - snap.point) <= snap.radius ? snap.point : value;
}
