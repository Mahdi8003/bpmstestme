import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROLE_KEYS,
  type AdminUserDto,
  type AuditLogDto,
  type RoleKey,
} from '@ravand/shared';
import {
  CheckCircle,
  ClockCounterClockwise,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShieldCheck,
  UserCircle,
  XCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatDateTime, roleLabel } from '@/lib/format';
import {
  Avatar,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
  cn,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/ToastProvider';

const auditLabels: Record<string, string> = {
  'auth.login': 'ورود به سامانه',
  'auth.logout': 'خروج از سامانه',
  'case.created': 'ایجاد پرونده',
  'case.updated': 'ویرایش پرونده',
  'case.completed': 'تکمیل پرونده',
  'case.cancelled': 'لغو پرونده',
  'case.comment_added': 'یادداشت پرونده',
  'case.document_uploaded': 'بارگذاری مدرک',
  'task.claimed': 'برداشتن کار',
  'task.released': 'آزادکردن کار',
  'task.reassigned': 'واگذاری کار',
  'task.completed': 'تکمیل کار',
  'task.rejected': 'رد کار',
  'task.returned': 'بازگشت کار',
  'task.info_requested': 'درخواست اطلاعات',
  'task.info_completed': 'ثبت اطلاعات تکمیلی',
  'case_type.created': 'ایجاد فرآیند',
  'case_type.updated': 'ویرایش فرآیند',
  'case_type.published': 'انتشار فرآیند',
  'user.created': 'ایجاد کاربر',
  'user.updated': 'ویرایش کاربر',
  'party.created': 'ایجاد طرف‌حساب',
  'party.updated': 'ویرایش طرف‌حساب',
  'item.created': 'ایجاد کالا',
  'item.updated': 'ویرایش کالا',
  'warehouse.created': 'ایجاد انبار',
  'stock.movement_created': 'ثبت گردش انبار',
};

const entityLabels: Record<string, string> = {
  case: 'پرونده',
  task: 'کار',
  case_type: 'فرآیند',
  user: 'کاربر',
  party: 'طرف‌حساب',
  item: 'کالا',
  warehouse: 'انبار',
  stock_movement: 'گردش انبار',
};

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('users');
  const [userModal, setUserModal] = useState<AdminUserDto | 'new' | null>(null);
  const [auditSearch, setAuditSearch] = useState('');

  const isAdmin = user?.role === 'admin';

  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUserDto[]>('/admin/users'),
    enabled: isAdmin,
  });
  const audit = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<AuditLogDto[]>('/admin/audit?limit=300'),
    enabled: isAdmin && tab === 'audit',
  });

  if (!isAdmin) {
    return (
      <Card className="mx-auto mt-12 max-w-lg px-6 py-12 text-center">
        <ShieldCheck size={30} className="mx-auto text-ink-300" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">دسترسی مدیریتی ندارید.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          این بخش فقط برای مدیر سیستم در دسترس است.
        </p>
      </Card>
    );
  }

  const auditRows = (audit.data ?? []).filter((row) => {
    if (!auditSearch.trim()) return true;
    const term = auditSearch.trim();
    return (
      (auditLabels[row.action] ?? row.action).includes(term) ||
      (row.actorName ?? '').includes(term) ||
      (entityLabels[row.entityType] ?? row.entityType).includes(term)
    );
  });

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت"
        title="سازمان، دسترسی‌ها و ردپا."
        description="کاربران و نقش‌ها را مدیریت کنید و ببینید چه کسی، چه زمانی و چه تغییری ایجاد کرده است."
        actions={
          tab === 'users' ? (
            <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setUserModal('new')}>
              کاربر جدید
            </Button>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-line px-3 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'users', label: 'کاربران', count: users.data?.length },
              { value: 'audit', label: 'گزارش رویدادها', count: audit.data?.length },
            ]}
            className="border-0"
          />
        </div>

        {tab === 'users' ? (
          users.isError ? (
            <ErrorBlock error={users.error} onRetry={() => void users.refetch()} />
          ) : users.isLoading ? (
            <LoadingRows />
          ) : users.data?.length ? (
            <UsersTable rows={users.data} onEdit={(row) => setUserModal(row)} />
          ) : (
            <p className="px-4 py-12 text-center text-xs text-ink-400">کاربری وجود ندارد.</p>
          )
        ) : audit.isError ? (
          <ErrorBlock error={audit.error} onRetry={() => void audit.refetch()} />
        ) : audit.isLoading ? (
          <LoadingRows />
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
                />
                <input
                  value={auditSearch}
                  onChange={(event) => setAuditSearch(event.target.value)}
                  placeholder="جستجو در رویداد، کاربر یا موجودیت…"
                  className="focus-ring h-8 w-full rounded-lg border border-line bg-white/70 ps-8 text-[11px] placeholder:text-ink-400 focus:border-copper-400"
                />
              </div>
              <span className="text-[10px] text-ink-400">
                {faNum(auditRows.length)} رویداد · جدیدترین‌ها ابتدا
              </span>
            </div>
            {auditRows.length ? (
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[170px_120px_minmax(0,1fr)_130px_150px] gap-3 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400">
                    <span>رویداد</span>
                    <span>موجودیت</span>
                    <span>توسط</span>
                    <span>زمان</span>
                    <span>جزئیات</span>
                  </div>
                  <div className="divide-y divide-line/70">
                    {auditRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[170px_120px_minmax(0,1fr)_130px_150px] items-center gap-3 px-4 py-2.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <ClockCounterClockwise size={13} className="text-ink-300" />
                          <span className="text-[10px] font-medium text-ink-700">
                            {auditLabels[row.action] ?? row.action}
                          </span>
                        </div>
                        <span className="w-fit rounded bg-paper-100 px-1.5 py-0.5 text-[9px] text-ink-500">
                          {entityLabels[row.entityType] ?? row.entityType}
                        </span>
                        <span className="truncate text-[10px] text-ink-500">{row.actorName ?? 'سیستم'}</span>
                        <span className="text-[9px] text-ink-400">{formatDateTime(row.createdAt)}</span>
                        <AuditDetail row={row} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="px-4 py-12 text-center text-xs text-ink-400">رویدادی با این جستجو پیدا نشد.</p>
            )}
          </>
        )}
      </Card>

      <UserModal
        value={userModal}
        onClose={() => setUserModal(null)}
        onSaved={() => {
          void users.refetch();
          void audit.refetch();
        }}
      />
    </div>
  );
}

