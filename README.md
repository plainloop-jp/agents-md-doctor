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
agents-md-doctor improve [path] [--force]
```

Examples:

```sh
agents-md-doctor check .
agents-md-doctor check ../my-project --json
agents-md-doctor check . --strict
```

## Improve a file

`check` reports missing guidance. `improve` leaves the source unchanged and writes a separate `.improved.md` copy using only commands it can safely derive from `package.json`.

```sh
npx agents-md-doctor improve .
```

Example when both missing checks can be filled safely:

```text
Before: 55 / 100
After:  100 / 100
Created: AGENTS.improved.md
Added: Useful commands, Testing guidance
```

Automatic improvement currently supports Node.js projects with a readable `package.json`. It can add `npm install` plus commands for existing `test`, `check`, `lint`, `typecheck`, or `build` scripts. These commands are not run, and no external AI or APIs are used. Your original stays put. The useful additions go into a new file.

The new file is named `AGENTS.improved.md` or `CLAUDE.improved.md`, matching the source file. If that output already exists, use `--force` to replace it. `--force` refuses an output path that aliases the source, including a symbolic link or hard link. Scores can improve without always reaching 100.

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

`improve` は、読み取り可能な `package.json` がある Node.js プロジェクトに対応しています。`npm install` と既存の npm スクリプト（`test`、`check`、`lint`、`typecheck`、`build`）から安全に導ける案内だけを追加し、コマンド自体は実行しません。外部の AI や API も使用しません。元の `AGENTS.md` または `CLAUDE.md` は変更せず、`AGENTS.improved.md` または `CLAUDE.improved.md` を別に作成します。出力が既にある場合は `--force` で置き換えますが、出力先がシンボリックリンクまたはハードリンクによって元ファイルと同じ実体を指す場合は拒否します。スコアが必ず 100 になるわけではありません。

```sh
npx agents-md-doctor check .
npx agents-md-doctor improve .
```

## License

MIT
