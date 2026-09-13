# ravito

Personal web app for grocery shopping: a shared household **pantry** that
feeds a **real-time shared shopping list**. Longer term, a "kitchen hub"
(receipt import, meal planning, price tracking).

This repo is self-contained: everything an agent or a new machine needs is
in-tree. Read, in order: this file, then `PLAN.md` (full design + staged
roadmap), then `.claude/standards/engineering.md` (project-agnostic
practice, vendored from `agentic-lab`), then `CONTRIBUTING.md` (the
human-readable pointer to the same, plus per-machine setup).

Personal defaults (language, commit style, attribution) are in
`~/.claude/CLAUDE.md`.

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

## Engineering standards

Project-agnostic standards are in `.claude/standards/engineering.md` and
apply unchanged. No project-specific deviations right now.

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
