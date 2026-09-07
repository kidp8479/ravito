# Contributing

Working notes for how this project is built day to day.


## Workflow: one issue, one branch, one PR

Work is tracked in Linear. Each unit of work is an issue; each issue gets
its own branch (Linear suggests a branch name per issue) and its own pull
request. A GitHub↔Linear integration moves the issue's status
automatically: opening a branch/PR moves it to *In Progress*, merging moves
it to *Done*.

Drop a short comment on the Linear issue when there's meaningful progress
to log (not just at the end) - it keeps the issue's history useful instead
of a single "done" at the finish line.

### Keeping branches up to date

If `main` has moved forward while a feature branch is in progress, rebase
the feature branch onto `main` before opening (or before merging) the PR -
don't merge `main` into the feature branch. Merge commits are reserved for
the single moment a PR actually merges into `main`; everything before that
stays a clean, rebased line of commits.

## Commits

Commits are atomic: one logical change per commit, not a pile of unrelated
edits squashed together. Commit messages follow `type: summary` -
`feat`, `fix`, `chore`, `docs`, `ci` - with a short body explaining *why*
when it's not obvious from the diff alone.

Every commit tied to a Linear issue includes the issue key:
`type(RAV-N): summary` (e.g. `feat(RAV-9): add X`). This is on
top of the branch-name-based link Linear already infers - it reinforces
the link and helps the status auto-transition on merge.

Small, focused commits make `git log` and `git blame` actually useful
later.

## Before committing

```sh
make format
make lint
```

Both should be wired into the shared VSCode workspace config
(`.vscode/settings.json`) to run automatically on save, so in practice this
is mostly a safety net rather than a manual step.

A git pre-commit hook (`.githooks/pre-commit`, enabled via `make install`)
runs `make format-check` and `make lint-check` before every commit and
blocks it if either fails - fix with `make format` / `make lint` and
re-commit. These now cascade into both `backend/` and `frontend/`, so the
hook needs both packages' dependencies installed (`make install`, or
`make install-backend` / `make install-frontend` individually) - re-run it
after pulling a branch that adds a package you don't have installed yet.
The same checks should run in CI (`.github/workflows/ci.yml`) on every
push and pull request, alongside a secret scan
(`.github/workflows/gitleaks.yml`).

## Planning and lessons

- For any non-trivial task (3+ steps, or an architectural choice), agree a
  plan before touching code (`/plan` or plan mode). If the work goes
  sideways mid-task, stop and re-plan rather than pushing on.
- After a course correction, write the lesson down so it isn't repeated: a
  `feedback` memory for a habit that spans projects, `docs/lessons.md` in
  this repo for a project-specific one.

## Review & merge gate

Even working solo:

- Re-read the full diff before merging (`/code-review`). Never push straight
  to `main`.
- CI must be green before merge: format, lint, typecheck, test, build, and
  the secret scan. **Never bypass** the pre-commit hook or CI - `--no-verify`
  is off-limits unless explicitly decided.
- Each new unit of behaviour (endpoint, service, script, manifest) ships
  with at least one test before it merges. Auth flows
  (register/login/reset/logout) also get an e2e test.

## Decisions (ADRs)

Record a structural decision (auth strategy, hashing algorithm, transport,
data model choice...) as a short ADR under `docs/adr/NNNN-title.md`:
context / decision / consequences. A commit message or a chat thread is not
a durable record.

## Diagrams

Architecture and flow diagrams that document the system live in
`docs/diagrams/`:

- `<name>.excalidraw` is the **source of truth** (editable at
  excalidraw.com or with the VS Code Excalidraw extension).
- `<name>.png` is the rendered view.
- `<name>.py` (optional) regenerates it via the personal
  `excalidraw-diagrams` skill.

Mirror each diagram in a **Linear document per domain** (e.g. "Auth -
architecture" in the project, tagged with the domain label): embed the
PNG, add a short walk-through, link it from that domain's issues. Refresh
the diagram and the document when the feature that changed the flow
merges.

## Code clarity

- Comment the *why*, not the *what*. A comment that restates the identifier
  name earns nothing.
- Public surface (exported classes/methods, HTTP routes, externally-invoked
  scripts) gets a doc comment; obvious private code does not.
- Everything written into the repo is in English (see `CLAUDE.md`),
  inline comments included - check none slipped through in another language
  before merging.

## Docker/Podman: dev containers and rootless Podman

<!-- TODO: this section only applies once docker-compose.yml + Dockerfiles
     exist. Delete if the project doesn't use containers. -->

Dev containers should run as the image's non-root "node" user (or
equivalent), not root - otherwise anything the container writes into the
bind-mounted source (build output, lockfiles...) becomes root-owned on
the host and unreadable/undeletable without sudo.

