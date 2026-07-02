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

function appendSection(content, title, bullets) {
  const base = content.endsWith("\n") ? content : `${content}\n`;
  return `${base}\n## ${title}\n\n${bullets.map((item) => `- ${item}`).join("\n")}\n`;
}

function failed(report, id) {
  return report.checks.some((check) => check.id === id && !check.passed);
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
