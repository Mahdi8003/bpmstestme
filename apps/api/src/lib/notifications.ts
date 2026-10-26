import { and, eq, inArray } from 'drizzle-orm';
import type { RoleKey } from '@ravand/shared';
import type { DbLike } from '../db/client.js';
import { notifications, users } from '../db/schema.js';

export async function findUsersByRole(
  db: DbLike,
  tenantId: string,
  role: RoleKey | string,
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.role, role as RoleKey),
        eq(users.isActive, true),
      ),
    );
  return rows.map((row) => row.id);
}

export async function notifyUsers(
  db: DbLike,
  input: {
    tenantId: string;
    userIds: string[];
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
  },
): Promise<void> {
  const unique = [...new Set(input.userIds.filter(Boolean))];
  if (!unique.length) return;
  await db.insert(notifications).values(
    unique.map((userId) => ({
      tenantId: input.tenantId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  );
}

export async function findUsersByIds(
  db: DbLike,
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, ids)));
  return rows.map((row) => row.id);
}
