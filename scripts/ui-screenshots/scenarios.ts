export const SCREENSHOT_SCENARIO = {
  MAIN_VIEW: "main-view",
  MICROTONAL_PITCHES: "microtonal-pitches",
  SELECTION_POPOVER: "selection-popover",
  TRACK_NOTE_HOVER: "track-note-hover",
  HELP_MODAL: "help-modal",
  RECORD_MODE: "record-mode",
  PATCH_EDITOR: "patch-editor",
  PATCH_MODULE_FACES: "patch-module-faces",
  PATCH_EXPANDED_FACE: "patch-expanded-face",
  PATCH_BASELINE_DIFF: "patch-baseline-diff",
  MACRO_AUTOMATION_LANE: "macro-automation-lane"
} as const;

export const SCREENSHOT_SCENARIOS = Object.values(SCREENSHOT_SCENARIO);

export type ScreenshotScenario = (typeof SCREENSHOT_SCENARIOS)[number];

export const SCREENSHOT_LABEL_PREFIX = "screenshots:";

export interface ScreenshotSelection {
  enabled: boolean;
  value: string;
  resolved: string;
  grep: string;
  display: string;
  error: string;
}

const normalizeList = (values: string[]) =>
  [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();

const formatDisplay = (scenarios: string[]) => scenarios.map((value) => `\`${value}\``).join(", ");

const grepFor = (scenarios: string[]) => scenarios.map((value) => `@${value}`).join("|");

const invalidResult = (message: string): ScreenshotSelection => ({
  enabled: false,
  value: "",
  resolved: "",
  grep: "",
  display: "",
  error: message
});

export const resolveAllScreenshotScenarios = (): ScreenshotSelection => ({
  enabled: true,
  value: "all",
  resolved: SCREENSHOT_SCENARIOS.join(","),
  grep: "",
  display: formatDisplay([...SCREENSHOT_SCENARIOS]),
  error: ""
});

export const resolveSpecificScreenshotScenarios = (scenarios: string[]): ScreenshotSelection => {
  const normalized = normalizeList(scenarios);
  const invalid = normalized.filter((scenario) => !SCREENSHOT_SCENARIOS.includes(scenario as ScreenshotScenario));
  if (invalid.length > 0) {
    return invalidResult(`Unknown screenshot scenarios: ${invalid.join(", ")}`);
  }
  if (normalized.length === 0) {
    return {
      enabled: false,
      value: "",
      resolved: "",
      grep: "",
      display: "",
      error: ""
    };
  }
  return {
    enabled: true,
    value: normalized.join(","),
    resolved: normalized.join(","),
    grep: grepFor(normalized),
    display: formatDisplay(normalized),
    error: ""
  };
};

export const resolveScreenshotScenariosFromInput = (raw: string): ScreenshotSelection => {
  const normalized = normalizeList((raw ?? "").split(","));
  if (normalized.length === 0 || normalized.includes("all")) {
    return resolveAllScreenshotScenarios();
  }
  return resolveSpecificScreenshotScenarios(normalized);
};

export const resolveScreenshotScenariosFromLabels = (labels: string[]): ScreenshotSelection => {
  const normalized = normalizeList(labels);
  if (normalized.includes("screenshots")) {
    return resolveAllScreenshotScenarios();
  }
  const scenarios = normalized
    .filter((label) => label.startsWith(SCREENSHOT_LABEL_PREFIX))
    .map((label) => label.slice(SCREENSHOT_LABEL_PREFIX.length));
  return resolveSpecificScreenshotScenarios(scenarios);
};

export const resolveScreenshotScenariosFromLabelsJson = (raw: string): ScreenshotSelection => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return invalidResult("Screenshot labels payload must be a JSON array.");
    }
    const labels = parsed.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
    return resolveScreenshotScenariosFromLabels(labels);
  } catch {
    return invalidResult("Screenshot labels payload must be valid JSON.");
  }
};
