import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// Backs the offline banner (RAV-19) and, indirectly, TanStack Query's own
// mutation pause/resume: browser 'online'/'offline' events are what its
// internal onlineManager listens to as well, so this hook and the
// library's own retry/pause behavior always agree on network state.
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
