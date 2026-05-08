const ADSR_LINEAR_CURVE_SNAP_RADIUS = 0.035;

export function snapAdsrCurveValueToLinearCenter(value: number) {
  return Math.abs(value) <= ADSR_LINEAR_CURVE_SNAP_RADIUS ? 0 : value;
}
