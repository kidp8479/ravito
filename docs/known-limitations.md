# Known limitations

Accepted tradeoffs and tech debt, kept here so they're deliberate choices
instead of forgotten ones. Unlike `docs/lessons.md` (mistakes already fixed),
these are live: check here before "fixing" one by surprise, and update or
remove the entry once it's actually resolved.

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
