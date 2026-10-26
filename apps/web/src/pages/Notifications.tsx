import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, NotificationsDto } from '@ravand/shared';
import {
  Bell,
  BellRinging,
  Check,
  FileText,
  SealCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { faNum, formatDateTime } from '@/lib/format';
import { Button, Card, EmptyState, Skeleton, Tabs, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/ToastProvider';

const typeIcons: Record<string, ReactNode> = {
  'task.assigned': <BellRinging size={16} />,
  'task.info_requested': <FileText size={16} />,
  'case.completed': <SealCheck size={16} />,
  'case.rejected': <WarningCircle size={16} />,
  'case.info_provided': <Check size={16} />,
  'sla.breached': <WarningCircle size={16} />,
};

export function NotificationsPage() {
  const [filter, setFilter] = useState('all');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const notifications = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () =>
      api.get<NotificationsDto>(`/notifications?limit=100${filter === 'unread' ? '&unread=true' : ''}`),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markOne = useMutation({
    mutationFn: (id: string) => api.post<NotificationDto>(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      invalidate();
      toast.success('همه اعلان‌ها خوانده شدند.');
    },
    onError: (error) => toast.error('ثبت خوانده‌شدن ممکن نشد.', errorMessage(error)),
  });

  const openNotification = (notification: NotificationDto) => {
    if (!notification.readAt) markOne.mutate(notification.id);
    if (notification.link) navigate(notification.link);
  };

  return (
    <div>
      <PageHeader
        eyebrow="اعلان‌ها"
        title="چیزهایی که نباید از دست برود."
        description="خبرهای کارها و پرونده‌های شما، در یک جا و به ترتیب زمان."
        actions={
          <Button
            variant="paper"
            size="sm"
            icon={<Check size={14} />}
            loading={markAll.isPending}
            disabled={!notifications.data?.unread}
            onClick={() => markAll.mutate()}
          >
            همه را خواندم
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 pt-2">
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'همه' },
              { value: 'unread', label: 'خوانده‌نشده', count: notifications.data?.unread },
            ]}
            className="border-0"
          />
          <span className="pe-2 font-mono text-[10px] text-ink-400">
            {faNum(notifications.data?.items.length ?? 0)}
          </span>
        </div>

        {notifications.isError ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-semibold text-ink-800">دریافت اعلان‌ها ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(notifications.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void notifications.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : notifications.isLoading ? (
          <div className="divide-y divide-line/70">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-3 px-4 py-4">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.data?.items.length ? (
          <div className="divide-y divide-line/70">
            {notifications.data.items.map((notification) => {
              const unread = !notification.readAt;
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={cn(
                    'focus-ring flex w-full items-start gap-3 px-4 py-4 text-start transition-colors hover:bg-paper-100/75',
                    unread && 'bg-copper-50/20',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      unread
                        ? 'border-copper-200 bg-copper-50 text-copper-600'
                        : 'border-line bg-white text-ink-400',
                    )}
                  >
                    {typeIcons[notification.type] ?? <Bell size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-xs', unread ? 'font-semibold text-ink-900' : 'font-medium text-ink-700')}>
                        {notification.title}
                      </span>
                      {unread ? <span className="h-1.5 w-1.5 rounded-full bg-copper-500" /> : null}
                    </div>
                    {notification.body ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-6 text-ink-500">{notification.body}</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-2 text-[9px] text-ink-400">
                      <span>{formatDateTime(notification.createdAt)}</span>
                      {notification.link ? (
                        <>
                          <span className="text-ink-300">·</span>
                          <span>برای مشاهده کلیک کنید</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {unread ? (
                    <span className="mt-1 shrink-0 rounded bg-copper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-600">
                      جدید
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Bell size={28} />}
            title={filter === 'unread' ? 'اعلان خوانده‌نشده‌ای ندارید.' : 'هنوز اعلانی ندارید.'}
            description="با حرکت پرونده‌ها و رسیدن کارها، اعلان‌های مرتبط اینجا نمایش داده می‌شوند."
            className="border-0 bg-transparent py-16"
          />
        )}
      </Card>
    </div>
  );
}
