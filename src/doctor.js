import { access, readFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_FILES = ["AGENTS.md", "CLAUDE.md"];
const MAX_LINES = 200;
const MAX_CHARACTERS = 12000;

const LINT_TERMS = [
  "biome",
  "black",
  "camelcase",
  "eslint",
  "formatting",
  "indentation",
  "lint",
  "prettier",
  "ruff",
  "semicolon",
  "snake_case",
  "stylelint",
  "trailing comma"
];

const COMMAND_TERMS = [
  "bun",
  "cargo",
  "go test",
  "make",
  "npm",
  "pnpm",
  "pytest",
  "uv",
  "yarn"
];

const TEST_TERMS = [
  "check",
  "ci",
  "test",
  "testing",
  "typecheck",
  "verification",
  "verify"
];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

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

function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(term));
}

function countTerms(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function findBlindReferences(lines) {
  const pathPattern = /(?:^|[\s`])(?:\.{1,2}\/|[\w.-]+\/)[\w./-]+/;

  return lines
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => {
      if (!pathPattern.test(line)) {
        return false;
      }

      const hasContext = line.includes(":") || line.includes("- ") || line.length > 80;
      return !hasContext;
    })
    .slice(0, 5);
}

function findConflicts(text) {
  const conflicts = [];

  const pairs = [
    {
      label: "test instructions",
      positive: /(always|must|should).{0,40}(run|execute).{0,20}tests?/s,
      negative: /(never|do not|don't|avoid).{0,40}(run|execute).{0,20}tests?/s
    },
    {
      label: "dependency installation",
      positive: /(always|must|should).{0,40}(install|update).{0,20}(dependencies|deps|packages)/s,
      negative: /(never|do not|don't|avoid).{0,40}(install|update).{0,20}(dependencies|deps|packages)/s
    },
    {
      label: "file editing",
      positive: /(always|must|should).{0,40}(edit|modify|change).{0,20}files?/s,
      negative: /(never|do not|don't|avoid).{0,40}(edit|modify|change).{0,20}files?/s
    }
  ];

  for (const pair of pairs) {
    if (pair.positive.test(text) && pair.negative.test(text)) {
      conflicts.push(pair.label);
    }
  }

  return conflicts;
}

function makeCheck(id, label, passed, message, weight) {
  return {
    id,
    label,
    passed,
    message,
    weight,
    score: passed ? weight : 0
  };
}

function createMissingReport(projectPath, strict) {
  const checks = [
    makeCheck(
      "config-file",
      "Configuration file",
      false,
      "No AGENTS.md or CLAUDE.md file found.",
      30
    )
  ];

  return {
    projectPath,
    fileName: null,
    filePath: null,
    strict,
    checks,
    findings: [],
    score: 0,
    maxScore: 100,
    passed: false
  };
}

export async function checkAgentInstructions(targetPath = ".", options = {}) {
  const projectPath = path.resolve(targetPath);
  const strict = Boolean(options.strict);
  const config = await findAgentInstructionFile(projectPath);

  if (!config) {
    return createMissingReport(projectPath, strict);
  }

  return checkAgentInstructionContent({ ...config, strict });
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
    makeCheck(
      "config-file",
      "Configuration file",
      true,
      `${fileName} found.`,
      30
    ),
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
