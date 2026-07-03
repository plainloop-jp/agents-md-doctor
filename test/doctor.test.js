import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  checkAgentInstructionContent,
  checkAgentInstructions,
  findAgentInstructionFile
} from "../src/doctor.js";

async function makeProject(t) {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "agents-md-doctor-"));
  t.after(() => rm(projectPath, { recursive: true, force: true }));
  return projectPath;
}

test("reports a missing AGENTS.md or CLAUDE.md file", async (t) => {
  const projectPath = await makeProject(t);
  const report = await checkAgentInstructions(projectPath);

  assert.equal(report.passed, false);
  assert.equal(report.score, 0);
  assert.equal(report.fileName, null);
});

test("passes a concise AGENTS.md with commands and testing guidance", async (t) => {
  const projectPath = await makeProject(t);
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

test("finds an instruction file with resolved metadata and content", async (t) => {
  const projectPath = await makeProject(t);
  const filePath = path.join(projectPath, "AGENTS.md");
  const content = "# Project instructions\n";
  await writeFile(filePath, content);

  const result = await findAgentInstructionFile(projectPath);

  assert.deepEqual(result, {
    projectPath,
    fileName: "AGENTS.md",
    filePath,
    content
  });
});

test("prefers AGENTS.md when both instruction files exist", async (t) => {
  const projectPath = await makeProject(t);
  await writeFile(path.join(projectPath, "AGENTS.md"), "AGENTS instructions");
  await writeFile(path.join(projectPath, "CLAUDE.md"), "CLAUDE instructions");

  const result = await findAgentInstructionFile(projectPath);

  assert.equal(result.fileName, "AGENTS.md");
  assert.equal(result.content, "AGENTS instructions");
});

test("returns null when no instruction file exists", async (t) => {
  const projectPath = await makeProject(t);

  const result = await findAgentInstructionFile(projectPath);

  assert.equal(result, null);
});

test("warns about repeated lint or formatting instructions", async (t) => {
  const projectPath = await makeProject(t);
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

test("strict mode fails when warnings are found", async (t) => {
  const projectPath = await makeProject(t);
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

test("detects overly large instruction files", async (t) => {
  const projectPath = await makeProject(t);
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

test("CLI supports JSON output", async (t) => {
  const projectPath = await makeProject(t);
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
