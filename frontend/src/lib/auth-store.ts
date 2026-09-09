// Auth state lives outside React (not context) so route `beforeLoad`
// guards - plain module code, no component tree to read context from -
// can check and await it directly.

// accessToken is nullable on the authenticated variant for the offline
// case (RAV-19): setAuthenticatedOffline() below sets this without a
// real token when refresh fails due to a network error rather than the
// server actually rejecting the session - route guards treat it as
// "render the page, cached data can still show" (lib/api.ts's
// ensureAuthLoaded), while apiFetch simply omits the Authorization
// header until a real refresh succeeds once back online.
type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; accessToken: string | null };

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A plain (non-httpOnly) marker, set alongside login/register/refresh and
// cleared on logout: lets ensureAuthLoaded() (lib/api.ts) tell "never had a
// session" apart from "might still have one" *before* making a network
// call, so a fresh anonymous visit doesn't have to fire a refresh request
// it already knows will 401. Never trusted for anything security-relevant
// - the httpOnly refresh cookie remains the only real credential.
const SESSION_HINT_KEY = 'ravito:hasSession';

function writeSessionHint(hasSession: boolean): void {
  try {
    if (hasSession) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage unavailable (private mode, disabled) - the hint is only an
    // optimization to skip a doomed refresh call, never load-bearing.
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    // Storage unreadable (private mode, disabled): fail open toward
    // attempting a real refresh rather than assuming anonymous - the
    // wrong guess here silently logs out someone with a valid session,
    // while the wrong guess the other way just costs one doomed request.
    return true;
  }
}

export function setAccessToken(accessToken: string): void {
  writeSessionHint(true);
  setState({ status: 'authenticated', accessToken });
}

// Called by doRefresh() (lib/api.ts) when a refresh attempt fails with a
// network-level error (offline, DNS, connection refused) rather than the
// server responding - that's not proof the session is invalid, just that
// nothing could be confirmed right now. Does not touch the session hint:
// this isn't a new session, just continuing to assume the existing one
// until it can actually be checked again.
export function setAuthenticatedOffline(): void {
  setState({ status: 'authenticated', accessToken: null });
}

export function clearAccessToken(): void {
  writeSessionHint(false);
  setState({ status: 'anonymous' });
}

export function getAccessToken(): string | null {
  return state.status === 'authenticated' ? state.accessToken : null;
}
