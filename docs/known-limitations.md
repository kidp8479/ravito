# Known limitations

Accepted tradeoffs and tech debt, kept here so they're deliberate choices
instead of forgotten ones. Unlike `docs/lessons.md` (mistakes already fixed),
these are live: check here before "fixing" one by surprise, and update or
remove the entry once it's actually resolved.

## Inventory quantity +/- can lose an update under true concurrent edits

`InventoryRow` (`frontend/src/routes/inventory.tsx`, RAV-12) computes the
next quantity as `item.quantity +/- 1` from the last data the query cache
fetched, then sends that absolute value via `PATCH .../inventory/:id`. Two
near-simultaneous clicks from different devices/tabs (both reading the
same stale quantity) can result in one increment being silently
overwritten by the other, instead of both being applied.

**Why not fixed**: a real fix needs the backend write to be atomic
(Prisma's `{ quantity: { increment: delta } }`, which Postgres executes as
a single `UPDATE ... SET quantity = quantity + $delta`, race-free even
under concurrent writers) plus a DB-level `CHECK (quantity >= 0)` so a
racing decrement below zero is rejected rather than silently clamped -
a new endpoint, a migration, and error-code handling, not a frontend-only
change. The inventory screen also has no realtime sync yet (unlike the
shopping list, PLAN.md Lot 3), so a click's effect on another device
already will not be reflected live regardless of this specific race -
worth solving properly together with that, not in isolation now.

**Consequence to watch for**: in a household with several people adjusting
the same item's quantity at nearly the same moment (across devices), the
final count can undercount by one per colliding pair of clicks. A single
user single-tab click is unaffected (the +/- buttons disable while a
request is in flight).

**Resolves when**: inventory gets the same kind of realtime/atomic-write
treatment planned for the shopping list in Lot 3 - add the atomic
increment endpoint then.

## The shopping-list realtime socket reconnects fully on every access-token refresh

`useShoppingListRealtime` (`frontend/src/lib/shopping-list.ts`, RAV-14)
tears down and recreates the `socket.io-client` connection whenever the
access token changes, rather than updating the existing socket's `auth`
in place and calling `socket.connect()`. Every silent token refresh
(`api.ts`'s `refreshAccessToken`, on any REST 401) while the user has the
shopping list open causes a brief realtime disconnect/reconnect blip
instead of a seamless in-place re-auth.

**Why not fixed**: `socket.auth` can be updated on the existing `Socket`
instance without discarding it, but Socket.IO still performs a full
transport-level reconnect handshake either way (auth is only re-sent on
(re)connection), so the blip is not actually eliminated by that change,
only the client-side object churn. Given the access token's 15 min TTL,
this fires rarely per session; not worth the added complexity right now.

**Consequence to watch for**: a user actively watching the shopping list
for an extended session can see a sub-second gap in realtime delivery
around each token refresh. A REST mutation made by someone else during
that gap is still recovered the moment the new socket reconnects and
requests the room again on the next relevant event, or on next fetch.

**Resolves when**: this becomes a real nuisance (e.g. shorter access
token TTLs) or the realtime layer grows a resume/replay mechanism worth
building for other reasons too.

## The household screen only shows the caller's first household

`HouseholdPage` (`frontend/src/routes/household.tsx`, RAV-8) renders only
`households.data[0]` from `GET /households/mine`, which is ordered
oldest-joined-first. Nothing on the backend prevents a user from
belonging to more than one household (`joinByCode` has no such check), so
a user who joins a second one would see no indicator it exists and have
no way to view or leave it from the UI.

**Why not fixed**: v1's scope is a single shared household per user
(`PLAN.md` > "Perimetre v1 = socle uniquement"); building a
household-switcher UI for a case the product doesn't intend to support
yet would be speculative. `GET /households/mine` already returns the
full list, so no backend change is needed when this gets built.

**Resolves when**: the product actually wants multi-household support -
add a switcher to `HouseholdPage` reading the rest of the array.

## Household invite codes are stored in cleartext, not hashed

`HouseholdInvite.code` (`backend/prisma/schema.prisma`, added in RAV-4) is a
plain `String @unique`, unlike refresh tokens or passwords, which are only
ever stored as a hash.

**Why not fixed**: the code is a 72-bit CSPRNG value (`randomBytes(9)`, RAV-7)
- impractical to brute-force even with the value in hand, and single-use
(atomically claimed on join, RAV-7). It's meant to be shared (a household
member hands it to whoever they're inviting), so it doesn't carry the same
"must never be recoverable" requirement a password or session token does.
Changing this now means a schema migration to revisit an RAV-4 decision,
out of scope for the module that merely consumes it (RAV-7).

**Consequence to watch for**: a database read access (backup leak, admin
query) exposes every currently-valid invite code, letting whoever read it
join those households before the code expires or gets used.

**Resolves when**: this stops being acceptable for the trust model (e.g. if
this becomes a hosted SaaS with third-party admins/support who shouldn't be
able to join a household this way) - hash it like a refresh token then.

## The refresh cookie's `Secure` flag has no non-HTTPS escape hatch

`AuthController`'s `setRefreshCookie` (`backend/src/auth/auth.controller.ts`)
hardcodes `secure: true` unconditionally, per ADR 0002. `localhost` is a
browser-recognized secure context, so local dev over plain HTTP works, but
any other non-HTTPS host (a staging deploy before TLS is wired up, reaching
the dev backend by its LAN IP or hostname instead of literal `localhost`)
would never receive the cookie at all: browsers refuse to store a `Secure`
cookie outside HTTPS or the localhost/loopback exception.

**Why not fixed**: making it environment-conditional (`secure: NODE_ENV ===
'production'`) would quietly reopen the XSS-cookie-theft mitigation ADR
0002 chose `Secure` for, on nothing more than a `NODE_ENV` value being
right - too easy to get wrong for what it buys. No deployment target hits
this yet (compose dev is `localhost`; there is no staging environment).

**Resolves when**: a real non-`localhost`, non-HTTPS deployment target
shows up (staging without TLS, LAN testing) - decide deliberately then
whether that target gets TLS instead, rather than loosening this cookie.

## Postgres image/credentials are duplicated between `docker-compose.yml` and CI

`.github/workflows/ci.yml`'s `postgres` service (image `postgres:16-alpine`,
user/password/db `ravito`) hand-copies `docker-compose.yml`'s `db` service
instead of both reading from one source. GitHub Actions `services:` blocks
only accept literal values or repo/org-level Actions variables, not values
read from `.env` at job-config time, so there's no low-effort way to share
the definition as-is.

