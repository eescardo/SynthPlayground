export function resolveMacroSliderKeyboardValue(currentValue: number, key: string) {
  const step = 0.001;
  const pageStep = 0.1;
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clampMacroSliderValue(currentValue - step);
    case "ArrowRight":
    case "ArrowUp":
      return clampMacroSliderValue(currentValue + step);
    case "PageDown":
      return clampMacroSliderValue(currentValue - pageStep);
    case "PageUp":
      return clampMacroSliderValue(currentValue + pageStep);
    case "Home":
      return 0;
    case "End":
      return 1;
    default:
      return null;
  }
}

function clampMacroSliderValue(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
