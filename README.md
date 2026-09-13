# ravito

Personal grocery-shopping web app: a shared household **pantry** that
feeds a **real-time shared shopping list**. Longer term, a kitchen hub
(receipt import, meal planning, price tracking).

- Design and staged roadmap: [`PLAN.md`](./PLAN.md)
- Project context and stack: [`CLAUDE.md`](./CLAUDE.md)
- Day-to-day conventions: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Production deployment: [`docs/deployment.md`](./docs/deployment.md)
  ([ADR 0004](./docs/adr/0004-deployment-target.md))

## Stack

React + Vite + TanStack Router/Query (PWA frontend) · NestJS + Prisma
(backend) · PostgreSQL · `docker-compose` for local dev.

## Status

v1 core shipped and live: auth, household, inventory, and the real-time
shared shopping list (Lots 0-3, `PLAN.md`). Deployed to production
(`docs/deployment.md`). Next up: purchase-history bulk entry and the
backlog items in `PLAN.md`.

## Getting started

```sh
make install   # install deps + git hooks
make up         # start db + backend + frontend
make help       # all targets
```

Cloning on a new machine (toolchain auth, `.env`): see
[`CONTRIBUTING.md`](./CONTRIBUTING.md) > "Working on another machine". The
repo is self-contained: `CLAUDE.md`, the conventions, and the
`web-security-review` skill (`.claude/skills/`) all come with the clone.
