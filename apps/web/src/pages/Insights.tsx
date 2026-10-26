import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InsightsDto } from '@ravand/shared';
import {
  ChartBar,
  Clock,
  FolderOpen,
  Lightning,
  SealCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { faNum, formatShortDate, statusLabel } from '@/lib/format';
import { Button, Card, Skeleton, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { CaseTypeIcon } from '@/components/domain';

const outcomeLabels: Record<string, string> = {
  approved: 'تأییدشده',
  rejected: 'ردشده',
  returned: 'بازگشته',
  completed: 'تکمیل‌شده',
  info_requested: 'درخواست اطلاعات',
};

const outcomeTone: Record<string, string> = {
  approved: 'bg-verdigris-500',
  completed: 'bg-ink-700',
  returned: 'bg-ochre-400',
  rejected: 'bg-stamp-500',
  info_requested: 'bg-copper-400',
};

const statusTone: Record<string, string> = {
  in_progress: 'bg-copper-500',
  on_hold: 'bg-ochre-400',
  completed: 'bg-verdigris-500',
  rejected: 'bg-stamp-500',
  cancelled: 'bg-ink-300',
};

export function InsightsPage() {
  const insights = useQuery({
    queryKey: ['insights'],
    queryFn: () => api.get<InsightsDto>('/insights'),
    staleTime: 60_000,
  });

  const data = insights.data;
  const completed = data?.statusBreakdown.find((row) => row.status === 'completed')?.count ?? 0;
  const completionRate = data?.totalCases ? Math.round((completed / data.totalCases) * 100) : 0;
  const overdue = data?.types.reduce((sum, row) => sum + row.overdueTasks, 0) ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="گزارش‌ها"
        title="تصویر بزرگ جریان کار."
        description="ببینید پرونده‌ها کجا متوقف می‌شوند، کدام انواع کندتر پیش می‌روند و بار کار کجاست."
        actions={
          <Button variant="paper" size="sm" icon={<ChartBar size={14} />} onClick={() => void insights.refetch()}>
            به‌روزرسانی
          </Button>
        }
      />

      {insights.isError ? (
        <Card className="px-6 py-14 text-center">
          <WarningCircle size={28} className="mx-auto text-stamp-500" />
          <p className="mt-3 text-sm font-semibold text-ink-800">دریافت گزارش‌ها ممکن نشد.</p>
          <p className="mt-1 text-xs text-ink-400">{errorMessage(insights.error)}</p>
        </Card>
      ) : insights.isLoading || !data ? (
        <InsightsSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <InsightStat label="کل پرونده‌ها" value={faNum(data.totalCases)} meta="در همه وضعیت‌ها" icon={<FolderOpen size={17} />} />
            <InsightStat label="کل کارها" value={faNum(data.totalTasks)} meta="در همه مراحل" icon={<SealCheck size={17} />} />
            <InsightStat
              label="نرخ تکمیل"
              value={`${faNum(completionRate)}٪`}
              meta="از کل پرونده‌ها"
              icon={<Lightning size={17} />}
              tone={completionRate >= 50 ? 'green' : 'copper'}
            />
            <InsightStat
              label="کارهای عقب‌افتاده"
              value={faNum(overdue)}
              meta="فراتر از مهلت"
              icon={<Clock size={17} />}
              tone={overdue ? 'red' : 'ink'}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">جریان هفته</h2>
                    <p className="mt-0.5 text-[10px] text-ink-400">تعداد ثبت و تکمیل در هفت روز اخیر</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-ink-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-3 rounded-full bg-ink-800" />
                      ثبت
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-3 rounded-full bg-verdigris-500" />
                      تکمیل
                    </span>
                  </div>
                </div>
                <BiggerWeekly data={data.weekly} />
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-ink-900">عملکرد انواع پرونده</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">مقایسهٔ حجم، تکمیل و زمان چرخه</p>
                </div>
                <div className="hidden grid-cols-[minmax(0,1.8fr)_70px_70px_90px_100px_90px] gap-2 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400 md:grid">
                  <span>نوع پرونده</span>
                  <span>کل</span>
                  <span>باز</span>
                  <span>میانگین چرخه</span>
                  <span>عقب‌افتاده</span>
                  <span>وضعیت</span>
                </div>
                <div className="divide-y divide-line/70">
                  {data.types.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.8fr)_70px_70px_90px_100px_90px] md:items-center md:gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
                          <CaseTypeIcon icon={row.icon} size={15} />
                        </span>
                        <span className="truncate text-xs font-semibold text-ink-800">{row.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-ink-600">{faNum(row.total)}</span>
                      <span className="font-mono text-[11px] text-ink-600">{faNum(row.open)}</span>
                      <span className="font-mono text-[11px] text-ink-600">
                        {row.avgCycleHours ? `${faNum(Math.round(row.avgCycleHours))} ساعت` : '—'}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-[11px]',
                          row.overdueTasks ? 'font-semibold text-stamp-600' : 'text-ink-400',
                        )}
                      >
                        {faNum(row.overdueTasks)}
                      </span>
                      <span
                        className={cn(
                          'w-fit rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                          row.status === 'published'
                            ? 'border-verdigris-100 bg-verdigris-50 text-verdigris-700'
                            : row.status === 'draft'
                              ? 'border-ochre-100 bg-ochre-50 text-ochre-600'
                              : 'border-line bg-paper-100 text-ink-400',
                        )}
                      >
                        {row.status === 'published' ? 'منتشرشده' : row.status === 'draft' ? 'پیش‌نویس' : 'بایگانی'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-4">
                <h2 className="text-sm font-semibold text-ink-900">وضعیت پرونده‌ها</h2>
                <p className="mt-0.5 text-[10px] text-ink-400">سهم هر وضعیت از کل</p>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-paper-200">
                  {data.statusBreakdown.map((row) => (
                    <span
                      key={row.status}
                      className={cn('h-full', statusTone[row.status])}
                      style={{
                        width: `${data.totalCases ? (row.count / data.totalCases) * 100 : 0}%`,
                      }}
                      title={`${statusLabel(row.status)}: ${row.count}`}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2.5">
                  {data.statusBreakdown.map((row) => (
                    <div key={row.status} className="flex items-center gap-2">
                      <span className={cn('h-1.5 w-1.5 rounded-full', statusTone[row.status])} />
                      <span className="flex-1 text-[11px] text-ink-500">{statusLabel(row.status)}</span>
                      <span className="font-mono text-[10px] text-ink-700">{faNum(row.count)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <h2 className="text-sm font-semibold text-ink-900">نتیجهٔ کارها</h2>
                <p className="mt-0.5 text-[10px] text-ink-400">کارها بر اساس نتیجهٔ نهایی</p>
                {data.taskOutcomes.length ? (
                  <div className="mt-4 space-y-3">
                    {data.taskOutcomes.map((row) => {
                      const total = data.taskOutcomes.reduce((sum, current) => sum + current.count, 0);
                      return (
                        <div key={row.outcome}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-ink-600">
                              {outcomeLabels[row.outcome] ?? row.outcome}
                            </span>
                            <span className="font-mono text-[10px] text-ink-400">{faNum(row.count)}</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-200">
                            <div
                              className={cn('h-full rounded-full', outcomeTone[row.outcome] ?? 'bg-ink-300')}
                              style={{ width: `${Math.max(4, (row.count / Math.max(1, total)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-5 text-center text-[11px] text-ink-400">کاری بسته نشده است.</p>
                )}
              </Card>

              <div className="rounded-xl border border-line bg-paper-200/45 p-4 text-[10px] leading-6 text-ink-500">
                <span className="font-semibold text-ink-700">توجه:</span> میانگین چرخه بر اساس پرونده‌های
                تکمیل‌شده محاسبه می‌شود. پرونده‌های باز در این عدد اثر ندارند.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightStat({
  label,
  value,
  meta,
  icon,
  tone = 'ink',
}: {
  label: string;
  value: string;
  meta: string;
  icon: ReactNode;
  tone?: 'ink' | 'green' | 'red' | 'copper';
}) {
  return (
    <Card className="px-4 py-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] text-ink-500">{label}</span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            tone === 'ink' && 'bg-paper-100 text-ink-500',
            tone === 'green' && 'bg-verdigris-50 text-verdigris-600',
            tone === 'red' && 'bg-stamp-50 text-stamp-600',
            tone === 'copper' && 'bg-copper-50 text-copper-600',
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3 font-mono text-[28px] font-medium leading-none text-ink-950">{value}</div>
      <p className="mt-3 text-[10px] text-ink-400">{meta}</p>
    </Card>
  );
}

function BiggerWeekly({ data }: { data: InsightsDto['weekly'] }) {
  const max = Math.max(1, ...data.map((day) => Math.max(day.created, day.completed)));
  return (
    <div className="mt-6 flex items-end gap-3 sm:gap-5">
      {data.map((day) => (
        <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-44 w-full items-end justify-center gap-1">
            <div
              className="group relative w-[38%] rounded-t-sm bg-ink-800/85"
              style={{ height: `${Math.max(3, (day.created / max) * 100)}%` }}
              title={`${formatShortDate(day.day)} · ثبت: ${faNum(day.created)}`}
            >
              <span className="absolute -top-5 right-1/2 translate-x-1/2 font-mono text-[9px] text-ink-700 opacity-0 transition group-hover:opacity-100">
                {faNum(day.created)}
              </span>
            </div>
            <div
              className="group relative w-[38%] rounded-t-sm bg-verdigris-500/85"
              style={{ height: `${Math.max(3, (day.completed / max) * 100)}%` }}
              title={`${formatShortDate(day.day)} · تکمیل: ${faNum(day.completed)}`}
            >
              <span className="absolute -top-5 right-1/2 translate-x-1/2 font-mono text-[9px] text-verdigris-700 opacity-0 transition group-hover:opacity-100">
                {faNum(day.completed)}
              </span>
            </div>
          </div>
          <span className="truncate text-[9px] text-ink-400">{formatShortDate(day.day)}</span>
        </div>
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="h-28 p-4">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-4 h-7 w-12" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
