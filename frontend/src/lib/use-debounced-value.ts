import { useEffect, useState } from 'react';

// Delays a fast-changing value (e.g. search-as-you-type input) by `delayMs`
// so callers only react once typing pauses, instead of once per keystroke.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
