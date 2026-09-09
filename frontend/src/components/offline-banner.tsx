import { useMutationState } from '@tanstack/react-query';
import { useOnlineStatus } from '@/lib/use-online-status';

// "N pending" also counts mutations still actually in flight, not just
// ones TanStack Query has paused for being offline - status stays
// 'pending' either way, and telling them apart isn't worth the extra
// state for a banner this minimal (RAV-19, PLAN.md's "minimal offline
// support").
function usePendingMutationCount(): number {
  return useMutationState({ filters: { status: 'pending' } }).length;
}

function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const pending = usePendingMutationCount();

  if (isOnline && pending === 0) return null;

  const message = isOnline
    ? `Syncing ${pending} change${pending > 1 ? 's' : ''}...`
    : pending > 0
      ? `You're offline - ${pending} change${pending > 1 ? 's' : ''} will sync once you're back online`
      : "You're offline";

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900"
    >
      {message}
    </div>
  );
}

export { OfflineBanner };
