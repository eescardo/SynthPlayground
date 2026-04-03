import {
  SCREENSHOT_SCENARIOS,
  resolveScreenshotScenariosFromInput,
  resolveScreenshotScenariosFromLabels,
  resolveScreenshotScenariosFromLabelsJson
} from "./ui-screenshots/scenarios";

const emitGithubOutput = (result: {
  enabled: boolean;
  value: string;
  resolved: string;
  grep: string;
  display: string;
  error: string;
}) => {
  const lines = [
    `enabled=${result.enabled ? "true" : "false"}`,
    `value=${result.value}`,
    `resolved=${result.resolved ?? ""}`,
    `grep=${result.grep ?? ""}`,
    `display=${result.display}`,
    `error=${result.error ?? ""}`
  ];
  process.stdout.write(lines.join("\n"));
};

const mode = process.argv[2];

if (mode === "list") {
  process.stdout.write(`${SCREENSHOT_SCENARIOS.join("\n")}\n`);
  process.exit(0);
}

if (mode === "github-output-input") {
  emitGithubOutput(resolveScreenshotScenariosFromInput(process.argv[3] ?? ""));
  process.exit(0);
}

if (mode === "github-output-labels") {
  emitGithubOutput(resolveScreenshotScenariosFromLabels(process.argv.slice(3)));
  process.exit(0);
}

if (mode === "github-output-labels-json") {
  emitGithubOutput(resolveScreenshotScenariosFromLabelsJson(process.argv[3] ?? "[]"));
  process.exit(0);
}

process.stderr.write(
  "Usage:\n" +
    "  node --import tsx scripts/screenshot-scenarios-cli.ts list\n" +
    "  node --import tsx scripts/screenshot-scenarios-cli.ts github-output-input <csv-or-all>\n" +
    "  node --import tsx scripts/screenshot-scenarios-cli.ts github-output-labels <label>...\n" +
    "  node --import tsx scripts/screenshot-scenarios-cli.ts github-output-labels-json <json-array>\n"
);
process.exit(1);
