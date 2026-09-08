# Known limitations

Accepted tradeoffs and tech debt, kept here so they're deliberate choices
instead of forgotten ones. Unlike `docs/lessons.md` (mistakes already fixed),
these are live: check here before "fixing" one by surprise, and update or
remove the entry once it's actually resolved.

## Email uniqueness is case-insensitive via a hand-written index, not the schema

`backend/prisma/schema.prisma`'s `User.email` is a plain case-sensitive
`@unique`. Case-insensitive uniqueness (`Alice@x.com` and `alice@x.com` can't
both exist) is enforced by a second, hand-written index
(`CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email))`) added
directly in the `add_case_insensitive_email_index` migration.

**Why not fixed properly**: the clean fix is a Postgres `citext` column, but
that needs Prisma's `postgresqlExtensions` preview feature, still preview
years after introduction - too much risk for how little it buys here.
Normalizing email to lowercase at the write boundary would avoid needing a
DB-level guard at all, but there's no write boundary yet (RAV-6, auth
endpoints, isn't built).

**Consequence to watch for**: the index has no `schema.prisma` counterpart,
so `prisma migrate diff` / `migrate dev` can't see it and may one day
generate a migration that drops "User_email_lower_key" as an "unrecognized"
object. There's a warning comment on `User.email` and in the migration file,
but no automated check backs it up.

**Resolves when**: RAV-6 (auth endpoints) either normalizes email to
lowercase on write (making the raw index redundant, safe to drop), or
`postgresqlExtensions` graduates out of preview and a `citext` migration
replaces it.

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
