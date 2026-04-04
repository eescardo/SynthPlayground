export const VIDEO_SCENARIO = {
  PLAY_FROM_START_5S: "play-from-start-5s",
  RECORD_FROM_START_8S: "record-from-start-8s",
  SELECTION_CUT_PASTE: "selection-cut-paste"
} as const;

export const VIDEO_SCENARIOS = Object.values(VIDEO_SCENARIO);

export type VideoScenario = (typeof VIDEO_SCENARIOS)[number];

export const VIDEO_LABEL_PREFIX = "videos:";

export interface VideoSelection {
  enabled: boolean;
  value: string;
  resolved: string;
  display: string;
  error: string;
}

const normalizeList = (values: string[]) =>
  [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();

const formatDisplay = (scenarios: string[]) => scenarios.map((value) => `\`${value}\``).join(", ");

const invalidResult = (message: string): VideoSelection => ({
  enabled: false,
  value: "",
  resolved: "",
  display: "",
  error: message
});

export const resolveAllVideoScenarios = (): VideoSelection => ({
  enabled: true,
  value: "all",
  resolved: VIDEO_SCENARIOS.join(","),
  display: formatDisplay([...VIDEO_SCENARIOS]),
  error: ""
});

export const resolveSpecificVideoScenarios = (scenarios: string[]): VideoSelection => {
  const normalized = normalizeList(scenarios);
  const invalid = normalized.filter((scenario) => !VIDEO_SCENARIOS.includes(scenario as VideoScenario));
  if (invalid.length > 0) {
    return invalidResult(`Unknown video scenarios: ${invalid.join(", ")}`);
  }
  if (normalized.length === 0) {
    return {
      enabled: false,
      value: "",
      resolved: "",
      display: "",
      error: ""
    };
  }
  return {
    enabled: true,
    value: normalized.join(","),
    resolved: normalized.join(","),
    display: formatDisplay(normalized),
    error: ""
  };
};

export const resolveVideoScenariosFromInput = (raw: string): VideoSelection => {
  const normalized = normalizeList((raw ?? "").split(","));
  if (normalized.length === 0 || normalized.includes("all")) {
    return resolveAllVideoScenarios();
  }
  return resolveSpecificVideoScenarios(normalized);
};

export const resolveVideoScenariosFromLabels = (labels: string[]): VideoSelection => {
  const normalized = normalizeList(labels);
  if (normalized.includes("videos")) {
    return resolveAllVideoScenarios();
  }
  const scenarios = normalized
    .filter((label) => label.startsWith(VIDEO_LABEL_PREFIX))
    .map((label) => label.slice(VIDEO_LABEL_PREFIX.length));
  return resolveSpecificVideoScenarios(scenarios);
};

export const resolveVideoScenariosFromLabelsJson = (raw: string): VideoSelection => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return invalidResult("Video labels payload must be a JSON array.");
    }
    const labels = parsed.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
    return resolveVideoScenariosFromLabels(labels);
  } catch {
    return invalidResult("Video labels payload must be valid JSON.");
  }
};
