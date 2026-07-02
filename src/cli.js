#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  checkAgentInstructionContent,
  checkAgentInstructions,
  findAgentInstructionFile
} from "./doctor.js";
import { createImprovedContent, getImprovedFileName } from "./improver.js";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

function printHelp() {
  console.log(`AGENTS.md Doctor

Usage:
  agents-md-doctor check [path] [--json] [--strict]
  agents-md-doctor improve [path] [--force]
  agents-md-doctor --help
  agents-md-doctor --version

Examples:
  agents-md-doctor check .
  agents-md-doctor check ../my-project --json
  agents-md-doctor check . --strict
  agents-md-doctor improve .
  agents-md-doctor improve ../my-project --force`);
}

function parseArguments(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { command: "help" };
  }

  if (args.includes("--version") || args.includes("-v")) {
    return { command: "version" };
  }

  let json = false;
  let strict = false;
  let force = false;
  const positional = [];

  for (const argument of args) {
    if (argument === "--json") {
      json = true;
      continue;
    }

    if (argument === "--strict") {
      strict = true;
      continue;
    }

    if (argument === "--force") {
      force = true;
      continue;
    }

    if (argument.startsWith("--")) {
      return { command: "invalid", message: `Unknown option: ${argument}` };
    }

    positional.push(argument);
  }

  if (positional.length === 0) {
    if (force) {
      return { command: "invalid", message: "--force is only valid with improve." };
    }

    return { command: "check", path: ".", json, strict };
  }

  if (!new Set(["check", "improve"]).has(positional[0]) || positional.length > 2) {
    return { command: "invalid" };
  }

  const command = positional[0];

  if (command === "check" && force) {
    return { command: "invalid", message: "--force is only valid with improve." };
  }

  if (command === "improve" && (json || strict)) {
    return {
      command: "invalid",
      message: "--json and --strict are only valid with check."
    };
  }

  return { command, path: positional[1] ?? ".", json, strict, force };
}

function printReport(report) {
  console.log("AGENTS.md Doctor");
  console.log(`Project: ${report.projectPath}`);
  if (report.fileName) {
    console.log(`File: ${report.fileName}`);
  }
  console.log("");

  for (const check of report.checks) {
    const status = check.passed ? "PASS" : "MISS";
    console.log(`[${status}] ${check.label}: ${check.message}`);
  }

  if (report.findings.length > 0) {
    console.log("");
    console.log("Findings:");
    for (const finding of report.findings) {
      console.log(`[${finding.severity.toUpperCase()}] ${finding.label}: ${finding.message}`);
    }
  }

  console.log("");
  console.log(`Score: ${report.score} / ${report.maxScore}`);
}

async function outputExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function printPackageRequiredError() {
  console.error("A valid package.json is required to improve instructions.");
}

function scoreContent(source, content, fileName = source.fileName, filePath = source.filePath) {
  return checkAgentInstructionContent({
    projectPath: source.projectPath,
    fileName,
    filePath,
    content
  });
}

async function improveInstructions(targetPath, force) {
  const source = await findAgentInstructionFile(targetPath);

  if (!source) {
    console.error("No AGENTS.md or CLAUDE.md file found.");
    process.exitCode = 1;
    return;
  }

  const before = scoreContent(source, source.content);
  if (before.score === before.maxScore) {
    console.log("No improvement needed. Score: 100 / 100");
    return;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(
      await readFile(path.join(source.projectPath, "package.json"), "utf8")
    );
  } catch {
    printPackageRequiredError();
    process.exitCode = 1;
    return;
  }

  let improved;
  try {
    improved = createImprovedContent({
      sourceContent: source.content,
      report: before,
      packageJson
    });
  } catch (error) {
    if (error.message.startsWith("Invalid package.json:")) {
      printPackageRequiredError();
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  if (improved.additions.length === 0) {
    console.log("No safe automatic improvement is available.");
    return;
  }

  const outputName = getImprovedFileName(source.fileName);
  const outputPath = path.join(source.projectPath, outputName);

  if (!force && await outputExists(outputPath)) {
    console.error(`Output already exists: ${outputName}. Use --force to replace it.`);
    process.exitCode = 1;
    return;
  }

  try {
    await writeFile(outputPath, improved.content, {
      encoding: "utf8",
      flag: force ? "w" : "wx"
    });
  } catch (error) {
    if (!force && error.code === "EEXIST") {
      console.error(`Output already exists: ${outputName}. Use --force to replace it.`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  const after = scoreContent(source, improved.content, outputName, outputPath);
  console.log("AGENTS.md Doctor");
  console.log(`Project: ${source.projectPath}`);
  console.log("");
  console.log(`Before: ${before.score} / ${before.maxScore}`);
  console.log(`After:  ${after.score} / ${after.maxScore}`);
  console.log("");
  console.log(`Created: ${outputName}`);
  console.log(`Added: ${improved.additions.join(", ")}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.command === "help") {
    printHelp();
    return;
  }

  if (options.command === "version") {
    console.log(packageJson.version);
    return;
  }

  if (options.command === "invalid") {
    console.error(options.message ?? "Invalid arguments.");
    printHelp();
    process.exitCode = 2;
    return;
  }

  try {
    if (options.command === "improve") {
      await improveInstructions(options.path, options.force);
      return;
    }

    const report = await checkAgentInstructions(options.path, {
      strict: options.strict
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

await main();
