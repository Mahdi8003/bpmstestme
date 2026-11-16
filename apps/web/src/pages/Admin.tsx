import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROLE_PERMISSIONS,
  ROLE_PERMISSION_HINTS,
  ROLE_PERMISSION_LABELS,
  type AdminUserDto,
  type AuditLogDto,
  type RoleDto,
  type RoleKey,
  type RolePermission,
} from '@ravand/shared';
import {
  CheckCircle,
  ClockCounterClockwise,
  Key,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  UsersThree,
  XCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatDateTime, roleLabel } from '@/lib/format';
import { hasPermission, rolesQueryKey, useRoles } from '@/lib/roles';
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
  'auth.login_failed': 'تلاش ناموفق ورود',
  'auth.profile_updated': 'به‌روزرسانی پروفایل',
  'auth.password_changed': 'تغییر رمز عبور',
  'user.password_reset': 'بازنشانی رمز عبور',
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
  'master_type.created': 'ایجاد نوع داده سفارشی',
  'master_type.updated': 'ویرایش نوع داده سفارشی',
  'master_record.created': 'ایجاد رکورد داده سفارشی',
  'master_record.updated': 'ویرایش رکورد داده سفارشی',
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
  master_type: 'نوع داده سفارشی',
  master_record: 'رکورد داده سفارشی',
};

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManageUsers = hasPermission(user, 'manageUsers');
  const canManageRoles = hasPermission(user, 'manageRoles');
  const [tab, setTab] = useState(canManageUsers ? 'users' : 'roles');
  const [userModal, setUserModal] = useState<AdminUserDto | 'new' | null>(null);
  const [roleModal, setRoleModal] = useState<RoleDto | 'new' | null>(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntity, setAuditEntity] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');

  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUserDto[]>('/admin/users'),
    enabled: canManageUsers && tab === 'users',
  });
  const audit = useQuery({
    queryKey: ['admin-audit', auditEntity],
    queryFn: () =>
      api.get<AuditLogDto[]>(
        `/admin/audit?limit=300${auditEntity ? `&entityType=${auditEntity}` : ''}`,
      ),
    enabled: canManageUsers && tab === 'audit',
  });
  const roles = useRoles(canManageRoles);

  if (!canManageUsers && !canManageRoles) {
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

  const roleMap = new Map((roles.data ?? []).map((role) => [role.key, role]));
  const userRows = (users.data ?? []).filter((row) => {
    if (!userSearch.trim()) return true;
    const term = userSearch.trim().toLowerCase();
    return (
      row.name.toLowerCase().includes(term) ||
      row.email.toLowerCase().includes(term) ||
      (row.jobTitle ?? '').toLowerCase().includes(term) ||
      roleLabel(row.role).includes(term) ||
      (roleMap.get(row.role)?.name ?? '').includes(term)
    );
  });
  const roleRows = (roles.data ?? []).filter((row) => {
    if (!roleSearch.trim()) return true;
    const term = roleSearch.trim();
    return (
      row.name.includes(term) ||
      row.key.includes(term.toLowerCase()) ||
      row.description.includes(term)
    );
  });

  return (
    <div>
      <PageHeader
        eyebrow="مدیریت"
        title="سازمان، دسترسی‌ها و ردپا."
        description="کاربران و نقش‌ها را مدیریت کنید و ببینید چه کسی، چه زمانی و چه تغییری ایجاد کرده است."
        actions={
          tab === 'users' && canManageUsers ? (
            <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setUserModal('new')}>
              کاربر جدید
            </Button>
          ) : tab === 'roles' && canManageRoles ? (
            <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setRoleModal('new')}>
              نقش جدید
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
              ...(canManageUsers
                ? [
                    { value: 'users', label: 'کاربران', count: users.data?.length },
                    { value: 'audit', label: 'گزارش رویدادها', count: audit.data?.length },
                  ]
                : []),
              ...(canManageRoles
                ? [{ value: 'roles', label: 'نقش‌ها و دسترسی‌ها', count: roles.data?.length }]
                : []),
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
            <>
              <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <MagnifyingGlass
                    size={14}
                    className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
                  />
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="جستجوی نام، ایمیل یا نقش…"
                    className="focus-ring h-8 w-full rounded-lg border border-line bg-paper-50/70 ps-8 text-[11px] placeholder:text-ink-400 focus:border-copper-400"
                  />
                </div>
                <span className="text-[10px] text-ink-400">
                  {faNum(userRows.length)} از {faNum(users.data.length)} کاربر
                </span>
              </div>
              {userRows.length ? (
                <UsersTable
                  rows={userRows}
                  roleNames={roleMap}
                  onEdit={(row) => setUserModal(row)}
                />
              ) : (
                <p className="px-4 py-12 text-center text-xs text-ink-400">
                  کاربری با این جستجو پیدا نشد.
                </p>
              )}
            </>
          ) : (
            <p className="px-4 py-12 text-center text-xs text-ink-400">کاربری وجود ندارد.</p>
          )
        ) : tab === 'audit' ? (
          audit.isError ? (
            <ErrorBlock error={audit.error} onRetry={() => void audit.refetch()} />
          ) : audit.isLoading ? (
          <LoadingRows />
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:max-w-xs">
                  <MagnifyingGlass
                    size={14}
                    className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
                  />
                  <input
                    value={auditSearch}
                    onChange={(event) => setAuditSearch(event.target.value)}
                    placeholder="جستجو در رویداد، کاربر یا موجودیت…"
                    className="focus-ring h-8 w-full rounded-lg border border-line bg-paper-50/70 ps-8 text-[11px] placeholder:text-ink-400 focus:border-copper-400"
                  />
                </div>
                <Select
                  value={auditEntity}
                  onChange={(event) => setAuditEntity(event.target.value)}
                  className="h-8 w-full text-[11px] sm:w-40"
                  aria-label="نوع موجودیت"
                >
                  <option value="">همهٔ موجودیت‌ها</option>
                  {Object.entries(entityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
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
          )
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
                />
                <input
                  value={roleSearch}
                  onChange={(event) => setRoleSearch(event.target.value)}
                  placeholder="جستجو در نام، کلید یا توضیح نقش"
                  className="focus-ring h-8 w-full rounded-lg border border-line bg-paper-50/70 ps-8 text-[11px] placeholder:text-ink-400 focus:border-copper-400"
                />
              </div>
              <span className="text-[10px] text-ink-400">
                {faNum(roleRows.length)} از {faNum(roles.data?.length ?? 0)} نقش
              </span>
            </div>
            {roles.isError ? (
              <ErrorBlock error={roles.error} onRetry={() => void roles.refetch()} />
            ) : roles.isLoading ? (
              <LoadingRows />
            ) : roleRows.length ? (
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {roleRows.map((role) => (
                  <div
                    key={role.id}
                    className="group rounded-xl border border-line bg-paper-50/60 p-4 transition hover:border-copper-300 hover:bg-paper-50"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                        style={{ backgroundColor: role.color }}
                      >
                        <ShieldCheck size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-xs font-semibold text-ink-900">
                            {role.name}
                          </h3>
                          {role.isSystem ? (
                            <span className="rounded bg-paper-100 px-1.5 py-0.5 text-[8px] font-medium text-ink-400">
                              پیش‌فرض
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 font-mono text-[9px] text-ink-400" dir="ltr">
                          {role.key}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRoleModal(role)}
                        className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 opacity-70 hover:bg-paper-100 hover:text-ink-700 group-hover:opacity-100"
                        aria-label={`ویرایش نقش ${role.name}`}
                      >
                        <PencilSimple size={14} />
                      </button>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-8 text-[10px] leading-5 text-ink-500">
                      {role.description || 'بدون توضیح'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {role.permissions.length ? (
                        role.permissions.map((permission) => (
                          <span
                            key={permission}
                            className="rounded-full border border-line bg-paper-100/70 px-1.5 py-0.5 text-[8px] text-ink-500"
                          >
                            {ROLE_PERMISSION_LABELS[permission]}
                          </span>
                        ))
                      ) : (
                        <span className="text-[9px] text-ink-300">بدون دسترسی ویژه</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 border-t border-line/70 pt-2.5 text-[9px] text-ink-400">
                      <UsersThree size={12} />
                      {faNum(role.userCount)} کاربر
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-12 text-center text-xs text-ink-400">
                نقشی با این مشخصات پیدا نشد.
              </p>
            )}
          </>
        )}
      </Card>

      <UserModal
        value={userModal}
        onClose={() => setUserModal(null)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: rolesQueryKey });
          void users.refetch();
          void audit.refetch();
        }}
      />
      <RoleModal
        value={roleModal}
        onClose={() => setRoleModal(null)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: rolesQueryKey });
          void users.refetch();
        }}
      />
    </div>
  );
}

