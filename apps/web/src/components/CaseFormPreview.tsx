import { useEffect, useState } from 'react';
import {
  validateCaseData,
  type CaseTypeDefinition,
  type ValidationIssue,
} from '@ravand/shared';
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react';
import { Button, Field, Input } from './ui';
import { DynamicFields, fieldDisplayValue, type MasterOptions } from './DynamicFields';
import { faNum } from '@/lib/format';
import { useRoleName } from '@/lib/roles';

/**
 * پیش‌نمایش فرم ثبت پرونده.
 * دقیقاً همان فیلدهایی را نشان می‌دهد که ثبت‌کننده می‌بیند و هیچ داده‌ای ذخیره نمی‌کند.
 */
export function CaseFormPreview({
  definition,
  options,
  onClose,
}: {
  definition: CaseTypeDefinition;
  options?: MasterOptions;
  onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>({});
  const [title, setTitle] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const roleName = useRoleName();

  useEffect(() => {
    const initial: Record<string, unknown> = {};
    for (const field of definition.fields) {
      initial[field.key] =
        field.type === 'checkbox'
          ? false
          : field.type === 'multiselect' || field.type === 'table'
            ? []
            : '';
    }
    setData(initial);
    setTitle('');
    setIssues(null);
  }, [definition]);

  const titleFieldKey = definition.settings?.titleField;
  const titleFieldDef = titleFieldKey
    ? definition.fields.find((field) => field.key === titleFieldKey)
    : undefined;
  const rawTitle = titleFieldKey ? data[titleFieldKey] : undefined;
  const hasTitle = rawTitle !== undefined && rawTitle !== null && rawTitle !== '';
  const titlePreview = titleFieldKey
    ? hasTitle && titleFieldDef
      ? fieldDisplayValue(titleFieldDef, rawTitle, options)
      : ''
    : title;
  const firstStage = definition.stages[0];
  const firstTask = firstStage?.tasks[0];

  const simulate = () => {
    const next = validateCaseData(definition.fields, data);
    if (!titleFieldKey && !title.trim()) {
      next.push({ field: 'title', message: 'عنوان پرونده الزامی است.' });
    }
    setIssues(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-line bg-paper-100/60 px-3 py-2.5 text-[10px] leading-6 text-ink-500">
        <Info size={14} className="mt-0.5 shrink-0 text-ink-400" />
        <p>
          این پیش‌نمایش فقط برای بررسی است؛ هر چه اینجا پر کنید ذخیره نمی‌شود و پرونده‌ای ساخته
          نمی‌شود.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-paper-100/55 px-3 py-2.5">
        <div className="text-[9px] font-semibold tracking-wide text-ink-400">عنوان پرونده</div>
        <div className="mt-1 text-xs font-semibold text-ink-800">
          {titlePreview || 'پس از تکمیل فیلدها ساخته می‌شود'}
        </div>
        {titleFieldDef ? (
          <div className="mt-1 text-[9px] text-ink-400">
            از فیلد «{titleFieldDef.label}» ساخته می‌شود.
          </div>
        ) : (
          <div className="mt-1 text-[9px] text-ink-400">
            فیلد عنوان تعیین نشده است؛ ثبت‌کننده خودش عنوان را وارد می‌کند.
          </div>
        )}
      </div>

      {!titleFieldKey ? (
        <Field label="عنوان پرونده" required>
          <Input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setIssues(null);
            }}
            placeholder="عنوانی کوتاه و گویا برای این پرونده"
          />
        </Field>
      ) : null}

      <DynamicFields
        fields={definition.fields}
        values={data}
        onChange={(key, value) => {
          setData((current) => ({ ...current, [key]: value }));
          setIssues(null);
        }}
        options={options}
        layout={definition.settings?.formLayout}
      />

      {issues && issues.length ? (
        <div className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stamp-700">
            <WarningCircle size={14} />
            فرم هنوز آمادهٔ ثبت نیست.
          </div>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] leading-5 text-stamp-600">
            {issues.map((issue, index) => (
              <li key={`${issue.field ?? 'issue'}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {issues && !issues.length ? (
        <div className="rounded-lg border border-verdigris-100 bg-verdigris-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-verdigris-700">
            <CheckCircle size={14} />
            این فرم با داده‌های نمونه قابل ثبت است.
          </div>
          <p className="mt-1 text-[10px] leading-5 text-verdigris-600">
            پس از ثبت، پرونده در مرحلهٔ «{firstStage?.name ?? '—'}» قرار می‌گیرد
            {firstTask ? ` و کار «${firstTask.name}» برای ${assigneeText(firstTask, roleName)} باز می‌شود.` : '.'}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed border-line px-3 py-2.5">
        <div className="text-[9px] font-semibold text-ink-400">مسیر پس از ثبت</div>
        <ol className="mt-1.5 space-y-1">
          {definition.stages.length ? (
            definition.stages.map((stage, index) => (
              <li key={stage.key} className="flex items-center gap-1.5 text-[10px] text-ink-500">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-paper-50 font-mono text-[8px] text-ink-400">
                  {faNum(index + 1)}
                </span>
                <span className="font-medium text-ink-700">{stage.name}</span>
                <span className="text-ink-400">
                  {stage.tasks.length
                    ? `${faNum(stage.tasks.length)} کار`
                    : 'بدون کار · عبور خودکار'}
                </span>
              </li>
            ))
          ) : (
            <li className="text-[10px] text-ink-400">مرحله‌ای تعریف نشده است.</li>
          )}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-[9px] text-ink-400">
          {definition.fields.length
            ? `${faNum(definition.fields.length)} فیلد در این فرم`
            : 'این فرم هنوز فیلدی ندارد.'}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
          <Button variant="paper" onClick={simulate} disabled={!definition.fields.length}>
            بررسی با دادهٔ نمونه
          </Button>
        </div>
      </div>
    </div>
  );
}

function assigneeText(
  task: { assignee: { type: string; value?: string } },
  roleName: (key: string | null | undefined) => string,
): string {
  if (task.assignee.type === 'role') return `نقش ${roleName(task.assignee.value)}`;
  if (task.assignee.type === 'creator') return 'ثبت‌کننده';
  if (task.assignee.type === 'manager') return 'مدیر پرونده';
  return 'کاربر مسئول';
}
