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
