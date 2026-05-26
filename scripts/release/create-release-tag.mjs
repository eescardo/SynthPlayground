#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const TAG_PREFIX = "deploy/v";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail("Usage: pnpm run release:tag -- <major.minor.patch>");
}

const tag = `${TAG_PREFIX}${version}`;
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);

if (branch !== "main") {
  fail(`Release tags must be created from main. Current branch: ${branch}`);
}

const dirtyStatus = run("git", ["status", "--porcelain"]);
if (dirtyStatus) {
  fail("Working tree must be clean before creating a release tag.");
}

run("git", ["fetch", "origin", "main", "--tags"], { stdio: "inherit" });

const existingTags = run("git", ["tag", "--list", tag]);
if (existingTags) {
  fail(`Tag already exists: ${tag}`);
}

const head = run("git", ["rev-parse", "HEAD"]);
const originMain = run("git", ["rev-parse", "origin/main"]);

if (head !== originMain) {
  fail("Release tag must point at the current origin/main HEAD.");
}

run("git", ["tag", "-a", tag, "-m", `Deploy SynthSprout v${version}`], { stdio: "inherit" });

console.log(`Created ${tag} at ${head}.`);
console.log(`Push it with: git push origin ${tag}`);
