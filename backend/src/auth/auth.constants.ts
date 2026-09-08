// Shared between AuthService (token lifetimes) and AuthController (cookie
// options) so the two can't drift out of sync.

export const ACCESS_TOKEN_TTL = '15m'; // ADR 0002

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, ADR 0002

export const REFRESH_COOKIE_NAME = 'refresh_token';

// Scoped to the two endpoints that read it, refresh and logout (ADR 0002) -
// cookie path matching is prefix-based, so `/auth/refresh` alone would
// silently stop the browser from ever sending it to `/auth/logout`. No
// route outside `/auth` needs to defend against it being forged.
export const REFRESH_COOKIE_PATH = '/auth';
