# 0003. Real-time transport for the shared shopping list

## Context

Lot 3's whole point (`PLAN.md`) is that the shopping list feels shared:
one household member checks off "Milk" on their phone, another member's
screen updates within about a second, with no manual refresh. That rules
out plain request/response REST for the read side - something has to push
changes to every connected client in the same household.

Three shapes were on the table:

- **Polling**: the client re-fetches `GET /households/:id/shopping-list`
  on an interval. No new server infra, but a real latency/cost tradeoff:
  a short interval (1-2s) to hit the "<1s" feel wastes requests when
  nothing changed (the common case for a household not actively
  shopping); a longer interval defeats the point of "shared" in the first
  place.
- **SSE (Server-Sent Events)**: a standing HTTP connection, server pushes
  events, no library needed beyond what the platform already gives you.
  Simple, but one-directional (server to client) - writes still go
  through separate REST calls, and a later "who else is looking at this
  list right now" presence feature would need a second channel anyway.
- **WebSocket**: bidirectional, one connection carries both the pushed
  updates and (if it's ever worth it) client-originated events like
  presence or typing indicators. More moving parts (a gateway, room
  membership, reconnection handling) than SSE for the same read-side
  result.

`PLAN.md`'s architecture section already named WebSocket
(`@nestjs/websockets` + Socket.IO) as the intended shape; this ADR settles
the specifics that decision left open, the same relationship RAV-5's ADR
0002 had to auth.

## Decision

**WebSocket via `@nestjs/websockets` + Socket.IO**, one gateway
(`ShoppingListGateway`, RAV-14) alongside the existing REST endpoints
(RAV-13) - Socket.IO handles both writes (still plain REST/HTTP; the
gateway is push-only) and reconnection/fallback transport negotiation, so
the app doesn't have to hand-roll a raw `ws` reconnect strategy.

**Auth on connect, not per-message.** The socket handshake carries the
same JWT access token already used for REST (`Authorization` header
equivalent: Socket.IO's `auth` payload on connection), verified once by
the same `passport-jwt` logic RAV-6 already wrote - no second auth
mechanism to keep in sync with the first.

**Rooms keyed by `householdId`.** On a verified connection, the gateway
joins the socket to a room named after the caller's household (looked up
the same way `HouseholdMembershipGuard` does - membership checked before
joining, never trusted from a client-supplied value). Every mutation
handled by the REST `shopping-list/` module emits its event
(`item.created`, `item.updated`, `item.deleted`) to that one room only -
tenant isolation for the real-time channel mirrors the REST guard's,
instead of being a separate thing that could drift from it.

**Writes stay REST, not socket events.** `POST/PATCH/DELETE
.../shopping-list` are plain HTTP, validated and guarded exactly like
every other mutating route (CLAUDE.md's tenant-isolation baseline). The
gateway only ever pushes; a client never mutates state by emitting a
socket event. This keeps one source of truth for validation and error
responses (a normal HTTP 4xx, not a bespoke socket-error protocol) and
means the REST API works on its own for a future client that doesn't
want the socket (a script, a future native app doing a simple sync).

**Frontend**: `socket.io-client`, one connection per session, established
after login and re-established on token refresh (new access token
re-authenticates the existing socket). On a received event, the
TanStack Query cache for that household's shopping list is updated
directly (optimistic local writes reconciled against the pushed event) -
no full refetch per event.

## Consequences

**Positive**:

- Sub-second propagation without polling overhead when the list is idle.
- One connection can carry future bidirectional needs (presence,
  "someone is editing") without a second transport - SSE would have
  needed exactly that if presence ever became a real feature.
- Reusing the existing JWT for the handshake means no new credential
  type, no new revocation story: an access token that's expired or
  belongs to a removed member fails the same way it already does on
  REST.

**Negative / accepted trade-offs**:

- A stateful gateway process (in-memory room membership) doesn't
  horizontally scale as-is: two backend instances behind a load balancer
  would each only know about their own connected sockets, so an event
  from a mutation handled by instance A never reaches a client connected
  to instance B. Out of scope at this single-instance, household-app
  scale (`docker-compose`, no orchestrator yet); the standard fix later
  is a Socket.IO adapter backed by Redis pub/sub, a deliberate addition
  when multi-instance deployment actually happens, not before.
- The socket's short-lived JWT (15 minute TTL, ADR 0002) means the
  frontend has to actively re-authenticate the live connection on token
  refresh, not just swap a header on the next REST call - a bit more
  wiring than a purely stateless REST client needs.
- Two things to keep in sync operationally (the REST module and the
  gateway emitting from it) instead of one - mitigated by keeping them in
  the same NestJS module (RAV-14) rather than separate services, so the
  emit call sits next to the write it announces.
