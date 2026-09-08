# ravito

Personal web app for grocery shopping: a shared household **pantry** that
feeds a **real-time shared shopping list**. Longer term, a "kitchen hub"
(receipt import, meal planning, price tracking).

This repo is self-contained: everything an agent or a new machine needs is
in-tree. Read, in order: this file, then `PLAN.md` (full design + staged
roadmap), then `CONTRIBUTING.md` (day-to-day conventions).

## Working conventions

- **Language**: everything written into the repo (code, comments, commit
  messages, docs, Linear issues, Slack posts) is in **English**.
  Conversation with the user is in **French**.
- **No AI dashes**: never use `-` (em dash) or `-` (en dash, outside
  numeric ranges) in anything written for the user or the repo. Use a
  plain hyphen with spaces, a colon, or parentheses.
- **Commits**: Conventional Commits, `type(RAV-N): summary` when tied to a
  Linear issue, atomic, with a body explaining *why* when the diff does
  not. Do **not** add `Co-Authored-By: Claude` or `Claude-Session:`
  trailers. Keep messages succinct.
- **Workflow**: one Linear issue = one branch = one PR. Never commit
  straight to `main`. Rebase the feature branch onto `main` (never merge
  `main` into it). Comment on the Linear issue at meaningful progress
  points, not only at the end.
- **Plan first**: for any non-trivial task (3+ steps or an architectural
  choice), agree a plan before touching code. If work goes sideways, stop
  and re-plan.
- **Pair-programming balance**: tooling / infra / CI setup, the agent can
  drive autonomously. Core project code: smaller steps, explain the
  *why*, let the user react rather than accepting a large unattended
  scaffold.
- **Lessons**: after a course correction, record the pattern in
  `docs/lessons.md` so it is not repeated.
- **Known limitations**: an accepted tradeoff or piece of tech debt (not a
  mistake to fix, a deliberate "not now") goes in
  `docs/known-limitations.md`, with why it's not fixed and what would
  resolve it. Check it before "fixing" one by surprise.
- **End of session**: post a recap to `#ravito-daily-log` on Slack and
  keep the Linear "Session Handoff" doc current (context does not carry
  between machines).

## Engineering standards

- **Review gate**, even solo: re-read the full diff before merging
  (`/code-review`). CI (format / lint / typecheck / test / build for both
  packages, plus gitleaks secret scan) must be green before merge. Never
  bypass the pre-commit hook or CI (`--no-verify` is off-limits unless
  the user explicitly asks).
- Ship at least one test with each new unit of behaviour (endpoint,
  service, gateway) before merging it. Auth flows also get an e2e test.
- **ADRs**: record a structural decision as a short
  `docs/adr/NNNN-title.md` (context / decision / consequences).
- **Diagrams**: architecture / flow diagrams live in `docs/diagrams/`
  (`.excalidraw` source, `.png` render). Mirror each in a Linear document
  per domain. Refresh when the feature that changed the flow merges.
- **Secrets**: only via `.env` (git-ignored); keep `.env.example`
  current. Treat a leaked secret as compromised (rotate, do not just
  delete the line).
- **Security**: before merging anything touching auth or user data, run
  the vendored `web-security-review` skill
  (`.claude/skills/web-security-review/SKILL.md`). Every mutating route on
  a household resource checks authentication **and** membership.

## Stack

- **Backend** (`backend/`): NestJS 11 + TypeScript, Prisma ORM,
  PostgreSQL. One module per domain (`auth/`, `households/`, `products/`,
  `inventory/`, `shopping-list/`), plus `common/` for guards and
  interceptors. Real-time via a NestJS WebSocket gateway.
- **Frontend** (`frontend/`): React 19 + Vite + TypeScript, TanStack
  Router + TanStack Query, Tailwind CSS + Radix/shadcn. Built as a
  mobile-first PWA (`vite-plugin-pwa`).
- **Database**: PostgreSQL. Schema in `backend/prisma/schema.prisma`.
- **Infra**: `docker-compose.yml` runs db + backend + frontend; `make up`.

## Non-negotiable: tenant isolation

Every business table carries `householdId`. Every route on a household
resource checks authentication **and** membership via
`HouseholdMembershipGuard`. No cross-household query in application code.
This is both the security baseline and the prerequisite for a later SaaS
pivot (`household` is the billing boundary). CRUD scaffolds ship without
guards: lock them before merge.

## Decided / not yet decided

- Decided: Prisma ORM (ADR 0001), PWA (no native app in v1), household
  access via individual accounts + invite link/code, UI kit (Tailwind CSS
  v4 + shadcn/ui, "new-york" style; formal rationale still owed to
  ADR 0001 alongside the rest of the stack, RAV-3).
- Open: auth strategy (JWT vs sessions, ADR 0002), real-time transport
  (WebSocket vs SSE vs polling, ADR 0003).

## Toolchain

- **Linear** team prefix `RAV`. MCP server configured in `.mcp.json` (run
  `/mcp` to authenticate on a new machine).
- **Slack**: install the official plugin
  (`/plugin install slack@claude-plugins-official`) then authenticate;
  channels are `ravito-*`.
- **GitHub**: `gh` CLI (`gh auth login` on a new machine).
- Full cross-machine setup: see `CONTRIBUTING.md` > "Working on another
  machine".
