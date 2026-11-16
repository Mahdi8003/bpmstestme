import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  BLANK_DEFINITION,
  CASE_TYPE_TEMPLATES,
  checkCaseTypeHealth,
  getTemplate,
  slugifyKey,
  type CaseTypeDefinition,
  type CaseTypeDetail,
  type CaseTypeSummary,
  type FieldDef,
  type TemplateSummary,
} from '@ravand/shared';
import { db } from '../../db/client.js';
import { caseTypeVersions, caseTypes, cases, masterDataTypes, users } from '../../db/schema.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';
import { hasPermission, type AuthContext } from '../../lib/auth.js';
import { tenantActiveUserIds, tenantRoleKeys } from '../roles/service.js';

function toSummary(row: {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  referencePrefix: string;
  status: 'draft' | 'published' | 'archived';
  version: number;
  updatedAt: Date;
  publishedAt: Date | null;
  ownerId: string | null;
  ownerName: string | null;
  definition: CaseTypeDefinition;
  publishedDefinition: CaseTypeDefinition | null;
  caseCount: number;
}): CaseTypeSummary {
  const hasDraftChanges =
    !row.publishedDefinition ||
    JSON.stringify(row.definition) !== JSON.stringify(row.publishedDefinition);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    referencePrefix: row.referencePrefix,
    status: row.status,
    version: row.version,
    caseCount: Number(row.caseCount),
    hasDraftChanges,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
  };
}

const listSelection = {
  id: caseTypes.id,
  key: caseTypes.key,
  name: caseTypes.name,
  description: caseTypes.description,
  icon: caseTypes.icon,
  referencePrefix: caseTypes.referencePrefix,
  status: caseTypes.status,
  version: caseTypes.version,
  definition: caseTypes.definition,
  updatedAt: caseTypes.updatedAt,
  publishedAt: caseTypes.publishedAt,
  ownerId: caseTypes.ownerId,
  ownerName: users.name,
  publishedDefinition: caseTypeVersions.definition,
  caseCount: sql<number>`(select count(*)::int from cases where cases.tenant_id = ${caseTypes.tenantId} and cases.case_type_id = ${caseTypes.id})`,
};

export async function listCaseTypes(auth: AuthContext): Promise<CaseTypeSummary[]> {
  const rows = await db
    .select(listSelection)
    .from(caseTypes)
    .leftJoin(users, eq(users.id, caseTypes.ownerId))
    .leftJoin(caseTypeVersions, eq(caseTypeVersions.id, caseTypes.publishedVersionId))
    .where(eq(caseTypes.tenantId, auth.tenantId))
    .orderBy(desc(caseTypes.updatedAt));

  return rows.map(toSummary);
}

function canBuild(auth: AuthContext): boolean {
  return hasPermission(auth, 'buildProcesses');
}

function assertCanManage(auth: AuthContext, ownerId: string | null): void {
  if (auth.user.role === 'admin') return;
  if (ownerId && ownerId === auth.userId) return;
  throw forbidden('فقط مالک فرآیند یا مدیر سیستم می‌تواند آن را تغییر دهد.');
}

export async function getCaseType(
  auth: AuthContext,
  id: string,
): Promise<CaseTypeDetail> {
  const rows = await db
    .select(listSelection)
    .from(caseTypes)
    .leftJoin(users, eq(users.id, caseTypes.ownerId))
    .leftJoin(caseTypeVersions, eq(caseTypeVersions.id, caseTypes.publishedVersionId))
    .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('فرآیند پیدا نشد.');
  if (!canBuild(auth) && row.status !== 'published') {
    throw notFound('فرآیند پیدا نشد.');
  }
  return { ...toSummary(row), definition: row.definition };
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  return CASE_TYPE_TEMPLATES;
}

