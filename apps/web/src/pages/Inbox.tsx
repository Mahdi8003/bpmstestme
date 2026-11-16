import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { TaskDto } from '@ravand/shared';
import { MagnifyingGlass, Tray, X } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { TaskRow } from '@/components/TaskRow';
import { Button, Card, EmptyState, Skeleton, Spinner, cn } from '@/components/ui';

const scopes = [
  { key: 'mine', label: 'کارهای من', hint: 'کارهایی که به شما سپرده شده یا در حال بررسی است.' },
  { key: 'available', label: 'قابل برداشت', hint: 'کارهای بدون مسئول که نقش شما می‌تواند بردارد.' },
  { key: 'all', label: 'همه کارهای باز', hint: 'نمای شفاف کارهای در جریان در کل سازمان.' },
  { key: 'completed', label: 'انجام‌شده', hint: 'آرشیو کارهایی که شما بسته‌اید.' },
] as const;

type Scope = (typeof scopes)[number]['key'];

const PAGE_SIZE = 50;

export function InboxPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedScope = searchParams.get('scope');
  const [scope, setScope] = useState<Scope>(
    scopes.some((item) => item.key === requestedScope)
      ? (requestedScope as Scope)
      : 'mine',
  );
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setScope(
      scopes.some((item) => item.key === requestedScope) ? (requestedScope as Scope) : 'mine',
    );
  }, [requestedScope]);

  const changeScope = (next: Scope) => {
    setScope(next);
    setSearchParams(next === 'mine' ? {} : { scope: next }, { replace: true });
  };

  const tasks = useInfiniteQuery({
    queryKey: ['tasks', scope, deferredSearch],
    queryFn: ({ pageParam }) =>
      api.get<TaskDto[]>(
        `/tasks?scope=${scope}&limit=${PAGE_SIZE}&offset=${pageParam}${
          deferredSearch.trim() ? `&q=${encodeURIComponent(deferredSearch.trim())}` : ''
        }`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    placeholderData: (previous) => previous,
  });

  const items = tasks.data?.pages.flatMap((page) => page) ?? [];

  const activeScope = scopes.find((item) => item.key === scope) ?? scopes[0];
  const scopeHint =
    scope === 'all' && user?.role !== 'admin'
      ? 'کارهای در جریان پرونده‌هایی که به آن‌ها دسترسی دارید.'
      : activeScope.hint;

  return (
    <div>
      <PageHeader
        eyebrow="صندوق کار"
        title="کارهایی که منتظر شماست."
        description="هر کار یک قدم روشن در مسیر یک پرونده است. کار را بردارید، بررسی کنید و پرونده را جلو ببرید."
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
        <div className="border-b border-line px-3 pt-3">
          <div className="scroll-thin flex gap-1 overflow-x-auto">
            {scopes.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => changeScope(item.key)}
                className={cn(
                  'focus-ring relative shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors',
                  scope === item.key
                    ? 'text-ink-900'
                    : 'text-ink-400 hover:text-ink-700',
                )}
              >
                {item.label}
                {scope === item.key ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-copper-500" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="جستجو در عنوان کار یا شماره پرونده…"
              className="focus-ring h-9 w-full rounded-lg border border-line bg-paper-50/70 ps-9 pe-8 text-xs text-ink-800 placeholder:text-ink-400 focus:border-copper-400 focus:bg-paper-50"
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
          <p className="flex items-center gap-1.5 text-[10px] leading-5 text-ink-400 sm:max-w-xs sm:justify-end sm:text-end">
            {tasks.isFetching && !tasks.isLoading ? <Spinner size={11} /> : null}
            {scopeHint}
          </p>
        </div>

        {tasks.isError ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-ink-800">دریافت کارها ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(tasks.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void tasks.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : tasks.isLoading ? (
          <div className="divide-y divide-line/70">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-4">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : items.length ? (
          <div className="divide-y divide-line/70">
            {items.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {tasks.hasNextPage ? (
              <div className="border-t border-line px-4 py-3 text-center">
                <Button
                  variant="paper"
                  size="sm"
                  loading={tasks.isFetchingNextPage}
                  onClick={() => void tasks.fetchNextPage()}
                >
                  نمایش کارهای بیشتر
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={<Tray size={30} />}
            title={
              search
                ? 'کاری با این عبارت پیدا نشد.'
                : scope === 'completed'
                  ? 'هنوز کاری توسط شما بسته نشده.'
                  : scope === 'available'
                    ? 'کار قابل برداشتی نیست.'
                    : scope === 'all'
                      ? user?.role === 'admin'
                        ? 'کار باز دیگری در سازمان نیست.'
                        : 'کار باز دیگری در دسترس شما نیست.'
                      : 'صندوق شما خالی است.'
            }
            description={
              search
                ? 'عبارت کوتاه‌تری را جستجو کنید یا فیلتر را تغییر دهید.'
                : 'با تغییر دادن وضعیت، کارهای دیگر را ببینید.'
            }
            className="border-0 bg-transparent py-14"
          />
        )}
      </Card>

      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-dashed border-line px-4 py-3 text-[10px] leading-6 text-ink-400">
        <Tray size={14} className="mt-0.5 shrink-0 text-ink-300" />
        کارهای «قابل برداشت» را می‌توانید از صفحهٔ کار بردارید. پس از برداشتن، کار در صندوق شما قرار می‌گیرد.
      </div>
    </div>
  );
}
