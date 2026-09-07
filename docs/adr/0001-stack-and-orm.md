# 0001. Stack, ORM, and UI kit

## Context

Ravito's v1 scope is a household pantry backed by a real-time shared
shopping list (see `PLAN.md`), with a longer-term "kitchen hub" roadmap
(receipt import, meal planning, price tracking) that the v1 data model
and architecture need to accommodate without a rewrite.

Two constraints shaped the stack choice more than the app's own
requirements did:

- **Reuse the maison stack.** This isn't the first project built this
  way - `vacation_picker` and the 42 school projects (Hypertube) already
  settled on React + NestJS as the day-to-day toolchain. Picking anything
  else would mean re-learning tooling instead of building the app.
- **Multi-tenant from day one.** The household is the natural data
  isolation boundary for a shared shopping list, and it's also the
  natural billing boundary if this ever becomes a small SaaS. Retrofitting
  tenant isolation onto a single-tenant schema later is expensive; making
  every table carry `householdId` from the first migration is not.

## Decision

**Backend**: NestJS 11 + TypeScript, one module per domain (`auth/`,
`households/`, `products/`, `inventory/`, `shopping-list/`), `common/` for
guards and interceptors. Real-time via a NestJS WebSocket gateway (Socket.IO)
once the shopping list needs it - transport choice itself (WebSocket vs SSE
vs polling) is deferred to ADR 0003.

**ORM: Prisma**, over raw SQL (the deliberate choice in `vacation_picker`,
made there to practice SQL). Ravito wants a clean, fast-moving SaaS-shaped
socle rather than a learning exercise - Prisma's declarative schema,
versioned migrations, and generated types are worth the ORM tax here.

**Database**: PostgreSQL 16.

**Frontend**: React 19 + Vite + TypeScript. TanStack Router (file-based,
type-safe) + TanStack Query (cache, invalidation, retries, groundwork for
offline). Same reasoning as the backend: known tooling, not a fresh
evaluation each time.

**Form factor: PWA**, not a native app, in v1. `vite-plugin-pwa` gives an
installable, offline-capable web app (manifest + service worker) with a
path to camera access (future receipt-scan feature) via web APIs. A
native client re-using the same NestJS API stays a later option if
offline/scan needs outgrow what the web platform offers.

**UI kit: Tailwind CSS v4 + shadcn/ui** (`new-york` style, Radix
primitives underneath). Utility-first CSS plus copy-in, ownable components
fits a solo-maintained project better than a heavier component library:
no opaque theming layer to fight, and each component that gets pulled in
via the shadcn CLI is plain code in the repo, not a dependency to track.
`frontend/components.json` and a `cn()` helper are in place from the
first commit (RAV-21); no component has been generated yet, only when a
screen actually needs one.

**Multi-tenant**: every business table carries `householdId`; every
mutating route on a household resource checks authentication *and*
membership via a `HouseholdMembershipGuard` (implemented in Lot 1, not
yet built). No cross-household query in application code. See `CLAUDE.md`
> "Non-negotiable: tenant isolation".

## Consequences

**Positive**:

- One toolchain across every active project (`vacation_picker`,
  Hypertube, Ravito) - conventions, debugging habits, and editor tooling
  transfer directly.
- Typed end to end: Prisma's generated client on the backend, TypeScript
  + TanStack on the frontend. A schema change surfaces as a compile error
  at every call site that touches it, not a runtime surprise.
- The household/tenant boundary is load-bearing from the first migration,
  not bolted on later - a SaaS pivot (billing, per-tenant quotas) is a
  new layer on top, not a schema rewrite.
- shadcn's copy-in model means UI code is fully owned and readable in the
  repo, with no black-box component internals to work around.

**Negative / accepted trade-offs**:

- Prisma's migration engine and generated-client model is a real
  dependency to keep working (see `docs/lessons.md`'s two Prisma-related
  entries: npm's install-scripts allowlist blocking `prisma generate`,
  the ESM vs CJS generator choice) - more moving parts than raw SQL would
  be, in exchange for the type safety and migration tooling.
- PWA, not native: no App Store distribution, and browser APIs (camera,
  background sync) are a notch behind what a native client could do -
  acceptable for v1's manual-entry + shared-list scope, revisited if the
  future receipt-scan feature needs more than the web platform offers.
- Two independent npm toolchains (`backend/`, `frontend/`) in one repo:
  no shared root-level lint/format config, each package configured and
  upgraded on its own (see RAV-21's `/code-review` pass, which flagged
  and accepted this duplication as consistent with `42_hypertube`'s own
  layout).
- shadcn/ui's design tokens (CSS variables, dark mode palette) aren't
  set up yet - deferred to whichever screen first needs a real shadcn
  component, rather than guessed ahead of time.
