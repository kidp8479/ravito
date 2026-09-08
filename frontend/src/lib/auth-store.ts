// Auth state lives outside React (not context) so route `beforeLoad`
// guards - plain module code, no component tree to read context from -
// can check and await it directly.

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; accessToken: string };

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
    return false;
  }
}

export function setAccessToken(accessToken: string): void {
  writeSessionHint(true);
  setState({ status: 'authenticated', accessToken });
}

export function clearAccessToken(): void {
  writeSessionHint(false);
  setState({ status: 'anonymous' });
}

export function getAccessToken(): string | null {
  return state.status === 'authenticated' ? state.accessToken : null;
}
