# Improve Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `improve` command that safely creates `AGENTS.improved.md` or `CLAUDE.improved.md` and displays an easy-to-share before-and-after score.

**Architecture:** Refactor the current doctor so it can score in-memory content as well as files. Add a focused improver module that derives real npm commands from `package.json` and appends only safe missing sections. Keep filesystem coordination, overwrite protection, terminal formatting, and exit codes in the CLI.

**Tech Stack:** Node.js 20+, ECMAScript modules, `node:test`, `node:assert`, and Node built-in filesystem/path APIs. No runtime dependencies.

---

## File Map

- Modify `src/doctor.js`: export source discovery and content-level scoring while preserving current behavior.
- Create `src/improver.js`: derive npm commands, generate safe appended sections, and choose output names.
- Modify `src/cli.js`: parse and execute `improve [path] [--force]`.
- Modify `test/doctor.test.js`: verify content-level scoring and preserve existing tests.
- Create `test/improver.test.js`: unit-test pure improvement rules.
- Create `test/improve-cli.test.js`: integration-test file safety, output, errors, and `--force`.
- Modify `README.md`: document the new command and before/after result.
- Modify `package.json`: release version 0.2.0.

### Task 1: Add Content-Level Diagnosis

**Files:**
- Modify: `src/doctor.js`
- Modify: `test/doctor.test.js`

- [ ] **Step 1: Write a failing content-scoring test**

Add this import and test to `test/doctor.test.js`:

```js
import {
  checkAgentInstructionContent,
  checkAgentInstructions
} from "../src/doctor.js";

test("scores instruction content without writing a file", () => {
  const report = checkAgentInstructionContent({
    projectPath: "C:/example",
    fileName: "AGENTS.improved.md",
    filePath: "C:/example/AGENTS.improved.md",
    content: `# AGENTS.md

## Commands

- Install dependencies: npm install
- Run tests: npm test

## Verification

- Run npm test before finishing.
`
  });

  assert.equal(report.score, 100);
  assert.equal(report.passed, true);
  assert.equal(report.fileName, "AGENTS.improved.md");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test --test-name-pattern "scores instruction content" test/doctor.test.js
```

Expected: FAIL because `checkAgentInstructionContent` is not exported.

- [ ] **Step 3: Extract content-level scoring**

In `src/doctor.js`, export the existing source reader and move the scoring body into this public function:

