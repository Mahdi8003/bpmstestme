import { and, eq, inArray } from 'drizzle-orm';
import { evaluateCondition, type FieldDef, type ValidationIssue } from '@ravand/shared';
import type { DbLike } from '../db/client.js';
import {
  caseDocuments,
  items,
  masterDataRecords,
  masterDataTypes,
  parties,
  users,
  warehouses,
} from '../db/schema.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function validateReferenceFields(
  db: DbLike,
  tenantId: string,
  fields: FieldDef[],
  data: Record<string, unknown>,
  caseId?: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const pairs: { field: FieldDef; value: unknown }[] = [];
  const walk = (candidateFields: FieldDef[], candidateData: Record<string, unknown>): void => {
    for (const field of candidateFields) {
      if (
        field.visibleWhen &&
        !evaluateCondition(field.visibleWhen, candidateFields, candidateData)
      ) {
        continue;
      }
      const value = candidateData[field.key];
      if (field.type === 'table') {
        if (Array.isArray(value)) {
          for (const row of value) {
            if (row && typeof row === 'object' && !Array.isArray(row)) {
              walk(field.columns ?? [], row as Record<string, unknown>);
            }
          }
        }
        continue;
      }
      pairs.push({ field, value });
    }
  };
  walk(fields, data);
  const collect = (type: FieldDef['type']): string[] =>
    pairs
      .filter((pair) => pair.field.type === type)
      .map((pair) => pair.value)
      .filter(
        (value): value is string =>
          typeof value === 'string' && UUID_PATTERN.test(value),
      );

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

  const fileIds = collect('file');
  if (fileIds.length) {
    if (!caseId) {
      issues.push({ message: 'فایل پیوست انتخاب‌شده معتبر نیست.' });
    } else {
      const rows = await db
        .select({ id: caseDocuments.id })
        .from(caseDocuments)
        .where(
          and(
            eq(caseDocuments.tenantId, tenantId),
            eq(caseDocuments.caseId, caseId),
            inArray(caseDocuments.id, fileIds),
          ),
        );
      const found = new Set(rows.map((row) => row.id));
      for (const id of fileIds) {
        if (!found.has(id)) {
          issues.push({
            message: 'فایل پیوست انتخاب‌شده معتبر نیست یا به این پرونده تعلق ندارد.',
          });
        }
      }
    }
  }

  const masterPairs = pairs.filter((pair) => pair.field.type === 'master');
  const masterTypeKeys = [
    ...new Set(
      masterPairs
        .map((pair) => pair.field.masterTypeKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  for (const pair of masterPairs) {
    if (!pair.field.masterTypeKey) {
      issues.push({ message: `نوع داده پایه فیلد «${pair.field.label}» مشخص نیست.` });
    }
  }
  for (const typeKey of masterTypeKeys) {
    const ids = masterPairs
      .filter((pair) => pair.field.masterTypeKey === typeKey)
      .map((pair) => pair.value)
      .filter(
        (value): value is string =>
          typeof value === 'string' && UUID_PATTERN.test(value),
      );
    if (!ids.length) continue;
    const rows = await db
      .select({ id: masterDataRecords.id })
      .from(masterDataRecords)
      .innerJoin(masterDataTypes, eq(masterDataTypes.id, masterDataRecords.typeId))
      .where(
        and(
          eq(masterDataRecords.tenantId, tenantId),
          eq(masterDataTypes.tenantId, tenantId),
          eq(masterDataTypes.key, typeKey),
          inArray(masterDataRecords.id, ids),
        ),
      );
    const found = new Set(rows.map((row) => row.id));
    for (const id of ids) {
      if (!found.has(id)) {
        issues.push({ message: 'داده پایه سفارشی انتخاب‌شده معتبر نیست.' });
      }
    }
  }

  return issues;
}
