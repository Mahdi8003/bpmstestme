import { useDeferredValue, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  type CaseListItem,
  type CaseStatus,
  type CaseTypeSummary,
} from '@ravand/shared';
import { CaretLeft, FolderSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { faNum } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, EmptyState, Skeleton, cn } from '@/components/ui';
import {
  CaseTypeIcon,
  DueChip,
  PriorityBadge,
  StatusBadge,
} from '@/components/domain';

export function CasesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const deferredSearch = useDeferredValue(search);
  const status = (params.get('status') ?? '') as CaseStatus | '';
  const type = params.get('type') ?? '';

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const types = useQuery({
    queryKey: ['case-types'],
    queryFn: () => api.get<CaseTypeSummary[]>('/case-types'),
    staleTime: 60_000,
  });

  const cases = useQuery({
    queryKey: ['cases', status, type, deferredSearch],
    queryFn: () => {
      const query = new URLSearchParams({ limit: '200' });
      if (status) query.set('status', status);
      if (type) query.set('type', type);
      if (deferredSearch.trim()) query.set('q', deferredSearch.trim());
      return api.get<CaseListItem[]>(`/cases?${query.toString()}`);
    },
    placeholderData: (previous) => previous,
  });

  const hasFilters = Boolean(status || type || search);
  const publishedTypes = (types.data ?? []).filter((item) => item.status === 'published');

  return (
    <div>
      <PageHeader
        eyebrow="پرونده‌ها"
        title="همه پرونده‌ها، یک نگاه."
        description="پرونده‌ها را بر اساس وضعیت، نوع یا عبارت جستجو کنید و وارد مسیر هر پرونده شوید."
        actions={
          <Link
            to="/cases/new"
            className="focus-ring inline-flex h-9 items-center justify-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50 transition hover:bg-ink-800"
          >
            پرونده جدید
          </Link>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line px-4 py-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجو در عنوان یا شماره پرونده…"
              className="focus-ring h-9 w-full rounded-lg border border-line bg-white/70 ps-9 pe-8 text-xs text-ink-800 placeholder:text-ink-400 focus:border-copper-400 focus:bg-white"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 end-2 my-auto flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-700"
                aria-label="پاک کردن جستجو"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:flex">
            <select
              value={type}
              onChange={(event) => setFilter('type', event.target.value)}
              className="focus-ring h-9 min-w-36 rounded-lg border border-line bg-white/70 px-2.5 text-[11px] text-ink-600 focus:border-copper-400"
              aria-label="نوع پرونده"
            >
              <option value="">همه انواع</option>
              {publishedTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => setFilter('status', event.target.value)}
              className="focus-ring h-9 min-w-28 rounded-lg border border-line bg-white/70 px-2.5 text-[11px] text-ink-600 focus:border-copper-400"
              aria-label="وضعیت پرونده"
            >
              <option value="">همه وضعیت‌ها</option>
              {CASE_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {CASE_STATUS_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
              className="focus-ring self-start rounded px-1.5 py-1 text-[10px] font-semibold text-copper-600 hover:bg-copper-50 lg:self-auto"
            >
              پاک کردن فیلترها
            </button>
          ) : null}
        </div>

        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_130px_100px_16px] gap-3 border-b border-line bg-paper-100/55 px-4 py-2 text-[9px] font-semibold tracking-wide text-ink-400 sm:grid">
          <span>پرونده</span>
          <span>نوع / مرحله</span>
          <span>مسئول</span>
          <span>وضعیت</span>
          <span />
        </div>

        {cases.isError ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-semibold text-ink-800">دریافت پرونده‌ها ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(cases.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void cases.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : cases.isLoading ? (
          <div className="divide-y divide-line/70">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : cases.data?.length ? (
          <>
            <div className="divide-y divide-line/70">
              {cases.data.map((item) => (
                <CaseTableRow key={item.id} item={item} />
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line bg-paper-100/40 px-4 py-2.5 text-[10px] text-ink-400">
              <span>{faNum(cases.data.length)} پرونده</span>
              <span>مرتب‌شده بر اساس آخرین حرکت</span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<FolderSimple size={30} />}
            title={hasFilters ? 'پرونده‌ای با این فیلترها پیدا نشد.' : 'هنوز پرونده‌ای ثبت نشده.'}
            description={
              hasFilters
                ? 'فیلترها را تغییر دهید یا عبارت جستجو را کوتاه‌تر کنید.'
                : 'اولین پرونده را ثبت کنید تا مسیر آن شروع شود.'
            }
            className="border-0 bg-transparent py-16"
          />
        )}
      </Card>
    </div>
  );
}

function CaseTableRow({ item }: { item: CaseListItem }) {
  return (
    <Link
      to={`/cases/${item.id}`}
      className="focus-ring group grid grid-cols-1 gap-2 px-4 py-3.5 transition-colors hover:bg-paper-100/70 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_130px_100px_16px] sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
          <CaseTypeIcon icon={item.caseTypeIcon} size={17} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-ink-900">{item.title}</span>
            {item.priority === 'high' ? <PriorityBadge priority="high" /> : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-400">
            <span className="font-mono" dir="ltr">
              {item.reference}
            </span>
            <span className="text-ink-300">·</span>
            <span className="sm:hidden">{item.caseTypeName}</span>
            <span className="md:hidden">
              <StatusBadge status={item.status} />
            </span>
          </div>
        </div>
      </div>

      <div className="min-w-0 ps-12 sm:ps-0">
        <div className="truncate text-[11px] font-medium text-ink-600">{item.caseTypeName}</div>
        <div className="mt-0.5 truncate text-[10px] text-ink-400">{item.stageName}</div>
      </div>

      <div className="truncate ps-12 text-[11px] text-ink-500 sm:ps-0">
        {item.assigneeName ?? item.createdByName ?? '—'}
      </div>

      <div className="hidden flex-col items-start gap-1 sm:flex">
        <StatusBadge status={item.status} />
        <DueChip value={item.dueAt} />
      </div>

      <CaretLeft
        size={15}
        className="hidden text-ink-300 transition-transform group-hover:-translate-x-0.5 group-hover:text-copper-500 sm:block"
      />
    </Link>
  );
}
