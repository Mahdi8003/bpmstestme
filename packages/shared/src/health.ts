import type { CaseTypeDefinition, FieldDef, HealthIssue, HealthResult } from './types.js';
import { ROLE_KEYS } from './types.js';

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function checkTableColumns(
  field: FieldDef,
  issues: HealthIssue[],
  path: string,
  context: string,
): void {
  if (field.type !== 'table') return;
  const columns = field.columns ?? [];
  if (!columns.length) {
    issues.push({
      level: 'error',
      message: `${context} «${field.label}» ستونی ندارد.`,
      path,
    });
    return;
  }
  const keys = new Set<string>();
  for (const column of columns) {
    if (column.type === 'table') {
      issues.push({
        level: 'error',
        message: `ستون «${column.label}» نمی‌تواند جدول تودرتو باشد.`,
        path: `${path}.${column.key}`,
      });
    }
    if (!KEY_PATTERN.test(column.key)) {
      issues.push({
        level: 'error',
        message: `کلید ستون «${column.key}» در ${context} «${field.label}» معتبر نیست.`,
        path: `${path}.${column.key}`,
      });
    }
    if (keys.has(column.key)) {
      issues.push({
        level: 'error',
        message: `کلید ستون «${column.key}» در ${context} «${field.label}» تکراری است.`,
        path: `${path}.${column.key}`,
      });
    }
    keys.add(column.key);
    if (
      ['select', 'radio', 'multiselect'].includes(column.type) &&
      !(column.options?.length ?? 0)
    ) {
      issues.push({
        level: 'warning',
        message: `ستون انتخابی «${column.label}» گزینه‌ای ندارد.`,
        path: `${path}.${column.key}`,
      });
    }
    if (column.type === 'master' && !column.masterTypeKey) {
      issues.push({
        level: 'error',
        message: `ستون «${column.label}» نوع داده پایه مقصد را مشخص نکرده است.`,
        path: `${path}.${column.key}`,
      });
    }
  }
}

export interface CaseTypeHealthOptions {
  /** Tenant-defined role keys. Defaults to the built-in roles. */
  knownRoles?: Iterable<string>;
  /** Active tenant user ids used to validate direct user assignments. */
  knownUserIds?: Iterable<string>;
}

