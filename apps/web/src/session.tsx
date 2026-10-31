import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient, ApiClientError } from '@sahana/api-client';
import type { PublicConfig, SessionSociety, SessionUser } from '@sahana/types';

export type Me = {
  user: SessionUser;
  society: SessionSociety;
  permissions: string[];
};

const client = createApiClient({ baseUrl: '' });

type SessionValue = {
  me: Me | undefined;
  config: PublicConfig | undefined;
  isLoading: boolean;
  login: (input: { email: string; password: string; societyId?: string }) => Promise<unknown>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => client.request<Me>('/api/v1/me'),
    retry: false,
  });
  const configQuery = useQuery({
    queryKey: ['config'],
    queryFn: () => client.request<PublicConfig>('/api/v1/config'),
    enabled: Boolean(meQuery.data),
  });
  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string; societyId?: string }) =>
      client.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...input, client: 'web' }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () => client.request<void>('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const value = useMemo<SessionValue>(
    () => ({
      me: meQuery.data,
      config: configQuery.data,
      isLoading: meQuery.isLoading,
      login: (input) => loginMutation.mutateAsync(input),
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
    }),
    [configQuery.data, loginMutation, logoutMutation, meQuery.data, meQuery.isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}

export function isApiError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export { client };
