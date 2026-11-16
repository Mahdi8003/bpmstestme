import { useQuery } from '@tanstack/react-query';
import {
  ROLE_LABELS,
  type RoleDto,
  type RolePermission,
  type UserSummary,
} from '@ravand/shared';
import { api } from './api';

export const rolesQueryKey = ['roles'] as const;

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: rolesQueryKey,
    queryFn: () => api.get<RoleDto[]>('/roles'),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useRoleMap(): Map<string, RoleDto> {
  const { data } = useRoles();
  return new Map((data ?? []).map((role) => [role.key, role]));
}

export function useRoleName(): (key: string | null | undefined) => string {
  const roleMap = useRoleMap();
  return (key) => {
    if (!key) return '—';
    return roleMap.get(key)?.name ?? ROLE_LABELS[key] ?? key;
  };
}

export function hasPermission(
  user: UserSummary | null,
  permission: RolePermission,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.permissions ?? []).includes(permission);
}
