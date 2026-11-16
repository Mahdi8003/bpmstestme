import { and, asc, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_KEYS,
  ROLE_LABELS,
  type CaseTypeDefinition,
  type RoleDto,
  type RolePermission,
} from '@ravand/shared';
import { db } from '../../db/client.js';
import { caseTasks, caseTypes, roles, users } from '../../db/schema.js';
import { writeAudit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../lib/auth.js';

const BUILTIN_COLORS: Record<string, string> = {
  admin: '#1E3A5F',
  builder: '#8B5E3C',
  manager: '#3F5F4A',
  finance: '#6B4C7A',
  procurement: '#7A5C2E',
  warehouse: '#2F6572',
  member: '#5B6475',
};

const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  admin: 'دسترسی کامل به تنظیمات، کاربران، نقش‌ها و همهٔ پرونده‌ها.',
  builder: 'ساخت و ویرایش فرآیندها و مشاهدهٔ همهٔ پرونده‌ها.',
  manager: 'مدیریت فرآیندها، مشاهدهٔ همهٔ پرونده‌ها و واگذاری کارها.',
  finance: 'بررسی و تأیید کارهای مالی و مشاهدهٔ پرونده‌های مرتبط.',
  procurement: 'تأمین کالا، مدیریت طرف‌حساب‌ها و کالاها.',
  warehouse: 'مدیریت انبار، کالاها و گردش موجودی.',
  member: 'کارشناس سازمانی با دسترسی به پرونده‌های مرتبط با خود.',
};

const BUILTIN_SORT = new Map(ROLE_KEYS.map((key, index) => [key, (index + 1) * 10]));

type RoleRow = typeof roles.$inferSelect;

function toDto(row: RoleRow, userCount: number): RoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    color: row.color,
    isSystem: row.isSystem,
    permissions: row.permissions,
    userCount: Number(userCount),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Creates the built-in role rows for a tenant if they are missing. This keeps
 * tenants created before custom roles existed fully usable.
 */
export function builtinRoleSeedValues(tenantId: string) {
  return ROLE_KEYS.map((key) => ({
    tenantId,
    key,
    name: ROLE_LABELS[key] ?? key,
    description: BUILTIN_DESCRIPTIONS[key] ?? '',
    color: BUILTIN_COLORS[key] ?? '#1E3A5F',
    permissions: DEFAULT_ROLE_PERMISSIONS[key] ?? [],
    isSystem: true,
    sortOrder: BUILTIN_SORT.get(key) ?? 100,
  }));
}

export async function ensureBuiltInRoles(tenantId: string): Promise<void> {
  await db
    .insert(roles)
    .values(builtinRoleSeedValues(tenantId))
    .onConflictDoNothing({ target: [roles.tenantId, roles.key] });
}

export async function listRoles(auth: AuthContext): Promise<RoleDto[]> {
  await ensureBuiltInRoles(auth.tenantId);
  const rows = await db
    .select({
      role: roles,
      userCount: sql<number>`(
        select count(*)::int from users u
        where u.tenant_id = ${roles.tenantId}
          and u.role = ${roles.key}
          and u.is_active = true
      )`,
    })
    .from(roles)
    .where(eq(roles.tenantId, auth.tenantId))
    .orderBy(asc(roles.sortOrder), asc(roles.name));
  return rows.map((row) => toDto(row.role, row.userCount));
}

export async function tenantRoleKeys(tenantId: string): Promise<Set<string>> {
  await ensureBuiltInRoles(tenantId);
  const rows = await db
    .select({ key: roles.key })
    .from(roles)
    .where(eq(roles.tenantId, tenantId));
  return new Set(rows.map((row) => row.key));
}

export async function tenantActiveUserIds(tenantId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)));
  return new Set(rows.map((row) => row.id));
}

async function assertRoleKey(auth: AuthContext, key: string): Promise<void> {
  await ensureBuiltInRoles(auth.tenantId);
  const existing = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, auth.tenantId), eq(roles.key, key)))
    .limit(1);
  if (existing[0]) throw conflict('این کلید نقش قبلاً استفاده شده است.');
}