function UsersTable({
  rows,
  roleNames,
  onEdit,
}: {
  rows: AdminUserDto[];
  roleNames: Map<string, RoleDto>;
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
              {roleNames.get(row.role)?.name ?? roleLabel(row.role)}
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
  const [newPassword, setNewPassword] = useState('');
  const [hydrated, setHydrated] = useState<string | null>(null);
  const toast = useToast();
  const roleOptions = useRoles(Boolean(value)).data ?? [];

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
    setNewPassword('');
    setError('');
  }

  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.patch<AdminUserDto>(`/admin/users/${existing.id}`, {
            name: form.name.trim(),
            email: form.email.trim(),
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

  const resetPassword = useMutation({
    mutationFn: () =>
      api.post<{ ok: true }>(`/admin/users/${existing!.id}/reset-password`, {
        newPassword,
      }),
    onSuccess: () => {
      onSaved();
      setNewPassword('');
      toast.success('رمز عبور بازنشانی شد.');
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={existing ? 'ویرایش کاربر' : 'کاربر جدید'}
      description={existing ? 'اطلاعات، نقش و وضعیت دسترسی را تغییر دهید.' : 'یک حساب سازمانی جدید بسازید.'}
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
              setError('');
              if (!form.name.trim() || !form.email.trim()) {
                setError('نام و ایمیل الزامی است.');
                return;
              }
              if (!existing && form.password.length < 8) {
                setError('رمز عبور باید حداقل ۸ کاراکتر باشد.');
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
        {!existing ? (
          <Field label="رمز عبور" required hint="حداقل ۸ کاراکتر" className="sm:col-span-2">
            <Input
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </Field>
        ) : null}
        <Field label="نقش" required>
          <Select
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({ ...current, role: event.target.value as RoleKey }))
            }
          >
            {roleOptions.length ? (
              roleOptions.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))
            ) : (
              <option value={form.role}>{roleLabel(form.role)}</option>
            )}
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
      {existing ? (
        <div className="mt-5 rounded-lg border border-line bg-paper-100/50 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
            <Key size={14} className="text-ink-400" />
            بازنشانی رمز عبور
          </div>
          <p className="mt-1 text-[10px] leading-5 text-ink-400">
            رمز جدید را تعیین کنید تا کاربر با آن وارد شود. حداقل ۸ کاراکتر.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              dir="ltr"
              value={newPassword}
              placeholder="رمز عبور جدید"
              onChange={(event) => setNewPassword(event.target.value)}
              className="flex-1"
            />
            <Button
              variant="paper"
              loading={resetPassword.isPending}
              onClick={() => {
                setError('');
                if (newPassword.length < 8) {
                  setError('رمز عبور جدید باید حداقل ۸ کاراکتر باشد.');
                  return;
                }
                resetPassword.mutate();
              }}
            >
              بازنشانی
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function RoleModal({
  value,
  onClose,
  onSaved,
}: {
  value: RoleDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({
    key: '',
    name: '',
    description: '',
    color: '#315364',
    permissions: [] as RolePermission[],
  });
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hydrated, setHydrated] = useState<string | null>(null);
  const toast = useToast();

  if (value && hydrated !== (existing?.id ?? 'new')) {
    setHydrated(existing?.id ?? 'new');
    setForm({
      key: existing?.key ?? '',
      name: existing?.name ?? '',
      description: existing?.description ?? '',
      color: existing?.color ?? '#315364',
      permissions: existing ? [...existing.permissions] : [],
    });
    setError('');
    setConfirmDelete(false);
  }

  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.patch<RoleDto>(`/roles/${existing.id}`, {
            name: form.name.trim(),
            description: form.description.trim(),
            color: form.color,
            permissions: form.permissions,
          })
        : api.post<RoleDto>('/roles', {
            key: form.key.trim(),
            name: form.name.trim(),
            description: form.description.trim(),
            color: form.color,
            permissions: form.permissions,
          }),
    onSuccess: () => {
      onSaved();
      toast.success(existing ? 'نقش به‌روزرسانی شد.' : 'نقش جدید ساخته شد.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`/roles/${existing!.id}`),
    onSuccess: () => {
      onSaved();
      toast.success('نقش حذف شد.');
      onClose();
    },
    onError: (caught) => {
      setConfirmDelete(false);
      setError(errorMessage(caught));
    },
  });

  const togglePermission = (permission: RolePermission) => {
    if (existing?.key === 'admin') return;
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={existing ? 'ویرایش نقش' : 'نقش جدید'}
      description={
        existing
          ? 'نام، رنگ و دسترسی‌های این نقش را مدیریت کنید. تغییرات برای همهٔ کاربران این نقش اعمال می‌شود.'
          : 'یک نقش سازمانی بسازید و مشخص کنید اعضای آن به چه بخش‌هایی دسترسی داشته باشند.'
      }
      size="lg"
      footer={
        <>
          {existing && !existing.isSystem ? (
            <Button
              variant="ghost"
              className="me-auto text-stamp-600 hover:bg-stamp-50"
              loading={remove.isPending}
              onClick={() => {
                setError('');
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                remove.mutate();
              }}
            >
              <Trash size={14} />
              {confirmDelete ? 'تأیید حذف نقش' : 'حذف نقش'}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="ink"
            loading={save.isPending}
            onClick={() => {
              setError('');
              if (form.name.trim().length < 2) {
                setError('نام نقش باید حداقل ۲ نویسه باشد.');
                return;
              }
              if (!existing && !/^[a-z][a-z0-9_]{1,59}$/.test(form.key.trim())) {
                setError('کلید نقش باید با حرف لاتین کوچک شروع شود و فقط شامل حروف کوچک، عدد و زیرخط باشد.');
                return;
              }
              save.mutate();
            }}
          >
            {existing ? 'ذخیره تغییرات' : 'ساخت نقش'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="نام نقش"
          required
          hint="مثلاً مدیر انبار یا کارشناس خرید"
          className="sm:col-span-2"
        >
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field
          label="کلید نقش"
          required={!existing}
          hint={existing ? 'کلید نقش پس از ساخت قابل تغییر نیست.' : 'حروف لاتین کوچک، عدد و زیرخط؛ مثل warehouse_manager'}
        >
          <Input
            dir="ltr"
            value={form.key}
            disabled={Boolean(existing)}
            onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
            className="font-mono text-[11px]"
          />
        </Field>
        <Field label="رنگ نقش">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
              className="h-9 w-12 cursor-pointer rounded-md border border-line bg-paper-50 p-1"
              aria-label="رنگ نقش"
            />
            <Input
              dir="ltr"
              value={form.color}
              onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
              className="font-mono text-[11px]"
            />
          </div>
        </Field>
        <Field label="توضیح نقش" className="sm:col-span-2">
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            rows={2}
            className="focus-ring w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-xs leading-6 text-ink-800 placeholder:text-ink-400 focus:border-copper-400"
            placeholder="این نقش چه مسئولیتی در سازمان دارد؟"
          />
        </Field>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[11px] font-semibold text-ink-800">دسترسی‌ها</h3>
            <p className="mt-0.5 text-[10px] text-ink-400">
              {existing?.key === 'admin'
                ? 'نقش مدیر سیستم همیشه به همهٔ بخش‌ها دسترسی دارد.'
                : 'فقط بخش‌هایی را فعال کنید که این نقش باید ببیند یا مدیریت کند.'}
            </p>
          </div>
          <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[9px] text-ink-500">
            {faNum(form.permissions.length)} دسترسی
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ROLE_PERMISSIONS.map((permission) => {
            const checked =
              existing?.key === 'admin' || form.permissions.includes(permission);
            return (
              <button
                key={permission}
                type="button"
                disabled={existing?.key === 'admin'}
                onClick={() => togglePermission(permission)}
                className={cn(
                  'focus-ring flex items-start gap-2.5 rounded-lg border p-3 text-start transition',
                  checked
                    ? 'border-verdigris-200 bg-verdigris-50/60'
                    : 'border-line bg-paper-50/50 hover:border-copper-200',
                  existing?.key === 'admin' && 'cursor-default opacity-80',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    checked
                      ? 'border-verdigris-500 bg-verdigris-500 text-white'
                      : 'border-line bg-white text-transparent',
                  )}
                >
                  <CheckCircle size={11} weight="fill" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold text-ink-700">
                    {ROLE_PERMISSION_LABELS[permission]}
                  </span>
                  <span className="mt-0.5 block text-[9px] leading-4 text-ink-400">
                    {ROLE_PERMISSION_HINTS[permission]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {existing?.isSystem ? (
        <p className="mt-4 rounded-lg border border-line bg-paper-100/60 px-3 py-2 text-[10px] leading-5 text-ink-500">
          این نقش پیش‌فرض سیستم است و حذف نمی‌شود؛ اما می‌توانید نام، رنگ و دسترسی‌های آن را تغییر دهید.
        </p>
      ) : null}
      {confirmDelete ? (
        <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[10px] leading-5 text-stamp-600">
          حذف نقش قطعی است. برای تأیید دوباره روی «تأیید حذف نقش» بزنید.
        </p>
      ) : null}
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
