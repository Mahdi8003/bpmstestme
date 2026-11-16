import { describe, expect, it } from 'vitest';
import {
  allDefinitionFields,
  checkCaseTypeHealth,
  fieldsForStage,
  type CaseTypeDefinition,
} from './index.js';

const definition: CaseTypeDefinition = {
  fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true }],
  stages: [
    {
      key: 'review',
      name: 'Review',
      fields: [
        { key: 'supplier', label: 'Supplier', type: 'text', required: true },
      ],
      tasks: [
        {
          key: 'review_task',
          name: 'Review task',
          assignee: { type: 'role', value: 'manager' },
        },
      ],
      transitions: [{ type: 'stage', stageKey: 'approval' }],
    },
    {
      key: 'approval',
      name: 'Approval',
      tasks: [
        {
          key: 'approval_task',
          name: 'Approval task',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
        },
      ],
    },
  ],
};

describe('stage fields', () => {
  it('merges global and stage fields for the selected stage', () => {
    const fields = fieldsForStage(definition, 'review');
    expect(fields.map((field) => field.key)).toEqual(['subject', 'supplier']);
  });

  it('collects every field across the definition without duplicates', () => {
    const fields = allDefinitionFields(definition);
    expect(fields.map((field) => field.key)).toEqual(['subject', 'supplier']);
  });

  it('validates transitions and stage-scoped required fields', () => {
    const health = checkCaseTypeHealth(definition);
    expect(health.ok).toBe(true);
  });

  it('rejects transitions to unknown stages', () => {
    const broken: CaseTypeDefinition = {
      ...definition,
      stages: definition.stages.map((stage, index) =>
        index === 0
          ? { ...stage, transitions: [{ type: 'stage', stageKey: 'missing' }] }
          : stage,
      ),
    };
    const health = checkCaseTypeHealth(broken);
    expect(health.ok).toBe(false);
    expect(health.issues.some((issue) => issue.path?.includes('transitions'))).toBe(true);
  });
});
