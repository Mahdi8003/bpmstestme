import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CASE_ICONS,
  type CaseTypeDetail,
  type TemplateSummary,
} from '@ravand/shared';
import {
  ArrowRight,
  Check,
  FilePlus,
  Info,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { hasPermission } from '@/lib/roles';
import { Button, Card, Field, Input, Skeleton, Textarea, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { CaseTypeIcon } from '@/components/domain';
import { useToast } from '@/components/ToastProvider';

export function BuilderNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: 'file',
    referencePrefix: '',
  });
  const [error, setError] = useState('');

  const canBuild = hasPermission(user, 'buildProcesses');
  const templates = useQuery({
    queryKey: ['case-type-templates'],
    queryFn: () => api.get<TemplateSummary[]>('/case-types/templates'),
    enabled: canBuild,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<CaseTypeDetail>('/case-types', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        icon: form.icon,
        referencePrefix: form.referencePrefix.trim().toUpperCase() || undefined,
        templateKey: selectedKey || undefined,
      }),
    onSuccess: (created) => {
      toast.success('فرآیند ساخته شد.', 'اکنون می‌توانید فرم و مراحل را ویرایش کنید.');
      navigate(`/builder/${created.id}`, { replace: true });
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  if (!canBuild) {
    return (
      <Card className="mx-auto mt-12 max-w-lg px-6 py-12 text-center">
        <ShieldCheck size={30} className="mx-auto text-ink-300" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">اجازهٔ ساخت فرآیند ندارید.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          این بخش برای مدیر، مدیر سیستم و طراح فرآیند در دسترس است.
        </p>
      </Card>
    );
  }

  const selectTemplate = (template: TemplateSummary | null) => {
    setSelectedKey(template?.key ?? '');
    if (template) {
      setForm({
        name: template.name,
        description: template.description,
        icon: template.icon,
        referencePrefix: template.referencePrefix,
      });
    } else {
      setForm({ name: '', description: '', icon: 'file', referencePrefix: '' });
    }
    setError('');
  };

  const selected = templates.data?.find((template) => template.key === selectedKey);

  return (
    <div>
      <Link
        to="/builder"
        className="focus-ring mb-4 inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
      >
        <ArrowRight size={13} />
        سازنده فرآیند
      </Link>

      <PageHeader
        eyebrow="فرآیند جدید"
        title="تعریف فرآیند"
        description="یک قالب شروع انتخاب کنید یا فرآیند را از صفر بسازید."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.78fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-xs font-semibold text-ink-900">قالب شروع</h2>
              <p className="mt-1 text-[10px] text-ink-400">
                قالب، فرم و گردش کار اولیه را آماده می‌کند و بعد از ساخت قابل ویرایش است.
              </p>
            </div>

            {templates.isError ? (
              <div className="px-6 py-12 text-center">
                <WarningCircle size={28} className="mx-auto text-stamp-500" />
                <p className="mt-3 text-sm font-semibold text-ink-800">دریافت قالب‌ها ممکن نشد.</p>
                <p className="mt-1 text-xs text-ink-400">{errorMessage(templates.error)}</p>
              </div>
            ) : templates.isLoading ? (
              <div className="divide-y divide-line/70">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 px-4 py-3.5">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-2 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-line/70">
                {(templates.data ?? []).map((template) => {
                  const active = selectedKey === template.key;
                  return (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => selectTemplate(template)}
                      className={cn(
                        'focus-ring flex w-full items-center gap-3 px-4 py-3.5 text-start transition',
                        active ? 'bg-copper-50/70' : 'hover:bg-paper-100/60',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          active
                            ? 'border-copper-500 bg-copper-500 text-on-accent'
                            : 'border-line bg-paper-50',
                        )}
                      >
                        {active ? <Check size={10} weight="bold" /> : null}
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-paper-50 text-ink-500">
                        <CaseTypeIcon icon={template.icon} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-ink-800">
                          {template.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-ink-400">
                          {template.description}
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-3 font-mono text-[10px] text-ink-400 sm:flex">
                        <span>{faNum(template.definition.stages.length)} مرحله</span>
                        <span>{faNum(template.definition.fields.length)} فیلد</span>
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => selectTemplate(null)}
                  className={cn(
                    'focus-ring flex w-full items-center gap-3 px-4 py-3.5 text-start transition',
                    selectedKey === '' ? 'bg-copper-50/70' : 'hover:bg-paper-100/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      selectedKey === ''
                        ? 'border-copper-500 bg-copper-500 text-on-accent'
                        : 'border-line bg-paper-50',
                    )}
                  >
                    {selectedKey === '' ? <Check size={10} weight="bold" /> : null}
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-paper-50 text-ink-500">
                    <FilePlus size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-ink-800">شروع از صفر</span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">
                      مسیر خالی برای طراحی کامل فرم و گردش کار
                    </span>
                  </span>
                </button>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-900">اطلاعات فرآیند</h2>
            </div>
            <div className="space-y-4 px-4 py-4">
              <Field label="نام فرآیند" required hint="نامی که در فهرست و هنگام ثبت پرونده دیده می‌شود.">
                <Input
                  value={form.name}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, name: event.target.value }));
                    setError('');
                  }}
                  placeholder="مثلاً درخواست خرید"
                />
              </Field>
              <Field label="توضیح کوتاه">
                <Textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  className="min-h-20"
                  placeholder="این فرآیند چه چیزی را مدیریت می‌کند؟"
                />
              </Field>
              <Field
                label="پیشوند شماره پرونده"
                hint="۲ تا ۸ حرف لاتین؛ خالی بگذارید تا خودکار و یکتا ساخته شود."
              >
                <Input
                  value={form.referencePrefix}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      referencePrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    }))
                  }
                  dir="ltr"
                  maxLength={8}
                  placeholder="PUR"
                />
              </Field>
              <Field label="آیکون فرآیند">
                <div className="flex flex-wrap gap-1.5">
                  {CASE_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, icon }))}
                      className={cn(
                        'focus-ring flex h-8 w-8 items-center justify-center rounded-md border transition',
                        form.icon === icon
                          ? 'border-copper-400 bg-copper-50 text-copper-600'
                          : 'border-line bg-paper-50/60 text-ink-400 hover:border-ink-300 hover:text-ink-700',
                      )}
                      aria-label={icon}
                    >
                      <CaseTypeIcon icon={icon} size={15} />
                    </button>
                  ))}
                </div>
              </Field>

              {selected ? (
                <div className="rounded-lg border border-line bg-paper-100/55 px-3 py-2.5 text-[10px] leading-6 text-ink-500">
                  <span className="font-semibold text-ink-700">قالب «{selected.name}»</span>
                  <br />
                  {faNum(selected.definition.stages.length)} مرحله و{' '}
                  {faNum(selected.definition.fields.length)} فیلد آمادهٔ ویرایش می‌شود.
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-[10px] leading-6 text-ink-400">
                  <Info size={13} className="mt-0.5 shrink-0" />
                  با شروع از صفر، یک مرحله و یک کار پیش‌فرض ساخته می‌شود تا مسیر را از همان‌جا بچینید.
                </div>
              )}

              {error ? (
                <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
                  {error}
                </p>
              ) : null}

              <Button
                variant="ink"
                className="w-full"
                loading={create.isPending}
                disabled={!form.name.trim() || form.name.trim().length < 2}
                onClick={() => {
                  if (form.referencePrefix.trim().length === 1) {
                    setError('پیشوند شماره پرونده باید بین ۲ تا ۸ نویسه باشد.');
                    return;
                  }
                  setError('');
                  create.mutate();
                }}
              >
                ساخت و ورود به ویرایشگر
              </Button>
              {form.name.trim().length < 2 ? (
                <p className="text-center text-[10px] leading-5 text-ink-400">
                  برای فعال شدن دکمه، نام فرآیند را (حداقل ۲ حرف) وارد کنید.
                </p>
              ) : null}
            </div>
          </Card>

          <div className="rounded-md border border-line bg-paper-100/60 p-4 text-[10px] leading-6 text-ink-500">
            <span className="font-semibold text-ink-700">راهنما:</span> پس از ساخت، ابتدا فیلدهای فرم را
            کامل کنید، سپس مراحل و مسئول هر کار را مشخص کنید. پیش از انتشار، اعتبارسنجی ساختار را اجرا
            کنید.
          </div>
        </aside>
      </div>
    </div>
  );
}
