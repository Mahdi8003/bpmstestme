import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import {
  validateCaseData,
  type FieldDef,
  type ItemDto,
  type MasterDataRecordDto,
  type MasterDataTypeDto,
  type MasterOptionsDto,
  type PartyDto,
  type UserSummary,
  type WarehouseDto,
} from '@ravand/shared';
import { db } from '../../db/client.js';
import {
  cases,
  caseTypes,
  items,
  masterDataRecords,
  masterDataTypes,
  parties,
  stockMovements,
  users,
  warehouses,
} from '../../db/schema.js';
import { writeAudit } from '../../lib/audit.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../../lib/auth.js';
import { MASTER_TYPE_SEEDS, coreFieldKeys } from './registry.js';

type MasterTypeRow = typeof masterDataTypes.$inferSelect;
type MasterRecordRow = typeof masterDataRecords.$inferSelect;

type RecordQuery = { q?: string; limit: number; offset?: number };

const MOVEMENT_LABELS: Record<string, string> = {
  in: 'ورود',
  out: 'خروج',
  adjust: 'اصلاح موجودی',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSystemEntity(entity: string): boolean {
  return entity !== 'custom';
}

function definitionUsesMasterType(
  definition: { fields: FieldDef[]; stages: { fields?: FieldDef[] }[] },
  typeKey: string,
): boolean {
  const visit = (fields: FieldDef[]): boolean =>
    fields.some(
      (field) =>
        (field.type === 'master' && field.masterTypeKey === typeKey) ||
        (field.type === 'table' && visit(field.columns ?? [])),
    );
  return (
    visit(definition.fields) ||
    definition.stages.some((stage) => visit(stage.fields ?? []))
  );
}

function recordIsUsedInData(data: Record<string, unknown>, recordId: string): boolean {
  return Object.values(data).some((value) => {
    if (value === recordId) return true;
    if (Array.isArray(value)) {
      return value.some(
        (row) =>
          Boolean(row) &&
          typeof row === 'object' &&
          Object.values(row as Record<string, unknown>).includes(recordId),
      );
    }
    return false;
  });
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    if (typeof value === 'number') return String(value);
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function textOrEmpty(value: unknown): string {
  return textOrNull(value) ?? '';
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Type provisioning                                                   */
/* ------------------------------------------------------------------ */

/** Creates the built-in data types of a tenant the first time they are needed. */
export async function ensureMasterTypes(tenantId: string): Promise<void> {
  const existing = await db
    .select({ key: masterDataTypes.key })
    .from(masterDataTypes)
    .where(eq(masterDataTypes.tenantId, tenantId));
  const keys = new Set(existing.map((row) => row.key));
  const missing = MASTER_TYPE_SEEDS.filter((seed) => !keys.has(seed.key));
  if (!missing.length) return;
  await db
    .insert(masterDataTypes)
    .values(
      missing.map((seed) => ({
        tenantId,
        key: seed.key,
        name: seed.name,
        description: seed.description,
        icon: seed.icon,
        entity: seed.entity,
        isSystem: seed.isSystem,
        isHierarchical: seed.isHierarchical,
        sortOrder: seed.sortOrder,
        fields: seed.fields,
        titleField: seed.titleField,
      })),
    )
    .onConflictDoNothing();
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

function masterTypeDto(row: MasterTypeRow, recordCount: number): MasterDataTypeDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    entity: row.entity,
    isSystem: row.isSystem,
    isHierarchical: row.isHierarchical,
    sortOrder: row.sortOrder,
    fields: row.fields,
    titleField: row.titleField,
    recordCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function countRecords(auth: AuthContext): Promise<{
  byType: Map<string, number>;
  byEntity: Map<string, number>;
}> {
  const [customRows, partyRows, itemRows, warehouseRows, movementRows] = await Promise.all([
    db
      .select({ typeId: masterDataRecords.typeId, count: sql<number>`count(*)::int` })
      .from(masterDataRecords)
      .where(eq(masterDataRecords.tenantId, auth.tenantId))
      .groupBy(masterDataRecords.typeId),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(parties)
      .where(eq(parties.tenantId, auth.tenantId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(items)
      .where(eq(items.tenantId, auth.tenantId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(warehouses)
      .where(eq(warehouses.tenantId, auth.tenantId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(eq(stockMovements.tenantId, auth.tenantId)),
  ]);
  const byType = new Map<string, number>();
  for (const row of customRows) byType.set(row.typeId, Number(row.count ?? 0));
  const byEntity = new Map<string, number>();
  byEntity.set('party', Number(partyRows[0]?.count ?? 0));
  byEntity.set('item', Number(itemRows[0]?.count ?? 0));
  byEntity.set('warehouse', Number(warehouseRows[0]?.count ?? 0));
  byEntity.set('movement', Number(movementRows[0]?.count ?? 0));
  return { byType, byEntity };
}

export async function listMasterDataTypes(auth: AuthContext): Promise<MasterDataTypeDto[]> {
  await ensureMasterTypes(auth.tenantId);
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(masterDataTypes)
      .where(eq(masterDataTypes.tenantId, auth.tenantId))
      .orderBy(masterDataTypes.sortOrder, masterDataTypes.name),
    countRecords(auth),
  ]);
  return rows.map((row) =>
    masterTypeDto(
      row,
      isSystemEntity(row.entity)
        ? (counts.byEntity.get(row.entity) ?? 0)
        : (counts.byType.get(row.id) ?? 0),
    ),
  );
}

async function getTypeRow(auth: AuthContext, id: string): Promise<MasterTypeRow> {
  await ensureMasterTypes(auth.tenantId);
  const rows = await db
    .select()
    .from(masterDataTypes)
    .where(and(eq(masterDataTypes.id, id), eq(masterDataTypes.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('نوع داده پایه پیدا نشد.');
  return row;
}

async function getTypeRowByKey(auth: AuthContext, key: string): Promise<MasterTypeRow | null> {
  const rows = await db
    .select()
    .from(masterDataTypes)
    .where(and(eq(masterDataTypes.key, key), eq(masterDataTypes.tenantId, auth.tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMasterDataType(
  auth: AuthContext,
  id: string,
): Promise<MasterDataTypeDto> {
  const row = await getTypeRow(auth, id);
  const counts = await countRecords(auth);
  return masterTypeDto(
    row,
    isSystemEntity(row.entity)
      ? (counts.byEntity.get(row.entity) ?? 0)
      : (counts.byType.get(row.id) ?? 0),
  );
}

const RESERVED_MASTER_KEYS = new Set(['party', 'item', 'warehouse', 'movement', 'user', 'item_category']);

async function assertValidTypeFields(
  auth: AuthContext,
  fields: FieldDef[],
  selfKey: string,
): Promise<void> {
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) {
      throw badRequest(`کلید فیلد «${field.key}» تکراری است.`);
    }
    keys.add(field.key);
    if (field.visibleWhen && !fields.some((candidate) => candidate.key === field.visibleWhen!.field)) {
      throw badRequest(`شرط نمایش فیلد «${field.label}» به فیلد ناموجود اشاره می‌کند.`);
    }
    if (['select', 'radio', 'multiselect'].includes(field.type)) {
      const options = field.options ?? [];
      if (!options.length) {
        throw badRequest(`برای فیلد «${field.label}» حداقل یک گزینه تعریف کنید.`);
      }
      const values = new Set<string>();
      for (const option of options) {
        if (values.has(option.value)) {
          throw badRequest(`مقدار گزینه‌های فیلد «${field.label}» باید یکتا باشد.`);
        }
        values.add(option.value);
      }
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      throw badRequest(`حداقل و حداکثر فیلد «${field.label}» معتبر نیست.`);
    }
    if (field.type === 'rollup') {
      const spec = field.rollup;
      if (!spec || !spec.sourceTypeKey) {
        throw badRequest(`برای فیلد «${field.label}» نوع داده منبع را انتخاب کنید.`);
      }
      const source = await getTypeRowByKey(auth, spec.sourceTypeKey);
      if (!source) {
        throw badRequest(`نوع داده منبع فیلد «${field.label}» پیدا نشد.`);
      }
      if (!source.fields.some((candidate) => candidate.key === spec.referenceField)) {
        throw badRequest(`فیلد ارجاع فیلد «${field.label}» در نوع داده منبع پیدا نشد.`);
      }
      if (spec.op !== 'count') {
        const valueField = source.fields.find(
          (candidate) => candidate.key === spec.valueField,
        );
        if (!valueField || !['number', 'currency'].includes(valueField.type)) {
          throw badRequest(
            `فیلد مقدار «${field.label}» باید در نوع داده منبع، عددی یا مبلغ باشد.`,
          );
        }
      }
      continue;
    }
    if (field.type !== 'master') continue;
    if (!field.masterTypeKey) {
      throw badRequest(`برای فیلد «${field.label}» نوع داده پایه مقصد را انتخاب کنید.`);
    }
    if (field.masterTypeKey === selfKey) continue;
    const referenced = await getTypeRowByKey(auth, field.masterTypeKey);
    if (!referenced) {
      throw badRequest(`نوع داده پایه «${field.masterTypeKey}» پیدا نشد.`);
    }
    if (isSystemEntity(referenced.entity)) {
      throw badRequest(
        `فیلد «${field.label}» نمی‌تواند به «${referenced.name}» اشاره کند؛ برای این نوع از فیلد مخصوص خودش استفاده کنید.`,
      );
    }
  }
}

export async function createMasterDataType(
  auth: AuthContext,
  input: {
    key: string;
    name: string;
    description?: string;
    icon?: string;
    titleField?: string | null;
    isHierarchical?: boolean;
    sortOrder?: number;
    fields: FieldDef[];
  },
): Promise<MasterDataTypeDto> {
  await ensureMasterTypes(auth.tenantId);
  const key = input.key.trim();
  if (RESERVED_MASTER_KEYS.has(key)) {
    throw badRequest('این کلید برای داده‌های پایه سیستمی رزرو شده است.');
  }
  const existing = await getTypeRowByKey(auth, key);
  if (existing) throw conflict('کلید نوع داده قبلاً استفاده شده است.');
  if (input.titleField && !input.fields.some((field) => field.key === input.titleField)) {
    throw badRequest('فیلد عنوان باید یکی از فیلدهای همین نوع باشد.');
  }
  await assertValidTypeFields(auth, input.fields, key);

  const [created] = await db
    .insert(masterDataTypes)
    .values({
      tenantId: auth.tenantId,
      key,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      icon: input.icon?.trim() || 'database',
      entity: 'custom',
      isSystem: false,
      isHierarchical: input.isHierarchical ?? false,
      sortOrder: input.sortOrder ?? 200,
      fields: input.fields,
      titleField: input.titleField || null,
      createdBy: auth.userId,
    })
    .returning({ id: masterDataTypes.id });
  if (!created) throw notFound();

  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'master_type.created',
    entityType: 'master_type',
    entityId: created.id,
    after: { key, name: input.name },
  });
  return getMasterDataType(auth, created.id);
}

export async function updateMasterDataType(
  auth: AuthContext,
  id: string,
  input: {
    name?: string;
    description?: string;
    icon?: string;
    titleField?: string | null;
    isHierarchical?: boolean;
    sortOrder?: number;
    fields?: FieldDef[];
  },
): Promise<MasterDataTypeDto> {
  const current = await getTypeRow(auth, id);
  const fields = input.fields ?? current.fields;

  if (input.fields) {
    const nextByKey = new Map(fields.map((field) => [field.key, field]));
    for (const locked of current.fields.filter((field) => field.locked)) {
      const next = nextByKey.get(locked.key);
      if (!next) {
        throw badRequest(`فیلد سیستمی «${locked.label}» را نمی‌توان حذف کرد.`);
      }
      if (next.type !== locked.type) {
        throw badRequest(`نوع فیلد سیستمی «${locked.label}» قابل تغییر نیست.`);
      }
      if (locked.type === 'master' && next.masterTypeKey !== locked.masterTypeKey) {
        throw badRequest(`نوع داده مرجع فیلد «${locked.label}» قابل تغییر نیست.`);
      }
    }
  }

  if (input.titleField && !fields.some((field) => field.key === input.titleField)) {
    throw badRequest('فیلد عنوان باید یکی از فیلدهای همین نوع باشد.');
  }
  await assertValidTypeFields(auth, fields, current.key);

  const [updated] = await db
    .update(masterDataTypes)
    .set({
      name: input.name?.trim() ?? current.name,
      description: input.description?.trim() ?? current.description,
      icon: input.icon?.trim() || current.icon,
      isHierarchical: input.isHierarchical ?? current.isHierarchical,
      sortOrder: input.sortOrder ?? current.sortOrder,
      fields,
      titleField: input.titleField !== undefined ? input.titleField || null : current.titleField,
      updatedAt: new Date(),
    })
    .where(and(eq(masterDataTypes.id, id), eq(masterDataTypes.tenantId, auth.tenantId)))
    .returning({ id: masterDataTypes.id });
  if (!updated) throw notFound();

  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'master_type.updated',
    entityType: 'master_type',
    entityId: id,
    before: { name: current.name },
    after: { name: input.name ?? current.name },
  });
  return getMasterDataType(auth, id);
}

export async function deleteMasterDataType(auth: AuthContext, id: string): Promise<void> {
  const current = await getTypeRow(auth, id);
  if (current.isSystem || isSystemEntity(current.entity)) {
    throw badRequest('نوع داده‌های پایه سیستمی قابل حذف نیستند.');
  }
  const referencingTypes = await db
    .select({ name: masterDataTypes.name, fields: masterDataTypes.fields })
    .from(masterDataTypes)
    .where(eq(masterDataTypes.tenantId, auth.tenantId));
  const referencedBy = referencingTypes.find((row) =>
    row.fields.some(
      (field) => field.type === 'master' && field.masterTypeKey === current.key,
    ),
  );
  if (referencedBy) {
    throw conflict(
      `این نوع داده در تعریف «${referencedBy.name}» استفاده شده است و قابل حذف نیست.`,
    );
  }
  const usedInRollup = referencingTypes.find((row) =>
    row.fields.some(
      (field) => field.type === 'rollup' && field.rollup?.sourceTypeKey === current.key,
    ),
  );
  if (usedInRollup) {
    throw conflict(
      `این نوع داده در محاسبهٔ «${usedInRollup.name}» استفاده شده است و قابل حذف نیست.`,
    );
  }
  const processRows = await db
    .select({ name: caseTypes.name, definition: caseTypes.definition })
    .from(caseTypes)
    .where(eq(caseTypes.tenantId, auth.tenantId));
  const usedInProcess = processRows.find((row) =>
    definitionUsesMasterType(row.definition, current.key),
  );
  if (usedInProcess) {
    throw conflict(
      `این نوع داده در فرم فرآیند «${usedInProcess.name}» استفاده شده است و قابل حذف نیست.`,
    );
  }
  const typeRecords = await db
    .select({ id: masterDataRecords.id })
    .from(masterDataRecords)
    .where(
      and(eq(masterDataRecords.tenantId, auth.tenantId), eq(masterDataRecords.typeId, id)),
    );
  const recordIds = typeRecords.map((row) => row.id);
  if (recordIds.length) {
    const categoryOwner = await db
      .select({ name: items.name })
      .from(items)
      .where(and(eq(items.tenantId, auth.tenantId), inArray(items.category, recordIds)))
      .limit(1);
    if (categoryOwner[0]) {
      throw conflict(
        `این نوع داده در کالای «${categoryOwner[0].name}» استفاده شده است و قابل حذف نیست.`,
      );
    }
    const candidates = await db
      .select({ title: cases.title, reference: cases.reference, data: cases.data })
      .from(cases)
      .where(
        and(
          eq(cases.tenantId, auth.tenantId),
          sql`${cases.data}::text ~* ${recordIds.join('|')}`,
        ),
      )
      .limit(20);
    const owningCase = candidates.find((row) =>
      recordIds.some((recordId) =>
        recordIsUsedInData(row.data as Record<string, unknown>, recordId),
      ),
    );
    if (owningCase) {
      throw conflict(
        `این نوع داده در پرونده «${owningCase.title}» (${owningCase.reference}) استفاده شده است و قابل حذف نیست.`,
      );
    }
  }
  await db
    .delete(masterDataTypes)
    .where(and(eq(masterDataTypes.id, id), eq(masterDataTypes.tenantId, auth.tenantId)));
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'master_type.deleted',
    entityType: 'master_type',
    entityId: id,
    before: { key: current.key, name: current.name },
  });
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

function recordDto(
  type: MasterTypeRow,
  id: string,
  title: string,
  data: Record<string, unknown>,
  createdAt: Date,
  updatedAt: Date,
): MasterDataRecordDto {
  return {
    id,
    typeId: type.id,
    typeKey: type.key,
    typeName: type.name,
    typeEntity: type.entity,
    title,
    data,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function sanitizeRecordData(
  fields: FieldDef[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const field of fields) {
    if (data[field.key] !== undefined) clean[field.key] = data[field.key];
  }
  return clean;
}

function coerceNumbers(
  fields: FieldDef[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...data };
  for (const field of fields) {
    const value = next[field.key];
    if (field.type !== 'number' && field.type !== 'currency') continue;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) next[field.key] = parsed;
    }
  }
  return next;
}

function normalizeRecordData(
  fields: FieldDef[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const clean = sanitizeRecordData(fields, coerceNumbers(fields, data));
  for (const field of fields) {
    if (field.type === 'rollup') delete clean[field.key];
  }
  return clean;
}

function recordTitle(
  type: Pick<MasterTypeRow, 'titleField' | 'fields'>,
  data: Record<string, unknown>,
  fallbackId: string,
): string {
  const candidates: unknown[] = [];
  if (type.titleField) candidates.push(data[type.titleField]);
  for (const field of type.fields) {
    if (['text', 'textarea', 'email', 'phone', 'url', 'select', 'radio'].includes(field.type)) {
      candidates.push(data[field.key]);
    }
  }
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
    if (typeof value === 'number') return String(value);
  }
  return `رکورد ${fallbackId.slice(0, 8)}`;
}

function extraFields(type: MasterTypeRow, data: Record<string, unknown>): Record<string, unknown> {
  const core = new Set(coreFieldKeys(type.entity));
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (core.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    extra[key] = value;
  }
  return extra;
}

function partyProjection(row: typeof parties.$inferSelect, type: MasterTypeRow) {
  return sanitizeRecordData(type.fields, {
    name: row.name,
    code: row.code,
    kind: row.kind,
    email: row.email ?? '',
    phone: row.phone ?? '',
    taxId: row.taxId ?? '',
    address: row.address ?? '',
    ...(row.extra ?? {}),
  });
}

function itemProjection(
  row: typeof items.$inferSelect,
  type: MasterTypeRow,
  stock?: number,
): Record<string, unknown> {
  const clean = sanitizeRecordData(type.fields, {
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    category: row.category ?? '',
    unitCost: Number(row.unitCost),
    reorderPoint: Number(row.reorderPoint),
    active: row.active,
    ...(row.extra ?? {}),
  });
  if (typeof stock === 'number') clean.stock = stock;
  return clean;
}

function warehouseProjection(row: typeof warehouses.$inferSelect, type: MasterTypeRow) {
  return sanitizeRecordData(type.fields, {
    name: row.name,
    code: row.code,
    location: row.location ?? '',
    ...(row.extra ?? {}),
  });
}

function movementProjection(
  row: typeof stockMovements.$inferSelect,
  type: MasterTypeRow,
) {
  return sanitizeRecordData(type.fields, {
    item: row.itemId,
    warehouse: row.warehouseId,
    type: row.type,
    quantity: Number(row.quantity),
    reference: row.reference ?? '',
    note: row.note ?? '',
    ...(row.extra ?? {}),
  });
}

function likeTerm(q: string): string {
  return `%${q.trim()}%`;
}

async function listSystemRecords(
  auth: AuthContext,
  type: MasterTypeRow,
  query: RecordQuery,
): Promise<MasterDataRecordDto[]> {
  const term = query.q?.trim() ? likeTerm(query.q) : null;
  const offset = query.offset ?? 0;

  if (type.entity === 'party') {
    const conditions = [eq(parties.tenantId, auth.tenantId)];
    if (term) {
      const search = or(
        ilike(parties.name, term),
        ilike(parties.code, term),
        ilike(parties.phone, term),
        ilike(parties.email, term),
      );
      if (search) conditions.push(search);
    }
    const rows = await db
      .select()
      .from(parties)
      .where(and(...conditions))
      .orderBy(desc(parties.createdAt))
      .limit(query.limit)
      .offset(offset);
    return rows.map((row) =>
      recordDto(
        type,
        row.id,
        row.name,
        partyProjection(row, type),
        row.createdAt,
        row.createdAt,
      ),
    );
  }

  if (type.entity === 'item') {
    const conditions = [eq(items.tenantId, auth.tenantId)];
    if (term) {
      const search = or(ilike(items.name, term), ilike(items.sku, term));
      if (search) conditions.push(search);
    }
    const rows = await db
      .select({
        item: items,
        stock: sql<number>`coalesce((select sum(case when ${stockMovements.type} = 'out' then -${stockMovements.quantity} else ${stockMovements.quantity} end) from ${stockMovements} where ${stockMovements.itemId} = ${items.id} and ${stockMovements.tenantId} = ${items.tenantId}), 0)::float`,
      })
      .from(items)
      .where(and(...conditions))
      .orderBy(desc(items.createdAt))
      .limit(query.limit)
      .offset(offset);
    return rows.map((row) =>
      recordDto(
        type,
        row.item.id,
        row.item.name,
        itemProjection(row.item, type, Number(row.stock ?? 0)),
        row.item.createdAt,
        row.item.createdAt,
      ),
    );
  }

  if (type.entity === 'warehouse') {
    const conditions = [eq(warehouses.tenantId, auth.tenantId)];
    if (term) {
      const search = or(
        ilike(warehouses.name, term),
        ilike(warehouses.code, term),
        ilike(warehouses.location, term),
      );
      if (search) conditions.push(search);
    }
    const rows = await db
      .select()
      .from(warehouses)
      .where(and(...conditions))
      .orderBy(warehouses.name)
      .limit(query.limit)
      .offset(offset);
    return rows.map((row) =>
      recordDto(
        type,
        row.id,
        row.name,
        warehouseProjection(row, type),
        row.createdAt,
        row.createdAt,
      ),
    );
  }

  if (type.entity === 'movement') {
    const conditions = [eq(stockMovements.tenantId, auth.tenantId)];
    if (term) {
      const search = or(
        ilike(stockMovements.reference, term),
        ilike(stockMovements.note, term),
        ilike(items.name, term),
        ilike(warehouses.name, term),
      );
      if (search) conditions.push(search);
    }
    const rows = await db
      .select({
        movement: stockMovements,
        itemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(stockMovements)
      .innerJoin(items, eq(items.id, stockMovements.itemId))
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .where(and(...conditions))
      .orderBy(desc(stockMovements.createdAt))
      .limit(query.limit)
      .offset(offset);
    return rows.map(({ movement, itemName, warehouseName }) =>
      recordDto(
        type,
        movement.id,
        `${itemName} — ${MOVEMENT_LABELS[movement.type] ?? movement.type} در ${warehouseName}`,
        movementProjection(movement, type),
        movement.createdAt,
        movement.createdAt,
      ),
    );
  }

  return [];
}

async function listRecordsForType(
  auth: AuthContext,
  type: MasterTypeRow,
  query: RecordQuery,
): Promise<MasterDataRecordDto[]> {
  if (isSystemEntity(type.entity)) return listSystemRecords(auth, type, query);

  const conditions = [
    eq(masterDataRecords.tenantId, auth.tenantId),
    eq(masterDataRecords.typeId, type.id),
  ];
  if (query.q?.trim()) {
    conditions.push(ilike(masterDataRecords.title, likeTerm(query.q)));
  }
  const rows = await db
    .select()
    .from(masterDataRecords)
    .where(and(...conditions))
    .orderBy(desc(masterDataRecords.updatedAt))
    .limit(query.limit)
    .offset(query.offset ?? 0);
  return rows.map((row) => customRecordDto(row, type));
}

function customRecordDto(row: MasterRecordRow, type: MasterTypeRow): MasterDataRecordDto {
  return recordDto(
    type,
    row.id,
    row.title,
    sanitizeRecordData(type.fields, row.data),
    row.createdAt,
    row.updatedAt,
  );
}

export async function listMasterDataRecords(
  auth: AuthContext,
  typeId: string,
  query: RecordQuery,
): Promise<MasterDataRecordDto[]> {
  const type = await getTypeRow(auth, typeId);
  const records = await listRecordsForType(auth, type, query);
  return applyRollups(auth, type, records);
}

/**
 * Computes `rollup` fields of a type from the records of another type. Values are
 * derived on read and never stored, so they cannot drift from the source data.
 */
async function applyRollups(
  auth: AuthContext,
  type: MasterTypeRow,
  records: MasterDataRecordDto[],
): Promise<MasterDataRecordDto[]> {
  const rollupFields = type.fields.filter((field) => field.type === 'rollup' && field.rollup);
  if (!rollupFields.length || !records.length) return records;

  for (const field of rollupFields) {
    const spec = field.rollup!;
    const sourceType = await getTypeRowByKey(auth, spec.sourceTypeKey);
    if (!sourceType) continue;
    const sourceRecords = await listRecordsForType(auth, sourceType, { limit: 5000 });
    const buckets = new Map<string, number[]>();

    for (const source of sourceRecords) {
      const reference = source.data[spec.referenceField];
      if (typeof reference !== 'string' || !reference) continue;
      let value = 1;
      if (spec.op !== 'count') {
        const raw = spec.valueField ? source.data[spec.valueField] : undefined;
        const numeric = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(numeric)) continue;
        value = numeric;
      }
      const bucket = buckets.get(reference);
      if (bucket) bucket.push(value);
      else buckets.set(reference, [value]);
    }

    for (const record of records) {
      const values = buckets.get(record.id) ?? [];
      let result = 0;
      if (values.length) {
        if (spec.op === 'sum') result = values.reduce((total, value) => total + value, 0);
        else if (spec.op === 'count') result = values.length;
        else if (spec.op === 'avg')
          result = values.reduce((total, value) => total + value, 0) / values.length;
        else if (spec.op === 'min') result = Math.min(...values);
        else result = Math.max(...values);
        result = Math.round(result * 10000) / 10000;
      }
      record.data = { ...record.data, [field.key]: result };
    }
  }

  return records;
}

async function assertReferences(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
  currentId?: string,
): Promise<void> {
  const valuesOf = (fieldType: FieldDef['type']): { label: string; value: string }[] =>
    type.fields
      .filter((field) => field.type === fieldType)
      .map((field) => ({ label: field.label, value: data[field.key] }))
      .filter(
        (pair): pair is { label: string; value: string } =>
          typeof pair.value === 'string' && UUID_PATTERN.test(pair.value),
      );

  const partyPairs = valuesOf('party');
  if (partyPairs.length) {
    const ids = [...new Set(partyPairs.map((pair) => pair.value))];
    const rows = await db
      .select({ id: parties.id })
      .from(parties)
      .where(and(eq(parties.tenantId, auth.tenantId), inArray(parties.id, ids)));
    const found = new Set(rows.map((row) => row.id));
    for (const pair of partyPairs) {
      if (!found.has(pair.value)) throw badRequest(`${pair.label} انتخاب‌شده معتبر نیست.`);
    }
  }

  const itemPairs = valuesOf('item');
  if (itemPairs.length) {
    const ids = [...new Set(itemPairs.map((pair) => pair.value))];
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.tenantId, auth.tenantId), inArray(items.id, ids)));
    const found = new Set(rows.map((row) => row.id));
    for (const pair of itemPairs) {
      if (!found.has(pair.value)) throw badRequest(`${pair.label} انتخاب‌شده معتبر نیست.`);
    }
  }

  const warehousePairs = valuesOf('warehouse');
  if (warehousePairs.length) {
    const ids = [...new Set(warehousePairs.map((pair) => pair.value))];
    const rows = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, auth.tenantId), inArray(warehouses.id, ids)));
    const found = new Set(rows.map((row) => row.id));
    for (const pair of warehousePairs) {
      if (!found.has(pair.value)) throw badRequest(`${pair.label} انتخاب‌شده معتبر نیست.`);
    }
  }

  const userPairs = valuesOf('user');
  if (userPairs.length) {
    const ids = [...new Set(userPairs.map((pair) => pair.value))];
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, auth.tenantId), inArray(users.id, ids)));
    const found = new Set(rows.map((row) => row.id));
    for (const pair of userPairs) {
      if (!found.has(pair.value)) throw badRequest(`${pair.label} انتخاب‌شده معتبر نیست.`);
    }
  }

  const masterFields = type.fields.filter(
    (field) => field.type === 'master' && field.masterTypeKey,
  );
  for (const field of masterFields) {
    const value = data[field.key];
    if (typeof value !== 'string' || !value) continue;
    if (value === currentId) {
      throw badRequest(`«${field.label}» نمی‌تواند به خود رکورد اشاره کند.`);
    }
    if (field.masterTypeKey === type.key) {
      const rows = await db
        .select({ id: masterDataRecords.id })
        .from(masterDataRecords)
        .where(
          and(
            eq(masterDataRecords.tenantId, auth.tenantId),
            eq(masterDataRecords.typeId, type.id),
            eq(masterDataRecords.id, value),
          ),
        )
        .limit(1);
      if (!rows[0]) throw badRequest(`${field.label} انتخاب‌شده معتبر نیست.`);
      continue;
    }
    const target = await getTypeRowByKey(auth, field.masterTypeKey!);
    if (!target || isSystemEntity(target.entity)) {
      throw badRequest(`${field.label} انتخاب‌شده معتبر نیست.`);
    }
    const rows = await db
      .select({ id: masterDataRecords.id })
      .from(masterDataRecords)
      .where(
        and(
          eq(masterDataRecords.tenantId, auth.tenantId),
          eq(masterDataRecords.typeId, target.id),
          eq(masterDataRecords.id, value),
        ),
      )
      .limit(1);
    if (!rows[0]) throw badRequest(`${field.label} انتخاب‌شده معتبر نیست.`);
  }
}

