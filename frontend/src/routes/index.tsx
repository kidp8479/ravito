import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthLoaded } from '@/lib/api';
import { getAuthState } from '@/lib/auth-store';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    await ensureAuthLoaded();
    throw redirect({
      to: getAuthState().status === 'authenticated' ? '/household' : '/login',
    });
  },
});
