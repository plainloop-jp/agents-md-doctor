import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI_PATH = path.resolve("src/cli.js");

async function makeProject() {
  return mkdtemp(path.join(os.tmpdir(), "agents-md-doctor-improve-"));
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: options.cwd ?? path.resolve("."),
    encoding: "utf8"
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeManifest(projectPath, value = { scripts: { test: "node --test" } }) {
  await writeFile(path.join(projectPath, "package.json"), JSON.stringify(value));
}

test("improve creates a separate AGENTS file and leaves the source unchanged", async () => {
  const projectPath = await makeProject();
  const sourcePath = path.join(projectPath, "AGENTS.md");
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  const sourceContent = "# Project instructions\n\nKeep changes small.\n";
  await writeFile(sourcePath, sourceContent);
  await writeManifest(projectPath);

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    result.stdout,
    [
      "AGENTS.md Doctor",
      `Project: ${projectPath}`,
      "",
      "Before: 55 / 100",
      "After:  100 / 100",
      "",
      "Created: AGENTS.improved.md",
      "Added: Useful commands, Testing guidance",
      ""
    ].join("\n")
  );
  assert.equal(await readFile(sourcePath, "utf8"), sourceContent);
  assert.match(await readFile(outputPath, "utf8"), /## Verification/);
});

test("improve refuses to replace an existing output without force", async () => {
  const projectPath = await makeProject();
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");
  await writeManifest(projectPath);
  await writeFile(outputPath, "existing output\n");

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /use --force/i);
  assert.equal(await readFile(outputPath, "utf8"), "existing output\n");
});

test("improve replaces an existing output with force", async () => {
  const projectPath = await makeProject();
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");
  await writeManifest(projectPath);
  await writeFile(outputPath, "existing output\n");

  const result = runCli(["improve", projectPath, "--force"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created: AGENTS\.improved\.md/);
  assert.notEqual(await readFile(outputPath, "utf8"), "existing output\n");
});

test("improve requires package.json and creates no output when it is missing", async () => {
  const projectPath = await makeProject();
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /package\.json is required/i);
  assert.equal(await pathExists(outputPath), false);
});

test("improve rejects invalid package.json and creates no output", async () => {
  const projectPath = await makeProject();
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");
  await writeFile(path.join(projectPath, "package.json"), "{ invalid json");

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /package\.json is required/i);
  assert.equal(await pathExists(outputPath), false);
});

test("improve rejects unreadable and malformed package manifests", async (t) => {
  const cases = [
    {
      name: "unreadable package path",
      prepare: (projectPath) => mkdir(path.join(projectPath, "package.json"))
    },
    {
      name: "primitive manifest",
      prepare: (projectPath) => writeFile(path.join(projectPath, "package.json"), "42")
    },
    {
      name: "array manifest",
      prepare: (projectPath) => writeFile(path.join(projectPath, "package.json"), "[]")
    },
    {
      name: "malformed scripts",
      prepare: (projectPath) =>
        writeFile(path.join(projectPath, "package.json"), '{"scripts":[]}')
    }
  ];

  for (const manifestCase of cases) {
    await t.test(manifestCase.name, async () => {
      const projectPath = await makeProject();
      await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");
      await manifestCase.prepare(projectPath);

      const result = runCli(["improve", projectPath]);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /package\.json is required/i);
      assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
    });
  }
});

test("improve reports a missing instruction file and creates no output", async () => {
  const projectPath = await makeProject();

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /no AGENTS\.md or CLAUDE\.md/i);
  assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
  assert.equal(await pathExists(path.join(projectPath, "CLAUDE.improved.md")), false);
});

test("improve exits successfully without package.json when the source is complete", async () => {
  const projectPath = await makeProject();
  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    "# AGENTS.md\n\n## Commands\n\n- Run tests: npm test\n"
  );

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "No improvement needed. Score: 100 / 100\n");
  assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
});

test("improve creates CLAUDE.improved.md when CLAUDE.md is the source", async () => {
  const projectPath = await makeProject();
  const sourcePath = path.join(projectPath, "CLAUDE.md");
  const sourceContent = "# Project instructions\n";
  await writeFile(sourcePath, sourceContent);
  await writeManifest(projectPath);

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created: CLAUDE\.improved\.md/);
  assert.equal(await readFile(sourcePath, "utf8"), sourceContent);
  assert.equal(await pathExists(path.join(projectPath, "CLAUDE.improved.md")), true);
  assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
});

test("improve creates nothing when no safe automatic improvement is available", async () => {
  const projectPath = await makeProject();
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n\nUse npm install.\n");
  await writeManifest(projectPath, { scripts: { build: "node build.js" } });

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "No safe automatic improvement is available.\n");
  assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
});

test("CLI restricts command flags and keeps help and default check behavior", async () => {
  const projectPath = await makeProject();
  await writeFile(
    path.join(projectPath, "AGENTS.md"),
    "# AGENTS.md\n\n## Commands\n\n- Run tests: npm test\n"
  );

  const rejected = [
    ["check", projectPath, "--force"],
    ["improve", projectPath, "--json"],
    ["improve", projectPath, "--strict"],
    ["improve", projectPath, "extra"],
    ["check", projectPath, "--unknown"]
  ];

  for (const args of rejected) {
    const result = runCli(args);
    assert.equal(result.status, 2, args.join(" "));
  }

  const helpResult = runCli(["--help"]);
  assert.equal(helpResult.status, 0);
  assert.match(helpResult.stdout, /agents-md-doctor check \[path\] \[--json\] \[--strict\]/);
  assert.match(helpResult.stdout, /agents-md-doctor improve \[path\] \[--force\]/);

  const defaultResult = runCli([], { cwd: projectPath });
  assert.equal(defaultResult.status, 0);
  assert.match(defaultResult.stdout, new RegExp(`Project: ${projectPath.replaceAll("\\", "\\\\")}`));
});
