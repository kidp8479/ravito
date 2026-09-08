// Shared between AuthService (token lifetimes) and AuthController (cookie
// options) so the two can't drift out of sync.

export const ACCESS_TOKEN_TTL = '15m'; // ADR 0002

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, ADR 0002

export const REFRESH_COOKIE_NAME = 'refresh_token';

// Scoped to the one endpoint that reads it (ADR 0002) - the browser never
// attaches it to any other request, so no other route needs to defend
// against it being forged.
export const REFRESH_COOKIE_PATH = '/auth/refresh';
