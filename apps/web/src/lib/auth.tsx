import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSession, TenantSummary, UserSummary } from '@ravand/shared';
import { api, ApiError } from './api';

interface AuthContextValue {
  user: UserSummary | null;
  tenant: TenantSummary | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      try {
        return await api.get<AuthSession>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.post<AuthSession>('/auth/login', { email, password });
      queryClient.setQueryData(['auth'], session);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      queryClient.clear();
      queryClient.setQueryData(['auth'], null);
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data?.user ?? null,
      tenant: sessionQuery.data?.tenant ?? null,
      isLoading: sessionQuery.isLoading,
      login,
      logout,
    }),
    [login, logout, sessionQuery.data, sessionQuery.isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