**Consequence to watch for**: if the compose service's Postgres version or
credentials change, CI won't follow unless someone remembers to update it
too - nothing will fail loudly, `pull_request` runs will just start testing
against a different Postgres version than local dev.

**Resolves when**: this starts causing real drift (e.g. a Postgres major
bump), or the project adopts repo-level Actions variables and it's worth
moving both to reference them.

## `test:integration` is a third Jest tier, separate from `test:e2e`

`backend/test/jest-integration.json` largely duplicates `jest-e2e.json`
(same `moduleFileExtensions`/`rootDir`/`transform`), as its own npm script,
Makefile target (`test-integration`), and CI step, rather than folding the
DB-dependent specs into the existing e2e config.

**Why not merged**: `test:e2e` currently never needs a real database -
`test/setup-env.ts` falls back to a placeholder `DATABASE_URL`, and every
e2e spec mocks `PrismaService`. Folding the integration specs into that
config would make `npm run test:e2e` fail locally for anyone without
`make up` running, breaking that invariant.

**Resolves when**: either e2e specs start needing a real DB anyway (making
the separation moot), or Jest's `projects` config is adopted to run both
tiers from one config without changing what each needs to work locally.

## Dependabot can't bump `@nestjs/*` packages one at a time

Tracked in [RAV-23](https://linear.app/kidp8479/issue/RAV-23): Dependabot
opens one PR per `@nestjs/*` package, but `@nestjs/config` and `nestjs-pino`
pin peer ranges that require every `@nestjs/*` package to move together, so
each individual PR fails CI with an `ERESOLVE` peer-dependency conflict.
Same problem for the `typescript` 7.x bump vs. `typescript-eslint`'s peer
range.

**Resolves when**: RAV-23 ships a single grouped bump of the whole
`@nestjs/*` stack (+ `@nestjs/config`, `nestjs-pino`), and separately, a
`typescript-eslint` release supports TypeScript 7.

## Shopping-list reorder sends one PATCH per shifted item

`ShoppingListContent`'s `handleDragEnd` (`frontend/src/routes/shopping-list.tsx`,
RAV-15) recomputes the whole list's positions as dense integers (0..n-1)
after a drag and PATCHes every item whose index actually changed - moving
an item from the top to the bottom of a 20-item list fires 20 PATCH
requests (and 20 `item.updated` socket broadcasts to every other member's
screen), not one.

**Why not fixed**: `ShoppingListItem.position` is a plain dense `Int`
(schema comment: "no uniqueness constraint, ties are fine, the frontend
just needs *an* order, not a dense/gapless one" - true for creation, not
for cheap reordering). A real fix needs sparse/fractional positions
(step-1000 gaps, insert at the midpoint of two neighbors) on the backend,
a migration for existing rows, and DTO validation changes - out of scope
for a frontend-only issue (RAV-15's title).

**Consequence to watch for**: reordering a long list is chattier than it
needs to be - more requests, more realtime traffic, more Prisma writes.
Household shopping lists are small in practice (tens of items), so this
is a latency/traffic nit, not a correctness bug: every write is still a
real, valid position and the final order is always right.

**Resolves when**: the list sizes people actually hit make this worth a
backend migration to sparse positions, or the backend gains a dedicated
bulk-reorder endpoint.
