import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DashboardDto } from '@ravand/shared';
import {
  ArrowLeft,
  CalendarDots,
  CheckCircle,
  ClockCountdown,
  FolderOpen,
  Timer,
  Tray,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatShortDate, todayLabel } from '@/lib/format';
import { Button, Card, EmptyState, Skeleton, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { TaskRow } from '@/components/TaskRow';
import { CaseRow } from '@/components/CaseRow';
import { CaseTypeIcon } from '@/components/domain';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'صبح بخیر';
  if (hour < 17) return 'وقت بخیر';
  return 'عصر بخیر';
}

export function TodayPage() {
  const { user } = useAuth();
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardDto>('/dashboard'),
    staleTime: 20_000,
  });

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || 'همکار';
  const data = dashboard.data;

  return (
    <div>
      <PageHeader
        eyebrow={`دفتر امروز · ${todayLabel()}`}
        title={`${greeting()}، ${firstName}.`}
        description="تصویر امروز تیم؛ کارهایی که منتظر شماست و پرونده‌هایی که در جریان‌اند."
        actions={
          <>
            <Link
              to="/inbox"
              className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-white/55 px-3.5 text-xs font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-white"
            >
              <Tray size={16} />
              صندوق کار
            </Link>
            <Link
              to="/cases/new"
              className="focus-ring inline-flex h-9 items-center justify-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50 transition hover:bg-ink-800"
            >
              ثبت پرونده
            </Link>
          </>
        }
      />

      {dashboard.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-ink-800">دریافت تصویر امروز ممکن نشد.</p>
          <p className="mt-1 text-xs text-ink-400">{errorMessage(dashboard.error)}</p>
          <Button variant="paper" className="mt-4" onClick={() => void dashboard.refetch()}>
            تلاش دوباره
          </Button>
        </Card>
      ) : dashboard.isLoading || !data ? (
        <TodaySkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label="پرونده‌های باز"
              value={data.metrics.openCases}
              meta="در جریان یا متوقف"
              icon={<FolderOpen size={18} />}
              accent="ink"
            />
            <MetricCard
              label="مهلت امروز"
              value={data.metrics.dueToday}
              meta="تا پایان روز کاری"
              icon={<CalendarDots size={18} />}
              accent="copper"
            />
            <MetricCard
              label="تکمیل این ماه"
              value={data.metrics.completedThisMonth}
              meta="پرونده‌های بسته‌شده"
              icon={<CheckCircle size={18} />}
              accent="green"
            />
            <MetricCard
              label="میانگین چرخه"
              value={Math.round(data.metrics.avgCycleHours)}
              meta="ساعت تا تکمیل"
              icon={<Timer size={18} />}
              accent="amber"
              suffix="ساعت"
            />
          </div>

          {data.metrics.overdueTasks > 0 ? (
            <Link
              to="/inbox"
              className="focus-ring flex items-center gap-3 rounded-xl border border-stamp-100 bg-stamp-50/70 px-4 py-3 transition hover:bg-stamp-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-stamp-600">
                <WarningCircle size={17} weight="fill" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-stamp-700">
                  {faNum(data.metrics.overdueTasks)} کار از مهلت گذشته است
                </div>
                <div className="mt-0.5 text-[10px] text-stamp-600/80">
                  برای جلوگیری از توقف پرونده، صندوق کار را بررسی کنید.
                </div>
              </div>
              <ArrowLeft size={15} className="shrink-0 text-stamp-500" />
            </Link>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.82fr)]">
            <div className="space-y-6">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">کارهای من</h2>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      کارهایی که به شما سپرده شده یا می‌توانید بردارید.
                    </p>
                  </div>
                  <Link
                    to="/inbox"
                    className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-copper-600 hover:bg-copper-50"
                  >
                    همه
                    <ArrowLeft size={13} />
                  </Link>
                </div>
                {data.myTasks.length ? (
                  <div className="divide-y divide-line/70">
                    {data.myTasks.slice(0, 7).map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Tray size={30} />}
                    title="کار بازی روی میز شما نیست."
                    description="می‌توانید از صندوق کار، کارهای قابل برداشت تیم را ببینید."
                    className="border-0 bg-transparent py-10"
                  />
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">آخرین پرونده‌ها</h2>
                    <p className="mt-0.5 text-[10px] text-ink-400">پرونده‌هایی که اخیراً حرکت کرده‌اند.</p>
                  </div>
                  <Link
                    to="/cases"
                    className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-copper-600 hover:bg-copper-50"
                  >
                    همه پرونده‌ها
                    <ArrowLeft size={13} />
                  </Link>
                </div>
                {data.recentCases.length ? (
                  <div className="divide-y divide-line/70">
                    {data.recentCases.slice(0, 5).map((item) => (
                      <CaseRow key={item.id} item={item} compact />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<FolderOpen size={30} />}
                    title="هنوز پرونده‌ای ثبت نشده."
                    description="اولین پرونده را از دکمه «پرونده جدید» ایجاد کنید."
                    className="border-0 bg-transparent py-10"
                  />
                )}
              </Card>
            </div>

            <aside className="space-y-6">
              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">ترکیب پرونده‌ها</h2>
                    <p className="mt-0.5 text-[10px] text-ink-400">توزیع پرونده‌های باز بر اساس نوع</p>
                  </div>
                  <span className="rounded bg-paper-100 px-2 py-1 font-mono text-[10px] text-ink-500">
                    {faNum(data.typeBreakdown.reduce((sum, row) => sum + row.count, 0))}
                  </span>
                </div>
                {data.typeBreakdown.length ? (
                  <div className="mt-4 space-y-3">
                    {data.typeBreakdown.map((row) => {
                      const total = Math.max(
                        1,
                        data.typeBreakdown.reduce((sum, current) => sum + current.count, 0),
                      );
                      return (
                        <div key={row.name}>
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded bg-paper-100 text-ink-500">
                              <CaseTypeIcon icon={row.icon} size={13} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-700">
                              {row.name}
                            </span>
                            <span className="font-mono text-[10px] text-ink-400">{faNum(row.count)}</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-200">
                            <div
                              className="h-full rounded-full bg-copper-400"
                              style={{ width: `${Math.max(4, (row.count / total) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-6 text-center text-[11px] text-ink-400">پروندهٔ بازی وجود ندارد.</p>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">نبض هفته</h2>
                    <p className="mt-0.5 text-[10px] text-ink-400">ثبت‌ها در برابر تکمیل‌ها</p>
                  </div>
                  <ClockCountdown size={17} className="text-ink-300" />
                </div>
                <WeeklyBars data={data.weekly} />
                <div className="mt-4 flex items-center gap-4 border-t border-line pt-3 text-[10px] text-ink-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-3 rounded-full bg-ink-800" />
                    ثبت‌شده
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-3 rounded-full bg-verdigris-500" />
                    تکمیل‌شده
                  </span>
                </div>
              </Card>

              <div className="rounded-xl border border-line bg-paper-200/55 p-4">
                <p className="text-[11px] leading-6 text-ink-500">
                  <span className="font-semibold text-ink-700">راهنمای کوتاه:</span> با میان‌بر{' '}
                  <kbd className="rounded border border-line bg-paper-50 px-1.5 py-0.5 font-mono text-[9px]">
                    Ctrl K
                  </kbd>{' '}
                  هر پرونده یا کار را سریع پیدا کنید.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  icon,
  accent,
  suffix,
}: {
  label: string;
  value: number;
  meta: string;
  icon: ReactNode;
  accent: 'ink' | 'copper' | 'green' | 'amber';
  suffix?: string;
}) {
  return (
    <Card className="relative overflow-hidden px-4 py-4">
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-0.5',
          accent === 'ink' && 'bg-ink-800',
          accent === 'copper' && 'bg-copper-500',
          accent === 'green' && 'bg-verdigris-500',
          accent === 'amber' && 'bg-ochre-400',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-500">{label}</span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            accent === 'ink' && 'bg-paper-100 text-ink-700',
            accent === 'copper' && 'bg-copper-50 text-copper-600',
            accent === 'green' && 'bg-verdigris-50 text-verdigris-600',
            accent === 'amber' && 'bg-ochre-50 text-ochre-600',
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-[30px] font-medium leading-none tracking-tight text-ink-950">
          {faNum(value)}
        </span>
        {suffix ? <span className="text-[10px] text-ink-400">{suffix}</span> : null}
      </div>
      <div className="mt-3 text-[10px] text-ink-400">{meta}</div>
    </Card>
  );
}

function WeeklyBars({ data }: { data: DashboardDto['weekly'] }) {
  const max = Math.max(1, ...data.map((day) => Math.max(day.created, day.completed)));
  return (
    <div className="mt-5 flex items-end gap-2">
      {data.map((day) => (
        <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex h-24 w-full items-end justify-center gap-0.5">
            <div
              className="w-[38%] rounded-t-sm bg-ink-800/85"
              style={{ height: `${Math.max(3, (day.created / max) * 100)}%` }}
              title={`${formatShortDate(day.day)}: ${faNum(day.created)} ثبت`}
            />
            <div
              className="w-[38%] rounded-t-sm bg-verdigris-500/85"
              style={{ height: `${Math.max(3, (day.completed / max) * 100)}%` }}
              title={`${formatShortDate(day.day)}: ${faNum(day.completed)} تکمیل`}
            />
          </div>
          <span className="truncate text-[9px] text-ink-400">{formatShortDate(day.day)}</span>
        </div>
      ))}
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="space-y-4 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-2 w-24" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.82fr)]">
        <Card className="divide-y divide-line/70">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-4">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2 w-1/2" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <Skeleton className="h-4 w-28" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