export function checkCaseTypeHealth(
  definition: CaseTypeDefinition,
  options: CaseTypeHealthOptions = {},
): HealthResult {
  const issues: HealthIssue[] = [];
  const knownRoles = new Set(options.knownRoles ?? ROLE_KEYS);
  const knownUserIds = options.knownUserIds ? new Set(options.knownUserIds) : null;
  const fieldKeys = new Set<string>();
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  const documentKeys = new Set<string>();
  const allFields: FieldDef[] = [
    ...definition.fields,
    ...definition.stages.flatMap((stage) => stage.fields ?? []),
  ];
  const allFieldKeys = new Set(allFields.map((field) => field.key));
  const allFieldMap = new Map(allFields.map((field) => [field.key, field]));

  if (!definition.fields.length) {
    issues.push({
      level: 'error',
      message: 'حداقل یک فیلد برای پرونده تعریف کنید.',
      path: 'fields',
    });
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
    if (field.type === 'master' && !field.masterTypeKey) {
      issues.push({
        level: 'error',
        message: `فیلد «${field.label}» نوع داده پایه مقصد را مشخص نکرده است.`,
        path: `fields.${field.key}`,
      });
    }
    if (field.required && (field.hidden || field.readonly)) {
      issues.push({
        level: 'error',
        message: `فیلد «${field.label}» هم‌زمان الزامی و ${
          field.hidden ? 'پنهان' : 'فقط‌خواندنی'
        } است؛ این فیلد هرگز قابل تکمیل نیست.`,
        path: `fields.${field.key}`,
      });
    }
    checkTableColumns(field, issues, `fields.${field.key}.columns`, 'فیلد');
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
    issues.push({ level: 'error', message: 'حداقل یک مرحله تعریف کنید.', path: 'stages' });
  }

  if (definition.stages.length > 7) {
    issues.push({
      level: 'warning',
      message: 'تعداد مراحل بیش از حد پیشنهادی است؛ سادگی فرآیند را بررسی کنید.',
      path: 'stages',
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

    const effectiveFields = [...definition.fields, ...(stage.fields ?? [])];
    const effectiveFieldKeys = new Set(effectiveFields.map((field) => field.key));

    for (const field of stage.fields ?? []) {
      if (!KEY_PATTERN.test(field.key)) {
        issues.push({
          level: 'error',
          message: `کلید پارامتر «${field.key}» در مرحله «${stage.name}» معتبر نیست.`,
          path: `stages.${stageIndex}.fields.${field.key}`,
        });
      }
      if (fieldKeys.has(field.key)) {
        issues.push({
          level: 'error',
          message: `کلید پارامتر «${field.key}» در مرحله «${stage.name}» با فیلد دیگری تکراری است.`,
          path: `stages.${stageIndex}.fields.${field.key}`,
        });
      }
      fieldKeys.add(field.key);
      if (
        ['select', 'radio', 'multiselect'].includes(field.type) &&
        !(field.options?.length ?? 0)
      ) {
        issues.push({
          level: 'warning',
          message: `پارامتر انتخابی «${field.label}» در مرحله «${stage.name}» گزینه‌ای ندارد.`,
          path: `stages.${stageIndex}.fields.${field.key}`,
        });
      }
      if (field.type === 'master' && !field.masterTypeKey) {
        issues.push({
          level: 'error',
          message: `پارامتر «${field.label}» در مرحله «${stage.name}» نوع داده پایه مقصد را مشخص نکرده است.`,
          path: `stages.${stageIndex}.fields.${field.key}`,
        });
      }
      if (field.required && (field.hidden || field.readonly)) {
        issues.push({
          level: 'warning',
          message: `پارامتر «${field.label}» در مرحله «${stage.name}» هم‌زمان الزامی و ${
            field.hidden ? 'پنهان' : 'فقط‌خواندنی'
          } است؛ مطمئن شوید مقدار آن از مرحله قبل یا انتخاب جدول پر می‌شود.`,
          path: `stages.${stageIndex}.fields.${field.key}`,
        });
      }
      checkTableColumns(
        field,
        issues,
        `stages.${stageIndex}.fields.${field.key}.columns`,
        'پارامتر',
      );
      if (field.visibleWhen && !effectiveFieldKeys.has(field.visibleWhen.field)) {
        issues.push({
          level: 'error',
          message: `شرط نمایش پارامتر «${field.label}» در مرحله «${stage.name}» به فیلد ناموجود اشاره می‌کند.`,
          path: `stages.${stageIndex}.fields.${field.key}`,
        });
      }
    }

    for (const role of [
      ...(stage.permissions?.editRoles ?? []),
      ...(stage.permissions?.uploadRoles ?? []),
    ]) {
      if (!knownRoles.has(role)) {
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
        if (!task.assignee.value || !knownRoles.has(task.assignee.value)) {
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
      } else if (
        task.assignee.type === 'user' &&
        task.assignee.value &&
        knownUserIds &&
        !knownUserIds.has(task.assignee.value)
      ) {
        issues.push({
          level: 'error',
          message: `کاربر مسئول کار «${task.name}» در این سازمان فعال نیست.`,
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
        if (!effectiveFieldKeys.has(fieldKey)) {
          issues.push({
            level: 'error',
            message: `کار «${task.name}» به پارامتر ناموجود «${fieldKey}» در مرحله «${stage.name}» اشاره می‌کند.`,
            path: `stages.${stage.key}.tasks.${task.key}`,
          });
        }
      }

      if (task.condition && !effectiveFieldKeys.has(task.condition.field)) {
        issues.push({
          level: 'error',
          message: `شرط کار «${task.name}» به فیلد ناموجود اشاره می‌کند.`,
          path: `stages.${stage.key}.tasks.${task.key}`,
        });
      }

      if (task.kind === 'selection') {
        const selection = task.selection;
        if (!selection) {
          issues.push({
            level: 'error',
            message: `کار انتخاب «${task.name}» منبع جدول را مشخص نکرده است.`,
            path: `stages.${stage.key}.tasks.${task.key}`,
          });
        } else {
          const source = allFieldMap.get(selection.sourceField);
          if (!source) {
            issues.push({
              level: 'error',
              message: `کار انتخاب «${task.name}» به جدول ناموجود «${selection.sourceField}» اشاره می‌کند.`,
              path: `stages.${stage.key}.tasks.${task.key}`,
            });
          } else if (source.type !== 'table') {
            issues.push({
              level: 'error',
              message: `منبع کار انتخاب «${task.name}» باید از نوع جدول باشد.`,
              path: `stages.${stage.key}.tasks.${task.key}`,
            });
          } else {
            const columnKeys = new Set((source.columns ?? []).map((column) => column.key));
            if (selection.labelColumn && !columnKeys.has(selection.labelColumn)) {
              issues.push({
                level: 'error',
                message: `ستون برچسب کار انتخاب «${task.name}» در جدول «${source.label}» وجود ندارد.`,
                path: `stages.${stage.key}.tasks.${task.key}`,
              });
            }
            const targets = new Set<string>();
            for (const copy of selection.copy ?? []) {
              if (!columnKeys.has(copy.from)) {
                issues.push({
                  level: 'error',
                  message: `کار انتخاب «${task.name}» ستون ناموجود «${copy.from}» را کپی می‌کند.`,
                  path: `stages.${stage.key}.tasks.${task.key}`,
                });
              }
              if (!allFieldKeys.has(copy.to)) {
                issues.push({
                  level: 'error',
                  message: `کار انتخاب «${task.name}» مقدار را در فیلد ناموجود «${copy.to}» می‌نویسد.`,
                  path: `stages.${stage.key}.tasks.${task.key}`,
                });
              }
              if (targets.has(copy.to)) {
                issues.push({
                  level: 'error',
                  message: `فیلد مقصد «${copy.to}» در کار انتخاب «${task.name}» تکراری است.`,
                  path: `stages.${stage.key}.tasks.${task.key}`,
                });
              }
              targets.add(copy.to);
            }
          }
        }
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

  for (const stage of definition.stages) {
    const effectiveFieldKeys = new Set(
      [...definition.fields, ...(stage.fields ?? [])].map((field) => field.key),
    );
    const transitions = stage.transitions ?? [];
    const unconditional = transitions.filter((transition) => !transition.condition);
    if (transitions.length && !unconditional.length) {
      issues.push({
        level: 'warning',
        message: `مرحله «${stage.name}» مسیر پیش‌فرض ندارد؛ اگر هیچ شرطی برقرار نشود پرونده پایان می‌یابد.`,
        path: `stages.${stage.key}.transitions`,
      });
    }
    if (unconditional.length > 1) {
      issues.push({
        level: 'warning',
        message: `مرحله «${stage.name}» بیش از یک مسیر بدون شرط دارد؛ فقط اولین مسیر اجرا می‌شود.`,
        path: `stages.${stage.key}.transitions`,
      });
    }
    for (const [transitionIndex, transition] of transitions.entries()) {
      if (transition.condition && !effectiveFieldKeys.has(transition.condition.field)) {
        issues.push({
          level: 'error',
          message: `شرط خروج مرحله «${stage.name}» به پارامتر ناموجود اشاره می‌کند.`,
          path: `stages.${stage.key}.transitions.${transitionIndex}`,
        });
      }
      if (transition.type === 'stage') {
        if (!transition.stageKey || !stageKeys.has(transition.stageKey)) {
          issues.push({
            level: 'error',
            message: `مسیر خروج مرحله «${stage.name}» به مرحله ناموجود اشاره می‌کند.`,
            path: `stages.${stage.key}.transitions.${transitionIndex}`,
          });
        }
      }
      if (transition.type === 'case_type' && !transition.caseTypeKey) {
        issues.push({
          level: 'error',
          message: `مسیر خروج مرحله «${stage.name}» نوع فرآیند مقصد را مشخص نکرده است.`,
          path: `stages.${stage.key}.transitions.${transitionIndex}`,
        });
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
      path: 'stages',
    });
  }

  return {
    ok: !issues.some((issue) => issue.level === 'error'),
    issues,
  };
}
