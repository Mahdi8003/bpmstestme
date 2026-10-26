import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  validateCaseData,
  type CaseDetail,
  type CaseTypeDetail,
  type CaseTypeSummary,
  type ValidationIssue,
} from '@ravand/shared';
import {
  ArrowLeft,
  ArrowRight,
  CaretLeft,
  Check,
  Info,
  Plus,
  Spinner,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { faNum, roleLabel } from '@/lib/format';
import { Button, Card, Field, Input, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { CaseTypeIcon } from '@/components/domain';
import { DynamicFields, fieldDisplayValue, useMasterOptions } from '@/components/DynamicFields';
import { useToast } from '@/components/ToastProvider';

export function NewCasePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const options = useMasterOptions();
  const typeId = params.get('type') ?? '';
  const [data, setData] = useState<Record<string, unknown>>({});
  const [title, setTitle] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState('');

  const types = useQuery({
    queryKey: ['case-types'],
    queryFn: () => api.get<CaseTypeSummary[]>('/case-types'),
    staleTime: 60_000,
  });

  const typeDetail = useQuery({
    queryKey: ['case-type', typeId],
    queryFn: () => api.get<CaseTypeDetail>(`/case-types/${typeId}`),
    enabled: Boolean(typeId),
  });

  const definition = typeDetail.data?.definition;

  useEffect(() => {
    if (!definition) return;
    const initial: Record<string, unknown> = {};
    for (const field of definition.fields) {
      initial[field.key] =
        field.type === 'checkbox' ? false : field.type === 'multiselect' ? [] : '';
    }
    setData(initial);
    setTitle('');
    setIssues([]);
    setError('');
  }, [definition]);

  const createCase = useMutation({
    mutationFn: () =>
      api.post<CaseDetail>('/cases', {
        caseTypeId: typeId,
        title: definition?.settings?.titleField ? undefined : title.trim() || undefined,
        data,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('پرونده ثبت شد.', 'اولین مرحلهٔ مسیر پرونده آغاز شد.');
      navigate(`/cases/${created.id}`, { replace: true });
    },
    onError: (caught) => {
      setError(errorMessage(caught));
      setIssues(issuesOf(caught));
    },
  });

  const publishedTypes = (types.data ?? []).filter((item) => item.status === 'published');

  if (!typeId) {
    return (
      <div>
        <PageHeader
          eyebrow="پرونده جدید"
          title="از کجا شروع می‌کنیم؟"
          description="نوع پرونده را انتخاب کنید. مسیر، مراحل و مدارک هر نوع از پیش تعریف شده است."
          actions={
            <Link
              to="/cases"
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white/55 px-3.5 text-xs font-semibold text-ink-600 hover:bg-white"
            >
              <ArrowRight size={14} />
              بازگشت به پرونده‌ها
            </Link>
          }
        />

        {types.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="h-44 space-y-4 p-5">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-2.5 w-full" />
              </Card>
            ))}
          </div>
        ) : types.isError ? (
          <Card className="px-6 py-12 text-center">
            <WarningCircle size={28} className="mx-auto text-stamp-500" />
            <p className="mt-3 text-sm font-semibold text-ink-800">دریافت انواع پرونده ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(types.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void types.refetch()}>
              تلاش دوباره
            </Button>
          </Card>
        ) : publishedTypes.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {publishedTypes.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams({ type: item.id })}
                className="focus-ring animate-rise group relative flex flex-col rounded-xl border border-line bg-paper-50 p-5 text-start shadow-folio transition hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink-600 transition group-hover:border-copper-200 group-hover:bg-copper-50 group-hover:text-copper-600">
                    <CaseTypeIcon icon={item.icon} size={21} />
                  </span>
                  <span className="rounded border border-line bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] text-ink-400" dir="ltr">
                    {item.referencePrefix}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-ink-900">{item.name}</h2>
                  {item.hasDraftChanges ? (
                    <span className="rounded bg-ochre-50 px-1.5 py-0.5 text-[9px] font-semibold text-ochre-600">
                      پیش‌نویس
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-6 text-ink-500">
                  {item.description}
                </p>
                <div className="mt-auto flex items-center justify-between pt-4 text-[10px] text-ink-400">
                  <span>{faNum(item.caseCount)} پرونده ثبت‌شده</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-copper-600">
                    شروع
                    <CaretLeft
                      size={12}
                      className="transition-transform group-hover:-translate-x-0.5"
                    />
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Card className="px-6 py-14 text-center">
            <Info size={28} className="mx-auto text-ink-300" />
            <p className="mt-3 text-sm font-semibold text-ink-800">هنوز نوع پروندهٔ منتشرشده‌ای وجود ندارد.</p>
            <p className="mt-1 text-xs text-ink-400">
              مدیر یا طراح فرآیند باید ابتدا یک نوع پرونده را منتشر کند.
            </p>
          </Card>
        )}

        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-dashed border-line px-4 py-3 text-[10px] leading-6 text-ink-400">
          <Info size={14} className="mt-0.5 shrink-0 text-ink-300" />
          هر نوع پرونده، مجموعه‌ای از فیلدها، مراحل و کارها را با خود دارد. پس از ثبت، اولین کار برای نقش
          مسئول همان مرحله ایجاد می‌شود.
        </div>
      </div>
    );
  }

  if (typeDetail.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-1/2" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <Skeleton className="h-[430px] rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (typeDetail.isError || !typeDetail.data || !definition) {
    return (
      <Card className="mx-auto mt-10 max-w-lg px-6 py-12 text-center">
        <WarningCircle size={30} className="mx-auto text-stamp-500" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">این نوع پرونده در دسترس نیست.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          {typeDetail.isError ? errorMessage(typeDetail.error) : 'ممکن است این نوع منتشر نشده باشد.'}
        </p>
        <button
          type="button"
          onClick={() => setParams({})}
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50"
        >
          انتخاب نوع دیگر
        </button>
      </Card>
    );
  }

  const type = typeDetail.data;
  const titleField = definition.settings?.titleField;
  const titleFieldDef = definition.fields.find((field) => field.key === titleField);
  const rawTitleValue = titleField ? data[titleField] : undefined;
  const hasTitleValue =
    rawTitleValue !== undefined && rawTitleValue !== null && rawTitleValue !== '';
  const titleValue = titleField
    ? hasTitleValue && titleFieldDef
      ? fieldDisplayValue(titleFieldDef, rawTitleValue, options.data)
      : ''
    : title;

  const submit = () => {
    const nextIssues = validateCaseData(definition.fields, data);
    if (!titleField && !title.trim()) {
      nextIssues.push({ field: 'title', message: 'عنوان پرونده الزامی است.' });
    }
    if (nextIssues.length) {
      setIssues(nextIssues);
      setError('برای ثبت پرونده، موارد مشخص‌شده را کامل کنید.');
      return;
    }
    setIssues([]);
    setError('');
    createCase.mutate();
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setParams({})}
        className="focus-ring mb-4 inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
      >
        <ArrowRight size={13} />
        انتخاب نوع پرونده
      </button>

      <PageHeader
        eyebrow={`پرونده جدید · ${type.name}`}
        title="اطلاعات اولیه را تکمیل کنید."
        description="هر فیلد را با دقت پر کنید؛ همین اطلاعات پایهٔ مسیر تأیید و کارهای بعدی است."
        actions={
          <Button
            variant="ink"
            size="md"
            icon={<Plus size={16} />}
            loading={createCase.isPending}
            onClick={submit}
          >
            ثبت و شروع
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink-600">
                <CaseTypeIcon icon={type.icon} size={18} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink-900">{type.name}</h2>
                <p className="mt-0.5 text-[10px] text-ink-400">{type.description}</p>
              </div>
            </div>

            <div className="px-4 py-4">
              <div className="mb-4 rounded-lg border border-line bg-paper-100/55 px-3 py-2.5">
                <div className="text-[9px] font-semibold tracking-wide text-ink-400">عنوان پرونده</div>
                <div className="mt-1 text-xs font-semibold text-ink-800">
                  {titleValue || 'پس از تکمیل فیلدها ساخته می‌شود'}
                </div>
                {titleFieldDef ? (
                  <div className="mt-1 text-[9px] text-ink-400">
                    از فیلد «{titleFieldDef.label}» ساخته می‌شود.
                  </div>
                ) : null}
              </div>

              {!titleField ? (
                <Field label="عنوان پرونده" required className="mb-4">
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="عنوانی کوتاه و گویا برای این پرونده"
                  />
                </Field>
              ) : null}

              <DynamicFields
                fields={definition.fields}
                values={data}
                onChange={(key, value) => {
                  setData((current) => ({ ...current, [key]: value }));
                  setError('');
                  setIssues([]);
                }}
                options={options.data}
                layout={definition.settings?.formLayout}
                disabled={createCase.isPending}
              />

              {error ? (
                <div className="mt-4 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stamp-700">
                    <WarningCircle size={14} />
                    {error}
                  </div>
                  {issues.length ? (
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] leading-5 text-stamp-600">
                      {issues.map((issue, index) => (
                        <li key={`${issue.field ?? 'issue'}-${index}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper-100/40 px-4 py-3">
              <p className="text-[10px] leading-5 text-ink-400">
                ثبت پرونده، اولین کار را برای مسئول مرحلهٔ اول ایجاد می‌کند.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setParams({})}>
                  انصراف
                </Button>
                <Button
                  variant="ink"
                  loading={createCase.isPending}
                  icon={<ArrowLeft size={15} />}
                  onClick={submit}
                >
                  ثبت پرونده
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink-900">مسیر این پرونده</h2>
            <p className="mt-0.5 text-[10px] text-ink-400">
              {faNum(definition.stages.length)} مرحله تا بسته‌شدن
            </p>
            <div className="mt-4">
              {definition.stages.map((stage, index) => (
                <div key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < definition.stages.length - 1 ? (
                    <span className="absolute bottom-0 right-[10px] top-6 w-px bg-line" />
                  ) : null}
                  <span
                    className={
                      index === 0
                        ? 'relative z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-[8px] font-bold text-paper-50'
                        : 'relative z-10 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border border-line bg-paper-50 font-mono text-[8px] text-ink-400'
                    }
                  >
                    {faNum(index + 1)}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="text-[11px] font-semibold text-ink-800">{stage.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {stage.tasks.map((task) => (
                        <span
                          key={task.key}
                          className="rounded bg-paper-100 px-1.5 py-0.5 text-[9px] text-ink-500"
                        >
                          {assigneeLabel(task.assignee)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="rounded-xl border border-copper-200 bg-copper-50/55 p-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-copper-600">
                <Check size={14} weight="bold" />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-copper-800">پس از ثبت چه می‌شود؟</p>
                <p className="mt-1 text-[10px] leading-6 text-copper-700/80">
                  پرونده ساخته می‌شود، اولین کار به نقش مسئول مرحلهٔ اول می‌رسد و شما می‌توانید مسیر و
                  سابقه را از صفحهٔ پرونده دنبال کنید.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {options.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-[10px] text-ink-400">
          <Spinner size={13} />
          در حال دریافت داده‌های پایه…
        </div>
      ) : null}
    </div>
  );
}

function assigneeLabel(assignee: { type: string; value?: string }): string {
  if (assignee.type === 'role') return roleLabel(assignee.value ?? 'member');
  if (assignee.type === 'creator') return 'ثبت‌کننده';
  if (assignee.type === 'manager') return 'مدیر';
  return 'کاربر';
}

function issuesOf(error: unknown): ValidationIssue[] {
  if (
    error &&
    typeof error === 'object' &&
    'details' in error &&
    Array.isArray((error as { details?: unknown }).details)
  ) {
    return (error as { details: ValidationIssue[] }).details;
  }
  return [];
}