```js
export async function findAgentInstructionFile(targetPath = ".") {
  const projectPath = path.resolve(targetPath);

  for (const fileName of CONFIG_FILES) {
    const filePath = path.join(projectPath, fileName);
    if (await fileExists(filePath)) {
      return {
        projectPath,
        fileName,
        filePath,
        content: await readFile(filePath, "utf8")
      };
    }
  }

  return null;
}

export function checkAgentInstructionContent({
  projectPath,
  fileName,
  filePath,
  content,
  strict = false
}) {
  const lowerContent = content.toLowerCase();
  const lines = content.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const conflicts = findConflicts(lowerContent);
  const lintTermCount = countTerms(lowerContent, LINT_TERMS);
  const blindReferences = findBlindReferences(lines);
  const hasCommands = hasAnyTerm(lowerContent, COMMAND_TERMS);
  const hasTesting = hasAnyTerm(lowerContent, TEST_TERMS);
  const hasBloat = nonEmptyLines.length > MAX_LINES || content.length > MAX_CHARACTERS;

  const checks = [
    makeCheck("config-file", "Configuration file", true, `${fileName} found.`, 30),
    makeCheck(
      "commands",
      "Useful commands",
      hasCommands,
      hasCommands
        ? "The file mentions project commands or package managers."
        : "Add setup, build, test, or package-manager commands.",
      25
    ),
    makeCheck(
      "testing-guidance",
      "Testing guidance",
      hasTesting,
      hasTesting
        ? "The file gives the agent a way to verify changes."
        : "Tell the agent how to test or verify changes.",
      20
    ),
    makeCheck(
      "context-size",
      "Context size",
      !hasBloat,
      hasBloat
        ? `The file is ${nonEmptyLines.length} non-empty lines and ${content.length} characters.`
        : `The file stays under ${MAX_LINES} non-empty lines and ${MAX_CHARACTERS} characters.`,
      15
    ),
    makeCheck(
      "conflicts",
      "Conflicting instructions",
      conflicts.length === 0,
      conflicts.length === 0
        ? "No obvious conflicting instructions found."
        : `Possible conflict around: ${conflicts.join(", ")}.`,
      10
    )
  ];

  const findings = [];

  if (lintTermCount >= 5) {
    findings.push({
      id: "lint-leakage",
      label: "Lint leakage",
      severity: "warn",
      message:
        "This file repeats several lint or formatting terms. Prefer letting linters enforce deterministic style rules."
    });
  }

  if (blindReferences.length > 0) {
    findings.push({
      id: "blind-reference",
      label: "Blind reference",
      severity: "warn",
      message:
        `Some references look unexplained, for example line ${blindReferences[0].lineNumber}: ${blindReferences[0].line}`
    });
  }

  if (/auto-generated|autogenerated|generated by|\/init/.test(lowerContent)) {
    findings.push({
      id: "init-fossilization",
      label: "Init fossilization",
      severity: "warn",
      message:
        "This file looks generated. Review it so temporary initialization notes do not become permanent instructions."
    });
  }

  const score = checks.reduce((total, check) => total + check.score, 0);
  const hasFailedChecks = checks.some((check) => !check.passed);
  const hasStrictWarnings = strict && findings.some((finding) => finding.severity === "warn");

  return {
    projectPath,
    fileName,
    filePath,
    strict,
    checks,
    findings,
    score,
    maxScore: 100,
    passed: !hasFailedChecks && !hasStrictWarnings
  };
}

export async function checkAgentInstructions(targetPath = ".", options = {}) {
  const projectPath = path.resolve(targetPath);
  const strict = Boolean(options.strict);
  const config = await findAgentInstructionFile(projectPath);

  if (!config) {
    return createMissingReport(projectPath, strict);
  }

  return checkAgentInstructionContent({
    ...config,
    strict
  });
}
```

Delete the old private `readConfigFile` after all callers use `findAgentInstructionFile`.

- [ ] **Step 4: Run all doctor tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/doctor.test.js
```

Expected: 8 tests pass, including all 7 original tests.

- [ ] **Step 5: Commit the refactor**

```powershell
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' add -- src/doctor.js test/doctor.test.js
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' commit -m "refactor: support in-memory instruction checks"
```

### Task 2: Build Pure Improvement Rules

**Files:**
- Create: `src/improver.js`
- Create: `test/improver.test.js`

- [ ] **Step 1: Write failing npm-command discovery tests**

Create `test/improver.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  createImprovedContent,
  discoverNpmCommands,
  getImprovedFileName
} from "../src/improver.js";

test("discovers only supported npm scripts that exist", () => {
  const commands = discoverNpmCommands({
    scripts: {
      test: "node --test",
      check: "node ./src/cli.js check .",
      deploy: "example deploy"
    }
  });

  assert.deepEqual(commands, {
    install: "npm install",
    scripts: ["npm test", "npm run check"],
    verification: ["npm test", "npm run check"]
  });
});

