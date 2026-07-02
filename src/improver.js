const SUPPORTED_SCRIPTS = ["test", "check", "lint", "typecheck", "build"];
const VERIFICATION_SCRIPTS = new Set(["test", "check", "lint", "typecheck"]);

function formatNpmScript(name) {
  return name === "test" ? "npm test" : `npm run ${name}`;
}

function isNonArrayObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function discoverNpmCommands(packageJson) {
  if (!isNonArrayObject(packageJson)) {
    throw new Error("Invalid package.json: expected a non-array object.");
  }

  const hasScripts = Object.hasOwn(packageJson, "scripts");
  if (hasScripts && !isNonArrayObject(packageJson.scripts)) {
    throw new Error('Invalid package.json: "scripts" must be a non-array object.');
  }

  const scripts = hasScripts ? packageJson.scripts : {};
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

function appendSection(content, title, bullets, newline) {
  const base = content.endsWith(newline) ? content : `${content}${newline}`;
  const bulletLines = bullets.map((item) => `- ${item}`).join(newline);
  return `${base}${newline}## ${title}${newline}${newline}${bulletLines}${newline}`;
}

function addCommandsSection(content, bullets, newline) {
  const heading = /^[\t ]*## Commands[\t ]*$/im.exec(content);

  if (!heading) {
    return appendSection(content, "Commands", bullets, newline);
  }

  const insertionIndex = heading.index + heading[0].length;
  const suffix = content.slice(insertionIndex);
  const trailingNewline = suffix.startsWith(newline) ? "" : newline;
  const bulletLines = bullets.map((item) => `- ${item}`).join(newline);

  return `${content.slice(0, insertionIndex)}${newline}${newline}${bulletLines}${trailingNewline}${suffix}`;
}

function failed(report, id) {
  return report.checks.some((check) => check.id === id && !check.passed);
}

export function createImprovedContent({ sourceContent, report, packageJson }) {
  const commands = discoverNpmCommands(packageJson);
  const newline = sourceContent.includes("\r\n") ? "\r\n" : "\n";
  const additions = [];
  let content = sourceContent;

  if (failed(report, "commands")) {
    const bullets = [
      `Install dependencies: \`${commands.install}\``,
      ...commands.scripts.map((command) => `Run project command: \`${command}\``)
    ];
    content = addCommandsSection(content, bullets, newline);
    additions.push("Useful commands");
  }

  if (failed(report, "testing-guidance") && commands.verification.length > 0) {
    const bullets = commands.verification.map(
      (command) => `Before finishing, run: \`${command}\``
    );
    content = appendSection(content, "Verification", bullets, newline);
    additions.push("Testing guidance");
  }

  return { content, additions };
}
