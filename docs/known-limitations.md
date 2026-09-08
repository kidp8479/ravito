# Known limitations

Accepted tradeoffs and tech debt, kept here so they're deliberate choices
instead of forgotten ones. Unlike `docs/lessons.md` (mistakes already fixed),
these are live: check here before "fixing" one by surprise, and update or
remove the entry once it's actually resolved.

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
