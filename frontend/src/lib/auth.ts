import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';
import {
  clearAccessToken,
  getAuthState,
  setAccessToken,
  subscribeAuth,
} from './auth-store';

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

interface AuthTokenResponse {
  accessToken: string;
}

export function useAuthState() {
  return useSyncExternalStore(subscribeAuth, getAuthState);
}

export function useMe() {
  const auth = useAuthState();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/auth/me'),
    enabled: auth.status === 'authenticated',
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<AuthTokenResponse>('/auth/login', {
        method: 'POST',
        body: input,
        skipAuthRetry: true,
      }),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      email: string;
      password: string;
      displayName: string;
    }) =>
      apiFetch<AuthTokenResponse>('/auth/register', {
        method: 'POST',
        body: input,
        skipAuthRetry: true,
      }),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>('/auth/logout', { method: 'POST', skipAuthRetry: true }),
    onSettled: () => {
      clearAccessToken();
      queryClient.clear();
    },
  });
}