function uniqueKey(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`;
}

async function uniqueReferencePrefix(auth: AuthContext, base: string): Promise<string> {
  const rows = await db
    .select({ referencePrefix: caseTypes.referencePrefix })
    .from(caseTypes)
    .where(eq(caseTypes.tenantId, auth.tenantId));
  const taken = new Set(rows.map((row) => row.referencePrefix.toUpperCase()));
  const root = base.toUpperCase().slice(0, 8) || 'CASE';
  let candidate = root;
  let index = 2;
  while (taken.has(candidate)) {
    const suffix = String(index);
    candidate = `${root.slice(0, Math.max(1, 8 - suffix.length))}${suffix}`;
    index += 1;
  }
  return candidate;
}

async function assertMasterFieldTypes(
  auth: AuthContext,
  definition: CaseTypeDefinition,
): Promise<void> {
  const referenced: FieldDef[] = [];
  const visit = (fields: FieldDef[]): void => {
    for (const field of fields) {
      if (field.type === 'master') referenced.push(field);
      if (field.type === 'table') visit(field.columns ?? []);
    }
  };
  visit(definition.fields);
  for (const stage of definition.stages) visit(stage.fields ?? []);
  if (!referenced.length) return;
  for (const field of referenced) {
    if (!field.masterTypeKey) {
      throw badRequest(`نوع داده پایه مقصد برای فیلد «${field.label}» انتخاب نشده است.`);
    }
  }
  const keys = [...new Set(referenced.map((field) => field.masterTypeKey!))];
  const rows = await db
    .select({ key: masterDataTypes.key, name: masterDataTypes.name, entity: masterDataTypes.entity })
    .from(masterDataTypes)
    .where(
      and(eq(masterDataTypes.tenantId, auth.tenantId), inArray(masterDataTypes.key, keys)),
    );
  for (const key of keys) {
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) {
      throw badRequest(`نوع داده پایه «${key}» در دسترس نیست.`);
    }
    if (row.entity !== 'custom') {
      const fields = referenced.filter((field) => field.masterTypeKey === key);
      throw badRequest(
        `دادهٔ پایهٔ «${row.name}» سیستمی است و در فرم پرونده با فیلد «${fields[0]?.label ?? key}» انتخاب نمی شود؛ برای داده های سفارشی یک نوع داده در بخش «داده های پایه» بسازید.`,
      );
    }
  }
}

export async function createCaseType(
  auth: AuthContext,
  input: {
    name: string;
    description?: string;
    icon: string;
    templateKey?: string;
    referencePrefix?: string;
    definition?: CaseTypeDefinition;
  },
): Promise<CaseTypeDetail> {
  const template = input.templateKey ? getTemplate(input.templateKey) : undefined;
  if (input.templateKey && !template) throw badRequest('قالب انتخاب‌شده معتبر نیست.');
  const definition = structuredClone(
    input.definition ?? template?.definition ?? BLANK_DEFINITION,
  );
  await assertMasterFieldTypes(auth, definition);
  const slug = slugifyKey(input.name) || 'case';
  const key = uniqueKey(slug);
  const fallbackPrefix =
    template?.referencePrefix ??
    (slug.replace(/[^a-z]/g, '').slice(0, 4).toUpperCase() || 'CASE');
  const prefix = await uniqueReferencePrefix(auth, input.referencePrefix ?? fallbackPrefix);

  const [created] = await db
    .insert(caseTypes)
    .values({
      tenantId: auth.tenantId,
      key,
      name: input.name,
      description: input.description ?? '',
      icon: input.icon,
      referencePrefix: prefix,
      status: 'draft',
      definition,
      ownerId: auth.userId,
      createdBy: auth.userId,
    })
    .returning({ id: caseTypes.id });

  if (!created) throw new AppError(500, 'ایجاد فرآیند ناموفق بود.');
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'case_type.created',
    entityType: 'case_type',
    entityId: created.id,
    after: { name: input.name, templateKey: input.templateKey ?? null },
  });
  return getCaseType(auth, created.id);
}

export async function updateCaseType(
  auth: AuthContext,
  id: string,
  input: {
    name?: string;
    description?: string;
    icon?: string;
    referencePrefix?: string;
    ownerId?: string | null;
    definition?: CaseTypeDefinition;
  },
): Promise<CaseTypeDetail> {
  const current = await db
    .select()
    .from(caseTypes)
    .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)))
    .limit(1);
  const row = current[0];
  if (!row) throw notFound('فرآیند پیدا نشد.');
  assertCanManage(auth, row.ownerId);
  if (row.status === 'archived') throw badRequest('فرآیند بایگانی‌شده قابل ویرایش نیست.');
  if (input.definition) await assertMasterFieldTypes(auth, input.definition);

  const nextPrefix = input.referencePrefix?.toUpperCase() ?? row.referencePrefix;
  if (nextPrefix !== row.referencePrefix) {
    const duplicate = await db
      .select({ id: caseTypes.id })
      .from(caseTypes)
      .where(
        and(
          eq(caseTypes.tenantId, auth.tenantId),
          eq(caseTypes.referencePrefix, nextPrefix),
        ),
      )
      .limit(1);
    if (duplicate[0] && duplicate[0].id !== id) {
      throw conflict('این پیشوند شمارهٔ پرونده قبلاً استفاده شده است.');
    }
  }

  let ownerId = input.ownerId !== undefined ? input.ownerId : row.ownerId;
  if (input.ownerId) {
    const ownerRows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.ownerId),
          eq(users.tenantId, auth.tenantId),
          eq(users.isActive, true),
        ),
      )
      .limit(1);
    if (!ownerRows[0]) {
      throw badRequest('کاربر انتخاب‌شده برای مالکیت فرآیند فعال نیست.');
    }
  }
  if (!ownerId && auth.user.role !== 'admin') ownerId = row.ownerId;

  await db
    .update(caseTypes)
    .set({
      name: input.name ?? row.name,
      description: input.description ?? row.description,
      icon: input.icon ?? row.icon,
      referencePrefix: nextPrefix,
      ownerId,
      definition: input.definition ?? row.definition,
      updatedAt: new Date(),
    })
    .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)));

  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'case_type.updated',
    entityType: 'case_type',
    entityId: id,
    before: { name: row.name },
    after: { name: input.name ?? row.name },
  });
  return getCaseType(auth, id);
}

export async function healthCheck(
  auth: AuthContext,
  id: string,
  definition?: CaseTypeDefinition,
) {
  let target = definition;
  if (!target) {
    const rows = await db
      .select({ definition: caseTypes.definition })
      .from(caseTypes)
      .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)))
      .limit(1);
    if (!rows[0]) throw notFound('فرآیند پیدا نشد.');
    target = rows[0].definition;
  }
  const [knownRoles, knownUserIds] = await Promise.all([
    tenantRoleKeys(auth.tenantId),
    tenantActiveUserIds(auth.tenantId),
  ]);
  return checkCaseTypeHealth(target, { knownRoles, knownUserIds });
}

export async function publishCaseType(
  auth: AuthContext,
  id: string,
): Promise<CaseTypeDetail> {
  const [knownRoles, knownUserIds] = await Promise.all([
    tenantRoleKeys(auth.tenantId),
    tenantActiveUserIds(auth.tenantId),
  ]);
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(caseTypes)
      .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)))
      .for('update')
      .limit(1);
    const row = rows[0];
    if (!row) throw notFound('فرآیند پیدا نشد.');
    assertCanManage(auth, row.ownerId);
    if (row.status === 'archived') throw badRequest('فرآیند بایگانی‌شده قابل انتشار نیست.');

    const health = checkCaseTypeHealth(row.definition, { knownRoles, knownUserIds });
    if (!health.ok) {
      throw badRequest('فرآیند هنوز ایرادهای لازم برای انتشار را دارد.', health.issues);
    }

    const version = row.version + 1;
    const [published] = await tx
      .insert(caseTypeVersions)
      .values({
        caseTypeId: row.id,
        tenantId: auth.tenantId,
        version,
        definition: row.definition,
        publishedBy: auth.userId,
      })
      .returning({ id: caseTypeVersions.id });
    if (!published) throw new AppError(500, 'انتشار فرآیند ناموفق بود.');

    await tx
      .update(caseTypes)
      .set({
        status: 'published',
        version,
        publishedVersionId: published.id,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)));

    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'case_type.published',
      entityType: 'case_type',
      entityId: id,
      after: { version },
    });
  });
  return getCaseType(auth, id);
}

export async function duplicateCaseType(
  auth: AuthContext,
  id: string,
): Promise<CaseTypeDetail> {
  const source = await getCaseType(auth, id);
  return createCaseType(auth, {
    name: `${source.name} (کپی)`,
    description: source.description,
    icon: source.icon,
    referencePrefix: source.referencePrefix,
    definition: source.definition,
  });
}

export async function archiveCaseType(
  auth: AuthContext,
  id: string,
): Promise<CaseTypeDetail> {
  const rows = await db
    .select({ id: caseTypes.id, ownerId: caseTypes.ownerId })
    .from(caseTypes)
    .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)))
    .limit(1);
  if (!rows[0]) throw notFound('فرآیند پیدا نشد.');
  assertCanManage(auth, rows[0].ownerId);
  await db
    .update(caseTypes)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, auth.tenantId)));
  return getCaseType(auth, id);
}

export async function publishedTypeForCase(
  auth: AuthContext,
  caseTypeId: string,
): Promise<{
  caseType: typeof caseTypes.$inferSelect;
  version: typeof caseTypeVersions.$inferSelect;
}> {
  const rows = await db
    .select({ caseType: caseTypes, version: caseTypeVersions })
    .from(caseTypes)
    .innerJoin(caseTypeVersions, eq(caseTypeVersions.id, caseTypes.publishedVersionId))
    .where(and(eq(caseTypes.id, caseTypeId), eq(caseTypes.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw badRequest('این فرآیند منتشر نشده یا در دسترس نیست.');
  if (row.caseType.status !== 'published') throw badRequest('این فرآیند منتشر نشده است.');
  return row;
}

export async function caseTypeStats(auth: AuthContext) {
  const rows = await db
    .select({
      id: caseTypes.id,
      name: caseTypes.name,
      icon: caseTypes.icon,
      status: caseTypes.status,
      total: sql<number>`count(${cases.id})::int`,
    })
    .from(caseTypes)
    .leftJoin(cases, eq(cases.caseTypeId, caseTypes.id))
    .where(eq(caseTypes.tenantId, auth.tenantId))
    .groupBy(caseTypes.id, caseTypes.name, caseTypes.icon, caseTypes.status);
  return rows;
}
