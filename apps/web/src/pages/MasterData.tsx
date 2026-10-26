import { useDeferredValue, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { ItemDto, PartyDto, WarehouseDto } from '@ravand/shared';
import {
  ArrowDown,
  ArrowUp,
  Buildings,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  UsersThree,
  Warehouse,
  X,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum, formatDate, formatMoney } from '@/lib/format';
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  cn,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/ToastProvider';

interface StockMovementRow {
  id: string;
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  reference: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

const PARTY_KIND_LABELS = { customer: 'مشتری', supplier: 'تأمین‌کننده' } as const;
const MOVEMENT_LABELS = { in: 'ورود', out: 'خروج', adjust: 'اصلاح موجودی' } as const;
const MASTER_TABS = ['parties', 'items', 'warehouses', 'movements'] as const;
type MasterTab = (typeof MASTER_TABS)[number];

function isMasterTab(value: string | null): value is MasterTab {
  return Boolean(value && (MASTER_TABS as readonly string[]).includes(value));
}

export function MasterDataPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const [tab, setTab] = useState<MasterTab>(
    isMasterTab(requestedTab) ? requestedTab : 'parties',
  );
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [partyModal, setPartyModal] = useState<PartyDto | 'new' | null>(null);
  const [itemModal, setItemModal] = useState<ItemDto | 'new' | null>(null);
  const [warehouseModal, setWarehouseModal] = useState(false);
  const [movementModal, setMovementModal] = useState(false);

  const canParties = Boolean(user && ['admin', 'builder', 'manager', 'procurement'].includes(user.role));
  const canItems = Boolean(
    user && ['admin', 'builder', 'manager', 'procurement', 'warehouse'].includes(user.role),
  );
  const canWarehouses = Boolean(user && ['admin', 'builder', 'manager', 'warehouse'].includes(user.role));
  const canMovements = Boolean(user && ['admin', 'manager', 'warehouse'].includes(user.role));

  useEffect(() => {
    if (isMasterTab(requestedTab) && requestedTab !== tab) setTab(requestedTab);
  }, [requestedTab, tab]);

  const parties = useQuery({
    queryKey: ['parties', deferredSearch],
    queryFn: () =>
      api.get<PartyDto[]>(
        `/parties?limit=300${deferredSearch ? `&q=${encodeURIComponent(deferredSearch)}` : ''}`,
      ),
    enabled: tab === 'parties',
    placeholderData: (previous) => previous,
  });
  const items = useQuery({
    queryKey: ['items', deferredSearch],
    queryFn: () =>
      api.get<ItemDto[]>(
        `/items?limit=300${deferredSearch ? `&q=${encodeURIComponent(deferredSearch)}` : ''}`,
      ),
    enabled: tab === 'items' || tab === 'movements' || movementModal,
    placeholderData: (previous) => previous,
  });
  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<WarehouseDto[]>('/warehouses'),
    enabled: tab === 'warehouses' || tab === 'movements' || movementModal,
  });
  const movements = useQuery({
    queryKey: ['stock-movements'],
    queryFn: () => api.get<StockMovementRow[]>('/stock/movements?limit=200'),
    enabled: tab === 'movements',
  });

  const activeQuery =
    tab === 'parties' ? parties : tab === 'items' ? items : tab === 'warehouses' ? warehouses : movements;
  const hasSearch = tab === 'parties' || tab === 'items';

  return (
    <div>
      <PageHeader
        eyebrow="داده‌های پایه"
        title="زمین مشترک سازمان."
        description="طرف‌حساب‌ها، کالاها و انبارها؛ داده‌هایی که پرونده‌ها و فرم‌ها روی آن‌ها سوار می‌شوند."
        actions={
          <>
            {tab === 'parties' && canParties ? (
              <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setPartyModal('new')}>
                طرف‌حساب جدید
              </Button>
            ) : null}
            {tab === 'items' && canItems ? (
              <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setItemModal('new')}>
                کالای جدید
              </Button>
            ) : null}
            {tab === 'warehouses' && canWarehouses ? (
              <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setWarehouseModal(true)}>
                انبار جدید
              </Button>
            ) : null}
            {tab === 'movements' && canMovements ? (
              <Button variant="ink" size="sm" icon={<Plus size={14} />} onClick={() => setMovementModal(true)}>
                ثبت گردش
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line px-3 pt-2 lg:flex-row lg:items-center lg:justify-between lg:pr-4">
          <Tabs
            value={tab}
            onChange={(value) => {
              if (!isMasterTab(value)) return;
              setTab(value);
              setSearch('');
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  next.set('tab', value);
                  return next;
                },
                { replace: true },
              );
            }}
            items={[
              { value: 'parties', label: 'طرف‌حساب‌ها', count: parties.data?.length },
              { value: 'items', label: 'کالاها', count: items.data?.length },
              { value: 'warehouses', label: 'انبارها', count: warehouses.data?.length },
              { value: 'movements', label: 'گردش انبار' },
            ]}
            className="border-0"
          />
          {hasSearch ? (
            <div className="relative mb-2 w-full lg:mb-0 lg:w-64">
              <MagnifyingGlass
                size={14}
                className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tab === 'parties' ? 'نام، کد یا تماس…' : 'نام یا کد کالا…'}
                className="focus-ring h-8 w-full rounded-lg border border-line bg-white/70 ps-8 pe-7 text-[11px] placeholder:text-ink-400 focus:border-copper-400"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 end-1.5 my-auto flex h-6 w-6 items-center justify-center rounded text-ink-400"
                  aria-label="پاک کردن"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {activeQuery.isError ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-semibold text-ink-800">دریافت داده‌ها ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(activeQuery.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void activeQuery.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : activeQuery.isLoading ? (
          <div className="divide-y divide-line/70">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-4">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'parties' ? (
          <PartiesTable
            rows={parties.data ?? []}
            canEdit={canParties}
            onEdit={(party) => setPartyModal(party)}
          />
        ) : tab === 'items' ? (
          <ItemsTable
            rows={items.data ?? []}
            canEdit={canItems}
            onEdit={(item) => setItemModal(item)}
          />
        ) : tab === 'warehouses' ? (
          <WarehousesTable rows={warehouses.data ?? []} />
        ) : (
          <MovementsTable rows={movements.data ?? []} />
        )}
      </Card>

      <PartyModal
        value={partyModal}
        onClose={() => setPartyModal(null)}
        onSaved={() => {
          void parties.refetch();
          void items.refetch();
        }}
      />
      <ItemModal
        value={itemModal}
        onClose={() => setItemModal(null)}
        onSaved={() => {
          void items.refetch();
          void movements.refetch();
        }}
      />
      <WarehouseModal
        open={warehouseModal}
        onClose={() => setWarehouseModal(false)}
        onSaved={() => void warehouses.refetch()}
      />
      <MovementModal
        open={movementModal}
        onClose={() => setMovementModal(false)}
        items={items.data ?? []}
        warehouses={warehouses.data ?? []}
        onSaved={() => {
          void movements.refetch();
          void items.refetch();
        }}
      />
    </div>
  );
}

