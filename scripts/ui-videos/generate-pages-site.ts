import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const prNumber = process.env.PR_NUMBER;
const resolvedScenarios = process.env.RESOLVED_SCENARIOS ?? "";
const baseDir = process.env.VIDEO_PAGES_DIR;

if (!prNumber) {
  throw new Error("PR_NUMBER is required.");
}

if (!baseDir) {
  throw new Error("VIDEO_PAGES_DIR is required.");
}

const scenarios = resolvedScenarios.split(",").map((value) => value.trim()).filter(Boolean);
if (scenarios.length === 0) {
  throw new Error(`No video scenarios were resolved for PR ${prNumber}.`);
}

fs.mkdirSync(baseDir, { recursive: true });

for (const scenario of scenarios) {
  fs.writeFileSync(
    path.join(baseDir, `${scenario}.html`),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PR ${prNumber} · ${scenario}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        background: #0a1118;
        color: #f4f7fb;
        font-family: ui-sans-serif, system-ui, sans-serif;
        display: grid;
        min-height: 100vh;
        place-items: center;
      }
      main { width: min(96vw, 1280px); padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 16px; color: #b8c4d6; }
      video { width: 100%; max-height: 80vh; background: #000; border-radius: 12px; }
      a { color: #8cc8ff; }
    </style>
  </head>
  <body>
    <main>
      <h1>PR ${prNumber} · ${scenario}</h1>
      <p><a href="./${scenario}.webm">Download original webm</a></p>
      <video controls autoplay preload="metadata" poster="./${scenario}.png">
        <source src="./${scenario}.webm" type="video/webm" />
        Your browser does not support embedded webm playback.
      </video>
    </main>
  </body>
</html>
`
  );
}

const items = scenarios
  .map((scenario) => `        <li><a href="./${scenario}.html">${scenario}</a></li>`)
  .join("\n");

fs.writeFileSync(
  path.join(baseDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PR ${prNumber} video previews</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0a1118; color: #f4f7fb; font-family: ui-sans-serif, system-ui, sans-serif; }
      main { width: min(96vw, 1100px); margin: 0 auto; padding: 24px; }
      ul { line-height: 1.9; }
      a { color: #8cc8ff; }
    </style>
  </head>
  <body>
    <main>
      <h1>PR ${prNumber} video previews</h1>
      <ul>
${items}
      </ul>
    </main>
  </body>
</html>
`
);
