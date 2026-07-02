import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  checkAgentInstructionContent,
  checkAgentInstructions
} from "../src/doctor.js";

async function makeProject() {
  return mkdtemp(path.join(os.tmpdir(), "agents-md-doctor-"));
}

test("reports a missing AGENTS.md or CLAUDE.md file", async () => {
  const projectPath = await makeProject();
  const report = await checkAgentInstructions(projectPath);

  assert.equal(report.passed, false);
  assert.equal(report.score, 0);
  assert.equal(report.fileName, null);
});

test("passes a concise AGENTS.md with commands and testing guidance", async () => {
  const projectPath = await makeProject();
  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    `# AGENTS.md

## Commands

- Install dependencies: npm install
- Run tests: npm test

## Workflow

- Keep changes small.
- Run tests before handing off work.
`
  );

  const report = await checkAgentInstructions(projectPath);

  assert.equal(report.passed, true);
  assert.equal(report.score, 100);
  assert.equal(report.fileName, "AGENTS.md");
});

test("scores instruction content without writing a file", async () => {
  const projectPath = path.resolve("virtual-project");
  const report = await checkAgentInstructionContent({
    projectPath,
    fileName: "AGENTS.improved.md",
    filePath: path.join(projectPath, "AGENTS.improved.md"),
    content: `# AGENTS.md

## Commands

- Install dependencies: npm install
- Run tests: npm test

## Workflow

- Keep changes small.
- Run tests before handing off work.
`
  });

  assert.equal(report.score, 100);
  assert.equal(report.passed, true);
  assert.equal(report.fileName, "AGENTS.improved.md");
});

test("warns about repeated lint or formatting instructions", async () => {
  const projectPath = await makeProject();
  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    `# AGENTS.md

Use npm test.
Run tests before finishing.
Follow ESLint, Prettier, Biome, Ruff, Black, indentation, semicolon, and trailing comma rules.
`
  );

  const report = await checkAgentInstructions(projectPath);

  assert.equal(report.passed, true);
  assert.equal(report.findings.some((finding) => finding.id === "lint-leakage"), true);
});

test("strict mode fails when warnings are found", async () => {
  const projectPath = await makeProject();
  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    `# AGENTS.md

Use npm test.
Run tests before finishing.
Follow ESLint, Prettier, Biome, Ruff, Black, indentation, semicolon, and trailing comma rules.
`
  );

  const report = await checkAgentInstructions(projectPath, { strict: true });

  assert.equal(report.passed, false);
});

test("detects overly large instruction files", async () => {
  const projectPath = await makeProject();
  const longBody = Array.from({ length: 205 }, (_, index) => `- Rule ${index}: keep going`).join("\n");

  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    `# AGENTS.md

Use npm test.
Run tests before finishing.
${longBody}
`
  );

  const report = await checkAgentInstructions(projectPath);

  assert.equal(report.passed, false);
  assert.equal(report.checks.find((check) => check.id === "context-size").passed, false);
});

test("CLI prints the package version", () => {
  const result = spawnSync(process.execPath, ["./src/cli.js", "--version"], {
    cwd: path.resolve("."),
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("CLI supports JSON output", async () => {
  const projectPath = await makeProject();
  await mkdir(path.join(projectPath, "docs"));
  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    `# AGENTS.md

## Commands

- Install dependencies: npm install
- Run tests: npm test

docs/architecture.md
`
  );

  const result = spawnSync(process.execPath, ["./src/cli.js", "check", projectPath, "--json"], {
    cwd: path.resolve("."),
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.fileName, "AGENTS.md");
});
