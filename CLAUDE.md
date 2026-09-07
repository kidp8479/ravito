# ravito

Personal web app for grocery shopping: a shared household pantry that
feeds a real-time shared shopping list. Longer term, a "kitchen hub"
(receipt import, meal planning, price tracking). See `PLAN.md` for the
full design and the staged roadmap.

Project-agnostic engineering standards live in `~/42/WIP/CLAUDE.md`
(language, commit format, review gate, ADRs, diagrams, secrets). This
file holds only ravito-specific context. Conversation with the user is in
French; everything written into the repo is in English.

## Stack

- **Backend** (`backend/`): NestJS 11 + TypeScript, Prisma ORM,
  PostgreSQL. One module per domain (`auth/`, `households/`, `products/`,
  `inventory/`, `shopping-list/`), plus `common/` for guards and
  interceptors. Real-time via a NestJS WebSocket gateway.
- **Frontend** (`frontend/`): React 19 + Vite + TypeScript, TanStack
  Router + TanStack Query, Tailwind CSS + Radix/shadcn. Built as a
  mobile-first PWA (`vite-plugin-pwa`).
- **Database**: PostgreSQL. Schema in `backend/prisma/schema.prisma`,
  migrations under `backend/prisma/migrations/`.
- **Infra**: `docker-compose.yml` runs db + backend + frontend; `make up`.

## Non-negotiable: tenant isolation

Every business table carries `householdId`. Every route on a household
resource checks authentication **and** membership via
`HouseholdMembershipGuard`. No cross-household query in application code.
This is both the security baseline and the prerequisite for a later SaaS
pivot (`household` is the billing boundary). CRUD scaffolds ship without
guards: lock them before merge, and run the `web-security-review` skill
on anything touching auth or user data.

## Decided

- ORM: Prisma (deliberate; `vacation_picker`'s no-ORM rule does not apply
  here). ADR 0001.
- Form: PWA, no native app in v1.
- Household access: individual accounts + invite link/code.

## Not yet decided (open ADRs)

- Auth strategy (JWT access + refresh vs sessions) - ADR 0002.
- Real-time transport (WebSocket vs SSE vs polling) - ADR 0003.

## Workflow

Same ritual as Hypertube: one Linear issue = one branch = one PR, rebased
on `main`, `/code-review` before merge, CI green (format / lint /
typecheck / test / build for both packages, plus gitleaks). Linear team
prefix: `RAV`. See `CONTRIBUTING.md` and `PLAN.md`.
