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
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
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

  const canBuild = Boolean(user && ['admin', 'builder', 'manager'].includes(user.role));
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
        title="با یک الگو شروع کنید یا از صفر بسازید."
        description="قالب‌ها فرم، مراحل و کارهای اولیه را آماده می‌کنند. بعد از ساخت، همه‌چیز قابل ویرایش است."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.78fr)]">
        <div className="space-y-5">
          {templates.isError ? (
            <Card className="px-6 py-12 text-center">
              <WarningCircle size={28} className="mx-auto text-stamp-500" />
              <p className="mt-3 text-sm font-semibold text-ink-800">دریافت قالب‌ها ممکن نشد.</p>
              <p className="mt-1 text-xs text-ink-400">{errorMessage(templates.error)}</p>
            </Card>
          ) : templates.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="h-40 space-y-4 p-5">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-full" />
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-[11px] font-semibold text-ink-500">از یک قالب آماده</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(templates.data ?? []).map((template) => {
                    const active = selectedKey === template.key;
                    return (
                      <button
                        key={template.key}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        className={cn(
                          'focus-ring group relative flex flex-col rounded-xl border bg-paper-50 p-4 text-start transition',
                          active
                            ? 'border-copper-400 shadow-[0_0_0_3px_var(--color-copper-100)]'
                            : 'border-line hover:border-ink-300 hover:bg-white',
                        )}
                      >
                        {active ? (
                          <span className="absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-copper-500 text-white">
                            <Check size={12} weight="bold" />
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg border',
                            active
                              ? 'border-copper-200 bg-copper-50 text-copper-600'
                              : 'border-line bg-white text-ink-500',
                          )}
                        >
                          <CaseTypeIcon icon={template.icon} size={18} />
                        </span>
                        <span className="mt-3 text-xs font-semibold text-ink-800">{template.name}</span>
                        <span className="mt-1 line-clamp-2 text-[10px] leading-5 text-ink-400">
                          {template.description}
                        </span>
                        <span className="mt-3 flex gap-2 text-[9px] text-ink-300">
                          <span>{faNum(template.definition.stages.length)} مرحله</span>
                          <span>·</span>
                          <span>{faNum(template.definition.fields.length)} فیلد</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-[11px] font-semibold text-ink-500">یا</h2>
                <button
                  type="button"
                  onClick={() => selectTemplate(null)}
                  className={cn(
                    'focus-ring flex w-full items-center gap-3 rounded-xl border bg-paper-50 px-4 py-3.5 text-start transition',
                    selectedKey === ''
                      ? 'border-copper-400 shadow-[0_0_0_3px_var(--color-copper-100)]'
                      : 'border-line hover:border-ink-300 hover:bg-white',
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
                    <FilePlus size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-ink-800">شروع از صفر</span>
                    <span className="mt-0.5 block text-[10px] text-ink-400">
                      یک مسیر خالی برای طراحی کامل فرم و مراحل
                    </span>
                  </span>
                  {selectedKey === '' ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-copper-500 text-white">
                      <Check size={12} weight="bold" />
                    </span>
                  ) : null}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Sparkle size={15} className="text-copper-500" />
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
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="پیشوند شماره پرونده" hint="۲ تا ۸ حرف لاتین">
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
                <Field label="نگاره">
                  <div className="flex h-10 items-center justify-center rounded-lg border border-line bg-white">
                    <CaseTypeIcon icon={form.icon} size={19} className="text-ink-600" />
                  </div>
                </Field>
              </div>
              <Field label="نگارهٔ فرآیند">
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
                          : 'border-line bg-white/60 text-ink-400 hover:border-ink-300 hover:text-ink-700',
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
                onClick={() => create.mutate()}
              >
                ساخت و ورود به ویرایشگر
              </Button>
            </div>
          </Card>

          <div className="rounded-xl border border-line bg-paper-200/45 p-4 text-[10px] leading-6 text-ink-500">
            <span className="font-semibold text-ink-700">پیشنهاد:</span> پس از ساخت، ابتدا فیلدهای فرم را
            کامل کنید، سپس مراحل و مسئول هر کار را مشخص کنید. پیش از انتشار، بررسی سلامت را اجرا کنید.
          </div>
        </aside>
      </div>
    </div>
  );
}
