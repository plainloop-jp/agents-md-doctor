#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { checkAgentInstructions } from "./doctor.js";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

function printHelp() {
  console.log(`AGENTS.md Doctor

Usage:
  agents-md-doctor check [path] [--json] [--strict]
  agents-md-doctor --help
  agents-md-doctor --version

Examples:
  agents-md-doctor check .
  agents-md-doctor check ../my-project --json
  agents-md-doctor check . --strict`);
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

    if (argument.startsWith("--")) {
      return { command: "invalid", message: `Unknown option: ${argument}` };
    }

    positional.push(argument);
  }

  if (positional.length === 0) {
    return { command: "check", path: ".", json, strict };
  }

  if (positional[0] !== "check" || positional.length > 2) {
    return { command: "invalid" };
  }

  return { command: "check", path: positional[1] ?? ".", json, strict };
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