async function assertUniqueValues(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
  excludeId?: string,
): Promise<void> {
  const uniqueFields = type.fields.filter((field) => field.unique);
  if (!uniqueFields.length) return;
  const existing = await listRecordsForType(auth, type, { limit: 5000 });
  for (const field of uniqueFields) {
    const value = data[field.key];
    if (value === undefined || value === null || value === '') continue;
    const comparable = String(value).trim().toLowerCase();
    const duplicate = existing.find(
      (record) =>
        record.id !== excludeId &&
        String(record.data[field.key] ?? '').trim().toLowerCase() === comparable,
    );
    if (duplicate) throw conflict(`«${field.label}» تکراری است: ${String(value)}`);
  }
}

async function validateRecord(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
  currentId?: string,
): Promise<void> {
  const issues = validateCaseData(type.fields, data);
  if (issues.length) {
    throw badRequest('اطلاعات این رکورد کامل یا معتبر نیست.', issues);
  }
  if (type.entity === 'movement' && numberOr(data.quantity, 0) <= 0) {
    throw badRequest('مقدار گردش انبار باید بزرگ‌تر از صفر باشد.');
  }
  await assertReferences(auth, type, data, currentId);
}

async function nextGeneratedCode(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
): Promise<string> {
  const prefix =
    type.entity === 'party'
      ? data.kind === 'customer'
        ? 'CUS'
        : 'SUP'
      : type.entity === 'item'
        ? 'ITM'
        : 'WH';
  const records = await listRecordsForType(auth, type, { limit: 5000 });
  const key = type.entity === 'party' ? 'code' : type.entity === 'item' ? 'sku' : 'code';
  let max = 0;
  for (const record of records) {
    const value = String(record.data[key] ?? '');
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

async function insertCustomRecord(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
): Promise<MasterDataRecordDto> {
  const id = randomUUID();
  const title = recordTitle(type, data, id);
  const [record] = await db
    .insert(masterDataRecords)
    .values({
      id,
      tenantId: auth.tenantId,
      typeId: type.id,
      title,
      data,
      createdBy: auth.userId,
    })
    .returning();
  if (!record) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'master_record.created',
    entityType: 'master_record',
    entityId: record.id,
    after: { typeKey: type.key, title },
  });
  return customRecordDto(record, type);
}

