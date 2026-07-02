# AGENTS.md Doctor Improve Command Design

## Goal

Add an `improve` command for version 0.2.0 that creates a safer, more complete copy of an existing `AGENTS.md` or `CLAUDE.md`. The terminal output must make the before-and-after difference easy to understand and easy to share in an X post.

## User Experience

The user runs:

```sh
npx agents-md-doctor improve .
```

The command:

1. Finds `AGENTS.md`, falling back to `CLAUDE.md`.
2. Diagnoses the original file.
3. Reads real commands from the target project's `package.json`.
4. Preserves the complete original text and appends only missing guidance that can be generated safely.
5. Writes `AGENTS.improved.md` or `CLAUDE.improved.md`.
6. Diagnoses the generated content and prints the before and after scores.

Example output:

```text
AGENTS.md Doctor
Project: /path/to/project

Before: 55 / 100
After:  100 / 100

Created: AGENTS.improved.md
Added: Useful commands, Testing guidance
```

The existing `check` command remains unchanged.

## Improvement Rules

Version 0.2.0 officially supports Node.js projects with a readable `package.json`.

The generated file keeps the original content byte-for-byte at the beginning, except that a final newline may be normalized before appending new sections. It never removes, rewrites, or reorders existing instructions.

The command may append a `## Commands` section when useful command guidance is missing. It uses only commands supported by the detected project:

- `npm install` when `package.json` exists.
- `npm test` when a `test` script exists.
- `npm run <name>` for existing `check`, `lint`, `typecheck`, and `build` scripts.

The command may append a `## Verification` section when testing guidance is missing. It includes only detected `test`, `check`, `lint`, or `typecheck` scripts. If none exist, it does not invent a verification command.

The command reports each appended section in the `Added` line. Safe improvements may raise the score without always reaching 100.

The command does not automatically repair oversized files, conflicting instructions, lint leakage, blind references, or generated-file warnings. Those changes require human judgment.

## Architecture

### `src/doctor.js`

Keep filesystem discovery and scoring behavior compatible with version 0.1.0. Extract or export a content-level diagnostic function so both the original file and generated content can be scored without temporary files.

### `src/improver.js`

Add a focused module responsible for:

- reading and validating `package.json`
- discovering supported npm commands
- deciding which safe sections are missing
- producing improved content and a list of additions
- choosing the output filename from the source filename

The content-generation logic should be a pure function where practical, so it can be tested without writing files.

### `src/cli.js`

Extend argument parsing with:

```text
agents-md-doctor improve [path] [--force]
```

The CLI coordinates discovery, improvement, file writing, score comparison, output formatting, and exit codes. `--json` and `--strict` remain options for `check` only in version 0.2.0.

## Safety And Errors

- Never modify the source `AGENTS.md` or `CLAUDE.md`.
- Refuse to overwrite an existing improved file unless `--force` is supplied.
- If neither source file exists, create nothing and exit with code 1.
- If `package.json` is missing, unreadable, or invalid, create nothing and exit with code 1.
- If the original score is 100, report that no improvement is needed, create nothing, and exit with code 0.
- If no safe section can be generated from detected commands, report that no automatic improvement is available, create nothing, and exit with code 0.
- Unexpected filesystem or parsing failures print a concise message and exit with code 2.
- A successful file creation exits with code 0 even when the after score is below 100.

## Testing

Keep all seven existing tests passing and add coverage for:

- preserving all original text in the generated content
- appending only missing sections
- using only scripts that exist in `package.json`
- producing the correct output name for both supported source filenames
- leaving the source file unchanged
- refusing an existing output file without `--force`
- allowing replacement with `--force`
- handling missing or invalid `package.json`
- handling an already complete instruction file
- showing before and after scores in CLI output
- proving that a generated file receives a higher score in the representative demo case

## Documentation And Release Scope

Update the README with the new command, one before-and-after example, Node.js-only support for automatic improvement, output-file behavior, and the `--force` safeguard. Bump the package version to `0.2.0` during implementation.

Publishing to npm, creating the GitHub release, and posting on X are follow-up release steps after implementation verification. They are not part of the code change itself.
