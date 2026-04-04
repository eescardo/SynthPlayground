import {
  resolveVideoScenariosFromInput,
  resolveVideoScenariosFromLabels,
  resolveVideoScenariosFromLabelsJson,
  VIDEO_SCENARIOS
} from "./ui-videos/scenarios";

const emitGithubOutput = (result: {
  enabled: boolean;
  value: string;
  resolved: string;
  display: string;
  error: string;
}) => {
  const lines = [
    `enabled=${result.enabled ? "true" : "false"}`,
    `value=${result.value}`,
    `resolved=${result.resolved ?? ""}`,
    `display=${result.display}`,
    `error=${result.error ?? ""}`
  ];
  process.stdout.write(lines.join("\n"));
};

const mode = process.argv[2];

if (mode === "list") {
  process.stdout.write(`${VIDEO_SCENARIOS.join("\n")}\n`);
  process.exit(0);
}

if (mode === "github-output-input") {
  emitGithubOutput(resolveVideoScenariosFromInput(process.argv[3] ?? ""));
  process.exit(0);
}

if (mode === "github-output-labels") {
  emitGithubOutput(resolveVideoScenariosFromLabels(process.argv.slice(3)));
  process.exit(0);
}

if (mode === "github-output-labels-json") {
  emitGithubOutput(resolveVideoScenariosFromLabelsJson(process.argv[3] ?? "[]"));
  process.exit(0);
}

process.stderr.write(
  "Usage:\n" +
    "  node --import tsx scripts/video-scenarios-cli.ts list\n" +
    "  node --import tsx scripts/video-scenarios-cli.ts github-output-input <csv-or-all>\n" +
    "  node --import tsx scripts/video-scenarios-cli.ts github-output-labels <label>...\n" +
    "  node --import tsx scripts/video-scenarios-cli.ts github-output-labels-json <json-array>\n"
);
process.exit(1);