async function insertSystemRecord(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
): Promise<MasterDataRecordDto> {
  const extra = extraFields(type, data);

  if (type.entity === 'party') {
    const [created] = await db
      .insert(parties)
      .values({
        tenantId: auth.tenantId,
        kind: data.kind === 'customer' ? 'customer' : 'supplier',
        name: textOrEmpty(data.name),
        code: textOrEmpty(data.code),
        email: textOrNull(data.email),
        phone: textOrNull(data.phone),
        taxId: textOrNull(data.taxId),
        address: textOrNull(data.address),
        extra,
      })
      .returning();
    if (!created) throw notFound();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'party.created',
      entityType: 'party',
      entityId: created.id,
      after: { name: created.name, code: created.code },
    });
    return recordDto(type, created.id, created.name, partyProjection(created, type), created.createdAt, created.createdAt);
  }

  if (type.entity === 'item') {
    const [created] = await db
      .insert(items)
      .values({
        tenantId: auth.tenantId,
        sku: textOrEmpty(data.sku),
        name: textOrEmpty(data.name),
        unit: textOrEmpty(data.unit) || 'عدد',
        category: textOrNull(data.category),
        unitCost: String(numberOr(data.unitCost, 0)),
        reorderPoint: String(numberOr(data.reorderPoint, 0)),
        active: data.active === undefined ? true : Boolean(data.active),
        extra,
      })
      .returning();
    if (!created) throw notFound();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'item.created',
      entityType: 'item',
      entityId: created.id,
      after: { name: created.name, sku: created.sku },
    });
    return recordDto(type, created.id, created.name, itemProjection(created, type, 0), created.createdAt, created.createdAt);
  }

  if (type.entity === 'warehouse') {
    const [created] = await db
      .insert(warehouses)
      .values({
        tenantId: auth.tenantId,
        code: textOrEmpty(data.code),
        name: textOrEmpty(data.name),
        location: textOrNull(data.location),
        extra,
      })
      .returning();
    if (!created) throw notFound();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'warehouse.created',
      entityType: 'warehouse',
      entityId: created.id,
      after: { name: created.name, code: created.code },
    });
    return recordDto(type, created.id, created.name, warehouseProjection(created, type), created.createdAt, created.createdAt);
  }

  const [created] = await db
    .insert(stockMovements)
    .values({
      tenantId: auth.tenantId,
      itemId: String(data.item),
      warehouseId: String(data.warehouse),
      type: (data.type as 'in' | 'out' | 'adjust') ?? 'in',
      quantity: String(numberOr(data.quantity, 0)),
      reference: textOrNull(data.reference),
      note: textOrNull(data.note),
      extra,
      createdBy: auth.userId,
    })
    .returning();
  if (!created) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'stock.movement_created',
    entityType: 'stock_movement',
    entityId: created.id,
    after: {
      itemId: created.itemId,
      warehouseId: created.warehouseId,
      type: created.type,
      quantity: Number(created.quantity),
    },
  });
  return recordDto(
    type,
    created.id,
    `${MOVEMENT_LABELS[created.type] ?? created.type}`,
    movementProjection(created, type),
    created.createdAt,
    created.createdAt,
  );
}

