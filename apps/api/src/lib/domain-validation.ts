import { and, eq, inArray } from 'drizzle-orm';
import { evaluateCondition, type FieldDef, type ValidationIssue } from '@ravand/shared';
import type { DbLike } from '../db/client.js';
import { items, parties, users, warehouses } from '../db/schema.js';

export async function validateReferenceFields(
  db: DbLike,
  tenantId: string,
  fields: FieldDef[],
  data: Record<string, unknown>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const visibleFields = fields.filter(
    (field) => !field.visibleWhen || evaluateCondition(field.visibleWhen, fields, data),
  );
  const collect = (type: FieldDef['type']): string[] =>
    visibleFields
      .filter((field) => field.type === type)
      .map((field) => data[field.key])
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

  const partyIds = collect('party');
  if (partyIds.length) {
    const rows = await db
      .select({ id: parties.id })
      .from(parties)
      .where(and(eq(parties.tenantId, tenantId), inArray(parties.id, partyIds)));
    const found = new Set(rows.map((row) => row.id));
    for (const id of partyIds) {
      if (!found.has(id)) {
        issues.push({ message: 'طرف حساب انتخاب‌شده معتبر نیست.' });
      }
    }
  }

  const itemIds = collect('item');
  if (itemIds.length) {
    const rows = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), inArray(items.id, itemIds)));
    const found = new Set(rows.map((row) => row.id));
    for (const id of itemIds) {
      if (!found.has(id)) issues.push({ message: 'کالای انتخاب‌شده معتبر نیست.' });
    }
  }

  const warehouseIds = collect('warehouse');
  if (warehouseIds.length) {
    const rows = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, tenantId), inArray(warehouses.id, warehouseIds)));
    const found = new Set(rows.map((row) => row.id));
    for (const id of warehouseIds) {
      if (!found.has(id)) issues.push({ message: 'انبار انتخاب‌شده معتبر نیست.' });
    }
  }

  const userIds = collect('user');
  if (userIds.length) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)));
    const found = new Set(rows.map((row) => row.id));
    for (const id of userIds) {
      if (!found.has(id)) issues.push({ message: 'کاربر انتخاب‌شده معتبر نیست.' });
    }
  }

  return issues;
}