function UsersTable({
  rows,
  onEdit,
}: {
  rows: AdminUserDto[];
  onEdit: (row: AdminUserDto) => void;
}) {
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_130px_140px_100px_150px_40px] gap-3 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400 md:grid">
        <span>کاربر</span>
        <span>نقش</span>
        <span>عنوان شغلی</span>
        <span>وضعیت</span>
        <span>آخرین ورود</span>
        <span />
      </div>
      <div className="divide-y divide-line/70">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_130px_140px_100px_150px_40px] md:items-center md:gap-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={row.name} color={row.avatarColor} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-ink-800">{row.name}</div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-ink-400" dir="ltr">
                  {row.email}
                </div>
              </div>
            </div>
            <span className="w-fit rounded-full border border-line bg-paper-100 px-2 py-0.5 text-[9px] font-semibold text-ink-600">
              {roleLabel(row.role)}
            </span>
            <span className="truncate text-[10px] text-ink-500">{row.jobTitle ?? '—'}</span>
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                row.isActive
                  ? 'border-verdigris-100 bg-verdigris-50 text-verdigris-700'
                  : 'border-line bg-paper-100 text-ink-400',
              )}
            >
              {row.isActive ? <CheckCircle size={10} weight="fill" /> : <XCircle size={10} />}
              {row.isActive ? 'فعال' : 'غیرفعال'}
            </span>
            <span className="text-[9px] text-ink-400">
              {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'هنوز وارد نشده'}
            </span>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onEdit(row)}
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                aria-label="ویرایش کاربر"
              >
                <PencilSimple size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditDetail({ row }: { row: AuditLogDto }) {
  const payload = row.after ?? row.before;
  if (!payload) return <span className="text-[9px] text-ink-300">—</span>;
  return (
    <details className="text-[9px] text-ink-400">
      <summary className="cursor-pointer text-ink-500 hover:text-ink-800">نمایش</summary>
      <pre
        dir="ltr"
        className="scroll-thin mt-1 max-h-28 overflow-auto rounded bg-paper-100 p-2 text-left font-mono text-[8px] leading-4 text-ink-500"
      >
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

function UserModal({
  value,
  onClose,
  onSaved,
}: {
  value: AdminUserDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member' as RoleKey,
    jobTitle: '',
    isActive: true,
  });
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState<string | null>(null);
  const toast = useToast();

  if (value && hydrated !== (existing?.id ?? 'new')) {
    setHydrated(existing?.id ?? 'new');
    setForm({
      name: existing?.name ?? '',
      email: existing?.email ?? '',
      password: '',
      role: existing?.role ?? 'member',
      jobTitle: existing?.jobTitle ?? '',
      isActive: existing?.isActive ?? true,
    });
    setError('');
  }

  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.patch<AdminUserDto>(`/admin/users/${existing.id}`, {
            role: form.role,
            isActive: form.isActive,
            jobTitle: form.jobTitle || undefined,
          })
        : api.post<AdminUserDto>('/admin/users', {
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
            jobTitle: form.jobTitle || undefined,
          }),
    onSuccess: () => {
      onSaved();
      toast.success(existing ? 'کاربر به‌روز شد.' : 'کاربر ایجاد شد.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={existing ? 'ویرایش کاربر' : 'کاربر جدید'}
      description={existing ? 'نقش و وضعیت دسترسی را تغییر دهید.' : 'یک حساب سازمانی جدید بسازید.'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="ink"
            loading={save.isPending}
            onClick={() => {
              if (!existing && (!form.name.trim() || !form.email.trim() || form.password.length < 8)) {
                setError('نام، ایمیل و رمز عبور حداقل ۸ کاراکتری الزامی است.');
                return;
              }
              save.mutate();
            }}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!existing ? (
          <>
            <Field label="نام" required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="ایمیل" required className="sm:col-span-2">
              <Input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="رمز عبور" required hint="حداقل ۸ کاراکتر">
              <Input
                type="password"
                dir="ltr"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </Field>
          </>
        ) : (
          <div className="flex items-center gap-2.5 sm:col-span-2">
            <Avatar name={existing.name} color={existing.avatarColor} />
            <div>
              <div className="text-xs font-semibold text-ink-800">{existing.name}</div>
              <div className="mt-0.5 font-mono text-[10px] text-ink-400" dir="ltr">
                {existing.email}
              </div>
            </div>
          </div>
        )}
        <Field label="نقش" required>
          <Select
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({ ...current, role: event.target.value as RoleKey }))
            }
          >
            {ROLE_KEYS.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="عنوان شغلی">
          <Input
            value={form.jobTitle}
            onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}
          />
        </Field>
        {existing ? (
          <Field label="وضعیت حساب" className="sm:col-span-2">
            <Select
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) =>
                setForm((current) => ({ ...current, isActive: event.target.value === 'active' }))
              }
            >
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
            </Select>
          </Field>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function ErrorBlock({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-semibold text-ink-800">دریافت داده‌ها ممکن نشد.</p>
      <p className="mt-1 text-xs text-ink-400">{errorMessage(error)}</p>
      <Button variant="paper" className="mt-4" onClick={onRetry}>
        تلاش دوباره
      </Button>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="divide-y divide-line/70">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