async function withGeneratedCodes(
  auth: AuthContext,
  type: MasterTypeRow,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isSystemEntity(type.entity)) return data;
  const key = type.entity === 'party' ? 'code' : type.entity === 'item' ? 'sku' : type.entity === 'warehouse' ? 'code' : null;
  if (!key) return data;
  const current = data[key];
  if (typeof current === 'string' && current.trim()) return data;
  return { ...data, [key]: await nextGeneratedCode(auth, type, data) };
}

export async function createMasterDataRecord(
  auth: AuthContext,
  typeId: string,
  input: { data: Record<string, unknown> },
): Promise<MasterDataRecordDto> {
  const type = await getTypeRow(auth, typeId);
  let data = normalizeRecordData(type.fields, input.data);
  if (type.entity === 'party' && !data.kind) data = { ...data, kind: 'supplier' };
  data = await withGeneratedCodes(auth, type, data);
  await validateRecord(auth, type, data);
  await assertUniqueValues(auth, type, data);
  return isSystemEntity(type.entity)
    ? insertSystemRecord(auth, type, data)
    : insertCustomRecord(auth, type, data);
}

async function loadRecord(
  auth: AuthContext,
  id: string,
): Promise<{ row: MasterRecordRow; type: MasterTypeRow }> {
  const rows = await db
    .select()
    .from(masterDataRecords)
    .where(and(eq(masterDataRecords.id, id), eq(masterDataRecords.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('رکورد پیدا نشد.');
  const type = await getTypeRow(auth, row.typeId);
  return { row, type };
}

export async function updateMasterDataRecord(
  auth: AuthContext,
  id: string,
  input: { data: Record<string, unknown> },
): Promise<MasterDataRecordDto> {
  const { row: current, type } = await loadRecord(auth, id);
  if (isSystemEntity(type.entity)) {
    throw badRequest('این رکورد سیستمی است؛ آن را از نوع داده مربوطه ویرایش کنید.');
  }
  const merged = normalizeRecordData(type.fields, { ...current.data, ...input.data });
  await validateRecord(auth, type, merged, current.id);
  await assertUniqueValues(auth, type, merged, current.id);
  const title = recordTitle(type, merged, current.id);
  const [updated] = await db
    .update(masterDataRecords)
    .set({ data: merged, title, updatedAt: new Date() })
    .where(and(eq(masterDataRecords.id, id), eq(masterDataRecords.tenantId, auth.tenantId)))
    .returning();
  if (!updated) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'master_record.updated',
    entityType: 'master_record',
    entityId: id,
    before: { title: current.title },
    after: { title: updated.title },
  });
  return customRecordDto(updated, type);
}

export async function updateSystemDataRecord(
  auth: AuthContext,
  typeId: string,
  id: string,
  input: { data: Record<string, unknown> },
): Promise<MasterDataRecordDto> {
  const type = await getTypeRow(auth, typeId);
  if (!isSystemEntity(type.entity)) {
    return updateMasterDataRecord(auth, id, input);
  }
  const existing = await listRecordsForType(auth, type, { limit: 5000 });
  const current = existing.find((record) => record.id === id);
  if (!current) throw notFound('رکورد پیدا نشد.');

  const merged = normalizeRecordData(type.fields, { ...current.data, ...input.data });
  await validateRecord(auth, type, merged, id);
  await assertUniqueValues(auth, type, merged, id);
  const extra = extraFields(type, merged);

  if (type.entity === 'party') {
    const [updated] = await db
      .update(parties)
      .set({
        kind: merged.kind === 'customer' ? 'customer' : 'supplier',
        name: textOrEmpty(merged.name),
        code: textOrEmpty(merged.code),
        email: textOrNull(merged.email),
        phone: textOrNull(merged.phone),
        taxId: textOrNull(merged.taxId),
        address: textOrNull(merged.address),
        extra,
      })
      .where(and(eq(parties.id, id), eq(parties.tenantId, auth.tenantId)))
      .returning();
    if (!updated) throw notFound();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'party.updated',
      entityType: 'party',
      entityId: id,
      before: { name: current.title },
      after: { name: updated.name },
    });
    return recordDto(type, updated.id, updated.name, partyProjection(updated, type), updated.createdAt, updated.createdAt);
  }

  if (type.entity === 'item') {
    const [updated] = await db
      .update(items)
      .set({
        sku: textOrEmpty(merged.sku),
        name: textOrEmpty(merged.name),
        unit: textOrEmpty(merged.unit) || 'عدد',
        category: textOrNull(merged.category),
        unitCost: String(numberOr(merged.unitCost, 0)),
        reorderPoint: String(numberOr(merged.reorderPoint, 0)),
        active: merged.active === undefined ? true : Boolean(merged.active),
        extra,
      })
      .where(and(eq(items.id, id), eq(items.tenantId, auth.tenantId)))
      .returning();
    if (!updated) throw notFound();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'item.updated',
      entityType: 'item',
      entityId: id,
      before: { name: current.title },
      after: { name: updated.name },
    });
    return recordDto(type, updated.id, updated.name, itemProjection(updated, type), updated.createdAt, updated.createdAt);
  }

  if (type.entity === 'warehouse') {
    const [updated] = await db
      .update(warehouses)
      .set({
        code: textOrEmpty(merged.code),
        name: textOrEmpty(merged.name),
        location: textOrNull(merged.location),
        extra,
      })
      .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, auth.tenantId)))
      .returning();
    if (!updated) throw notFound();
    await writeAudit(db, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'warehouse.updated',
      entityType: 'warehouse',
      entityId: id,
      before: { name: current.title },
      after: { name: updated.name },
    });
    return recordDto(type, updated.id, updated.name, warehouseProjection(updated, type), updated.createdAt, updated.createdAt);
  }

  const [updated] = await db
    .update(stockMovements)
    .set({
      itemId: String(merged.item),
      warehouseId: String(merged.warehouse),
      type: (merged.type as 'in' | 'out' | 'adjust') ?? 'in',
      quantity: String(numberOr(merged.quantity, 0)),
      reference: textOrNull(merged.reference),
      note: textOrNull(merged.note),
      extra,
    })
    .where(and(eq(stockMovements.id, id), eq(stockMovements.tenantId, auth.tenantId)))
    .returning();
  if (!updated) throw notFound();
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'stock.movement_updated',
    entityType: 'stock_movement',
    entityId: id,
    after: { quantity: Number(updated.quantity), type: updated.type },
  });
  return recordDto(
    type,
    updated.id,
    MOVEMENT_LABELS[updated.type] ?? updated.type,
    movementProjection(updated, type),
    updated.createdAt,
    updated.createdAt,
  );
}

