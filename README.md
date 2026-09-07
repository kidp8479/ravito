# ravito

Personal grocery-shopping web app: a shared household **pantry** that
feeds a **real-time shared shopping list**. Longer term, a kitchen hub
(receipt import, meal planning, price tracking).

- Design and staged roadmap: [`PLAN.md`](./PLAN.md)
- Project context and stack: [`CLAUDE.md`](./CLAUDE.md)
- Day-to-day conventions: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Stack

React + Vite + TanStack Router/Query (PWA frontend) · NestJS + Prisma
(backend) · PostgreSQL · `docker-compose` for local dev.

## Status

Scaffolding in place (from `kidp8479/42-project-template`). Lot 0 (monorepo
setup, CI, first ADR) not started yet. See `PLAN.md`.

## Getting started

```sh
make install   # install deps + git hooks
make up         # start db + backend + frontend
make help       # all targets
```