This behaves differently across runtimes: on **Docker**, the container
user maps to the host user, so a bind-mounted source directory stays
writable. On **rootless Podman** (a common school-lab setup), the host
user instead maps to *container root* - so the non-root "node" user can
no longer write into a bind-mounted `/app` at all, and a build step like
`nest start --watch` fails with `EACCES`.

**The fix, portable across both**: never let the container write
directly onto a bind mount. Put anything it generates (build output,
`node_modules`, lockfiles/tsbuildinfo) into a **named volume** instead -
both runtimes chown named volumes to the image's user, unlike bind
mounts.

```yaml
volumes:
  - ./backend:/app
  - backend_node_modules:/app/node_modules
  - backend_dist:/app/dist   # not just node_modules - anything written
# ...
volumes:
  backend_node_modules:
  backend_dist:
```

If the build tool deletes its output directory before regenerating it
(e.g. Nest's `deleteOutDir`), turn that off once the output dir is a
mount point - `rmdir` fails on a mount point, only the container's own
process can write inside it, not remove it.

Also watch out for tool configs living outside the bind-mounted
directory (e.g. a root-level `.prettierrc` for a `backend/` service) -
running that tool *inside* the container won't find the config. Run
formatting/linting/typechecking host-side instead (`make format` /
`make lint` / `make typecheck`), which is what the pre-commit hook does
anyway.

## Tools in use

- **Linear** - issue tracking, milestones, priorities. Labels group issues
  by technical domain.
- **GitHub** - source of truth for code, pull requests, code review.
- **Slack** - day-to-day communication. A daily-log channel is used as a
  running journal (what got done/blocked each day) to keep context between
  work sessions. Native Slack integrations post GitHub activity and Linear
  status changes into dedicated channels.

## Security baseline

### Project-specific (fill in)

<!-- TODO: copy this project's eliminatory / non-negotiable rules from the
     subject + marking sheet. Read both in full; where they diverge, apply
     the stricter one. -->

- Zero console errors/warnings - browser or server - at defense time.

### Generic web checklist

Run the `web-security-review` skill (vendored at `.claude/skills/web-security-review/`) before merging
anything touching auth or user data. The skill (`.claude/skills/web-security-review/SKILL.md`) is the source of truth;
the list below is a summary to keep in sync with it, not a replacement:

- **Passwords/tokens**: argon2id hashing; reset/verification tokens are
  CSPRNG-generated, single-use, short-lived, and **hashed at rest**.
- **Authorization**: every mutating route on a user resource checks auth
  **and** ownership, returning `403` otherwise, never a silent pass. CRUD scaffolds
  ship with no guards - lock every generated route before merge. Never
  trust a client-supplied role or ID for an authz decision. No IDOR.
- **Enumeration / brute-force**: login / register / reset return identical
  responses (text and timing); auth endpoints are rate-limited.
- **Input validation**: strict server-side validation, field whitelist,
  unknown fields rejected. Uploads: MIME checked, size-capped, name
  sanitized, stored outside the webroot.
- **Injection**: parameterized queries / ORM only; output escaped by
  default; security headers set (CSP, `X-Content-Type-Options`, frame
  options).
- **Session/transport**: session cookies `HttpOnly` + `Secure` +
  `SameSite`; CORS restricted to the expected origin; logout invalidates
  server-side.
- **Secrets**: `.env` only (git-ignored), `.env.example` kept current,
  `gitleaks` green. A leaked secret is rotated, not just deleted. No
  detailed error/stack traces to the client in prod.

## Working on another machine

This repo is self-contained: the conventions above, the engineering
standards in `CLAUDE.md`, and the `web-security-review` skill
(`.claude/skills/`) all travel with the clone. What still needs a one-time
setup per machine:

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
context without any global config. The `mattpocock-skills` plugin and the
`excalidraw-diagrams` skill are *not* vendored: install them globally if
needed, or skip (diagrams can be drawn by hand at excalidraw.com).
