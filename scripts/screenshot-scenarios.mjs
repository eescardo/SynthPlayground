const KNOWN_SCENARIOS = ["main-view", "help-modal", "record-mode", "patch-editor"];
const LABEL_PREFIX = "screenshots:";

const normalizeList = (values) =>
  [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();

const formatDisplay = (scenarios) => scenarios.map((value) => `\`${value}\``).join(", ");

const grepFor = (scenarios) => scenarios.map((value) => `@${value}`).join("|");

const emitGithubOutput = (result) => {
  const lines = [
    `enabled=${result.enabled ? "true" : "false"}`,
    `value=${result.value}`,
    `grep=${result.grep ?? ""}`,
    `display=${result.display}`,
    `error=${result.error ?? ""}`
  ];
  process.stdout.write(lines.join("\n"));
};

const invalidResult = (message) => ({
  enabled: false,
  value: "",
  grep: "",
  display: "",
  error: message
});

const resolveAll = () => ({
  enabled: true,
  value: "all",
  grep: "",
  display: formatDisplay(KNOWN_SCENARIOS),
  error: ""
});

const resolveSpecific = (scenarios) => {
  const normalized = normalizeList(scenarios);
  const invalid = normalized.filter((scenario) => !KNOWN_SCENARIOS.includes(scenario));
  if (invalid.length > 0) {
    return invalidResult(`Unknown screenshot scenarios: ${invalid.join(", ")}`);
  }
  if (normalized.length === 0) {
    return {
      enabled: false,
      value: "",
      grep: "",
      display: "",
      error: ""
    };
  }
  return {
    enabled: true,
    value: normalized.join(","),
    grep: grepFor(normalized),
    display: formatDisplay(normalized),
    error: ""
  };
};

const fromInput = (raw) => {
  const normalized = normalizeList((raw ?? "").split(","));
  if (normalized.length === 0 || normalized.includes("all")) {
    return resolveAll();
  }
  return resolveSpecific(normalized);
};

const fromLabels = (labels) => {
  const normalized = normalizeList(labels);
  if (normalized.includes("screenshots")) {
    return resolveAll();
  }
  const scenarios = normalized
    .filter((label) => label.startsWith(LABEL_PREFIX))
    .map((label) => label.slice(LABEL_PREFIX.length));
  return resolveSpecific(scenarios);
};

const mode = process.argv[2];

if (mode === "list") {
  process.stdout.write(`${KNOWN_SCENARIOS.join("\n")}\n`);
  process.exit(0);
}

if (mode === "github-output-input") {
  emitGithubOutput(fromInput(process.argv[3] ?? ""));
  process.exit(0);
}

if (mode === "github-output-labels") {
  emitGithubOutput(fromLabels(process.argv.slice(3)));
  process.exit(0);
}

process.stderr.write(
  "Usage:\n" +
    "  node scripts/screenshot-scenarios.mjs list\n" +
    "  node scripts/screenshot-scenarios.mjs github-output-input <csv-or-all>\n" +
    "  node scripts/screenshot-scenarios.mjs github-output-labels <label>...\n"
);
process.exit(1);
