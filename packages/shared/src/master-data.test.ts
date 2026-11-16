import { describe, expect, it } from 'vitest';
import {
  fieldDefSchema,
  validateCaseData,
  type FieldDef,
} from './index.js';

describe('master data field definitions', () => {
  it('accepts a rollup field with a complete configuration', () => {
    const parsed = fieldDefSchema.parse({
      key: 'paid',
      label: 'جمع پرداخت‌ها',
      type: 'rollup',
      rollup: {
        sourceTypeKey: 'payment',
        referenceField: 'invoice',
        valueField: 'amount',
        op: 'sum',
      },
    });
    expect(parsed.type).toBe('rollup');
    expect(parsed.rollup?.op).toBe('sum');
  });

  it('rejects an unknown rollup operation', () => {
    const result = fieldDefSchema.safeParse({
      key: 'paid',
      label: 'جمع',
      type: 'rollup',
      rollup: { sourceTypeKey: 'payment', referenceField: 'invoice', op: 'median' },
    });
    expect(result.success).toBe(false);
  });

  it('ignores computed values when validating input', () => {
    const fields: FieldDef[] = [
      {
        key: 'paid',
        label: 'جمع پرداخت‌ها',
        type: 'rollup',
        rollup: { sourceTypeKey: 'payment', referenceField: 'invoice', op: 'count' },
      },
    ];
    expect(validateCaseData(fields, {})).toHaveLength(0);
    expect(validateCaseData(fields, { paid: 'computed' })).toHaveLength(0);
  });

  it('keeps built-in field flags on parsed fields', () => {
    const parsed = fieldDefSchema.parse({
      key: 'sku',
      label: 'کد کالا',
      type: 'text',
      unique: true,
      locked: true,
    });
    expect(parsed.unique).toBe(true);
    expect(parsed.locked).toBe(true);
  });
});
