import { evaluateCondition } from './rules.js';
import type { FieldDef, ValidationIssue } from './types.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function validateCaseData(
  fields: FieldDef[],
  data: Record<string, unknown>,
  options: { onlyFields?: string[]; partial?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowed = options.onlyFields ? new Set(options.onlyFields) : null;

  for (const field of fields) {
    if (allowed && !allowed.has(field.key)) continue;
    if (field.visibleWhen && !evaluateCondition(field.visibleWhen, fields, data)) continue;
    const value = data[field.key];
    const empty = isEmptyValue(value);

    if (empty) {
      if (field.required && !options.partial) {
        issues.push({ field: field.key, message: `${field.label} الزامی است.` });
      }
      continue;
    }

    switch (field.type) {
      case 'text':
      case 'textarea': {
        if (typeof value !== 'string') {
          issues.push({ field: field.key, message: `${field.label} باید متن باشد.` });
          break;
        }
        if (field.max !== undefined && value.length > field.max) {
          issues.push({
            field: field.key,
            message: `${field.label} نباید بیشتر از ${field.max} کاراکتر باشد.`,
          });
        }
        if (field.min !== undefined && value.length < field.min) {
          issues.push({
            field: field.key,
            message: `${field.label} نباید کمتر از ${field.min} کاراکتر باشد.`,
          });
        }
        break;
      }
      case 'number':
      case 'currency': {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) {
          issues.push({ field: field.key, message: `${field.label} باید عدد باشد.` });
          break;
        }
        if (field.min !== undefined && numeric < field.min) {
          issues.push({
            field: field.key,
            message: `${field.label} نباید کمتر از ${field.min} باشد.`,
          });
        }
        if (field.max !== undefined && numeric > field.max) {
          issues.push({
            field: field.key,
            message: `${field.label} نباید بیشتر از ${field.max} باشد.`,
          });
        }
        break;
      }
      case 'date': {
        if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
          issues.push({ field: field.key, message: `${field.label} تاریخ معتبر نیست.` });
        }
        break;
      }
      case 'select':
      case 'radio': {
        const values = (field.options ?? []).map((option) => option.value);
        if (typeof value !== 'string' || !values.includes(value)) {
          issues.push({ field: field.key, message: `${field.label} معتبر نیست.` });
        }
        break;
      }
      case 'multiselect': {
        const values = (field.options ?? []).map((option) => option.value);
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
          issues.push({ field: field.key, message: `${field.label} معتبر نیست.` });
          break;
        }
        if (value.some((item) => !values.includes(item))) {
          issues.push({ field: field.key, message: `${field.label} شامل گزینهٔ نامعتبر است.` });
        }
        break;
      }
      case 'checkbox': {
        if (typeof value !== 'boolean') {
          issues.push({ field: field.key, message: `${field.label} باید بله یا خیر باشد.` });
        }
        break;
      }
      case 'email': {
        if (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim())) {
          issues.push({ field: field.key, message: `${field.label} باید ایمیل معتبر باشد.` });
        }
        break;
      }
      case 'phone': {
        if (typeof value !== 'string' || !PHONE_PATTERN.test(value.trim())) {
          issues.push({ field: field.key, message: `${field.label} باید شمارهٔ تلفن معتبر باشد.` });
        }
        break;
      }
      case 'url': {
        if (typeof value !== 'string' || !URL_PATTERN.test(value.trim())) {
          issues.push({ field: field.key, message: `${field.label} باید نشانی وب معتبر باشد.` });
        }
        break;
      }
      case 'party':
      case 'item':
      case 'warehouse':
      case 'user': {
        if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
          issues.push({ field: field.key, message: `${field.label} معتبر نیست.` });
        }
        break;
      }
    }
  }

  return issues;
}
