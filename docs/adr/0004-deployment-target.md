# 0004. Deployment target for the two-person household

## Context

Local dev has been the only environment so far (`docker-compose.yml`'s own
comment: "a prod-targeted variant is a later concern"). The app now holds
real household data (RAV-4 through RAV-20 shipped, a real inventory was
imported) and the goal is simple: the user and their partner both get
access from their own devices, over the internet, each with their own
account.

Three shapes were considered:

- **Free PaaS trio** (Vercel for the frontend, Render/Fly.io for the
  backend, Neon for Postgres): zero cost, auto-deploy on push to each
  service's connected repo. Splits the app across three providers with
  three sets of environment variables to keep in sync, and the free tier
  of a Node backend host typically sleeps after a period of inactivity -
  a real problem for a WebSocket gateway (ADR 0003) that either drops
  idle connections or never gets pinged awake before someone loads the
  page.
- **A single VM**, running the existing `docker-compose.yml` almost as-is
  behind a reverse proxy for TLS: one machine, one place to reason about,
  reuses the compose file and the `prod` Dockerfile stages that already
  exist for both services (`backend/Dockerfile`, `frontend/Dockerfile`)
  but go unused by the dev-only compose file today.
- **Self-hosting on a machine at home** (behind a home router): free, but
  needs dynamic-DNS and port-forwarding through residential NAT, and ties
  the app's uptime to the household's own internet connection and power -
  not what "my partner can access it too" should depend on.

The single-VM shape won on the same reasoning regardless of provider; two
free-credit routes were tried first and both fell through. DigitalOcean
was the first pick (the user already had credit there), but DigitalOcean
is no longer part of the GitHub Student Developer Pack and no promotional
balance showed on the account. Azure for Students ($100 credit, no card
required) was tried next, but its SheerID eligibility check failed on a
second attempt after initially passing - re-verification after switching
the linked email got flagged as ineligible rather than re-confirmed, with
no way to retry cleanly in reasonable time. Neither issue is architectural:
the Docker Compose + Caddy shape below is identical on any VM provider.
Landing on a **paid DigitalOcean Droplet** ($6/month) rather than
continuing to chase free credit - cheap enough that the setup friction and
uncertainty of a third credit path wasn't worth it.

## Decision

**A single DigitalOcean Droplet**, running the app via Docker Compose,
fronted by **Caddy** as a reverse proxy for automatic HTTPS (Let's
Encrypt) - no Kubernetes, no managed database, no multi-region concern at
two-user scale.

**Two subdomains, not one origin with path-based routing**: `app.<domain>`
serves the frontend's static build (nginx, the `prod` stage already in
`frontend/Dockerfile`), `api.<domain>` serves the backend (the `prod`
stage in `backend/Dockerfile`). The frontend calls the backend via an
absolute `VITE_API_URL` baked in at build time (`frontend/src/lib/api.ts`)
and the same URL for the Socket.IO client (ADR 0003) - a path-based split
behind one origin would need either rewriting every REST path or a
collision between the SPA's catch-all route and the API's routes; two
subdomains avoids that entirely, at the cost of Caddy issuing (and
renewing) two certificates instead of one.

**Postgres stays a plain container on the same Droplet**, not a managed
DB add-on: at this scale (one household, low write volume) a managed
Postgres would be pure cost with no operational benefit yet, and the data
already lives in a named Docker volume today - moving it to a managed
service is a deliberate future migration, not a day-one requirement.

**A new `docker-compose.prod.yml`**, not a further override of the dev
file: the dev compose file bind-mounts source and runs `nest start
--watch` / `vite dev` (both `target: dev`); prod needs `target: prod`
builds with no bind mounts, plus the Caddy service, different enough that
overlaying it on the dev file (`docker-compose.override.yml`'s existing
role, already used for a personal port remap) would fight the dev
ergonomics that file exists for.

**A free domain via the GitHub Student Developer Pack**
(`ravi-to.app`, via Name.com's offer) rather than buying one - Let's
Encrypt needs a real domain either way; the Pack covers it at zero cost
for the first year.

## Consequences

**Positive**:

- Reuses infrastructure that already exists (`prod` Dockerfile stages,
  the compose service shapes) instead of introducing a new build/deploy
  toolchain.
- One machine, one `docker compose -f docker-compose.prod.yml up -d` to
  reason about; no cross-provider environment-variable drift.
- Caddy's automatic certificate renewal means TLS is a one-time setup
  cost, not an ongoing chore - and resolves the `Secure`-cookie
  known-limitation (`docs/known-limitations.md`) the moment it's live.
- No dependency on a student-credit verification flow that already
  proved unreliable (Azure) or unavailable (DigitalOcean) - $6/month is
  cheap enough to just pay and stop spending time on it.

**Negative / accepted trade-offs**:

- A single Droplet is a single point of failure: no redundancy, and an
  OS-level outage takes the whole app down until someone intervenes.
  Acceptable for a two-person household app; revisit if uptime
  expectations change.
- Manual server maintenance (OS security updates, Docker Engine updates,
  disk space for the Postgres volume) falls on the user, unlike a managed
  PaaS. Mitigated by `unattended-upgrades` for OS patches, but Docker/app
  updates are still a manual `git pull && docker compose ... up -d
  --build` per the deployment runbook (`docs/deployment.md`).
- Backups run on DigitalOcean's paid Backups add-on (weekly full-disk
  snapshot) rather than anything this repo automates itself - a small
  recurring cost on top of the Droplet, and a whole-machine restore
  granularity (recovering just the database to a more recent point needs
  the optional `pg_dump` cron in the deployment runbook instead).
- $6/month, ongoing, not covered by any credit - a real (if small) cost
  the earlier options were trying to avoid.
