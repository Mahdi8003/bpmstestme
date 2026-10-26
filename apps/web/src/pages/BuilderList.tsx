import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseTypeSummary } from '@ravand/shared';
import {
  ArrowLeft,
  ArrowsClockwise,
  Copy,
  Plus,
  ShieldCheck,
  SquaresFour,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatDateTime } from '@/lib/format';
import { Button, Card, ConfirmDialog, Skeleton, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { CaseTypeIcon } from '@/components/domain';
import { useToast } from '@/components/ToastProvider';

export function BuilderListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [archiveTarget, setArchiveTarget] = useState<CaseTypeSummary | null>(null);

  const canBuild = Boolean(user && ['admin', 'builder', 'manager'].includes(user.role));

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
        <h1 className="mt-4 text-lg font-semibold text-ink-900">اجازهٔ ساخت فرآیند ندارید.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          این بخش برای مدیر، مدیر سیستم و طراح فرآیند در دسترس است.
        </p>
      </Card>
    );
  }

  const rows = types.data ?? [];
  const published = rows.filter((row) => row.status === 'published').length;
  const drafts = rows.filter((row) => row.status === 'draft').length;

  return (
    <div>
      <PageHeader
        eyebrow="سازنده فرآیند"
        title="مسیرهایی که تیم را جلو می‌برند."
        description="فرآیندها را بسازید، فرم و مراحل را شکل دهید و پس از بررسی سلامت، منتشر کنید."
        actions={
          <Link
            to="/builder/new"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50 transition hover:bg-ink-800"
          >
            <Plus size={15} />
            فرآیند جدید
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-[10px] text-ink-400">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-50 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-verdigris-500" />
          {faNum(published)} منتشرشده
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-50 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-ochre-400" />
          {faNum(drafts)} پیش‌نویس
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-50 px-2.5 py-1">
          <SquaresFour size={11} />
          {faNum(rows.length)} فرآیند
        </span>
      </div>

      {types.isError ? (
        <Card className="px-6 py-14 text-center">
          <WarningCircle size={28} className="mx-auto text-stamp-500" />
          <p className="mt-3 text-sm font-semibold text-ink-800">دریافت فرآیندها ممکن نشد.</p>
          <p className="mt-1 text-xs text-ink-400">{errorMessage(types.error)}</p>
          <Button variant="paper" className="mt-4" onClick={() => void types.refetch()}>
            تلاش دوباره
          </Button>
        </Card>
      ) : types.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-40 space-y-4 p-5">
              <div className="flex gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-2 w-1/2" />
            </Card>
          ))}
        </div>
      ) : rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id} className="group flex flex-col p-5 transition hover:border-ink-300">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink-600">
                  <CaseTypeIcon icon={row.icon} size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="truncate text-sm font-semibold text-ink-900">{row.name}</h2>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[9px] font-semibold',
                        row.status === 'published' && 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
                        row.status === 'draft' && 'border-ochre-100 bg-ochre-50 text-ochre-600',
                        row.status === 'archived' && 'border-line bg-paper-100 text-ink-400',
                      )}
                    >
                      {row.status === 'published'
                        ? 'منتشرشده'
                        : row.status === 'draft'
                          ? 'پیش‌نویس'
                          : 'بایگانی'}
                    </span>
                    {row.hasDraftChanges && row.status === 'published' ? (
                      <span className="rounded bg-copper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-600">
                        تغییر ذخیره‌نشده
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-ink-400">{row.description}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/70 pt-3 text-[10px]">
                <div>
                  <div className="text-ink-400">نسخه</div>
                  <div className="mt-1 font-mono text-ink-700">v{faNum(row.version)}</div>
                </div>
                <div>
                  <div className="text-ink-400">پرونده‌ها</div>
                  <div className="mt-1 font-mono text-ink-700">{faNum(row.caseCount)}</div>
                </div>
                <div>
                  <div className="text-ink-400">پیشوند</div>
                  <div className="mt-1 font-mono text-ink-700" dir="ltr">
                    {row.referencePrefix}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[9px] text-ink-300">
                  {row.updatedAt ? `آخرین ویرایش ${formatDateTime(row.updatedAt)}` : ''}
                </span>
                <div className="flex items-center gap-1">
                  {row.status !== 'archived' ? (
                    <>
                      <Link
                        to={`/builder/${row.id}`}
                        className="focus-ring inline-flex h-7 items-center gap-1 rounded-md bg-ink-900 px-2.5 text-[10px] font-semibold text-paper-50 hover:bg-ink-800"
                      >
                        ویرایش
                        <ArrowLeft size={11} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => duplicate.mutate(row.id)}
                        className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                        aria-label="کپی"
                        title="کپی"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setArchiveTarget(row)}
                        className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                        aria-label="بایگانی"
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
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="px-6 py-16 text-center">
          <SquaresFour size={30} className="mx-auto text-ink-300" />
          <h2 className="mt-3 text-sm font-semibold text-ink-800">هنوز فرآیندی ساخته نشده.</h2>
          <p className="mt-1 text-xs text-ink-400">
            از یک قالب آماده شروع کنید یا مسیر تازه‌ای از صفر بسازید.
          </p>
          <Link
            to="/builder/new"
            className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50"
          >
            <Plus size={14} />
            ساخت اولین فرآیند
          </Link>
        </Card>
      )}

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
