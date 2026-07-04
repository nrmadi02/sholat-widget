#!/usr/bin/env node
/**
 * Generate latest.json for Tauri updater from release artifacts.
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs \
 *     --version 0.2.0 \
 *     --repo nrmadi02/sholat-widget \
 *     --artifacts-dir ./artifacts
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      args[key.slice(2)] = argv[++i];
    }
  }
  return args;
}

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function extractChangelog(version) {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const header = `## [${version}]`;
  const start = changelog.indexOf(header);
  if (start === -1) return `Pembaruan versi ${version}`;

  const afterHeader = changelog.slice(start + header.length);
  const nextSection = afterHeader.search(/\n## \[/);
  const section = nextSection === -1 ? afterHeader : afterHeader.slice(0, nextSection);
  return section.replace(/^ - \d{4}-\d{2}-\d{2}\n/, "").trim();
}

function platformKey(filename) {
  if (filename.endsWith(".app.tar.gz")) {
    if (filename.includes("aarch64") || filename.includes("arm64")) {
      return "darwin-aarch64";
    }
    return "darwin-x86_64";
  }
  if (filename.endsWith("-setup.exe")) return "windows-x86_64";
  if (filename.endsWith(".AppImage")) return "linux-x86_64";
  return null;
}

const { version, repo, "artifacts-dir": artifactsDir } = parseArgs(process.argv);

if (!version || !repo || !artifactsDir) {
  console.error(
    "Usage: node scripts/generate-latest-json.mjs --version X.Y.Z --repo owner/repo --artifacts-dir PATH",
  );
  process.exit(1);
}

if (!existsSync(artifactsDir)) {
  console.error("Artifacts directory not found:", artifactsDir);
  process.exit(1);
}

const tag = version.startsWith("v") ? version : `v${version}`;
const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;
const platforms = {};

const allFiles = walkFiles(artifactsDir);
const sigFiles = allFiles.filter((f) => f.endsWith(".sig"));

for (const sigPath of sigFiles) {
  const artifactPath = sigPath.slice(0, -4);
  if (!existsSync(artifactPath)) continue;

  const filename = artifactPath.split("/").pop();
  const key = platformKey(filename);
  if (!key || platforms[key]) continue;

  platforms[key] = {
    url: `${baseUrl}/${filename}`,
    signature: readFileSync(sigPath, "utf8").trim(),
  };
}

if (Object.keys(platforms).length === 0) {
  console.error("No signed updater artifacts found in", artifactsDir);
  process.exit(1);
}

const manifest = {
  version,
  notes: extractChangelog(version),
  pub_date: new Date().toISOString(),
  platforms,
};

process.stdout.write(JSON.stringify(manifest, null, 2));