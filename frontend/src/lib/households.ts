import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import { useAuthState } from './auth';

export type HouseholdRole = 'OWNER' | 'MEMBER';

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
}

export interface HouseholdMember {
  userId: string;
  role: HouseholdRole;
  joinedAt: string;
  email: string;
  displayName: string;
}

export interface HouseholdInvite {
  code: string;
  expiresAt: string;
}

const mineKey = ['households', 'mine'];
const membersKey = (householdId: string) => [
  'households',
  householdId,
  'members',
];

export function useMyHouseholds() {
  const auth = useAuthState();
  return useQuery({
    queryKey: mineKey,
    queryFn: () => apiFetch<HouseholdSummary[]>('/households/mine'),
    enabled: auth.status === 'authenticated',
  });
}

export function useHouseholdMembers(householdId: string) {
  const auth = useAuthState();
  return useQuery({
    queryKey: membersKey(householdId),
    queryFn: () =>
      apiFetch<HouseholdMember[]>(`/households/${householdId}/members`),
    enabled: auth.status === 'authenticated',
  });
}

export function useCreateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<HouseholdSummary>('/households', {
        method: 'POST',
        body: { name },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mineKey }),
  });
}

export function useJoinHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ householdId: string }>('/households/join', {
        method: 'POST',
        body: { code },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mineKey }),
  });
}

export function useCreateInvite(householdId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<HouseholdInvite>(`/households/${householdId}/invites`, {
        method: 'POST',
      }),
  });
}

export function useRemoveMember(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/households/${householdId}/members/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mineKey });
      void queryClient.invalidateQueries({
        queryKey: membersKey(householdId),
      });
    },
  });
}