async function assertRecordDeletable(
  auth: AuthContext,
  type: MasterTypeRow,
  id: string,
): Promise<void> {
  const caseCandidates = await db
    .select({ title: cases.title, reference: cases.reference, data: cases.data })
    .from(cases)
    .where(
      and(eq(cases.tenantId, auth.tenantId), sql`${cases.data}::text ilike ${`%${id}%`}`),
    )
    .limit(50);
  const owningCase = caseCandidates.find((row) =>
    recordIsUsedInData(row.data as Record<string, unknown>, id),
  );
  if (owningCase) {
    throw conflict(
      `این رکورد در پرونده «${owningCase.title}» (${owningCase.reference}) استفاده شده است و قابل حذف نیست.`,
    );
  }

  const allTypes = await db
    .select()
    .from(masterDataTypes)
    .where(eq(masterDataTypes.tenantId, auth.tenantId));
  for (const candidate of allTypes) {
    const referencingFields = candidate.fields.filter(
      (field) => field.type === 'master' && field.masterTypeKey === type.key,
    );
    if (!referencingFields.length) continue;
    const records = await listRecordsForType(auth, candidate, { limit: 5000 });
    for (const record of records) {
      for (const field of referencingFields) {
        if (record.data[field.key] === id) {
          throw conflict(
            `این رکورد در «${candidate.name}» استفاده شده است (${record.title}) و قابل حذف نیست.`,
          );
        }
      }
    }
  }

  if (type.entity === 'item' || type.entity === 'warehouse') {
    const linked = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, auth.tenantId),
          type.entity === 'item'
            ? eq(stockMovements.itemId, id)
            : eq(stockMovements.warehouseId, id),
        ),
      )
      .limit(1);
    if (linked[0]) {
      throw conflict('این رکورد در گردش انبار استفاده شده است و قابل حذف نیست.');
    }
  }

  const usedByItem = await db
    .select({ name: items.name })
    .from(items)
    .where(and(eq(items.tenantId, auth.tenantId), eq(items.category, id)))
    .limit(1);
  if (usedByItem[0]) {
    throw conflict(
      `این رکورد در کالای «${usedByItem[0].name}» استفاده شده است و قابل حذف نیست.`,
    );
  }
}

