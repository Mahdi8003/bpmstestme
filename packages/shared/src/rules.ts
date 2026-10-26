import type { Condition, FieldDef, FieldType } from './types.js';

export function readField(data: Record<string, unknown>, key: string): unknown {
  return data[key];
}

function fieldTypeOf(fields: FieldDef[], key: string): FieldType | undefined {
  return fields.find((field) => field.key === key)?.type;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function compareValues(
  left: unknown,
  right: string | number | boolean,
  type: FieldType | undefined,
): number {
  if (type === 'number' || type === 'currency') {
    const a = asNumber(left) ?? 0;
    const b = asNumber(right) ?? 0;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (type === 'checkbox') {
    const a = left === true || left === 'true';
    const b = right === true || right === 'true';
    return a === b ? 0 : a ? 1 : -1;
  }
  if (type === 'date') {
    return String(left ?? '').localeCompare(String(right ?? ''));
  }
  const a = String(left ?? '').trim();
  const b = String(right ?? '').trim();
  return a.localeCompare(b, 'fa');
}

export function evaluateCondition(
  condition: Condition | undefined,
  fields: FieldDef[],
  data: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  const left = readField(data, condition.field);
  const type = fieldTypeOf(fields, condition.field);
  const cmp = compareValues(left, condition.value, type);

  switch (condition.op) {
    case 'eq':
      return cmp === 0;
    case 'neq':
      return cmp !== 0;
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
    case 'contains':
      return String(left ?? '')
        .toLocaleLowerCase('fa')
        .includes(String(condition.value).toLocaleLowerCase('fa'));
    default:
      return false;
  }
}

export function describeCondition(
  condition: Condition,
  fields: FieldDef[],
): string {
  const field = fields.find((item) => item.key === condition.field);
  const label = field?.label ?? condition.field;
  const value =
    field?.type === 'select'
      ? field.options?.find((option) => option.value === String(condition.value))?.label ??
        String(condition.value)
      : String(condition.value);
  const operators: Record<Condition['op'], string> = {
    eq: 'برابر است با',
    neq: 'برابر نیست با',
    gt: 'بیشتر از',
    gte: 'بیشتر یا مساوی',
    lt: 'کمتر از',
    lte: 'کمتر یا مساوی',
    contains: 'شامل',
  };
  return `${label} ${operators[condition.op]} ${value}`;
}
