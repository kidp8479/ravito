import { useMutationState } from '@tanstack/react-query';
import { useOnlineStatus } from '@/lib/use-online-status';

function usePendingMutationCount(): number {
  return useMutationState({ filters: { status: 'pending' } }).length;
}

// Offline-only, deliberately: while online, "pending" also includes
// perfectly normal, fast, fully-online mutations (a query is briefly
// 'pending' for the duration of any in-flight request) - a "Syncing..."
// banner reacting to those would flash on essentially every routine
// write, not just ones actually held up by connectivity. Once back
// online, paused mutations flush within one round trip; not worth a
// separate "reconnecting" phase for a banner this minimal (RAV-19,
// PLAN.md's "minimal offline support").
function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const pending = usePendingMutationCount();

  if (isOnline) return null;

  const message =
    pending > 0
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
