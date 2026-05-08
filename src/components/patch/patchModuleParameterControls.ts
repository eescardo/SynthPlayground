export interface MagneticSliderPoint {
  point: number;
  radius: number;
}

export function applyMagneticSliderSnap(value: number, magnetPoints: MagneticSliderPoint[]) {
  if (magnetPoints.length === 0) {
    return value;
  }
  const snapped = magnetPoints.find(({ point, radius }) => Math.abs(value - point) <= radius);
  return snapped ? snapped.point : value;
}
