# Contributing

Engineering practice for this project is in
[`.claude/standards/engineering.md`](.claude/standards/engineering.md):
workflow, commits, local checks, the review and merge gate, testing,
decisions (ADRs), diagrams, code clarity, slop control, secrets, web
security, dev containers, tools, and how to work with the agent. Read
that file, not this one - it is the source, vendored from `agentic-lab`
and kept in sync there. This file exists so the standard is visible
without opening `.claude/` (e.g. browsing on GitHub without an agent),
plus what is specific to ravito.

## ravito-specific

- Linear team prefix `RAV`: `type(RAV-N): summary`.
- Tenant isolation (`.claude/standards/school-42.md` has no equivalent
  here - this repo has no 42-subject layer): see `CLAUDE.md` >
  "Non-negotiable: tenant isolation".

## Before committing

```sh
make format
make lint
```

A pre-commit hook (`.githooks/pre-commit`, enabled via `make install`)
runs `make format-check` and `make lint-check` before every commit and
blocks it if either fails. These cascade into both `backend/` and
`frontend/`, so the hook needs both packages' dependencies installed
(`make install`, or `make install-backend` / `make install-frontend`
individually) - re-run it after pulling a branch that adds a package you
don't have installed yet.

## Working on another machine

This repo is self-contained: `CLAUDE.md`, `.claude/standards/`, and the
skills under `.claude/skills/` all travel with the clone. What still needs
a one-time setup per machine:

```sh
git clone git@github.com:kidp8479/ravito.git
cd ravito
make install          # dependencies + git hooks (core.hooksPath)
cp .env.example .env   # then fill in real values

# Toolchain auth (per machine, nothing syncs):
gh auth login                                   # GitHub CLI
# Linear: open Claude Code here, run /mcp, authenticate "linear"
#         (server already declared in .mcp.json)
# Slack:  /plugin install slack@claude-plugins-official, then authenticate
#         (see the fallback in TOOLCHAIN notes if the OAuth flow fails)
```

Claude Code auto-loads `CLAUDE.md` and `.claude/skills/` from the repo
root on clone, so an agent session started in this directory has the full
context without any global config. `excalidraw-diagrams` needs a one-time
`npm install` in its `scripts/` directory (Playwright, for PNG rendering)
and Python 3. The `mattpocock-skills` plugin is *not* vendored: install it
globally if needed.
