# AGENTS.md Doctor

A small CLI that checks `AGENTS.md` and `CLAUDE.md` files for common agent-instruction problems.

It is meant for projects that use coding agents such as Codex, Claude Code, Cursor, GitHub Copilot, or Gemini CLI.

## Why

Agent instruction files are becoming part of the normal developer workflow.

They are useful, but they can also become noisy:

- too long to be useful
- missing test commands
- repeating rules that linters already handle
- pointing to files without explaining when to read them
- keeping auto-generated setup notes forever
- giving instructions that seem to conflict

AGENTS.md Doctor gives a quick first pass before those instructions become part of your repository.

## Install

Run without installing:

```sh
npx agents-md-doctor check .
```

Or install globally:

```sh
npm install -g agents-md-doctor
agents-md-doctor check .
```

## Usage

```sh
agents-md-doctor check [path]
agents-md-doctor check [path] --json
agents-md-doctor check [path] --strict
```

Examples:

```sh
agents-md-doctor check .
agents-md-doctor check ../my-project --json
agents-md-doctor check . --strict
```

## Example Output

```text
AGENTS.md Doctor
Project: /path/to/project
File: AGENTS.md

[PASS] Configuration file: AGENTS.md found.
[PASS] Useful commands: The file mentions project commands or package managers.
[PASS] Testing guidance: The file gives the agent a way to verify changes.
[PASS] Context size: The file stays under 200 non-empty lines and 12000 characters.
[PASS] Conflicting instructions: No obvious conflicting instructions found.

Score: 100 / 100
```

## Checks

AGENTS.md Doctor currently checks:

- whether `AGENTS.md` or `CLAUDE.md` exists
- whether useful setup/build/test commands are included
- whether testing or verification guidance is included
- whether the file is likely too large
- whether obvious instruction conflicts appear
- whether there are warning signs such as lint leakage, blind references, or generated-file fossilization

The checks are intentionally simple and transparent. This is not an AI code reviewer. It is a small maintenance tool for keeping agent instructions practical.

## Japanese

`AGENTS.md` や `CLAUDE.md` は、AIコーディングエージェントに「このプロジェクトではどう動いてほしいか」を伝えるための説明書です。

AGENTS.md Doctor は、その説明書が長すぎないか、テスト方法が書かれているか、不要なルールを書きすぎていないかを確認する小さなCLIです。

```sh
npx agents-md-doctor check .
```

## License

MIT
