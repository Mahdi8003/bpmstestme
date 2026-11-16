import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseTypeSummary } from '@ravand/shared';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowsClockwise,
  Copy,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  SquaresFour,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatDateTime } from '@/lib/format';
import { hasPermission } from '@/lib/roles';
import { Button, Card, ConfirmDialog, EmptyState, Skeleton, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { CaseTypeIcon } from '@/components/domain';
import { useToast } from '@/components/ToastProvider';

const statusLabels: Record<CaseTypeSummary['status'], string> = {
  published: 'منتشرشده',
  draft: 'پیش‌نویس',
  archived: 'بایگانی',
};

const statusStyles: Record<CaseTypeSummary['status'], string> = {
  published: 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
  draft: 'border-ochre-100 bg-ochre-50 text-ochre-600',
  archived: 'border-line bg-paper-100 text-ink-500',
};

type SortKey = 'name' | 'status' | 'cases' | 'updated';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | CaseTypeSummary['status'];

export function BuilderListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [archiveTarget, setArchiveTarget] = useState<CaseTypeSummary | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'updated',
    direction: 'desc',
  });

  const canBuild = hasPermission(user, 'buildProcesses');

  const types = useQuery({
    queryKey: ['case-types'],
    queryFn: () => api.get<CaseTypeSummary[]>('/case-types'),
    enabled: canBuild,
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post<CaseTypeSummary>(`/case-types/${id}/duplicate`),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ['case-types'] });
      toast.success('نسخهٔ جدید ساخته شد.', 'فرآیند کپی‌شده در حالت پیش‌نویس است.');
      navigate(`/builder/${copy.id}`);
    },
    onError: (error) => toast.error('کپی فرآیند ممکن نشد.', errorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.post(`/case-types/${id}/archive`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['case-types'] });
      setArchiveTarget(null);
      toast.success('فرآیند بایگانی شد.');
    },
    onError: (error) => toast.error('بایگانی ممکن نشد.', errorMessage(error)),
  });

  if (!canBuild) {
    return (
      <Card className="mx-auto mt-12 max-w-lg px-6 py-12 text-center">
        <ShieldCheck size={30} className="mx-auto text-ink-300" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">اجازهٔ مدیریت فرآیند ندارید.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          این بخش برای مدیر، مدیر سیستم و طراح فرآیند در دسترس است.
        </p>
      </Card>
    );
  }

  const rows = types.data ?? [];
  const published = rows.filter((row) => row.status === 'published').length;
  const drafts = rows.filter((row) => row.status === 'draft').length;
  const archived = rows.filter((row) => row.status === 'archived').length;
  const term = deferredSearch.trim().toLowerCase();

  const filtered = rows
    .filter((row) => statusFilter === 'all' || row.status === statusFilter)
    .filter((row) =>
      term
        ? [row.name, row.description, row.key, row.referencePrefix]
            .join(' ')
            .toLowerCase()
            .includes(term)
        : true,
    )
    .sort((a, b) => {
      const factor = sort.direction === 'asc' ? 1 : -1;
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'fa') * factor;
      if (sort.key === 'cases') return (a.caseCount - b.caseCount) * factor;
      if (sort.key === 'status') {
        return statusLabels[a.status].localeCompare(statusLabels[b.status], 'fa') * factor;
      }
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * factor;
    });

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : 'desc',
    }));
  };

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت فرآیند"
        title="فرآیندها"
        description="تعریف، نسخه‌بندی و انتشار مسیرهای کاری سازمان."
        actions={
          <Link
            to="/builder/new"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-xs font-semibold text-paper-50 transition hover:bg-ink-800"
          >
            <Plus size={15} />
            فرآیند جدید
          </Link>
        }
      />

      <Card className="mb-4 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
          <Metric label="کل فرآیندها" value={rows.length} />
          <Metric label="منتشرشده" value={published} tone="verdigris" />
          <Metric label="پیش‌نویس" value={drafts} tone="ochre" />
          <Metric label="بایگانی" value={archived} tone="muted" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجو در نام، کلید، پیشوند یا توضیحات"
              className="focus-ring h-9 w-full rounded-md border border-line bg-paper-50/70 ps-9 pe-8 text-xs placeholder:text-ink-400 focus:border-copper-400"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="focus-ring absolute inset-y-0 end-1.5 my-auto flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-ink-700"
                aria-label="پاک کردن جستجو"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-paper-100/60 p-1">
            {(
              [
                ['all', 'همه'],
                ['published', 'منتشرشده'],
                ['draft', 'پیش‌نویس'],
                ['archived', 'بایگانی'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'focus-ring rounded px-3 py-1.5 text-[11px] font-medium transition',
                  statusFilter === value
                    ? 'bg-paper-50 text-ink-900 shadow-sm'
                    : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {types.isError ? (
          <div className="px-6 py-14 text-center">
            <WarningCircle size={28} className="mx-auto text-stamp-500" />
            <p className="mt-3 text-sm font-semibold text-ink-800">دریافت فرآیندها ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(types.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void types.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : types.isLoading ? (
          <div className="divide-y divide-line/70">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-9 w-9 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse text-start text-xs">
              <thead className="bg-paper-100/70 text-[10px] text-ink-500">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-start font-semibold">
                    <SortButton
                      label="فرآیند"
                      active={sort.key === 'name'}
                      direction={sort.direction}
                      onClick={() => toggleSort('name')}
                    />
                  </th>
                  <th className="hidden px-3 py-2.5 text-start font-semibold md:table-cell">
                    <SortButton
                      label="وضعیت"
                      active={sort.key === 'status'}
                      direction={sort.direction}
                      onClick={() => toggleSort('status')}
                    />
                  </th>
                  <th className="hidden px-3 py-2.5 text-start font-semibold md:table-cell">
                    نسخه
                  </th>
                  <th className="hidden px-3 py-2.5 text-start font-semibold xl:table-cell">
                    <SortButton
                      label="پرونده‌ها"
                      active={sort.key === 'cases'}
                      direction={sort.direction}
                      onClick={() => toggleSort('cases')}
                    />
                  </th>
                  <th className="hidden px-3 py-2.5 text-start font-semibold xl:table-cell">
                    پیشوند
                  </th>
                  <th className="hidden px-3 py-2.5 text-start font-semibold xl:table-cell">
                    <SortButton
                      label="آخرین ویرایش"
                      active={sort.key === 'updated'}
                      direction={sort.direction}
                      onClick={() => toggleSort('updated')}
                    />
                  </th>
                  <th className="px-4 py-2.5 text-end font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filtered.map((row) => (
                  <tr key={row.id} className="group transition hover:bg-paper-100/60">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-paper-50 text-ink-600">
                          <CaseTypeIcon icon={row.icon} size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/builder/${row.id}`}
                              className="truncate font-semibold text-ink-900 hover:text-copper-600"
                            >
                              {row.name}
                            </Link>
                            {row.hasDraftChanges && row.status === 'published' ? (
                              <span className="rounded border border-copper-100 bg-copper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-600">
                                تغییر ذخیره‌نشده
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-ink-400">
                            <span dir="ltr" className="font-mono">
                              {row.key}
                            </span>
                            <span className="hidden max-w-[24rem] truncate sm:inline">
                              {row.description}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
                            <StatusBadge status={row.status} />
                            <span className="font-mono text-[10px] text-ink-500">
                              v{faNum(row.version)}
                            </span>
                            <span className="text-[10px] text-ink-500">
                              {faNum(row.caseCount)} پرونده
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="hidden px-3 py-3 font-mono text-[11px] text-ink-600 md:table-cell">
                      v{faNum(row.version)}
                    </td>
                    <td className="hidden px-3 py-3 font-mono text-[11px] text-ink-700 xl:table-cell">
                      {faNum(row.caseCount)}
                    </td>
                    <td
                      className="hidden px-3 py-3 font-mono text-[11px] text-ink-600 xl:table-cell"
                      dir="ltr"
                    >
                      {row.referencePrefix}
                    </td>
                    <td className="hidden px-3 py-3 text-[10px] text-ink-500 xl:table-cell">
                      {formatDateTime(row.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {row.status !== 'archived' ? (
                          <>
                            <Link
                              to={`/builder/${row.id}`}
                              className="focus-ring inline-flex h-7 items-center gap-1 rounded-md border border-line bg-paper-50 px-2.5 text-[10px] font-semibold text-ink-700 hover:border-ink-300 hover:bg-paper-50"
                            >
                              ویرایش
                              <ArrowLeft size={11} />
                            </Link>
                            <button
                              type="button"
                              onClick={() => duplicate.mutate(row.id)}
                              className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                              aria-label="کپی فرآیند"
                              title="کپی"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(row)}
                              className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                              aria-label="بایگانی فرآیند"
                              title="بایگانی"
                            >
                              <Trash size={14} />
                            </button>
                          </>
                        ) : (
                          <Link
                            to={`/builder/${row.id}`}
                            className="focus-ring inline-flex h-7 items-center gap-1 rounded-md border border-line px-2.5 text-[10px] font-semibold text-ink-500 hover:bg-paper-100"
                          >
                            مشاهده
                            <ArrowsClockwise size={11} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : rows.length ? (
          <EmptyState
            icon={<MagnifyingGlass size={22} />}
            title="فرآیندی با این فیلترها پیدا نشد."
            description="عبارت جستجو یا وضعیت انتخابی را تغییر دهید."
            action={
              <Button
                variant="paper"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                پاک کردن فیلترها
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<SquaresFour size={24} />}
            title="هنوز فرآیندی تعریف نشده است."
            description="از یک قالب آماده شروع کنید یا مسیر تازه‌ای از صفر بسازید."
            action={
              <Link
                to="/builder/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink-900 px-4 text-xs font-semibold text-paper-50 hover:bg-ink-800"
              >
                <Plus size={14} />
                ساخت اولین فرآیند
              </Link>
            }
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archive.mutate(archiveTarget.id)}
        title="بایگانی فرآیند"
        description={
          archiveTarget
            ? `فرآیند «${archiveTarget.name}» بایگانی می‌شود و دیگر برای ثبت پروندهٔ جدید در دسترس نخواهد بود. پرونده‌های موجود دست‌نخورده می‌مانند.`
            : ''
        }
        confirmLabel="بایگانی"
        loading={archive.isPending}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: CaseTypeSummary['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-semibold',
        statusStyles[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {statusLabels[status]}
    </span>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'verdigris' | 'ochre' | 'muted';
}) {
  const toneClass = {
    default: 'text-ink-900',
    verdigris: 'text-verdigris-700',
    ochre: 'text-ochre-600',
    muted: 'text-ink-400',
  }[tone];
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-medium text-ink-500">{label}</div>
      <div className={cn('mt-1 font-mono text-xl font-semibold tabular-nums', toneClass)}>
        {faNum(value)}
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring inline-flex items-center gap-1 hover:text-ink-800"
    >
      {label}
      {active ? (
        direction === 'asc' ? (
          <ArrowUp size={10} />
        ) : (
          <ArrowDown size={10} />
        )
      ) : null}
    </button>
  );
}
