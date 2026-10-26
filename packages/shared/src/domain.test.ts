import { describe, expect, it } from 'vitest';
import {
  CASE_TYPE_TEMPLATES,
  checkCaseTypeHealth,
  evaluateCondition,
  formatReference,
  getJalaliYear,
  validateCaseData,
} from './index.js';

describe('rule engine', () => {
  const fields = [
    { key: 'amount', label: 'مبلغ', type: 'currency' as const },
    { key: 'subject', label: 'موضوع', type: 'text' as const },
  ];

  it('compares currency values numerically', () => {
    expect(
      evaluateCondition(
        { field: 'amount', op: 'gte', value: 50_000_000 },
        fields,
        { amount: '120000000' },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'amount', op: 'lt', value: 50_000_000 },
        fields,
        { amount: 20_000_000 },
      ),
    ).toBe(true);
  });

  it('supports text contains', () => {
    expect(
      evaluateCondition({ field: 'subject', op: 'contains', value: 'لپ' }, fields, {
        subject: 'خرید لپ‌تاپ',
      }),
    ).toBe(true);
  });

  it('respects missing conditions', () => {
    expect(evaluateCondition(undefined, fields, {})).toBe(true);
  });
});

describe('validation', () => {
  it('reports required and invalid fields', () => {
    const issues = validateCaseData(
      [
        { key: 'amount', label: 'مبلغ', type: 'currency', required: true, min: 10 },
        { key: 'due', label: 'تاریخ', type: 'date', required: true },
      ],
      { amount: 5, due: 'not-a-date' },
    );
    expect(issues).toHaveLength(2);
  });

  it('validates only task fields when requested', () => {
    const issues = validateCaseData(
      [{ key: 'note', label: 'یادداشت', type: 'textarea', required: true }],
      {},
      { onlyFields: ['note'] },
    );
    expect(issues).toHaveLength(1);
  });

  it('validates multi-value and contact fields', () => {
    const issues = validateCaseData(
      [
        { key: 'tags', label: 'برچسب‌ها', type: 'multiselect', required: true },
        { key: 'email', label: 'ایمیل', type: 'email', required: true },
        { key: 'phone', label: 'تلفن', type: 'phone', required: true },
      ],
      { tags: [], email: 'not-an-email', phone: 'abc' },
    );
    expect(issues.map((issue) => issue.field)).toEqual(['tags', 'email', 'phone']);
  });

  it('accepts valid multiselect options and skips hidden fields', () => {
    const fields = [
      { key: 'amount', label: 'مبلغ', type: 'currency' as const },
      {
        key: 'note',
        label: 'یادداشت',
        type: 'textarea' as const,
        required: true,
        visibleWhen: { field: 'amount', op: 'gte' as const, value: 100 },
      },
      {
        key: 'tags',
        label: 'برچسب‌ها',
        type: 'multiselect' as const,
        options: [
          { label: 'فوری', value: 'urgent' },
          { label: 'داخلی', value: 'internal' },
        ],
      },
    ];
    expect(validateCaseData(fields, { amount: 50, tags: ['urgent'] })).toHaveLength(0);
    expect(validateCaseData(fields, { amount: 150, tags: ['urgent'] })).toHaveLength(1);
    expect(
      validateCaseData(fields, { amount: 50, tags: ['unknown'] }).map((issue) => issue.field),
    ).toEqual(['tags']);
  });
});

describe('health checks', () => {
  it('accepts every bundled template', () => {
    for (const template of CASE_TYPE_TEMPLATES) {
      const health = checkCaseTypeHealth(template.definition);
      expect(health.issues.filter((issue) => issue.level === 'error')).toEqual([]);
      expect(health.ok).toBe(true);
    }
  });

  it('detects duplicate task keys and missing fields', () => {
    const health = checkCaseTypeHealth({
      fields: [{ key: 'subject', label: 'موضوع', type: 'text', required: true }],
      stages: [
        {
          key: 'one',
          name: 'اول',
          tasks: [
            {
              key: 'same',
              name: 'کار',
              assignee: { type: 'role', value: 'manager' },
              formFields: ['missing'],
            },
          ],
        },
        {
          key: 'two',
          name: 'دوم',
          tasks: [
            {
              key: 'same',
              name: 'کار دوم',
              assignee: { type: 'role', value: 'manager' },
            },
          ],
        },
      ],
    });
    expect(health.ok).toBe(false);
    expect(health.issues.some((issue) => issue.message.includes('تکراری'))).toBe(true);
  });
});

describe('reference utilities', () => {
  it('formats references', () => {
    expect(formatReference('PR', 1405, 7)).toBe('PR-1405-0007');
  });

  it('returns a Jalali year', () => {
    expect(getJalaliYear(new Date('2026-01-01T00:00:00Z'))).toBeGreaterThan(1400);
  });
});
