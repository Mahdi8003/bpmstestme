import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowsDownUp,
  Copy,
  Database,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash,
  UsersThree,
  Warehouse,
  X,
} from '@phosphor-icons/react';
import type { MasterDataRecordDto, MasterDataTypeDto } from '@ravand/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { faNum } from '@/lib/format';
import { hasPermission } from '@/lib/roles';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Skeleton,
  cn,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { fieldDisplayValue, useMasterOptions } from '@/components/DynamicFields';
import { FieldDesigner } from '@/components/master-data/FieldDesigner';
import { RecordModal } from '@/components/master-data/RecordModal';
import { useToast } from '@/components/ToastProvider';

const TYPE_ICONS: Record<string, ReactNode> = {
  users: <UsersThree size={15} />,
  package: <Package size={15} />,
  warehouse: <Warehouse size={15} />,
  arrows: <ArrowsDownUp size={15} />,
  tags: <Tag size={15} />,
  database: <Database size={15} />,
};

function typeIcon(icon: string) {
  return TYPE_ICONS[icon] ?? TYPE_ICONS.database;
}

interface Column {
  key: string;
  label: string;
  value: (record: MasterDataRecordDto) => string;
}

export function MasterDataPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const masterOptions = useMasterOptions();
  const canManage = hasPermission(user, 'manageMasterData');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabKey = searchParams.get('tab');
  const recordId = searchParams.get('record');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [designer, setDesigner] = useState<{ open: boolean; type: MasterDataTypeDto | null }>({
    open: false,
    type: null,
  });
  const [recordEditor, setRecordEditor] = useState<{
    type: MasterDataTypeDto;
    record: MasterDataRecordDto | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: MasterDataTypeDto;
    record: MasterDataRecordDto;
  } | null>(null);

  const types = useQuery({
    queryKey: ['master-types'],
    queryFn: () => api.get<MasterDataTypeDto[]>('/master/types'),
  });

  const typeList = types.data ?? [];
  const handledParams = useRef<string | null>(null);

  useEffect(() => {
    if (!typeList.length) {
      setSelectedId(null);
      return;
    }
    if (!tabKey) {
      setSelectedId((current) =>
        current && typeList.some((type) => type.id === current) ? current : typeList[0]!.id,
      );
      return;
    }
    const paramsKey = `${tabKey}|${recordId ?? ''}`;
    if (handledParams.current === paramsKey) return;
    const requested = typeList.find((type) => type.key === tabKey || type.entity === tabKey);
    if (!requested) {
      setSelectedId((current) =>
        current && typeList.some((type) => type.id === current) ? current : typeList[0]!.id,
      );
      return;
    }
    handledParams.current = paramsKey;
    setSelectedId(requested.id);
    if (!recordId) {
      handledParams.current = null;
      setSearchParams({}, { replace: true });
    }
  }, [typeList, tabKey, recordId, setSearchParams]);

  const selected = typeList.find((type) => type.id === selectedId) ?? null;

  const records = useQuery({
    queryKey: ['master-records', selected?.id, deferredSearch],
    queryFn: () =>
      api.get<MasterDataRecordDto[]>(
        `/master/types/${selected!.id}/records?limit=500${
          deferredSearch ? `&q=${encodeURIComponent(deferredSearch)}` : ''
        }`,
      ),
    enabled: Boolean(selected),
    placeholderData: (previous) => previous,
  });

  const recordApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!recordId || !selected || !records.isSuccess || records.isPlaceholderData) return;
    if (recordApplied.current === recordId) return;
    recordApplied.current = recordId;
    const match = records.data.find((record) => record.id === recordId);
    if (match && canManage) {
      setRecordEditor({ type: selected, record: match });
    }
    handledParams.current = null;
    setSearchParams({}, { replace: true });
  }, [recordId, selected, records.data, records.isSuccess, records.isPlaceholderData, canManage, setSearchParams]);

  const duplicate = useMutation({
    mutationFn: (record: MasterDataRecordDto) =>
      api.post<MasterDataRecordDto>(
        `/master/types/${record.typeId}/records/${record.id}/duplicate`,
      ),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['master-records', created.typeId] });
      void queryClient.invalidateQueries({ queryKey: ['master-types'] });
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      toast.success('رکورد کپی شد.', 'فیلدهای یکتا برای نسخهٔ جدید خالی شده‌اند.');
    },
    onError: (error) => toast.error('کپی رکورد ممکن نشد.', errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (record: MasterDataRecordDto) => api.delete(`/master/records/${record.id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['master-records', selected?.id] });
      void queryClient.invalidateQueries({ queryKey: ['master-types'] });
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      toast.success('رکورد حذف شد.');
    },
    onError: (error) => toast.error('حذف ممکن نشد.', errorMessage(error)),
  });

  const columns = useMemo<Column[]>(() => {
    if (!selected) return [];
    const visible = selected.fields.filter((field) => !field.hidden && field.type !== 'table');
    const title =
      visible.find((field) => field.key === selected.titleField) ?? visible[0] ?? null;
    const rest = title ? visible.filter((field) => field.key !== title.key) : visible;
    const ordered = title ? [title, ...rest] : visible;
    const list: Column[] = ordered.slice(0, 5).map((field, index) => ({
      key: field.key,
      label: field.label,
      value: (record) =>
        index === 0
          ? record.title
          : fieldDisplayValue(field, record.data[field.key], masterOptions.data),
    }));
    if (selected.entity === 'item') {
      list.push({
        key: 'stock',
        label: 'موجودی',
        value: (record) =>
          typeof record.data.stock === 'number'
            ? faNum(record.data.stock)
            : '—',
      });
    }
    return list;
  }, [selected, masterOptions.data]);

  const gridTemplate = `minmax(0,2.4fr) repeat(${Math.max(columns.length - 1, 0)}, minmax(0,1fr)) 96px`;

  const systemTypes = typeList.filter((type) => type.entity !== 'custom');
  const customTypes = typeList.filter((type) => type.entity === 'custom');

  const typeByKey = useMemo(
    () => new Map(typeList.map((type) => [type.key, type])),
    [typeList],
  );
  const relationNames = useMemo(() => {
    if (!selected) return [];
    const names = new Set<string>();
    for (const field of selected.fields) {
      if (field.type === 'master' && field.masterTypeKey) {
        names.add(typeByKey.get(field.masterTypeKey)?.name ?? field.masterTypeKey);
      } else if (field.type === 'party') {
        names.add(typeByKey.get('party')?.name ?? 'طرف حساب');
      } else if (field.type === 'item') {
        names.add(typeByKey.get('item')?.name ?? 'کالا');
      } else if (field.type === 'warehouse') {
        names.add(typeByKey.get('warehouse')?.name ?? 'انبار');
      }
    }
    return [...names];
  }, [selected, typeByKey]);
  const rollupCount = selected
    ? selected.fields.filter((field) => field.type === 'rollup').length
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="داده‌های پایه"
        title="هر داده‌ای که کسب‌وکار شما لازم دارد."
        description="پارامترهای طرف‌حساب، کالا، انبار، گردش انبار و هر دادهٔ دلخواه دیگر را خودتان تعریف کنید؛ فیلدها بلافاصله در فرم فرآیندها و انتخابگرها در دسترس‌اند."
        actions={
          canManage ? (
            <Button
              variant="ink"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setDesigner({ open: true, type: null })}
            >
              نوع داده جدید
            </Button>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {types.isError ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-semibold text-ink-800">دریافت داده‌های پایه ممکن نشد.</p>
            <p className="mt-1 text-xs text-ink-400">{errorMessage(types.error)}</p>
            <Button variant="paper" className="mt-4" onClick={() => void types.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : types.isLoading ? (
          <div className="grid gap-4 p-4 lg:grid-cols-[250px_1fr]">
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-[250px_1fr]">
            <aside className="flex gap-2 overflow-x-auto border-b border-line p-3 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-e">
              <TypeGroup
                title="داده‌های اصلی"
                types={systemTypes}
                selectedId={selected?.id ?? null}
                onSelect={(id) => {
                  setSelectedId(id);
                  setSearch('');
                }}
              />
              <TypeGroup
                title="داده‌های سفارشی"
                types={customTypes}
                selectedId={selected?.id ?? null}
                onSelect={(id) => {
                  setSelectedId(id);
                  setSearch('');
                }}
                emptyHint={
                  canManage ? 'با «نوع داده جدید» اولین دادهٔ خود را بسازید.' : undefined
                }
              />
            </aside>

            <section className="min-w-0">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-ink-900">{selected.name}</h2>
                        {selected.isSystem ? (
                          <Badge tone="neutral">سیستمی</Badge>
                        ) : selected.isHierarchical ? (
                          <Badge tone="copper">درختی</Badge>
                        ) : null}
                        <Badge tone="outline">{faNum(selected.recordCount)} رکورد</Badge>
                      </div>
                      <p className="mt-1 max-w-xl text-[11px] leading-5 text-ink-400">
                        {selected.description || 'بدون توضیح'}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-400">
                        {faNum(selected.fields.length)} پارامتر
                        {selected.isSystem
                          ? ' — پارامترهای دلخواه خود را با «تنظیمات» اضافه کنید.'
                          : ''}
                      </p>
                      {relationNames.length || rollupCount ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {relationNames.length ? (
                            <span className="text-[10px] text-ink-400">
                              بر اساس: {relationNames.join('، ')}
                            </span>
                          ) : null}
                          {rollupCount ? (
                            <Badge tone="copper">
                              {faNum(rollupCount)} مقدار محاسبه‌شده
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {canManage ? (
                        <Button
                          variant="paper"
                          size="sm"
                          icon={<SlidersHorizontal size={13} />}
                          onClick={() => setDesigner({ open: true, type: selected })}
                        >
                          تنظیمات و فیلدها
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="ink"
                          size="sm"
                          icon={<Plus size={14} />}
                          onClick={() => setRecordEditor({ type: selected, record: null })}
                        >
                          رکورد جدید
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="relative border-b border-line px-4 py-2">
                    <MagnifyingGlass
                      size={14}
                      className="pointer-events-none absolute inset-y-0 start-7 my-auto text-ink-400"
                    />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="جستجو در این داده‌ها…"
                      className="focus-ring h-8 w-full rounded-lg border border-line bg-paper-50/70 ps-8 pe-7 text-[11px] placeholder:text-ink-400 focus:border-copper-400"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute inset-y-0 end-6 my-auto flex h-6 w-6 items-center justify-center rounded text-ink-400"
                        aria-label="پاک کردن"
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>

                  {records.isError ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold text-ink-800">دریافت رکوردها ممکن نشد.</p>
                      <p className="mt-1 text-xs text-ink-400">{errorMessage(records.error)}</p>
                      <Button
                        variant="paper"
                        className="mt-4"
                        onClick={() => void records.refetch()}
                      >
                        تلاش دوباره
                      </Button>
                    </div>
                  ) : records.isLoading ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-11 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : !(records.data ?? []).length ? (
                    <EmptyState
                      icon={<Database size={20} />}
                      title={search ? 'رکوردی پیدا نشد.' : 'هنوز رکوردی ثبت نشده است.'}
                      description={
                        search
                          ? 'عبارت جستجو را تغییر دهید.'
                          : 'اولین رکورد را اضافه کنید؛ همین حالا در فرم پرونده‌ها قابل انتخاب است.'
                      }
                      action={
                        !search && canManage ? (
                          <Button
                            variant="ink"
                            size="sm"
                            icon={<Plus size={14} />}
                            onClick={() => setRecordEditor({ type: selected, record: null })}
                          >
                            افزودن رکورد
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="min-w-[640px]">
                        <div
                          className="grid gap-3 border-b border-line bg-paper-100/50 px-4 py-2 text-[9px] font-semibold text-ink-400"
                          style={{ gridTemplateColumns: gridTemplate }}
                        >
                          {columns.map((column) => (
                            <span key={column.key} className="truncate">
                              {column.label}
                            </span>
                          ))}
                          <span />
                        </div>
                        <div className="divide-y divide-line/70">
                          {(records.data ?? []).map((record) => (
                            <div
                              key={record.id}
                              className="grid items-center gap-3 px-4 py-2.5 hover:bg-paper-100/40"
                              style={{ gridTemplateColumns: gridTemplate }}
                            >
                              {columns.map((column, index) => (
                                <button
                                  key={column.key}
                                  type="button"
                                  onClick={() =>
                                    canManage
                                      ? setRecordEditor({ type: selected, record })
                                      : undefined
                                  }
                                  className={cn(
                                    'min-w-0 truncate text-start text-[11px]',
                                    index === 0
                                      ? 'text-xs font-semibold text-ink-800'
                                      : 'text-ink-500',
                                    canManage ? 'cursor-pointer' : 'cursor-default',
                                  )}
                                  title={column.value(record)}
                                >
                                  {column.value(record)}
                                </button>
                              ))}
                              <div className="flex items-center justify-end gap-0.5">
                                {canManage ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => duplicate.mutate(record)}
                                      className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                                      aria-label="کپی رکورد"
                                      title="کپی"
                                    >
                                      <Copy size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRecordEditor({ type: selected, record })}
                                      className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                                      aria-label="ویرایش رکورد"
                                      title="ویرایش"
                                    >
                                      <PencilSimple size={14} />
                                    </button>
                                    {selected.entity === 'custom' ? (
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget({ type: selected, record })}
                                        className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                                        aria-label="حذف رکورد"
                                        title="حذف"
                                      >
                                        <Trash size={13} />
                                      </button>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                        {(records.data ?? []).length >= 500 ? (
                          <p className="border-t border-line bg-ochre-50/60 px-4 py-2 text-[10px] leading-5 text-ochre-600">
                            فقط ۵۰۰ رکورد نخست نمایش داده می‌شود؛ برای دیدن رکوردهای بیشتر از جستجو
                            استفاده کنید.
                          </p>
                        ) : null}
                        <div className="flex items-center justify-between border-t border-line bg-paper-100/40 px-4 py-2.5 text-[10px] text-ink-400">
                          <span>
                            {faNum((records.data ?? []).length)} رکورد از «{selected.name}»
                          </span>
                          <span>فیلدها و پارامترها را از «تنظیمات» تغییر دهید</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<Database size={22} />}
                  title="هنوز نوع داده‌ای بسازید."
                  description="با ساخت یک نوع داده، پارامترهای دلخواه خود را تعریف کنید و در فرم‌های فرآیند استفاده کنید."
                  action={
                    canManage ? (
                      <Button
                        variant="ink"
                        size="sm"
                        icon={<Plus size={14} />}
                        onClick={() => setDesigner({ open: true, type: null })}
                      >
                        ساخت نوع داده
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </section>
          </div>
        )}
      </Card>

      <FieldDesigner
        open={designer.open}
        type={designer.type}
        types={typeList}
        onClose={() => setDesigner({ open: false, type: null })}
        onSaved={(saved) => setSelectedId(saved.id)}
        onDeleted={() => {
          setSelectedId((current) => {
            const remaining = typeList.filter((type) => type.id !== current);
            return remaining[0]?.id ?? null;
          });
          void types.refetch();
        }}
      />

      {recordEditor ? (
        <RecordModal
          open
          type={recordEditor.type}
          record={recordEditor.record}
          onClose={() => setRecordEditor(null)}
        />
      ) : null}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="حذف رکورد"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.record)}
            >
              حذف
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-ink-600">
          «{deleteTarget?.record.title}» حذف شود؟ اگر در داده‌های دیگر استفاده شده باشد، حذف انجام
          نمی‌شود.
        </p>
      </Modal>
    </div>
  );
}

function TypeGroup({
  title,
  types,
  selectedId,
  onSelect,
  emptyHint,
}: {
  title: string;
  types: MasterDataTypeDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint?: string;
}) {
  return (
    <div className="lg:w-full">
      <p className="mb-1 hidden px-1 text-[9px] font-bold uppercase tracking-wide text-ink-400 lg:block">
        {title}
      </p>
      <div className="flex gap-2 lg:flex-col lg:gap-0.5">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => onSelect(type.id)}
            className={cn(
              'focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-start transition lg:w-full',
              selectedId === type.id
                ? 'border-copper-300 bg-copper-50'
                : 'border-transparent hover:border-line hover:bg-paper-100/70',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                selectedId === type.id
                  ? 'border-copper-200 bg-paper-50 text-copper-700'
                  : 'border-line bg-paper-50 text-ink-500',
              )}
            >
              {typeIcon(type.icon)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold text-ink-800">
                {type.name}
              </span>
              <span className="block truncate text-[9px] text-ink-400">
                {faNum(type.recordCount)} رکورد
              </span>
            </span>
          </button>
        ))}
        {!types.length && emptyHint ? (
          <p className="px-1 text-[10px] leading-5 text-ink-400">{emptyHint}</p>
        ) : null}
      </div>
    </div>
  );
}
