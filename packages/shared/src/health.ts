import type { CaseTypeDefinition, HealthIssue, HealthResult } from './types.js';
import { ROLE_KEYS } from './types.js';

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function checkCaseTypeHealth(definition: CaseTypeDefinition): HealthResult {
  const issues: HealthIssue[] = [];
  const fieldKeys = new Set<string>();
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  const documentKeys = new Set<string>();

  if (!definition.fields.length) {
    issues.push({ level: 'error', message: 'حداقل یک فیلد برای پرونده تعریف کنید.' });
  }

  for (const field of definition.fields) {
    if (!KEY_PATTERN.test(field.key)) {
      issues.push({
        level: 'error',
        message: `کلید فیلد «${field.key}» معتبر نیست.`,
        path: `fields.${field.key}`,
      });
    }
    if (fieldKeys.has(field.key)) {
      issues.push({
        level: 'error',
        message: `کلید فیلد «${field.key}» تکراری است.`,
        path: `fields.${field.key}`,
      });
    }
    fieldKeys.add(field.key);
    if (
      ['select', 'radio', 'multiselect'].includes(field.type) &&
      !(field.options?.length ?? 0)
    ) {
      issues.push({
        level: 'warning',
        message: `فیلد انتخابی «${field.label}» گزینه‌ای ندارد.`,
        path: `fields.${field.key}`,
      });
    }
  }

  for (const field of definition.fields) {
    if (field.visibleWhen && !fieldKeys.has(field.visibleWhen.field)) {
      issues.push({
        level: 'error',
        message: `شرط نمایش «${field.label}» به فیلد ناموجود اشاره می‌کند.`,
        path: `fields.${field.key}`,
      });
    }
  }

  if (!definition.stages.length) {
    issues.push({ level: 'error', message: 'حداقل یک مرحله تعریف کنید.' });
  }

  if (definition.stages.length > 7) {
    issues.push({
      level: 'warning',
      message: 'تعداد مراحل بیش از حد پیشنهادی است؛ سادگی فرآیند را بررسی کنید.',
    });
  }

  let approvalCount = 0;

  for (const [stageIndex, stage] of definition.stages.entries()) {
    if (!KEY_PATTERN.test(stage.key)) {
      issues.push({
        level: 'error',
        message: `کلید مرحله «${stage.key}» معتبر نیست.`,
        path: `stages.${stageIndex}`,
      });
    }
    if (stageKeys.has(stage.key)) {
      issues.push({
        level: 'error',
        message: `کلید مرحله «${stage.key}» تکراری است.`,
        path: `stages.${stageIndex}`,
      });
    }
    stageKeys.add(stage.key);

    for (const role of [
      ...(stage.permissions?.editRoles ?? []),
      ...(stage.permissions?.uploadRoles ?? []),
    ]) {
      if (!ROLE_KEYS.includes(role)) {
        issues.push({
          level: 'error',
          message: `نقش «${role}» در دسترسی‌های مرحله «${stage.name}» معتبر نیست.`,
          path: `stages.${stage.key}.permissions`,
        });
      }
    }

    if (!stage.tasks.length) {
      issues.push({
        level: 'warning',
        message: `مرحله «${stage.name}» کار ندارد و به‌صورت خودکار عبور می‌کند.`,
        path: `stages.${stage.key}`,
      });
    }

    for (const task of stage.tasks) {
      if (!KEY_PATTERN.test(task.key)) {
        issues.push({
          level: 'error',
          message: `کلید کار «${task.key}» معتبر نیست.`,
          path: `stages.${stage.key}.tasks.${task.key}`,
        });
      }
      if (taskKeys.has(task.key)) {
        issues.push({
          level: 'error',
          message: `کلید کار «${task.key}» تکراری است؛ در کل فرآیند باید یکتا باشد.`,
          path: `stages.${stage.key}.tasks.${task.key}`,
        });
      }
      taskKeys.add(task.key);

      if (task.kind === 'approval') approvalCount += 1;

      if (task.assignee.type === 'role') {
        if (!task.assignee.value || !ROLE_KEYS.includes(task.assignee.value as never)) {
          issues.push({
            level: 'error',
            message: `نقش مسئول کار «${task.name}» معتبر نیست.`,
            path: `stages.${stage.key}.tasks.${task.key}`,
          });
        }
      } else if (task.assignee.type === 'user' && !task.assignee.value) {
        issues.push({
          level: 'error',
          message: `کار «${task.name}» کاربر مسئول ندارد.`,
          path: `stages.${stage.key}.tasks.${task.key}`,
        });
      } else if (!task.assignee.type) {
        issues.push({
          level: 'error',
          message: `کار «${task.name}» مسئول ندارد.`,
          path: `stages.${stage.key}.tasks.${task.key}`,
        });
      }

      for (const fieldKey of task.formFields ?? []) {
        if (!fieldKeys.has(fieldKey)) {
          issues.push({
            level: 'error',
            message: `کار «${task.name}» به فیلد ناموجود «${fieldKey}» اشاره می‌کند.`,
            path: `stages.${stage.key}.tasks.${task.key}`,
          });
        }
      }

      if (task.condition && !fieldKeys.has(task.condition.field)) {
        issues.push({
          level: 'error',
          message: `شرط کار «${task.name}» به فیلد ناموجود اشاره می‌کند.`,
          path: `stages.${stage.key}.tasks.${task.key}`,
        });
      }

      for (const documentKey of task.requiredDocuments ?? []) {
        if (!(definition.documents ?? []).some((document) => document.key === documentKey)) {
          issues.push({
            level: 'error',
            message: `کار «${task.name}» به مدرک ناموجود «${documentKey}» اشاره می‌کند.`,
            path: `stages.${stage.key}.tasks.${task.key}`,
          });
        }
      }
    }
  }

  if (definition.stages[0] && !definition.stages[0].tasks.length) {
    issues.push({
      level: 'error',
      message: 'مرحله اول باید حداقل یک کار داشته باشد.',
      path: 'stages.0',
    });
  }

  for (const document of definition.documents ?? []) {
    if (documentKeys.has(document.key)) {
      issues.push({
        level: 'error',
        message: `کلید مدرک «${document.key}» تکراری است.`,
        path: `documents.${document.key}`,
      });
    }
    documentKeys.add(document.key);
    if (document.stageKey && !stageKeys.has(document.stageKey)) {
      issues.push({
        level: 'error',
        message: `مدرک «${document.name}» به مرحله ناموجود اشاره می‌کند.`,
        path: `documents.${document.key}`,
      });
    }
  }

  if (definition.settings?.titleField && !fieldKeys.has(definition.settings.titleField)) {
    issues.push({
      level: 'error',
      message: 'فیلد عنوان پرونده معتبر نیست.',
      path: 'settings.titleField',
    });
  }

  if (definition.settings?.descriptionField && !fieldKeys.has(definition.settings.descriptionField)) {
    issues.push({
      level: 'error',
      message: 'فیلد توضیحات پرونده معتبر نیست.',
      path: 'settings.descriptionField',
    });
  }

  if (approvalCount > 3) {
    issues.push({
      level: 'warning',
      message: 'تعداد مراحل تأیید بیش از سه سطح است؛ سادگی را بررسی کنید.',
    });
  }

  return {
    ok: !issues.some((issue) => issue.level === 'error'),
    issues,
  };
}
