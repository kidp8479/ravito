import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui's standard helper: merge conditional class names, then let
// tailwind-merge resolve conflicting Tailwind utilities (e.g. two
// competing `px-*` values) in favor of the last one.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
