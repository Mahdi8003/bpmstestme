import { describe, expect, it } from 'vitest';
import {
  CASE_TYPE_TEMPLATES,
  caseTypeDefinitionSchema,
  checkCaseTypeHealth,
  evaluateCondition,
  formatReference,
  getJalaliYear,
  validateCaseData,
  type CaseTypeDefinition,
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

  it('validates table rows and enforces minimum rows', () => {
    const fields = [
      {
        key: 'items',
        label: 'اقلام',
        type: 'table' as const,
        required: true,
        minRows: 1,
        columns: [
          { key: 'item', label: 'کالا', type: 'item' as const, required: true },
          { key: 'qty', label: 'مقدار', type: 'number' as const, required: true },
        ],
      },
    ];
    expect(validateCaseData(fields, { items: [] })).toHaveLength(1);
    expect(
      validateCaseData(fields, {
        items: [{ item: 'not-a-uuid', qty: 'abc' }],
      }),
    ).toHaveLength(2);
    expect(
      validateCaseData(fields, {
        items: [
          {
            item: '11111111-1111-4111-8111-111111111111',
            qty: 2,
          },
        ],
      }),
    ).toHaveLength(0);
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
      const parsed = caseTypeDefinitionSchema.safeParse(template.definition);
      expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
      const health = checkCaseTypeHealth(template.definition);
      expect(health.issues.filter((issue) => issue.level === 'error')).toEqual([]);
      expect(health.ok).toBe(true);
    }
  });

  it('validates selection tasks against their source table', () => {
    const definition: CaseTypeDefinition = {
      fields: [
        {
          key: 'quotes',
          label: 'پیش‌فاکتورها',
          type: 'table',
          columns: [
            { key: 'supplier', label: 'تأمین‌کننده', type: 'party' },
            { key: 'amount', label: 'مبلغ', type: 'currency' },
          ],
        },
        { key: 'selectedSupplier', label: 'انتخاب‌شده', type: 'party', hidden: true },
      ],
      stages: [
        {
          key: 'collect',
          name: 'جمع‌آوری',
          tasks: [
            {
              key: 'collect_task',
              name: 'ثبت',
              assignee: { type: 'role', value: 'procurement' },
              formFields: ['quotes'],
            },
          ],
        },
        {
          key: 'select',
          name: 'انتخاب',
          tasks: [
            {
              key: 'select_task',
              name: 'انتخاب',
              kind: 'selection',
              assignee: { type: 'role', value: 'manager' },
              selection: {
                sourceField: 'quotes',
                labelColumn: 'supplier',
                copy: [{ from: 'supplier', to: 'selectedSupplier' }],
              },
            },
          ],
        },
      ],
    };
    expect(checkCaseTypeHealth(definition).ok).toBe(true);

    const broken: CaseTypeDefinition = {
      ...definition,
      stages: definition.stages.map((stage) =>
        stage.key === 'select'
          ? {
              ...stage,
              tasks: [
                {
                  ...stage.tasks[0]!,
                  selection: { sourceField: 'missing', copy: [] },
                },
              ],
            }
          : stage,
      ),
    };
    expect(checkCaseTypeHealth(broken).ok).toBe(false);
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

  it('validates tenant-defined roles and direct user assignments', () => {
    const userId = '8a3f6f5c-3f3b-4a8d-9f3c-1f16d6f2a111';
    const definition: CaseTypeDefinition = {
      fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }],
      stages: [
        {
          key: 'receive',
          name: 'Receive',
          tasks: [
            {
              key: 'warehouse_task',
              name: 'Warehouse check',
              assignee: { type: 'role', value: 'warehouse_manager' },
            },
            {
              key: 'owner_task',
              name: 'Owner task',
              assignee: { type: 'user', value: userId },
            },
          ],
        },
      ],
    };

    const accepted = checkCaseTypeHealth(definition, {
      knownRoles: ['warehouse_manager'],
      knownUserIds: [userId],
    });
    expect(accepted.issues.filter((issue) => issue.level === 'error')).toEqual([]);
    expect(accepted.ok).toBe(true);

    const rejected = checkCaseTypeHealth(definition, {
      knownRoles: ['member'],
      knownUserIds: [],
    });
    expect(rejected.ok).toBe(false);
    expect(
      rejected.issues.filter(
        (issue) => issue.path === 'stages.receive.tasks.owner_task',
      ),
    ).not.toHaveLength(0);
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