function PartiesTable({
  rows,
  canEdit,
  onEdit,
}: {
  rows: PartyDto[];
  canEdit: boolean;
  onEdit: (party: PartyDto) => void;
}) {
  if (!rows.length) return <EmptyTable text="طرف‌حسابی ثبت نشده است." />;
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.6fr)_110px_170px_120px_40px] gap-3 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400 md:grid">
        <span>طرف‌حساب</span>
        <span>نوع</span>
        <span>تماس</span>
        <span>کد</span>
        <span />
      </div>
      <div className="divide-y divide-line/70">
        {rows.map((party) => (
          <div
            key={party.id}
            className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_110px_170px_120px_40px] md:items-center md:gap-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
                <UsersThree size={15} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-ink-800">{party.name}</div>
                <div className="mt-0.5 truncate text-[10px] text-ink-400">{party.address ?? 'بدون نشانی'}</div>
              </div>
            </div>
            <span
              className={cn(
                'w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                party.kind === 'supplier'
                  ? 'border-ochre-100 bg-ochre-50 text-ochre-600'
                  : 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
              )}
            >
              {PARTY_KIND_LABELS[party.kind]}
            </span>
            <div className="min-w-0 text-[10px] text-ink-500">
              <div className="truncate" dir="ltr">
                {party.phone ?? '—'}
              </div>
              <div className="mt-0.5 truncate text-ink-400" dir="ltr">
                {party.email ?? '—'}
              </div>
            </div>
            <span className="font-mono text-[10px] text-ink-400" dir="ltr">
              {party.code}
            </span>
            <div className="flex justify-end">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => onEdit(party)}
                  className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                  aria-label="ویرایش"
                >
                  <PencilSimple size={14} />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <TableFooter count={rows.length} label="طرف‌حساب" />
    </div>
  );
}