test("uses the correct improved filename", () => {
  assert.equal(getImprovedFileName("AGENTS.md"), "AGENTS.improved.md");
  assert.equal(getImprovedFileName("CLAUDE.md"), "CLAUDE.improved.md");
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improver.test.js
```

Expected: FAIL because `src/improver.js` does not exist.

- [ ] **Step 3: Implement command discovery and filenames**

Create `src/improver.js` with these exports:

```js
const SUPPORTED_SCRIPTS = ["test", "check", "lint", "typecheck", "build"];
const VERIFICATION_SCRIPTS = new Set(["test", "check", "lint", "typecheck"]);

function formatNpmScript(name) {
  return name === "test" ? "npm test" : `npm run ${name}`;
}

export function discoverNpmCommands(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  const names = SUPPORTED_SCRIPTS.filter(
    (name) => typeof scripts[name] === "string" && scripts[name].trim().length > 0
  );

  return {
    install: "npm install",
    scripts: names.map(formatNpmScript),
    verification: names
      .filter((name) => VERIFICATION_SCRIPTS.has(name))
      .map(formatNpmScript)
  };
}

export function getImprovedFileName(sourceFileName) {
  if (sourceFileName === "AGENTS.md") return "AGENTS.improved.md";
  if (sourceFileName === "CLAUDE.md") return "CLAUDE.improved.md";
  throw new Error(`Unsupported instruction file: ${sourceFileName}`);
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improver.test.js
```

Expected: 2 tests pass.

- [ ] **Step 5: Write failing content-generation tests**

Append to `test/improver.test.js`:

```js
test("preserves source content and appends missing guidance", () => {
  const sourceContent = "# Project rules\n\nKeep changes small.\n";
  const result = createImprovedContent({
    sourceContent,
    report: {
      checks: [
        { id: "commands", passed: false },
        { id: "testing-guidance", passed: false }
      ]
    },
    packageJson: {
      scripts: {
        test: "node --test",
        check: "node ./src/cli.js check ."
      }
    }
  });

  assert.equal(result.content.startsWith(sourceContent), true);
  assert.match(result.content, /## Commands/);
  assert.match(result.content, /npm install/);
  assert.match(result.content, /npm test/);
  assert.match(result.content, /## Verification/);
  assert.deepEqual(result.additions, ["Useful commands", "Testing guidance"]);
});

test("does not append sections that already pass", () => {
  const result = createImprovedContent({
    sourceContent: "# Rules\n\nUse npm install and npm test.\n",
    report: {
      checks: [
        { id: "commands", passed: true },
        { id: "testing-guidance", passed: true }
      ]
    },
    packageJson: { scripts: { test: "node --test" } }
  });

  assert.equal(result.content, "# Rules\n\nUse npm install and npm test.\n");
  assert.deepEqual(result.additions, []);
});

test("does not invent verification commands", () => {
  const result = createImprovedContent({
    sourceContent: "# Rules\n",
    report: {
      checks: [
        { id: "commands", passed: true },
        { id: "testing-guidance", passed: false }
      ]
    },
    packageJson: { scripts: { deploy: "example deploy" } }
  });

  assert.equal(result.content, "# Rules\n");
  assert.deepEqual(result.additions, []);
});
```

- [ ] **Step 6: Run tests and verify generation is missing**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improver.test.js
```

Expected: 2 tests pass and 3 tests fail because `createImprovedContent` is not implemented.

- [ ] **Step 7: Implement safe section generation**

Add to `src/improver.js`:

```js
function failed(report, id) {
  return report.checks.some((check) => check.id === id && !check.passed);
}

function appendSection(content, title, bullets) {
  const base = content.endsWith("\n") ? content : `${content}\n`;
  return `${base}\n## ${title}\n\n${bullets.map((item) => `- ${item}`).join("\n")}\n`;
}

export function createImprovedContent({ sourceContent, report, packageJson }) {
  const commands = discoverNpmCommands(packageJson);
  const additions = [];
  let content = sourceContent;

  if (failed(report, "commands")) {
    const bullets = [
      `Install dependencies: \`${commands.install}\``,
      ...commands.scripts.map((command) => `Run project command: \`${command}\``)
    ];
    content = appendSection(content, "Commands", bullets);
    additions.push("Useful commands");
  }

  if (failed(report, "testing-guidance") && commands.verification.length > 0) {
    const bullets = commands.verification.map(
      (command) => `Before finishing, run: \`${command}\``
    );
    content = appendSection(content, "Verification", bullets);
    additions.push("Testing guidance");
  }

  return { content, additions };
}
```

- [ ] **Step 8: Run improver tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improver.test.js
```

Expected: 5 tests pass.

- [ ] **Step 9: Commit the improver module**

```powershell
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' add -- src/improver.js test/improver.test.js
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' commit -m "feat: generate improved agent instructions"
```

### Task 3: Add the Improve CLI Workflow

**Files:**
- Modify: `src/cli.js`
- Create: `test/improve-cli.test.js`

- [ ] **Step 1: Write the successful CLI integration test**

Create `test/improve-cli.test.js` with helpers that create a temporary Node.js project and spawn the CLI:

```js
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI_PATH = path.resolve("src/cli.js");

async function makeProject() {
  return mkdtemp(path.join(os.tmpdir(), "agents-md-improve-"));
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8"
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeIncompleteProject(fileName = "AGENTS.md") {
  const projectPath = await makeProject();
  const outputName = fileName === "AGENTS.md"
    ? "AGENTS.improved.md"
    : "CLAUDE.improved.md";
  const sourcePath = path.join(projectPath, fileName);
  const outputPath = path.join(projectPath, outputName);
  const source = "# Project rules\n\nKeep changes small.\n";

  await writeFile(sourcePath, source);
  await writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({ scripts: { test: "node --test", check: "node check.js" } })
  );

  return { projectPath, sourcePath, outputPath, source };
}

test("improve creates a separate file and prints before and after scores", async () => {
  const projectPath = await makeProject();
  const sourcePath = path.join(projectPath, "AGENTS.md");
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  const source = "# Project rules\n\nKeep changes small.\n";

  await writeFile(sourcePath, source);
  await writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({ scripts: { test: "node --test", check: "node check.js" } })
  );

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Before: 55 \/ 100/);
  assert.match(result.stdout, /After:\s+100 \/ 100/);
  assert.match(result.stdout, /Created: AGENTS\.improved\.md/);
  assert.equal(await readFile(sourcePath, "utf8"), source);
  assert.equal(await exists(outputPath), true);
});
```

- [ ] **Step 2: Run the CLI test and verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improve-cli.test.js
```

Expected: FAIL because `improve` is not a recognized CLI command.

- [ ] **Step 3: Implement argument parsing and help text**

Replace `parseArguments` in `src/cli.js` with:

```js
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
      return { command: "invalid", message: "--force can only be used with improve." };
    }
    return { command: "check", path: ".", json, strict };
  }

  if (positional[0] === "check" && positional.length <= 2) {
    if (force) {
      return { command: "invalid", message: "--force can only be used with improve." };
    }
    return { command: "check", path: positional[1] ?? ".", json, strict };
  }

  if (positional[0] === "improve" && positional.length <= 2) {
    if (json || strict) {
      return {
        command: "invalid",
        message: "--json and --strict can only be used with check."
      };
    }
    return { command: "improve", path: positional[1] ?? ".", force };
  }

  return { command: "invalid" };
}
```

Update help text to include:

```text
agents-md-doctor improve [path] [--force]
```

- [ ] **Step 4: Implement the successful improve path**

Replace the filesystem import and add the new imports at the top of `src/cli.js`:

```js
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  checkAgentInstructionContent,
  checkAgentInstructions,
  findAgentInstructionFile
} from "./doctor.js";
import {
  createImprovedContent,
  getImprovedFileName
} from "./improver.js";
```

Add the helper and `improve` handler with these exact operations:

```js
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function improve(targetPath, { force }) {
  const projectPath = path.resolve(targetPath);
  const source = await findAgentInstructionFile(projectPath);

  if (!source) {
    return { ok: false, exitCode: 1, message: "No AGENTS.md or CLAUDE.md file found." };
  }

  const before = checkAgentInstructionContent(source);
  if (before.score === 100) {
    return { ok: true, exitCode: 0, message: "No improvement needed. Score: 100 / 100" };
  }

  const packagePath = path.join(projectPath, "package.json");
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    return {
      ok: false,
      exitCode: 1,
      message: "A readable package.json is required for automatic improvement."
    };
  }
  const generated = createImprovedContent({
    sourceContent: source.content,
    report: before,
    packageJson
  });

  if (generated.additions.length === 0) {
    return {
      ok: true,
      exitCode: 0,
      message: "No safe automatic improvement is available."
    };
  }

  const outputName = getImprovedFileName(source.fileName);
  const outputPath = path.join(projectPath, outputName);

  if (!force && await fileExists(outputPath)) {
    return {
      ok: false,
      exitCode: 1,
      message: `${outputName} already exists. Use --force to replace it.`
    };
  }

  await writeFile(outputPath, generated.content, "utf8");
  const after = checkAgentInstructionContent({
    projectPath,
    fileName: outputName,
    filePath: outputPath,
    content: generated.content
  });

  return { ok: true, exitCode: 0, before, after, outputName, ...generated };
}
```

Add this formatter:

```js
function printImprovement(result) {
  console.log("AGENTS.md Doctor");

  if (!result.before) {
    console.log(result.message);
    return;
  }

  console.log(`Project: ${result.before.projectPath}`);
  console.log("");
  console.log(`Before: ${result.before.score} / ${result.before.maxScore}`);
  console.log(`After:  ${result.after.score} / ${result.after.maxScore}`);
  console.log("");
  console.log(`Created: ${result.outputName}`);
  console.log(`Added: ${result.additions.join(", ")}`);
}
```

Handle the new command in `main` before the existing `check` try block:

```js
if (options.command === "improve") {
  try {
    const result = await improve(options.path, { force: options.force });

    if (result.ok) {
      printImprovement(result);
    } else {
      console.error(result.message);
    }

    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
  return;
}
```

- [ ] **Step 5: Run the successful CLI test**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improve-cli.test.js
```

Expected: 1 test passes.

- [ ] **Step 6: Add safety and error tests**

Append these complete integration tests:

```js
test("improve refuses to overwrite without force", async () => {
  const project = await writeIncompleteProject();
  await writeFile(project.outputPath, "existing output\n");

  const result = runCli(["improve", project.projectPath]);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /already exists/);
  assert.equal(await readFile(project.outputPath, "utf8"), "existing output\n");
});

test("improve replaces the output with force", async () => {
  const project = await writeIncompleteProject();
  await writeFile(project.outputPath, "existing output\n");

  const result = runCli(["improve", project.projectPath, "--force"]);
  const output = await readFile(project.outputPath, "utf8");

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, /existing output/);
  assert.match(output, /## Commands/);
  assert.equal(await readFile(project.sourcePath, "utf8"), project.source);
});

test("improve fails safely without package.json", async () => {
  const projectPath = await makeProject();
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Rules\n");

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /package\.json is required/);
  assert.equal(await exists(outputPath), false);
});

test("improve fails safely with invalid package.json", async () => {
  const projectPath = await makeProject();
  const outputPath = path.join(projectPath, "AGENTS.improved.md");
  await writeFile(path.join(projectPath, "AGENTS.md"), "# Rules\n");
  await writeFile(path.join(projectPath, "package.json"), "not json");

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /package\.json is required/);
  assert.equal(await exists(outputPath), false);
});

test("improve fails safely without an instruction file", async () => {
  const projectPath = await makeProject();
  await writeFile(path.join(projectPath, "package.json"), JSON.stringify({ scripts: {} }));

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /No AGENTS\.md or CLAUDE\.md/);
  assert.equal(await exists(path.join(projectPath, "AGENTS.improved.md")), false);
});

test("improve creates nothing when the source already scores 100", async () => {
  const projectPath = await makeProject();
  const source = `# AGENTS.md

## Commands

- Install dependencies: npm install
- Run tests: npm test

## Verification

- Run npm test before finishing.
`;
  await writeFile(path.join(projectPath, "AGENTS.md"), source);
  await writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify({ scripts: { test: "node --test" } })
  );

  const result = runCli(["improve", projectPath]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /No improvement needed/);
  assert.equal(await exists(path.join(projectPath, "AGENTS.improved.md")), false);
});

test("improve supports CLAUDE.md", async () => {
  const project = await writeIncompleteProject("CLAUDE.md");

  const result = runCli(["improve", project.projectPath]);

  assert.equal(result.status, 0);
  assert.equal(await exists(project.outputPath), true);
  assert.match(result.stdout, /Created: CLAUDE\.improved\.md/);
  assert.equal(await readFile(project.sourcePath, "utf8"), project.source);
});
```

Use the same concrete source and package fixtures as the first integration test. Do not mock filesystem behavior.

- [ ] **Step 7: Run CLI safety tests**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' --test test/improve-cli.test.js
```

Expected: 8 tests pass.

- [ ] **Step 8: Commit the CLI workflow**

```powershell
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' add -- src/cli.js test/improve-cli.test.js
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' commit -m "feat: add improve command"
```

### Task 4: Document Version 0.2.0

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Update package version**

Change:

```json
"version": "0.2.0"
```

- [ ] **Step 2: Add the improve command to README usage**

Add:

````md
## Improve

For Node.js projects, AGENTS.md Doctor can create a separate improved copy:

```sh
npx agents-md-doctor improve .
```

It keeps the original file unchanged, reads real npm scripts from `package.json`, and writes `AGENTS.improved.md` or `CLAUDE.improved.md`.

```text
Before: 55 / 100
After:  100 / 100

Created: AGENTS.improved.md
Added: Useful commands, Testing guidance
```

If the improved file already exists, review or remove it first. To replace it intentionally:

```sh
npx agents-md-doctor improve . --force
```
````

Also add `agents-md-doctor improve [path] [--force]` to the existing Usage block.

- [ ] **Step 3: Verify CLI version and package contents**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' ./src/cli.js --version
```

Expected: `0.2.0`.

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' pack --dry-run
```

Expected: package name `agents-md-doctor@0.2.0`; `src/improver.js` is included; test and docs folders are not included.

- [ ] **Step 4: Commit docs and version**

```powershell
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' add -- README.md package.json
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' commit -m "docs: prepare version 0.2.0"
```

### Task 5: Verify the Release Candidate

**Files:**
- No intended file changes

- [ ] **Step 1: Run the complete test suite**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
```

Expected: all original and new tests pass with zero failures.

- [ ] **Step 2: Run the repository self-check**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run check
```

Expected: score 100 / 100 and exit code 0.

- [ ] **Step 3: Run a real before-and-after demo**

Create a temporary project outside the repository containing this `AGENTS.md`:

```md
# Demo instructions

Keep changes small.
```

and this `package.json`:

```json
{
  "scripts": {
    "test": "node --test",
    "check": "node check.js"
  }
}
```

Run the local CLI against that folder:

```powershell
& 'C:\Program Files\nodejs\node.exe' ./src/cli.js improve '<temporary-project-path>'
```

Expected: source remains unchanged, `AGENTS.improved.md` is created, and output shows `Before: 55 / 100` and `After: 100 / 100`.

- [ ] **Step 4: Confirm repository state**

Run:

```powershell
& 'C:\Users\dynab\AppData\Local\GitHubDesktop\app-3.5.11\resources\app\git\cmd\git.exe' status --short --branch
```

Expected: no uncommitted files; `main` is ahead of `origin/main` only by the intentional local commits. Do not push or publish until the user reviews the completed implementation.