async function removeRecordRow(
  auth: AuthContext,
  type: MasterTypeRow,
  id: string,
): Promise<void> {
  if (type.entity === 'party') {
    await db
      .delete(parties)
      .where(and(eq(parties.id, id), eq(parties.tenantId, auth.tenantId)));
  } else if (type.entity === 'item') {
    await db.delete(items).where(and(eq(items.id, id), eq(items.tenantId, auth.tenantId)));
  } else if (type.entity === 'warehouse') {
    await db
      .delete(warehouses)
      .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, auth.tenantId)));
  } else if (type.entity === 'movement') {
    await db
      .delete(stockMovements)
      .where(
        and(eq(stockMovements.id, id), eq(stockMovements.tenantId, auth.tenantId)),
      );
  } else {
    await db
      .delete(masterDataRecords)
      .where(and(eq(masterDataRecords.id, id), eq(masterDataRecords.tenantId, auth.tenantId)));
  }
}

async function removeRecord(
  auth: AuthContext,
  type: MasterTypeRow,
  id: string,
  title: string,
): Promise<void> {
  await removeRecordRow(auth, type, id);
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: `${type.entity}.deleted`,
    entityType: type.entity === 'custom' ? 'master_record' : type.entity,
    entityId: id,
    before: { typeKey: type.key, title },
  });
}

