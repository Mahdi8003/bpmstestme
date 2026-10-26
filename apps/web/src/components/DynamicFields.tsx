import { evaluateCondition, type FieldDef } from '@ravand/shared';
import { useQuery } from '@tanstack/react-query';
import type { ItemDto, PartyDto, UserSummary, WarehouseDto } from '@ravand/shared';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Field, Input, Select, Textarea, cn } from './ui';

export interface MasterOptions {
  parties: PartyDto[];
  items: ItemDto[];
  warehouses: WarehouseDto[];
  users: UserSummary[];
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
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  options?: MasterOptions;
  className?: string;
  disabled?: boolean;
  layout?: 'two-column' | 'single-column';
}) {
  const visibleFields = fields.filter(
    (field) => !field.visibleWhen || evaluateCondition(field.visibleWhen, fields, values),
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
  const width = field.width ?? (field.type === 'textarea' ? 'full' : 'half');
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
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: MasterOptions;
  disabled: boolean;
}) {
  const isDisabled = disabled || Boolean(field.readonly);

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
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-white/60 px-3 py-2">
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
      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-white/60 px-3 py-2">
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
      <span className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white/60 px-3">
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
        <Input
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === '' ? '' : Number(raw));
          }}
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
      <Input
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(normalizeDateInput(event.target.value))}
        placeholder={field.placeholder ?? '1405-08-20'}
        dir="ltr"
        className="text-end font-mono"
        disabled={isDisabled}
        inputMode="numeric"
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

const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDateInput(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[./\\]/g, '-')
    .replace(/[^\d-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 10);
}

export function fieldDisplayValue(
  field: FieldDef,
  value: unknown,
  options?: MasterOptions,
): string {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return '—';
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
    const normalized = normalizeDateInput(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return normalized.replace(/-/g, '/').replace(/\d/g, (digit) => persianDigits[Number(digit)]!);
    }
    return value;
  }
  if (field.type === 'currency') {
    return typeof value === 'number' || typeof value === 'string'
      ? formatMoney(value)
      : String(value);
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