function ItemsTable({
  rows,
  canEdit,
  onEdit,
}: {
  rows: ItemDto[];
  canEdit: boolean;
  onEdit: (item: ItemDto) => void;
}) {
  if (!rows.length) return <EmptyTable text="کالایی ثبت نشده است." />;
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.8fr)_100px_120px_110px_100px_40px] gap-3 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400 md:grid">
        <span>کالا</span>
        <span>واحد</span>
        <span>بهای واحد</span>
        <span>موجودی</span>
        <span>وضعیت</span>
        <span />
      </div>
      <div className="divide-y divide-line/70">
        {rows.map((item) => {
          const low = typeof item.stock === 'number' && item.stock <= item.reorderPoint;
          return (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.8fr)_100px_120px_110px_100px_40px] md:items-center md:gap-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
                  <Package size={15} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-ink-800">{item.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-ink-400" dir="ltr">
                    {item.sku}
                    {item.category ? ` · ${item.category}` : ''}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-ink-500">{item.unit}</span>
              <span className="font-mono text-[10px] text-ink-500">{formatMoney(item.unitCost)}</span>
              <span
                className={cn(
                  'font-mono text-xs font-semibold',
                  low ? 'text-stamp-600' : 'text-ink-700',
                )}
              >
                {faNum(item.stock ?? 0)}
              </span>
              <span
                className={cn(
                  'w-fit rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                  low
                    ? 'border-stamp-100 bg-stamp-50 text-stamp-600'
                    : 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
                )}
              >
                {low ? 'نیاز به تأمین' : 'موجود'}
              </span>
              <div className="flex justify-end">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                    aria-label="ویرایش"
                  >
                    <PencilSimple size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <TableFooter count={rows.length} label="کالا" />
    </div>
  );
}

function WarehousesTable({ rows }: { rows: WarehouseDto[] }) {
  if (!rows.length) return <EmptyTable text="انباری ثبت نشده است." />;
  return (
    <div>
      <div className="divide-y divide-line/70">
        {rows.map((warehouse) => (
          <div key={warehouse.id} className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
              <Warehouse size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-ink-800">{warehouse.name}</div>
              <div className="mt-0.5 text-[10px] text-ink-400">{warehouse.location ?? 'بدون موقعیت'}</div>
            </div>
            <span className="font-mono text-[10px] text-ink-400" dir="ltr">
              {warehouse.code}
            </span>
          </div>
        ))}
      </div>
      <TableFooter count={rows.length} label="انبار" />
    </div>
  );
}

function MovementsTable({ rows }: { rows: StockMovementRow[] }) {
  if (!rows.length) return <EmptyTable text="گردشی ثبت نشده است." />;
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_100px_100px_110px_110px] gap-3 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400 md:grid">
        <span>کالا</span>
        <span>انبار</span>
        <span>نوع</span>
        <span>مقدار</span>
        <span>ثبت‌کننده</span>
        <span>تاریخ</span>
      </div>
      <div className="divide-y divide-line/70">
        {rows.map((movement) => (
          <div
            key={movement.id}
            className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_110px_100px_100px_110px_110px] md:items-center md:gap-3"
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-ink-800">{movement.itemName}</div>
              {movement.reference ? (
                <div className="mt-0.5 font-mono text-[9px] text-ink-400" dir="ltr">
                  {movement.reference}
                </div>
              ) : null}
            </div>
            <span className="truncate text-[10px] text-ink-500">{movement.warehouseName}</span>
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold',
                movement.type === 'in' && 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
                movement.type === 'out' && 'border-stamp-100 bg-stamp-50 text-stamp-600',
                movement.type === 'adjust' && 'border-line bg-paper-100 text-ink-500',
              )}
            >
              {movement.type === 'in' ? <ArrowDown size={10} /> : movement.type === 'out' ? <ArrowUp size={10} /> : null}
              {MOVEMENT_LABELS[movement.type]}
            </span>
            <span className="font-mono text-xs font-semibold text-ink-700">{faNum(movement.quantity)}</span>
            <span className="truncate text-[10px] text-ink-400">{movement.createdByName ?? '—'}</span>
            <span className="text-[10px] text-ink-400">{formatDate(movement.createdAt)}</span>
          </div>
        ))}
      </div>
      <TableFooter count={rows.length} label="گردش" />
    </div>
  );
}