export async function deleteMasterDataRecord(auth: AuthContext, id: string): Promise<void> {
  const { row: current, type } = await loadRecord(auth, id);
  await assertRecordDeletable(auth, type, id);
  await removeRecord(auth, type, id, current.title);
}

export async function deleteSystemDataRecord(
  auth: AuthContext,
  typeId: string,
  id: string,
): Promise<void> {
  const type = await getTypeRow(auth, typeId);
  if (!isSystemEntity(type.entity)) {
    return deleteMasterDataRecord(auth, id);
  }
  const existing = await listRecordsForType(auth, type, { limit: 5000 });
  const record = existing.find((candidate) => candidate.id === id);
  if (!record) throw notFound('رکورد پیدا نشد.');
  await assertRecordDeletable(auth, type, id);
  await removeRecord(auth, type, id, record.title);
}

export async function duplicateMasterDataRecord(
  auth: AuthContext,
  typeId: string,
  id: string,
): Promise<MasterDataRecordDto> {
  const type = await getTypeRow(auth, typeId);
  const records = await listRecordsForType(auth, type, { limit: 5000 });
  const source = records.find((record) => record.id === id);
  if (!source) throw notFound('رکورد پیدا نشد.');
  const data: Record<string, unknown> = { ...source.data };
  for (const field of type.fields) {
    if (field.unique) delete data[field.key];
  }
  const titleKey = type.titleField;
  if (titleKey && typeof data[titleKey] === 'string') {
    data[titleKey] = `${String(data[titleKey])} (کپی)`;
  }
  return createMasterDataRecord(auth, type.id, { data });
}

