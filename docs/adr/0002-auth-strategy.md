# 0002. Auth strategy

## Context

Lot 1 needs a working login before anything else in the roadmap can be
built on top of it: every household resource is guarded by
`HouseholdMembershipGuard` (see `CLAUDE.md` > "Non-negotiable: tenant
isolation"), which needs to know who `req.user` is on every request.

The frontend (`frontend/`) and backend (`backend/`) are two separate
origins even in dev (`localhost:5173` vs `localhost:3000`), and CORS is
already wired for it (`app.enableCors({ credentials: true, ... })` in
`backend/src/main.ts`) - the auth strategy has to work across that
boundary, not assume same-origin cookies are enough on their own.

Two shapes were on the table:

- **Server-side sessions** (a session id in a cookie, session state in
  Postgres or Redis): simple to revoke (delete the row), but needs a
  session store from day one and doesn't fit a future "kitchen hub" API
  consumed by something other than this one SPA (a future native client,
  third-party integration) as cleanly as a token does.
- **JWT access + refresh**: stateless access tokens scale to multiple
  clients without a shared session store, at the cost of needing a
  deliberate revocation story (a JWT can't be un-issued by itself).

`PLAN.md`'s Lot 1 section already flagged the intended direction: JWT
access + refresh, refresh token in an httpOnly cookie, argon2id for
password hashing. This ADR settles the specifics that decision left open.

## Decision

**Password hashing: argon2id** (via the `argon2` npm package), not bcrypt.
Argon2id is the current OWASP recommendation and resists GPU/ASIC
cracking better than bcrypt at equivalent cost settings.

**Access token: JWT, 15 minute TTL.** Signed with a symmetric secret
(`JWT_ACCESS_SECRET` env var), issued by `@nestjs/jwt` and verified by a
`passport-jwt` strategy (`@nestjs/passport`). Sent as a `Bearer` header,
kept in memory on the frontend (a TanStack Query / module-level variable,
never `localStorage`) - short-lived enough that losing it to XSS is a
narrow window, and never touches disk on the client.

**Refresh token: opaque random token, persisted and revocable, 30 day
TTL, rotated on every use.** A new `RefreshToken` Prisma model (added in
RAV-6, out of scope for this ADR): `id`, `userId`, `tokenHash` (the token
itself is never stored, only its hash, same reasoning as passwords),
`expiresAt`, `revokedAt` nullable, `replacedByTokenId` nullable (for
reuse-detection chains). `POST /auth/refresh` looks up the hash, checks
it's neither expired nor revoked, issues a new access + refresh token
pair, and marks the old refresh token row `revokedAt` + `replacedByTokenId`
instead of deleting it - a reused (already-revoked) refresh token is
treated as a signal of theft and revokes the entire chain for that user.

**Refresh token transport: httpOnly, `Secure`, `SameSite=Strict` cookie**,
scoped to the `/auth/refresh` path only. Not readable from JS (mitigates
XSS exfiltration), not sent on cross-site requests (`SameSite=Strict`
mitigates CSRF for the one endpoint that reads it) - no separate CSRF
token needed as a result, since no other state-changing endpoint accepts
cookie-based auth (everything else requires the `Bearer` access token).

**Logout**: `POST /auth/logout` revokes the current refresh token
(`revokedAt`) and clears the cookie. A later "log out everywhere" is a
straightforward extension (revoke every non-revoked `RefreshToken` row for
that `userId`), not a new mechanism.

**Endpoints** (implemented in RAV-6): `POST /auth/register`,
`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET
/auth/me`.

## Consequences

**Positive**:

- Stateless access tokens mean any future API client (a native app, a
  second frontend) authenticates the same way, without sharing a session
  store with this backend.
- Revocation and reuse-detection on the refresh token close the main gap
  a naive "just verify the JWT signature" refresh design would have - a
  stolen refresh token doesn't grant indefinite access.
- Access token TTL of 15 minutes bounds the blast radius of a leaked
  access token without the user re-entering credentials that often (the
  refresh cycle is invisible to them).

**Negative / accepted trade-offs**:

- A `RefreshToken` table means a DB write on every login and every
  refresh (roughly every 15 minutes per active session) - more write
  volume than a pure-stateless JWT refresh, and a table that needs
  periodic cleanup of expired/revoked rows (deferred: not needed at this
  household-app scale, revisit if row count ever becomes a concern).
- Two secrets to manage instead of one (`JWT_ACCESS_SECRET` for signing,
  plus whatever hashes refresh tokens) - both go in `.env` /
  `.env.example` per `CLAUDE.md` > "Secrets", never hardcoded.
- `SameSite=Strict` on the refresh cookie means a refresh silently fails
  if the frontend and backend ever end up on genuinely different
  registrable domains in production (not just different ports, which is
  still same-site) - acceptable for the current single-deployment
  target, revisited if that changes.
