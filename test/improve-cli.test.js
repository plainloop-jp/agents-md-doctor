import assert from "node:assert/strict";
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import { checkAgentInstructionContent } from "../src/doctor.js";

const CLI_PATH = path.resolve("src/cli.js");

async function makeProject(t) {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), "agents-md-doctor-improve-"));
  t.after(() => rm(projectPath, { recursive: true, force: true }));
  return projectPath;
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: options.cwd ?? path.resolve("."),
    encoding: "utf8"
  });
}

function runCliAsync(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd ?? path.resolve("."),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
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

async function findTemporaryOutputs(projectPath, outputName = "AGENTS.improved.md") {
  const prefix = `.${outputName}.`;
  return (await readdir(projectPath)).filter(
    (fileName) => fileName.startsWith(prefix) && fileName.endsWith(".tmp")
  );
}

test("improve creates a separate AGENTS file and leaves the source unchanged", async (t) => {
  const projectPath = await makeProject(t);
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

test(
  "simultaneous non-force improves create exactly one complete output",
  { timeout: 30_000 },
  async (t) => {
    const projectPath = await makeProject(t);
    const sourcePath = path.join(projectPath, "AGENTS.md");
    const outputPath = path.join(projectPath, "AGENTS.improved.md");
    const sourceContent = "# Project instructions\n\nKeep changes small.\n";
    await writeFile(sourcePath, sourceContent);
    await writeManifest(projectPath);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => runCliAsync(["improve", projectPath]))
    );
    const successes = results.filter((result) => result.status === 0);
    const refusals = results.filter((result) => result.status === 1);

    assert.equal(successes.length, 1);
    assert.equal(refusals.length, 7);
    assert.equal(results.every((result) => result.signal === null), true);
    assert.equal(await readFile(sourcePath, "utf8"), sourceContent);

    const outputContent = await readFile(outputPath, "utf8");
    const report = checkAgentInstructionContent({
      projectPath,
      fileName: "AGENTS.improved.md",
      filePath: outputPath,
      content: outputContent
    });

    assert.equal(report.score, report.maxScore);
    assert.match(outputContent, /^## Commands$/m);
    assert.match(outputContent, /^## Verification$/m);
    assert.deepEqual(await findTemporaryOutputs(projectPath), []);
  }
);

test("improve refuses to replace an existing output without force", async (t) => {
  const projectPath = await makeProject(t);
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

test("improve replaces an existing output with force", async (t) => {
  const projectPath = await makeProject(t);
  const sourcePath = path.join(projectPath, "AGENTS.md");
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  const sourceContent = "# Project instructions\n";
  await writeFile(sourcePath, sourceContent);
  await writeManifest(projectPath);
  await writeFile(outputPath, "existing output\n");

  const result = runCli(["improve", projectPath, "--force"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Created: AGENTS\.improved\.md/);
  assert.equal(await readFile(sourcePath, "utf8"), sourceContent);
  assert.notEqual(await readFile(outputPath, "utf8"), "existing output\n");
  assert.deepEqual(await findTemporaryOutputs(projectPath), []);
});

test("improve force rejects a hardlink output that aliases the source", async (t) => {
  const projectPath = await makeProject(t);
  const sourcePath = path.join(projectPath, "AGENTS.md");
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  const sourceContent = "# Project instructions\n";
  await writeFile(sourcePath, sourceContent);
  await writeManifest(projectPath);
  await link(sourcePath, outputPath);

  const result = runCli(["improve", projectPath, "--force"]);
  const sourceStat = await stat(sourcePath);
  const outputStat = await stat(outputPath);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe output/i);
  assert.doesNotMatch(result.stdout, /Created:/);
  assert.equal(await readFile(sourcePath, "utf8"), sourceContent);
  assert.equal(await readFile(outputPath, "utf8"), sourceContent);
  assert.equal(sourceStat.dev, outputStat.dev);
  assert.equal(sourceStat.ino, outputStat.ino);
  assert.deepEqual(await findTemporaryOutputs(projectPath), []);
});

test("improve force rejects a symlink output that aliases the source", async (t) => {
  const projectPath = await makeProject(t);
  const sourcePath = path.join(projectPath, "AGENTS.md");
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  const sourceContent = "# Project instructions\n";
  await writeFile(sourcePath, sourceContent);
  await writeManifest(projectPath);

  try {
    await symlink(sourcePath, outputPath, "file");
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      t.skip("Windows denied symlink creation because the process lacks symlink privilege.");
      return;
    }

    throw error;
  }

  const result = runCli(["improve", projectPath, "--force"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe output/i);
  assert.doesNotMatch(result.stdout, /Created:/);
  assert.equal(await readFile(sourcePath, "utf8"), sourceContent);
  assert.equal(await readFile(outputPath, "utf8"), sourceContent);
  assert.equal((await lstat(outputPath)).isSymbolicLink(), true);
  assert.deepEqual(await findTemporaryOutputs(projectPath), []);
});

test("improve exits 2 without false success when the output cannot be written", async (t) => {
  const projectPath = await makeProject(t);
  const sourcePath = path.join(projectPath, "AGENTS.md");
  const sourceContent = "# Project instructions\n";
  await writeFile(sourcePath, sourceContent);
  await writeManifest(projectPath);
  await mkdir(path.join(projectPath, "AGENTS.improved.md"));

  const result = runCli(["improve", projectPath, "--force"]);

  assert.equal(result.status, 2);
  assert.equal(await readFile(sourcePath, "utf8"), sourceContent);
  assert.doesNotMatch(result.stdout, /Created:/);
  assert.deepEqual(await findTemporaryOutputs(projectPath), []);
});

test("improve requires package.json and creates no output when it is missing", async (t) => {
  const projectPath = await makeProject(t);
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /package\.json is required/i);
  assert.equal(await pathExists(outputPath), false);
});

test("improve rejects invalid package.json and creates no output", async (t) => {
  const projectPath = await makeProject(t);
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
    await t.test(manifestCase.name, async (t) => {
      const projectPath = await makeProject(t);
      await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n");
      await manifestCase.prepare(projectPath);

      const result = runCli(["improve", projectPath]);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /package\.json is required/i);
      assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
    });
  }
});

test("improve reports a missing instruction file and creates no output", async (t) => {
  const projectPath = await makeProject(t);

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /no AGENTS\.md or CLAUDE\.md/i);
  assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
  assert.equal(await pathExists(path.join(projectPath, "CLAUDE.improved.md")), false);
});

test("improve exits successfully without package.json when the source is complete", async (t) => {
  const projectPath = await makeProject(t);
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

test("improve creates CLAUDE.improved.md when CLAUDE.md is the source", async (t) => {
  const projectPath = await makeProject(t);
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

test("improve creates nothing when no safe automatic improvement is available", async (t) => {
  const projectPath = await makeProject(t);
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Project instructions\n\nUse npm install.\n");
  await writeManifest(projectPath, { scripts: { build: "node build.js" } });

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "No safe automatic improvement is available.\n");
  assert.equal(await pathExists(path.join(projectPath, "AGENTS.improved.md")), false);
});

test("CLI restricts command flags and keeps help and default check behavior", async (t) => {
  const projectPath = await makeProject(t);
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
