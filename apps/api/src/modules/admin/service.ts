import { and, desc, eq, sql } from 'drizzle-orm';
import type { AdminUserDto, AuditLogDto, RoleKey } from '@ravand/shared';
import { db } from '../../db/client.js';
import { auditLogs, roles, sessions, users } from '../../db/schema.js';
import { writeAudit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import type { AuthContext } from '../../lib/auth.js';
import { ensureBuiltInRoles } from '../roles/service.js';

const AVATAR_COLORS = [
  '#1E3A5F',
  '#8B5E3C',
  '#3F5F4A',
  '#6B4C7A',
  '#7A5C2E',
  '#2F6572',
  '#5B6475',
  '#7A3E3E',
];

function toDto(row: typeof users.$inferSelect): AdminUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    jobTitle: row.jobTitle,
    avatarColor: row.avatarColor,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function assertRoleExists(auth: AuthContext, key: string): Promise<void> {
  await ensureBuiltInRoles(auth.tenantId);
  const rows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, auth.tenantId), eq(roles.key, key)))
    .limit(1);
  if (!rows[0]) throw badRequest('نقش انتخاب‌شده در این سازمان تعریف نشده است.');
}

export async function listUsers(auth: AuthContext): Promise<AdminUserDto[]> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.tenantId, auth.tenantId))
    .orderBy(users.createdAt);
  return rows.map(toDto);
}

export async function createUser(
  auth: AuthContext,
  input: {
    name: string;
    email: string;
    password: string;
    role: RoleKey;
    jobTitle?: string;
  },
): Promise<AdminUserDto> {
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) throw conflict('این ایمیل قبلاً ثبت شده است.');
  await assertRoleExists(auth, input.role);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? '#1E3A5F';
  const [created] = await db
    .insert(users)
    .values({
      tenantId: auth.tenantId,
      email,
      passwordHash: await hashPassword(input.password),
      name: input.name.trim(),
      role: input.role,
      jobTitle: input.jobTitle?.trim() || null,
      avatarColor: color,
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'user.created',
    entityType: 'user',
    entityId: created.id,
    after: { email: created.email, role: created.role },
  });
  return toDto(created);
}

export async function updateUser(
  auth: AuthContext,
  id: string,
  input: {
    name?: string;
    email?: string;
    role?: RoleKey;
    isActive?: boolean;
    jobTitle?: string;
  },
): Promise<AdminUserDto> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.tenantId, auth.tenantId)))
    .limit(1);
  const current = rows[0];
  if (!current) throw notFound('کاربر پیدا نشد.');
  if (id === auth.userId && input.isActive === false) {
    throw badRequest('نمی‌توانید حساب خودتان را غیرفعال کنید.');
  }
  if (id === auth.userId && input.role && input.role !== 'admin') {
    throw badRequest('نمی‌توانید نقش مدیر سیستم خودتان را تغییر دهید.');
  }

  const nextRole = input.role ?? current.role;
  const nextActive = input.isActive ?? current.isActive;
  if (input.role && input.role !== current.role) {
    await assertRoleExists(auth, input.role);
  }
  if (current.role === 'admin' && (nextRole !== 'admin' || !nextActive)) {
    const remaining = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.tenantId, auth.tenantId),
          eq(users.role, 'admin'),
          eq(users.isActive, true),
          sql`${users.id} <> ${id}`,
        ),
      );
    if (Number(remaining[0]?.count ?? 0) === 0) {
      throw badRequest('حداقل یک مدیر سیستم فعال باید باقی بماند.');
    }
  }

  const email = input.email?.trim().toLowerCase();
  if (email && email !== current.email) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), sql`${users.id} <> ${id}`))
      .limit(1);
    if (existing[0]) throw conflict('این ایمیل قبلاً ثبت شده است.');
  }

  const [updated] = await db
    .update(users)
    .set({
      name: input.name?.trim() || current.name,
      email: email ?? current.email,
      role: nextRole,
      isActive: nextActive,
      jobTitle: input.jobTitle !== undefined ? input.jobTitle.trim() || null : current.jobTitle,
    })
    .where(and(eq(users.id, id), eq(users.tenantId, auth.tenantId)))
    .returning();
  if (!updated) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'user.updated',
    entityType: 'user',
    entityId: id,
    before: {
      name: current.name,
      email: current.email,
      role: current.role,
      isActive: current.isActive,
      jobTitle: current.jobTitle,
    },
    after: {
      name: updated.name,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      jobTitle: updated.jobTitle,
    },
  });
  return toDto(updated);
}

export async function resetUserPassword(
  auth: AuthContext,
  id: string,
  newPassword: string,
): Promise<void> {
  const [updated] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(and(eq(users.id, id), eq(users.tenantId, auth.tenantId)))
    .returning({ id: users.id });
  if (!updated) throw notFound('کاربر پیدا نشد.');
  await db.delete(sessions).where(eq(sessions.userId, id));
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: id,
  });
}

export async function listAuditLogs(
  auth: AuthContext,
  query: { limit: number; offset: number; entityType?: string },
): Promise<AuditLogDto[]> {
  const conditions = [eq(auditLogs.tenantId, auth.tenantId)];
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  const rows = await db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit)
    .offset(query.offset);
  return rows.map(({ log, actorName }) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    actorName,
    createdAt: log.createdAt.toISOString(),
    before: log.before,
    after: log.after,
  }));
}