/* ------------------------------------------------------------------ */
/* Read helpers used by cases, search and form options                 */
/* ------------------------------------------------------------------ */

export async function listParties(
  auth: AuthContext,
  query: { kind?: 'customer' | 'supplier'; q?: string; limit: number },
): Promise<PartyDto[]> {
  const conditions = [eq(parties.tenantId, auth.tenantId)];
  if (query.kind) conditions.push(eq(parties.kind, query.kind));
  if (query.q?.trim()) {
    const term = likeTerm(query.q);
    const search = or(ilike(parties.name, term), ilike(parties.code, term));
    if (search) conditions.push(search);
  }
  const rows = await db
    .select()
    .from(parties)
    .where(and(...conditions))
    .orderBy(desc(parties.createdAt))
    .limit(query.limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    code: row.code,
    email: row.email,
    phone: row.phone,
    taxId: row.taxId,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listItems(
  auth: AuthContext,
  query: { q?: string; limit: number },
): Promise<ItemDto[]> {
  const conditions = [eq(items.tenantId, auth.tenantId)];
  if (query.q?.trim()) {
    const term = likeTerm(query.q);
    const search = or(ilike(items.name, term), ilike(items.sku, term));
    if (search) conditions.push(search);
  }
  const rows = await db
    .select({
      item: items,
      categoryTitle: masterDataRecords.title,
      stock: sql<number>`coalesce((select sum(case when ${stockMovements.type} = 'out' then -${stockMovements.quantity} else ${stockMovements.quantity} end) from ${stockMovements} where ${stockMovements.itemId} = ${items.id} and ${stockMovements.tenantId} = ${items.tenantId}), 0)::float`,
    })
    .from(items)
    .leftJoin(
      masterDataRecords,
      and(
        sql`${masterDataRecords.id}::text = ${items.category}`,
        eq(masterDataRecords.tenantId, items.tenantId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(items.createdAt))
    .limit(query.limit);
  return rows.map((row) => ({
    id: row.item.id,
    sku: row.item.sku,
    name: row.item.name,
    unit: row.item.unit,
    category: row.categoryTitle ?? row.item.category,
    unitCost: Number(row.item.unitCost),
    reorderPoint: Number(row.item.reorderPoint),
    active: row.item.active,
    stock: Number(row.stock ?? 0),
  }));
}

export async function listWarehouses(auth: AuthContext): Promise<WarehouseDto[]> {
  const rows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.tenantId, auth.tenantId))
    .orderBy(warehouses.name);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location,
  }));
}

export async function listUserOptions(auth: AuthContext): Promise<UserSummary[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      jobTitle: users.jobTitle,
      avatarColor: users.avatarColor,
    })
    .from(users)
    .where(and(eq(users.tenantId, auth.tenantId), eq(users.isActive, true)))
    .orderBy(users.name);
  return rows;
}

export async function listStockMovements(
  auth: AuthContext,
  query: { itemId?: string; warehouseId?: string; limit: number },
): Promise<
  {
    id: string;
    itemId: string;
    itemName: string;
    warehouseId: string;
    warehouseName: string;
    type: 'in' | 'out' | 'adjust';
    quantity: number;
    reference: string | null;
    note: string | null;
    createdByName: string | null;
    createdAt: string;
  }[]
> {
  const conditions = [eq(stockMovements.tenantId, auth.tenantId)];
  if (query.itemId) conditions.push(eq(stockMovements.itemId, query.itemId));
  if (query.warehouseId) conditions.push(eq(stockMovements.warehouseId, query.warehouseId));
  const rows = await db
    .select({
      movement: stockMovements,
      itemName: items.name,
      warehouseName: warehouses.name,
      createdByName: users.name,
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .leftJoin(users, eq(users.id, stockMovements.createdBy))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt))
    .limit(query.limit);
  return rows.map(({ movement, itemName, warehouseName, createdByName }) => ({
    id: movement.id,
    itemId: movement.itemId,
    itemName,
    warehouseId: movement.warehouseId,
    warehouseName,
    type: movement.type,
    quantity: Number(movement.quantity),
    reference: movement.reference,
    note: movement.note,
    createdByName,
    createdAt: movement.createdAt.toISOString(),
  }));
}

export async function getMasterOptions(auth: AuthContext): Promise<MasterOptionsDto> {
  const [partyList, itemList, warehouseList, userList, types] = await Promise.all([
    listParties(auth, { limit: 300 }),
    listItems(auth, { limit: 300 }),
    listWarehouses(auth),
    listUserOptions(auth),
    listMasterDataTypes(auth),
  ]);
  const customRecords: Record<string, MasterDataRecordDto[]> = {};
  await Promise.all(
    types.map(async (type) => {
      customRecords[type.key] = await listRecordsForType(
        auth,
        await getTypeRow(auth, type.id),
        { limit: 300 },
      );
    }),
  );
  return {
    parties: partyList,
    items: itemList,
    warehouses: warehouseList,
    users: userList,
    customTypes: types,
    customRecords,
  };
}

