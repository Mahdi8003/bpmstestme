import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NotificationDto, NotificationsDto } from '@ravand/shared';
import { db } from '../../db/client.js';
import { notifications } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../lib/auth.js';

function toDto(row: typeof notifications.$inferSelect): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotifications(
  auth: AuthContext,
  query: { unread?: boolean; limit: number },
): Promise<NotificationsDto> {
  const conditions = [
    eq(notifications.tenantId, auth.tenantId),
    eq(notifications.userId, auth.userId),
  ];
  if (query.unread) conditions.push(isNull(notifications.readAt));
  const [rows, unreadRows] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(query.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, auth.tenantId),
          eq(notifications.userId, auth.userId),
          isNull(notifications.readAt),
        ),
      ),
  ]);
  return {
    items: rows.map(toDto),
    unread: Number(unreadRows[0]?.count ?? 0),
  };
}

export async function markNotificationRead(
  auth: AuthContext,
  id: string,
): Promise<NotificationDto> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.tenantId, auth.tenantId),
        eq(notifications.userId, auth.userId),
      ),
    )
    .returning();
  if (!updated) throw notFound('اعلان پیدا نشد.');
  return toDto(updated);
}

export async function markAllNotificationsRead(auth: AuthContext): Promise<{ ok: true }> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.tenantId, auth.tenantId),
        eq(notifications.userId, auth.userId),
        isNull(notifications.readAt),
      ),
    );
  return { ok: true };
}
