import { and, desc, eq } from 'drizzle-orm';
import type { AdminUserDto, AuditLogDto, RoleKey } from '@ravand/shared';
import { db } from '../../db/client.js';
import { auditLogs, users } from '../../db/schema.js';
import { writeAudit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import type { AuthContext } from '../../lib/auth.js';

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
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? '#1E3A5F';
  const [created] = await db
    .insert(users)
    .values({
      tenantId: auth.tenantId,
      email,
      passwordHash: hashPassword(input.password),
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
  input: { role?: RoleKey; isActive?: boolean; jobTitle?: string },
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
  const [updated] = await db
    .update(users)
    .set({
      role: input.role ?? current.role,
      isActive: input.isActive ?? current.isActive,
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
    before: { role: current.role, isActive: current.isActive, jobTitle: current.jobTitle },
    after: { role: updated.role, isActive: updated.isActive, jobTitle: updated.jobTitle },
  });
  return toDto(updated);
}

export async function listAuditLogs(
  auth: AuthContext,
  query: { limit: number; entityType?: string },
): Promise<AuditLogDto[]> {
  const conditions = [eq(auditLogs.tenantId, auth.tenantId)];
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  const rows = await db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.limit);
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
