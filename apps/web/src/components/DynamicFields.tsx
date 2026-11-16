import { useEffect, useState } from 'react';
import { evaluateCondition, type FieldDef } from '@ravand/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentDto,
  ItemDto,
  MasterDataRecordDto,
  MasterDataTypeDto,
  PartyDto,
  UserSummary,
  WarehouseDto,
} from '@ravand/shared';
import { api, errorMessage } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { formatJalaliIso, norm, parseJalaliIso } from '@/lib/jalali';
import { Field, Input, Select, Textarea, cn } from './ui';
import { JalaliDatePicker } from './JalaliDatePicker';

export interface MasterOptions {
  parties: PartyDto[];
  items: ItemDto[];
  warehouses: WarehouseDto[];
  users: UserSummary[];
  customTypes: MasterDataTypeDto[];
  customRecords: Record<string, MasterDataRecordDto[]>;
}

export function useMasterOptions() {
  return useQuery({
    queryKey: ['master-options'],
    queryFn: () => api.get<MasterOptions>('/master/options'),
    staleTime: 60_000,
  });
}

export function DynamicFields({
  fields,
  values,
  onChange,
  options,
  className,
  disabled = false,
  layout = 'two-column',
  caseId,
  taskId,
  documents,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options?: MasterOptions;
  className?: string;
  disabled?: boolean;
  layout?: 'two-column' | 'single-column';
  caseId?: string;
  taskId?: string;
  documents?: DocumentDto[];
}) {
  const visibleFields = fields.filter(
    (field) =>
      !field.hidden &&
      (!field.visibleWhen || evaluateCondition(field.visibleWhen, fields, values)),
  );

  if (!visibleFields.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-ink-400">
        فیلد قابل نمایشی وجود ندارد.
      </p>
    );
  }

  const groups: { section: string; fields: FieldDef[] }[] = [];
  for (const field of visibleFields) {
    const section = field.section?.trim() ?? '';
    const group = groups.find((candidate) => candidate.section === section);
    if (group) group.fields.push(field);
    else groups.push({ section, fields: [field] });
  }
  const single = layout === 'single-column';

  return (
    <div className={cn('space-y-5', className)}>
      {groups.map((group) => (
        <div key={group.section || 'default'} className="space-y-3">
          {group.section ? (
            <div className="border-b border-line pb-1.5 text-[11px] font-semibold text-ink-700">
              {group.section}
            </div>
          ) : null}
          <div className={cn('grid gap-4', single ? 'grid-cols-1' : 'sm:grid-cols-6')}>
            {group.fields.map((field) => {
              const value = values[field.key];
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  hint={field.help}
                  className={single ? undefined : fieldWidthClass(field)}
                >
                  <FieldControl
                    field={field}
                    value={value}
                    onChange={(next) => onChange(field.key, next)}
                    options={options}
                    disabled={disabled}
                    caseId={caseId}
                    taskId={taskId}
                    documents={documents}
                  />
                </Field>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function fieldWidthClass(field: FieldDef): string {
  const width =
    field.width ?? (['textarea', 'table'].includes(field.type) ? 'full' : 'half');
  if (width === 'full') return 'sm:col-span-6';
  if (width === 'third') return 'sm:col-span-2';
  return 'sm:col-span-3';
}

function FieldControl({
  field,
  value,
  onChange,
  options,
  disabled,
  caseId,
  taskId,
  documents,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: MasterOptions;
  disabled: boolean;
  caseId?: string;
  taskId?: string;
  documents?: DocumentDto[];
}) {
  const isDisabled = disabled || Boolean(field.readonly);

  if (field.type === 'rollup') {
    const text =
      typeof value === 'number'
        ? value.toLocaleString('fa-IR')
        : value === undefined || value === null || value === ''
          ? '—'
          : String(value);
    return (
      <span className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-line bg-paper-100/60 px-3">
        <span className="text-xs font-semibold text-ink-800">{text}</span>
        <span className="text-[10px] text-ink-400">محاسبه‌شده</span>
      </span>
    );
  }

  if (field.type === 'table') {
    return (
      <TableField
        field={field}
        value={value}
        onChange={onChange}
        options={options}
        disabled={isDisabled}
        caseId={caseId}
        taskId={taskId}
        documents={documents}
      />
    );
  }

  if (field.type === 'file') {
    return (
      <FileField
        field={field}
        value={value}
        onChange={onChange}
        disabled={isDisabled}
        caseId={caseId}
        taskId={taskId}
        documents={documents}
      />
    );
  }

  if (field.type === 'textarea') {
    return (
      <Textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        disabled={isDisabled}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">انتخاب کنید…</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === 'radio') {
    return (
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-paper-50/60 px-3 py-2">
        {(field.options ?? []).map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-xs text-ink-700">
            <input
              type="radio"
              name={field.key}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-3.5 w-3.5 accent-copper-500"
              disabled={isDisabled}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-paper-50/60 px-3 py-2">
        {(field.options ?? []).map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label key={option.value} className="flex items-center gap-1.5 text-xs text-ink-700">
              <input
                type="checkbox"
                value={option.value}
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((item) => item !== option.value)
                      : [...selected, option.value],
                  )
                }
                className="h-3.5 w-3.5 accent-copper-500"
                disabled={isDisabled}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <span className="flex h-10 items-center gap-2 rounded-lg border border-line bg-paper-50/60 px-3">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-copper-500"
          disabled={isDisabled}
        />
        <span className="text-xs text-ink-600">بله</span>
      </span>
    );
  }

  if (field.type === 'master') {
    const type = options?.customTypes.find((candidate) => candidate.key === field.masterTypeKey);
    const records = field.masterTypeKey
      ? (options?.customRecords[field.masterTypeKey] ?? [])
      : [];
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">انتخاب {type?.name ?? 'داده پایه'}…</option>
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {record.title}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === 'party') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">انتخاب طرف حساب…</option>
        {(options?.parties ?? []).map((party) => (
          <option key={party.id} value={party.id}>
            {party.name} — {party.code}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === 'item') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">انتخاب کالا…</option>
        {(options?.items ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} — {item.sku}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === 'warehouse') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">انتخاب انبار…</option>
        {(options?.warehouses ?? []).map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name} — {warehouse.code}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === 'user') {
    return (
      <Select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
      >
        <option value="">انتخاب کاربر…</option>
        {(options?.users ?? []).map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} — {user.jobTitle ?? user.email}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === 'number' || field.type === 'currency') {
    return (
      <div className="relative">
        <NumberField
          value={value}
          onChange={onChange}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          disabled={isDisabled}
          className={field.type === 'currency' ? 'pe-14' : undefined}
        />
        {field.type === 'currency' ? (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[10px] text-ink-400">
            ریال
          </span>
        ) : null}
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <JalaliDatePicker
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        placeholder={field.placeholder ?? 'انتخاب تاریخ'}
        disabled={isDisabled}
      />
    );
  }

  if (field.type === 'email' || field.type === 'phone' || field.type === 'url') {
    return (
      <Input
        type={field.type === 'phone' ? 'tel' : field.type}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          field.placeholder ??
          (field.type === 'email'
            ? 'name@company.com'
            : field.type === 'phone'
              ? '0912…'
              : 'https://')
        }
        dir="ltr"
        className="text-start"
        disabled={isDisabled}
      />
    );
  }

  return (
    <Input
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      disabled={isDisabled}
    />
  );
}

export function normalizeDateInput(value: string): string {
  return norm(value);
}

export function fieldDisplayValue(
  field: FieldDef,
  value: unknown,
  options?: MasterOptions,
  documents?: DocumentDto[],
): string {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return '—';
  }
  if (field.type === 'table') {
    return Array.isArray(value) ? `${value.length.toLocaleString('fa-IR')} ردیف` : '—';
  }
  if (field.type === 'file' && typeof value === 'string') {
    return documents?.find((document) => document.id === value)?.name ?? 'فایل پیوست';
  }
  if (field.type === 'checkbox') return value ? 'بله' : 'خیر';
  if (field.type === 'multiselect' && Array.isArray(value)) {
    return value
      .map(
        (item) =>
          field.options?.find((option) => option.value === String(item))?.label ?? String(item),
      )
      .join('، ');
  }
  if (field.type === 'date' && typeof value === 'string') {
    return parseJalaliIso(value) ? formatJalaliIso(value) : value;
  }
  if (field.type === 'currency') {
    return typeof value === 'number' || typeof value === 'string'
      ? formatMoney(value)
      : String(value);
  }
  if (field.type === 'master' && typeof value === 'string') {
    const records = field.masterTypeKey
      ? (options?.customRecords[field.masterTypeKey] ?? [])
      : [];
    return records.find((record) => record.id === value)?.title ?? value;
  }
  if (field.type === 'party' && typeof value === 'string') {
    return options?.parties.find((party) => party.id === value)?.name ?? value;
  }
  if (field.type === 'item' && typeof value === 'string') {
    const item = options?.items.find((candidate) => candidate.id === value);
    return item ? `${item.name} (${item.sku})` : value;
  }
  if (field.type === 'warehouse' && typeof value === 'string') {
    return options?.warehouses.find((warehouse) => warehouse.id === value)?.name ?? value;
  }
  if (field.type === 'user' && typeof value === 'string') {
    return options?.users.find((user) => user.id === value)?.name ?? value;
  }
  if ((field.type === 'select' || field.type === 'radio') && typeof value === 'string') {
    return field.options?.find((option) => option.value === value)?.label ?? value;
  }
  if (typeof value === 'number') return value.toLocaleString('fa-IR');
  return String(value);
}

function newRowKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function TableField({
  field,
  value,
  onChange,
  options,
  disabled,
  caseId,
  taskId,
  documents,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: MasterOptions;
  disabled: boolean;
  caseId?: string;
  taskId?: string;
  documents?: DocumentDto[];
}) {
  const columns = field.columns ?? [];
  const rows = Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
  const minRows = field.minRows ?? 0;
  const maxRows = field.maxRows;
  const canAdd = !disabled && (maxRows === undefined || rows.length < maxRows);

  const updateCell = (rowIndex: number, columnKey: string, next: unknown) => {
    onChange(
      rows.map((row, index) => (index === rowIndex ? { ...row, [columnKey]: next } : row)),
    );
  };

  const addRow = () => {
    if (!canAdd) return;
    const row: Record<string, unknown> = { _key: newRowKey() };
    for (const column of columns) row[column.key] = undefined;
    onChange([...rows, row]);
  };

  const removeRow = (rowIndex: number) => {
    if (disabled || rows.length <= minRows) return;
    onChange(rows.filter((_, index) => index !== rowIndex));
  };

  if (!columns.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-4 py-4 text-center text-xs text-ink-400">
        ستونی برای این جدول تعریف نشده است.
      </p>
    );
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(150px, 1fr)) 2.5rem`,
  };

  return (
    <div className="rounded-xl border border-line bg-paper-50/40">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div
            className="grid items-center gap-2 border-b border-line bg-paper-100/70 px-3 py-2 text-[11px] font-semibold text-ink-600"
            style={gridStyle}
          >
            {columns.map((column) => (
              <span key={column.key} className="truncate">
                {column.label}
                {column.required ? <span className="text-stamp-600"> *</span> : null}
              </span>
            ))}
            <span className="sr-only">حذف</span>
          </div>
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <div
                key={String(row._key ?? rowIndex)}
                className="grid items-start gap-2 border-b border-line/70 px-3 py-2 last:border-b-0"
                style={gridStyle}
              >
                {columns.map((column) => (
                  <FieldControl
                    key={column.key}
                    field={column}
                    value={row[column.key]}
                    onChange={(next) => updateCell(rowIndex, column.key, next)}
                    options={options}
                    disabled={disabled}
                    caseId={caseId}
                    taskId={taskId}
                    documents={documents}
                  />
                ))}
                <div className="flex h-10 items-center justify-center">
                  {!disabled && rows.length > minRows ? (
                    <button
                      type="button"
                      onClick={() => removeRow(rowIndex)}
                      className="rounded-md px-2 py-1 text-xs text-stamp-600 hover:bg-stamp-50"
                      title="حذف ردیف"
                    >
                      حذف
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-xs text-ink-400">
              هنوز ردیفی ثبت نشده است.
            </p>
          )}
        </div>
      </div>
      {!disabled ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
          <span className="text-[11px] text-ink-400">
            {rows.length.toLocaleString('fa-IR')} ردیف
            {minRows ? ` • حداقل ${minRows.toLocaleString('fa-IR')} ردیف` : ''}
            {maxRows ? ` • حداکثر ${maxRows.toLocaleString('fa-IR')} ردیف` : ''}
          </span>
          <button
            type="button"
            onClick={addRow}
            disabled={!canAdd}
            className="rounded-lg border border-line bg-paper-0 px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-copper-300 hover:text-copper-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {field.addLabel ?? 'افزودن ردیف'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FileField({
  field,
  value,
  onChange,
  disabled,
  caseId,
  taskId,
  documents,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  caseId?: string;
  taskId?: string;
  documents?: DocumentDto[];
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const documentId = typeof value === 'string' && value ? value : '';
  const document = documentId
    ? documents?.find((candidate) => candidate.id === documentId)
    : undefined;

  if (disabled) {
    return documentId ? (
      <a
        href={`/api/documents/${documentId}/download`}
        className="inline-flex h-10 items-center text-xs font-medium text-copper-700 hover:underline"
      >
        {document?.name ?? 'دریافت فایل پیوست'}
      </a>
    ) : (
      <span className="flex h-10 items-center text-xs text-ink-400">بدون پیوست</span>
    );
  }

  if (!caseId) {
    return (
      <span className="flex min-h-10 items-center rounded-lg border border-dashed border-line px-3 text-[11px] text-ink-400">
        امکان بارگذاری فایل پس از ثبت پرونده فراهم می‌شود.
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-line bg-paper-50/60 px-3 py-1.5">
        {documentId ? (
          <a
            href={`/api/documents/${documentId}/download`}
            className="text-xs font-medium text-copper-700 hover:underline"
          >
            {document?.name ?? 'دریافت فایل پیوست'}
          </a>
        ) : (
          <span className="text-xs text-ink-400">فایلی بارگذاری نشده است.</span>
        )}
        <span className="flex-1" />
        <label className="cursor-pointer rounded-md border border-line bg-paper-0 px-2.5 py-1 text-[11px] font-medium text-ink-700 transition hover:border-copper-300 hover:text-copper-700">
          {uploading ? 'در حال بارگذاری…' : documentId ? 'تغییر فایل' : 'انتخاب فایل'}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setError(null);
              setUploading(true);
              try {
                const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
                const uploaded = await api.upload<DocumentDto>(
                  `/cases/${caseId}/documents${query}`,
                  file,
                );
                onChange(uploaded.id);
                if (taskId) {
                  void queryClient.invalidateQueries({ queryKey: ['task', taskId] });
                }
                void queryClient.invalidateQueries({ queryKey: ['case', caseId] });
              } catch (uploadError) {
                setError(errorMessage(uploadError));
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {documentId ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-md px-2 py-1 text-[11px] text-stamp-600 hover:bg-stamp-50"
          >
            حذف
          </button>
        ) : null}
      </div>
      {field.help ? <p className="text-[11px] text-ink-400">{field.help}</p> : null}
      {error ? <p className="text-[11px] text-stamp-600">{error}</p> : null}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [raw, setRaw] = useState(() =>
    value === undefined || value === null ? '' : String(value),
  );

  useEffect(() => {
    const next = value === undefined || value === null ? '' : String(value);
    setRaw((current) => {
      if (current === next) return current;
      if (current !== '' && Number.isFinite(Number(current)) && Number(current) === Number(value)) {
        return current;
      }
      return next;
    });
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      dir="ltr"
      value={raw}
      onChange={(event) => {
        const next = event.target.value;
        if (next !== '' && !/^-?\d*\.?\d*$/.test(next)) return;
        setRaw(next);
        if (next === '') {
          onChange('');
          return;
        }
        const numeric = Number(next);
        if (Number.isFinite(numeric)) onChange(numeric);
      }}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
