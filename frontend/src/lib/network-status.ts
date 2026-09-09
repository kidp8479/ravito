import { onlineManager } from '@tanstack/react-query';

// TanStack Query's default onlineManager assumes online (`true`) until a
// browser 'online'/'offline' *event* fires - it never checks
// navigator.onLine at startup. That's wrong for a PWA reloaded (or
// opened fresh) while already offline (RAV-19): every query would
// attempt a real fetch and fail (fetchStatus never becomes 'paused')
// instead of serving the persisted cache, because reloading while
// already offline doesn't fire a new transition event. Re-registering
// the event listener setup syncs it with the real navigator.onLine
// value immediately on setup, not just on the next transition.
export function syncOnlineManagerWithNavigator(): void {
  onlineManager.setEventListener((setOnline) => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });
}
