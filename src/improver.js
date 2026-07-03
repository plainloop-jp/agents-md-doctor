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

function updateHtmlCommentState(line, inComment) {
  let index = 0;

  while (index < line.length) {
    if (inComment) {
      const commentEnd = line.indexOf("-->", index);
      if (commentEnd === -1) return true;
      inComment = false;
      index = commentEnd + 3;
      continue;
    }

    const commentStart = line.indexOf("<!--", index);
    if (commentStart === -1) return false;
    inComment = true;
    index = commentStart + 4;
  }

  return inComment;
}

function findCommandsHeading(content) {
  let fence = null;
  let inHtmlComment = false;
  let lineStart = 0;

  while (lineStart < content.length) {
    const newlineIndex = content.indexOf("\n", lineStart);
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex;
    const rawLine = content.slice(lineStart, lineEnd);
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (fence) {
      const closingFence = /^ {0,3}(`+|~+)[\t ]*$/.exec(line);
      if (
        closingFence &&
        closingFence[1][0] === fence.character &&
        closingFence[1].length >= fence.length
      ) {
        fence = null;
      }
    } else if (inHtmlComment) {
      inHtmlComment = updateHtmlCommentState(line, true);
    } else {
      const commentStart = line.indexOf("<!--");
      const visibleLine = commentStart === -1 ? line : line.slice(0, commentStart);
      const openingFence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(visibleLine);
      const validOpeningFence =
        openingFence &&
        (openingFence[1][0] === "~" || !openingFence[2].includes("`"));

      if (validOpeningFence) {
        fence = {
          character: openingFence[1][0],
          length: openingFence[1].length
        };
      } else if (/^ {0,3}##[\t ]+commands(?:[\t ]+#+)?[\t ]*$/i.test(visibleLine)) {
        return { index: lineStart, length: line.length };
      } else if (commentStart !== -1) {
        inHtmlComment = updateHtmlCommentState(line, false);
      }
    }

    lineStart = newlineIndex === -1 ? content.length : newlineIndex + 1;
  }

  return null;
}

function addCommandsSection(content, bullets, newline) {
  const heading = findCommandsHeading(content);

  if (!heading) {
    return appendSection(content, "Commands", bullets, newline);
  }

  const insertionIndex = heading.index + heading.length;
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
