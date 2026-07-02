import assert from "node:assert/strict";
import test from "node:test";

import {
  createImprovedContent,
  discoverNpmCommands,
  getImprovedFileName
} from "../src/improver.js";

test("discovers supported npm scripts in deterministic order", () => {
  const commands = discoverNpmCommands({
    scripts: {
      build: "node build.js",
      deploy: "example deploy",
      typecheck: "tsc --noEmit",
      test: "node --test",
      lint: "eslint .",
      check: "node ./src/cli.js check .",
      ignoredEmpty: "",
      ignoredWhitespace: "   "
    }
  });

  assert.deepEqual(commands, {
    install: "npm install",
    scripts: [
      "npm test",
      "npm run check",
      "npm run lint",
      "npm run typecheck",
      "npm run build"
    ],
    verification: [
      "npm test",
      "npm run check",
      "npm run lint",
      "npm run typecheck"
    ]
  });
});

test("rejects package manifests that are not non-array objects", () => {
  const invalidManifests = [null, undefined, "package", 42, true, []];

  for (const packageJson of invalidManifests) {
    assert.throws(
      () => discoverNpmCommands(packageJson),
      new Error("Invalid package.json: expected a non-array object.")
    );
  }
});

test("rejects malformed scripts values", () => {
  const invalidScripts = [null, undefined, "node --test", 42, true, []];

  for (const scripts of invalidScripts) {
    assert.throws(
      () => discoverNpmCommands({ scripts }),
      new Error('Invalid package.json: "scripts" must be a non-array object.')
    );
  }
});

test("maps supported filenames and rejects unsupported filenames", () => {
  assert.equal(getImprovedFileName("AGENTS.md"), "AGENTS.improved.md");
  assert.equal(getImprovedFileName("CLAUDE.md"), "CLAUDE.improved.md");
  assert.throws(
    () => getImprovedFileName("README.md"),
    new Error("Unsupported instruction file: README.md")
  );
});

test("preserves source content and appends both missing sections", () => {
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
        check: "node ./src/cli.js check .",
        test: "node --test"
      }
    }
  });

  assert.equal(
    result.content,
    `${sourceContent}
## Commands

- Install dependencies: \`npm install\`
- Run project command: \`npm test\`
- Run project command: \`npm run check\`

## Verification

- Before finishing, run: \`npm test\`
- Before finishing, run: \`npm run check\`
`
  );
  assert.deepEqual(result.additions, ["Useful commands", "Testing guidance"]);
});

test("adds command bullets inside an existing Commands section", () => {
  const sourceContent = [
    "# Rules",
    "",
    "  ## cOmMaNdS  ",
    "",
    "- Keep existing command notes.",
    "",
    "## Workflow",
    "",
    "- Finish carefully.",
    ""
  ].join("\n");
  const result = createImprovedContent({
    sourceContent,
    report: {
      checks: [
        { id: "commands", passed: false },
        { id: "testing-guidance", passed: true }
      ]
    },
    packageJson: { scripts: { test: "node --test" } }
  });
  const lines = result.content.split("\n");
  const commandHeadings = lines.filter((line) => /^[\t ]*## Commands[\t ]*$/i.test(line));
  const headingIndex = lines.findIndex((line) => /^[\t ]*## Commands[\t ]*$/i.test(line));
  const installIndex = lines.indexOf("- Install dependencies: `npm install`");
  const workflowIndex = lines.indexOf("## Workflow");

  assert.equal(commandHeadings.length, 1);
  assert.equal(headingIndex < installIndex && installIndex < workflowIndex, true);
  assert.deepEqual(result.additions, ["Useful commands"]);
});

test("uses CRLF for every generated line when the source uses CRLF", () => {
  const sourceContent = "# Rules\r\n\r\n## COMMANDS\r\n\r\n- Existing note.\r\n";
  const result = createImprovedContent({
    sourceContent,
    report: {
      checks: [
        { id: "commands", passed: false },
        { id: "testing-guidance", passed: false }
      ]
    },
    packageJson: { scripts: { test: "node --test" } }
  });
  const generatedContent = result.content.slice(sourceContent.indexOf("## COMMANDS"));

  assert.equal(generatedContent.replaceAll("\r\n", "").includes("\n"), false);
  assert.equal(result.content.includes("- Install dependencies: `npm install`"), true);
  assert.equal(result.content.includes("## Verification"), true);
});

test("uses LF for every generated line when the source uses LF", () => {
  const sourceContent = "# Rules\n";
  const result = createImprovedContent({
    sourceContent,
    report: {
      checks: [
        { id: "commands", passed: false },
        { id: "testing-guidance", passed: false }
      ]
    },
    packageJson: { scripts: { test: "node --test" } }
  });

  assert.equal(result.content.includes("\r"), false);
  assert.equal(result.content.includes("- Install dependencies: `npm install`"), true);
  assert.equal(result.content.includes("## Verification"), true);
});

test("returns the exact source when improvement checks already pass", () => {
  const sourceContent = "# Rules\n\nUse npm install and npm test.\n";
  const result = createImprovedContent({
    sourceContent,
    report: {
      checks: [
        { id: "commands", passed: true },
        { id: "testing-guidance", passed: true }
      ]
    },
    packageJson: { scripts: { test: "node --test" } }
  });

  assert.deepEqual(result, { content: sourceContent, additions: [] });
});

test("does not invent verification from unrelated scripts", () => {
  const sourceContent = "# Rules\n";
  const result = createImprovedContent({
    sourceContent,
    report: {
      checks: [
        { id: "commands", passed: true },
        { id: "testing-guidance", passed: false }
      ]
    },
    packageJson: { scripts: { deploy: "example deploy" } }
  });

  assert.deepEqual(result, { content: sourceContent, additions: [] });
});