function TableFooter({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex items-center justify-between border-t border-line bg-paper-100/40 px-4 py-2.5 text-[10px] text-ink-400">
      <span>
        {faNum(count)} {label}
      </span>
      <span>آخرین به‌روزرسانی از سرور</span>
    </div>
  );
}

function EmptyTable({ text }: { text: string }) {
  return (
    <div className="px-4 py-14 text-center">
      <Buildings size={26} className="mx-auto text-ink-300" />
      <p className="mt-2 text-xs text-ink-400">{text}</p>
    </div>
  );
}

function PartyModal({
  value,
  onClose,
  onSaved,
}: {
  value: PartyDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = value === 'new';
  const party = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({
    kind: 'supplier' as 'supplier' | 'customer',
    name: '',
    code: '',
    email: '',
    phone: '',
    taxId: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState<string | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  if (value && hydrated !== (party?.id ?? 'new')) {
    setHydrated(party?.id ?? 'new');
    setForm({
      kind: party?.kind ?? 'supplier',
      name: party?.name ?? '',
      code: party?.code ?? '',
      email: party?.email ?? '',
      phone: party?.phone ?? '',
      taxId: party?.taxId ?? '',
      address: party?.address ?? '',
    });
    setError('');
  }

  const save = useMutation({
    mutationFn: () =>
      party
        ? api.patch<PartyDto>(`/parties/${party.id}`, form)
        : api.post<PartyDto>('/parties', form),
    onSuccess: () => {
      onSaved();
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      toast.success(party ? 'طرف‌حساب به‌روز شد.' : 'طرف‌حساب ثبت شد.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={party ? 'ویرایش طرف‌حساب' : 'طرف‌حساب جدید'}
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
              if (!form.name.trim() || !form.code.trim()) {
                setError('نام و کد طرف‌حساب الزامی است.');
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
        <Field label="نوع" required>
          <Select
            value={form.kind}
            onChange={(event) =>
              setForm((current) => ({ ...current, kind: event.target.value as 'supplier' | 'customer' }))
            }
          >
            <option value="supplier">تأمین‌کننده</option>
            <option value="customer">مشتری</option>
          </Select>
        </Field>
        <Field label="کد" required>
          <Input
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            dir="ltr"
          />
        </Field>
        <Field label="نام" required className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field label="ایمیل">
          <Input
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            dir="ltr"
            type="email"
          />
        </Field>
        <Field label="تلفن">
          <Input
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            dir="ltr"
          />
        </Field>
        <Field label="شناسه مالیاتی">
          <Input
            value={form.taxId}
            onChange={(event) => setForm((current) => ({ ...current, taxId: event.target.value }))}
            dir="ltr"
          />
        </Field>
        <Field label="نشانی" className="sm:col-span-2">
          <Textarea
            value={form.address}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            className="min-h-16"
          />
        </Field>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function ItemModal({
  value,
  onClose,
  onSaved,
}: {
  value: ItemDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const item = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({
    sku: '',
    name: '',
    unit: 'عدد',
    category: '',
    unitCost: 0,
    reorderPoint: 0,
  });
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState<string | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  if (value && hydrated !== (item?.id ?? 'new')) {
    setHydrated(item?.id ?? 'new');
    setForm({
      sku: item?.sku ?? '',
      name: item?.name ?? '',
      unit: item?.unit ?? 'عدد',
      category: item?.category ?? '',
      unitCost: item?.unitCost ?? 0,
      reorderPoint: item?.reorderPoint ?? 0,
    });
    setError('');
  }

  const save = useMutation({
    mutationFn: () =>
      item
        ? api.patch<ItemDto>(`/items/${item.id}`, {
            ...form,
            category: form.category || undefined,
          })
        : api.post<ItemDto>('/items', {
            ...form,
            category: form.category || undefined,
          }),
    onSuccess: () => {
      onSaved();
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      toast.success(item ? 'کالا به‌روز شد.' : 'کالا ثبت شد.');
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={item ? 'ویرایش کالا' : 'کالای جدید'}
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
              if (!form.sku.trim() || !form.name.trim()) {
                setError('کد و نام کالا الزامی است.');
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
        <Field label="کد کالا" required>
          <Input
            value={form.sku}
            onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
            dir="ltr"
          />
        </Field>
        <Field label="واحد" required>
          <Input
            value={form.unit}
            onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))}
          />
        </Field>
        <Field label="نام کالا" required className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field label="دسته‌بندی">
          <Input
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
          />
        </Field>
        <Field label="بهای واحد (ریال)">
          <Input
            type="number"
            value={String(form.unitCost)}
            onChange={(event) =>
              setForm((current) => ({ ...current, unitCost: Number(event.target.value || 0) }))
            }
            dir="ltr"
          />
        </Field>
        <Field label="نقطه سفارش">
          <Input
            type="number"
            value={String(form.reorderPoint)}
            onChange={(event) =>
              setForm((current) => ({ ...current, reorderPoint: Number(event.target.value || 0) }))
            }
            dir="ltr"
          />
        </Field>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function WarehouseModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ code: '', name: '', location: '' });
  const [error, setError] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.post<WarehouseDto>('/warehouses', form),
    onSuccess: () => {
      onSaved();
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      toast.success('انبار ثبت شد.');
      setForm({ code: '', name: '', location: '' });
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="انبار جدید"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="ink"
            loading={save.isPending}
            onClick={() => {
              if (!form.code.trim() || !form.name.trim()) {
                setError('کد و نام انبار الزامی است.');
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
      <div className="space-y-4">
        <Field label="کد انبار" required>
          <Input
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            dir="ltr"
          />
        </Field>
        <Field label="نام انبار" required>
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field label="موقعیت">
          <Input
            value={form.location}
            onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
          />
        </Field>
        {error ? (
          <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function MovementModal({
  open,
  onClose,
  items,
  warehouses,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  items: ItemDto[];
  warehouses: WarehouseDto[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    itemId: '',
    warehouseId: '',
    type: 'in' as 'in' | 'out' | 'adjust',
    quantity: 1,
    reference: '',
    note: '',
  });
  const [error, setError] = useState('');
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api.post('/stock/movements', { ...form, reference: form.reference || undefined, note: form.note || undefined }),
    onSuccess: () => {
      onSaved();
      toast.success('گردش انبار ثبت شد.');
      setForm((current) => ({ ...current, quantity: 1, reference: '', note: '' }));
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت گردش انبار"
      description="موجودی کالا بر اساس نوع گردش به‌روز می‌شود."
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
              if (!form.itemId || !form.warehouseId || form.quantity <= 0) {
                setError('کالا، انبار و مقدار مثبت الزامی است.');
                return;
              }
              save.mutate();
            }}
          >
            ثبت گردش
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="کالا" required className="sm:col-span-2">
          <Select
            value={form.itemId}
            onChange={(event) => setForm((current) => ({ ...current, itemId: event.target.value }))}
          >
            <option value="">انتخاب کالا…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.sku}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="انبار" required>
          <Select
            value={form.warehouseId}
            onChange={(event) => setForm((current) => ({ ...current, warehouseId: event.target.value }))}
          >
            <option value="">انتخاب انبار…</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نوع گردش" required>
          <Select
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({ ...current, type: event.target.value as 'in' | 'out' | 'adjust' }))
            }
          >
            <option value="in">ورود</option>
            <option value="out">خروج</option>
            <option value="adjust">اصلاح موجودی</option>
          </Select>
        </Field>
        <Field label="مقدار" required>
          <Input
            type="number"
            min={0}
            value={String(form.quantity)}
            onChange={(event) =>
              setForm((current) => ({ ...current, quantity: Number(event.target.value || 0) }))
            }
            dir="ltr"
          />
        </Field>
        <Field label="مرجع">
          <Input
            value={form.reference}
            onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
            dir="ltr"
          />
        </Field>
        <Field label="یادداشت" className="sm:col-span-2">
          <Textarea
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            className="min-h-16"
          />
        </Field>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