export async function createRole(
  auth: AuthContext,
  input: {
    key: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: RolePermission[];
  },
): Promise<RoleDto> {
  await assertRoleKey(auth, input.key);
  const [created] = await db
    .insert(roles)
    .values({
      tenantId: auth.tenantId,
      key: input.key,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      color: input.color ?? '#315364',
      permissions: input.permissions ?? [],
      isSystem: false,
      sortOrder: 500,
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'role.created',
    entityType: 'role',
    entityId: created.id,
    after: {
      key: created.key,
      name: created.name,
      permissions: created.permissions,
    },
  });
  return toDto(created, 0);
}

async function loadRole(auth: AuthContext, id: string): Promise<RoleRow> {
  const rows = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('نقش پیدا نشد.');
  return row;
}

export async function updateRole(
  auth: AuthContext,
  id: string,
  input: {
    name?: string;
    description?: string;
    color?: string;
    permissions?: RolePermission[];
  },
): Promise<RoleDto> {
  const current = await loadRole(auth, id);
  const permissions =
    current.key === 'admin'
      ? [...DEFAULT_ROLE_PERMISSIONS.admin]
      : (input.permissions ?? current.permissions);
  const [updated] = await db
    .update(roles)
    .set({
      name: input.name?.trim() || current.name,
      description:
        input.description !== undefined
          ? input.description.trim()
          : current.description,
      color: input.color ?? current.color,
      permissions,
      updatedAt: new Date(),
    })
    .where(and(eq(roles.id, id), eq(roles.tenantId, auth.tenantId)))
    .returning();
  if (!updated) throw notFound();
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.tenantId, auth.tenantId),
        eq(users.role, updated.key),
        eq(users.isActive, true),
      ),
    );
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'role.updated',
    entityType: 'role',
    entityId: id,
    before: {
      name: current.name,
      description: current.description,
      color: current.color,
      permissions: current.permissions,
    },
    after: {
      name: updated.name,
      description: updated.description,
      color: updated.color,
      permissions: updated.permissions,
    },
  });
  return toDto(updated, Number(countRow?.count ?? 0));
}

function definitionReferencesRole(
  definition: CaseTypeDefinition,
  roleKey: string,
): boolean {
  return definition.stages.some(
    (stage) =>
      stage.tasks.some(
        (task) => task.assignee.type === 'role' && task.assignee.value === roleKey,
      ) ||
      stage.permissions?.editRoles?.includes(roleKey) ||
      stage.permissions?.uploadRoles?.includes(roleKey),
  );
}

export async function deleteRole(auth: AuthContext, id: string): Promise<{ ok: true }> {
  const current = await loadRole(auth, id);
  if (current.isSystem) {
    throw conflict('نقش‌های پیش‌فرض سیستم قابل حذف نیستند؛ می‌توانید نام و دسترسی آن‌ها را تغییر دهید.');
  }
  const [userCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenantId, auth.tenantId), eq(users.role, current.key)));
  if (Number(userCount?.count ?? 0) > 0) {
    throw conflict('این نقش به یک یا چند کاربر اختصاص داده شده است؛ ابتدا نقش آن کاربران را تغییر دهید.');
  }
  const typeRows = await db
    .select({ name: caseTypes.name, definition: caseTypes.definition })
    .from(caseTypes)
    .where(eq(caseTypes.tenantId, auth.tenantId));
  const usedIn = typeRows.find((row) => definitionReferencesRole(row.definition, current.key));
  if (usedIn) {
    throw conflict(`این نقش در فرآیند «${usedIn.name}» استفاده شده است و قابل حذف نیست.`);
  }
  const [taskCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(caseTasks)
    .where(
      and(
        eq(caseTasks.tenantId, auth.tenantId),
        eq(caseTasks.candidateRole, current.key),
        sql`${caseTasks.status} in ('pending','claimed','waiting_info')`,
      ),
    );
  if (Number(taskCount?.count ?? 0) > 0) {
    throw conflict('این نقش در کارهای در جریان استفاده شده است و قابل حذف نیست.');
  }
  await db
    .delete(roles)
    .where(and(eq(roles.id, id), eq(roles.tenantId, auth.tenantId)));
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'role.deleted',
    entityType: 'role',
    entityId: id,
    before: { key: current.key, name: current.name },
  });
  return { ok: true };
}
