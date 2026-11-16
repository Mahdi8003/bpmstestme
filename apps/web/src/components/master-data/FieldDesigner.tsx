import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowsDownUp,
  Database,
  LockSimple,
  Package,
  Plus,
  Tag,
  Trash,
  UsersThree,
  Warehouse,
  X,
} from '@phosphor-icons/react';
import {
  ROLLUP_OPS,
  ROLLUP_OP_LABELS,
  type FieldDef,
  type FieldType,
  type MasterDataTypeDto,
} from '@ravand/shared';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  cn,
} from '@/components/ui';

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const OPTION_TYPES: FieldType[] = ['select', 'radio', 'multiselect'];
const NUMBER_TYPES: FieldType[] = ['number', 'currency'];
const REFERENCE_TYPES: FieldType[] = ['master', 'party', 'item', 'warehouse'];

export const MASTER_FIELD_TYPES: FieldType[] = [
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'select',
  'radio',
  'multiselect',
  'checkbox',
  'email',
  'phone',
  'url',
  'user',
  'party',
  'item',
  'warehouse',
  'master',
  'rollup',
];

const FIELD_TYPE_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'متن و عدد', types: ['text', 'textarea', 'number', 'currency', 'date', 'checkbox'] },
  { label: 'انتخاب از فهرست', types: ['select', 'radio', 'multiselect'] },
  { label: 'تماس و نشانی', types: ['email', 'phone', 'url'] },
  { label: 'ارجاع به داده پایه', types: ['party', 'item', 'warehouse', 'user', 'master'] },
  { label: 'محاسبه از داده دیگر', types: ['rollup'] },
];

export const FIELD_TYPE_FA: Record<string, string> = {
  text: 'متن کوتاه',
  textarea: 'متن بلند',
  number: 'عدد',
  currency: 'مبلغ',
  date: 'تاریخ',
  select: 'لیست انتخابی',
  radio: 'انتخاب تک‌گزینه‌ای',
  multiselect: 'چندانتخابی',
  checkbox: 'بله / خیر',
  email: 'ایمیل',
  phone: 'تلفن',
  url: 'نشانی وب',
  user: 'کاربر',
  party: 'طرف حساب',
  item: 'کالا',
  warehouse: 'انبار',
  master: 'داده پایه سفارشی',
  rollup: 'محاسبه‌شده (جمع/تعداد)',
};

interface Draft {
  id?: string;
  key: string;
  name: string;
  description: string;
  isHierarchical: boolean;
  titleField: string;
  sortOrder: number;
  isSystem: boolean;
  entity: MasterDataTypeDto['entity'];
  fields: FieldDef[];
}

interface Preset {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  needsTarget?: boolean;
  build: (context: { target: MasterDataTypeDto | null; key: string }) => Partial<Draft>;
}

function optionsToLines(options: FieldDef['options']): string {
  return (options ?? []).map((option) => option.label).join('\n');
}

function linesToOptions(value: string, previous: FieldDef['options']): FieldDef['options'] {
  const previousOptions = previous ?? [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      label,
      value:
        previousOptions.find((option) => option.label === label)?.value ??
        `opt_${index + 1}`,
    }));
}

function nextFieldKey(fields: FieldDef[]): string {
  const used = new Set(fields.map((field) => field.key));
  let index = fields.length + 1;
  while (used.has(`field_${index}`)) index += 1;
  return `field_${index}`;
}

function nextTypeKey(types: MasterDataTypeDto[], base: string): string {
  const used = new Set(types.map((type) => type.key));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function referenceField(target: MasterDataTypeDto): Pick<FieldDef, 'type' | 'masterTypeKey'> {
  if (target.entity === 'custom') return { type: 'master', masterTypeKey: target.key };
  if (target.entity === 'party' || target.entity === 'item' || target.entity === 'warehouse') {
    return { type: target.entity };
  }
  return { type: 'master', masterTypeKey: target.key };
}

const PRESETS: Preset[] = [
  {
    key: 'party',
    title: 'طرف حساب',
    description: 'مشتری یا تأمین‌کننده با اطلاعات تماس و کد خودکار.',
    icon: <UsersThree size={18} />,
    build: () => ({
      name: 'طرف حساب‌ها',
      description: 'مشتریان و تأمین‌کنندگان سازمان.',
      titleField: 'name',
      fields: [
        { key: 'name', label: 'نام طرف حساب', type: 'text', required: true, width: 'half' },
        {
          key: 'code',
          label: 'کد',
          type: 'text',
          width: 'half',
          unique: true,
          help: 'خالی بگذارید تا خودکار ساخته شود.',
        },
        {
          key: 'kind',
          label: 'نوع طرف حساب',
          type: 'select',
          required: true,
          width: 'half',
          options: [
            { label: 'تأمین‌کننده', value: 'supplier' },
            { label: 'مشتری', value: 'customer' },
          ],
        },
        { key: 'phone', label: 'تلفن', type: 'phone', width: 'half' },
        { key: 'email', label: 'ایمیل', type: 'email', width: 'half' },
        { key: 'address', label: 'نشانی', type: 'textarea', width: 'full' },
      ],
    }),
  },
  {
    key: 'item',
    title: 'کالا / خدمت',
    description: 'کالا، خدمت یا دارایی با واحد، بهای واحد و وضعیت.',
    icon: <Package size={18} />,
    build: () => ({
      name: 'کالاها و خدمات',
      description: 'کالاها و خدماتی که در فرآیندها استفاده می‌شوند.',
      titleField: 'name',
      fields: [
        { key: 'name', label: 'نام', type: 'text', required: true, width: 'half' },
        {
          key: 'code',
          label: 'کد',
          type: 'text',
          width: 'half',
          unique: true,
          help: 'خالی بگذارید تا خودکار ساخته شود.',
        },
        { key: 'unit', label: 'واحد', type: 'text', width: 'half' },
        { key: 'price', label: 'بهای واحد (ریال)', type: 'currency', width: 'half' },
        { key: 'active', label: 'فعال', type: 'checkbox', width: 'half' },
      ],
    }),
  },
  {
    key: 'warehouse',
    title: 'انبار / محل',
    description: 'محل نگهداری کالا یا دارایی با کد و موقعیت.',
    icon: <Warehouse size={18} />,
    build: () => ({
      name: 'انبارها',
      description: 'انبارها و محل‌های نگهداری.',
      titleField: 'name',
      fields: [
        { key: 'name', label: 'نام', type: 'text', required: true, width: 'half' },
        { key: 'code', label: 'کد', type: 'text', width: 'half', unique: true },
        { key: 'location', label: 'موقعیت', type: 'text', width: 'full' },
      ],
    }),
  },
  {
    key: 'transaction',
    title: 'گردش / تراکنش',
    description: 'رکوردی که به یک دادهٔ دیگر (کالا، طرف حساب، فاکتور…) اشاره می‌کند؛ مثل گردش انبار یا پرداخت.',
    icon: <ArrowsDownUp size={18} />,
    needsTarget: true,
    build: ({ target }) => {
      if (!target) return { name: 'گردش‌ها', fields: [] };
      return {
        name: `گردش ${target.name}`,
        description: `رکوردهای مربوط به ${target.name}.`,
        titleField: 'title',
        fields: [
          { key: 'title', label: 'عنوان', type: 'text', required: true, width: 'full' },
          {
            key: 'reference',
            label: target.name,
            ...referenceField(target),
            required: true,
            width: 'half',
          },
          { key: 'quantity', label: 'مقدار', type: 'number', width: 'half' },
          { key: 'date', label: 'تاریخ', type: 'date', width: 'half' },
          { key: 'note', label: 'توضیح', type: 'textarea', width: 'full' },
        ],
      };
    },
  },
  {
    key: 'category',
    title: 'دسته‌بندی درختی',
    description: 'دسته‌های چندسطحی با والد؛ برای کالا، هزینه، پروژه و…',
    icon: <Tag size={18} />,
    build: ({ key }) => ({
      name: 'دسته‌بندی‌ها',
      description: 'ساختار درختی دسته‌ها.',
      isHierarchical: true,
      titleField: 'title',
      fields: [
        { key: 'title', label: 'نام دسته', type: 'text', required: true, width: 'half' },
        { key: 'code', label: 'کد', type: 'text', width: 'half', unique: true },
        {
          key: 'parent',
          label: 'والد',
          type: 'master',
          masterTypeKey: key,
          width: 'half',
          help: 'برای ساخت سلسله‌مراتب، دستهٔ بالادستی را انتخاب کنید.',
        },
      ],
    }),
  },
  {
    key: 'blank',
    title: 'از صفر',
    description: 'خودتان نام و همهٔ پارامترها را تعیین کنید.',
    icon: <Database size={18} />,
    build: () => ({
      name: '',
      description: '',
      fields: [{ key: 'title', label: 'عنوان', type: 'text', required: true, width: 'half' }],
    }),
  },
];

function emptyDraft(types: MasterDataTypeDto[]): Draft {
  return {
    key: nextTypeKey(types, 'custom_type'),
    name: '',
    description: '',
    isHierarchical: false,
    titleField: 'title',
    sortOrder: types.reduce((max, type) => Math.max(max, type.sortOrder), 0) + 10,
    isSystem: false,
    entity: 'custom',
    fields: [{ key: 'title', label: 'عنوان', type: 'text', required: true, width: 'half' }],
  };
}

function toDraft(type: MasterDataTypeDto): Draft {
  return {
    id: type.id,
    key: type.key,
    name: type.name,
    description: type.description,
    isHierarchical: type.isHierarchical,
    titleField: type.titleField ?? '',
    sortOrder: type.sortOrder,
    isSystem: type.isSystem,
    entity: type.entity,
    fields: structuredClone(type.fields),
  };
}

export function FieldDesigner({
  open,
  type,
  types,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  type: MasterDataTypeDto | null;
  types: MasterDataTypeDto[];
  onClose: () => void;
  onSaved: (saved: MasterDataTypeDto) => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(types));
  const [step, setStep] = useState<'preset' | 'form'>('preset');
  const [presetTargetId, setPresetTargetId] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmDelete(false);
    setPresetTargetId('');
    if (type) {
      setDraft(toDraft(type));
      setStep('form');
    } else {
      setDraft(emptyDraft(types));
      setStep('preset');
    }
  }, [open, type, types]);

  const presetTargets = types.filter((candidate) => candidate.entity !== 'movement');
  const presetTarget =
    presetTargets.find((candidate) => candidate.id === presetTargetId) ?? null;

  const masterTargets = types.filter(
    (candidate) => candidate.entity === 'custom' && candidate.key !== draft.key,
  );

  const sourceTypes = types.filter((candidate) => candidate.key !== draft.key);

  const applyPreset = (preset: Preset) => {
    const target = preset.needsTarget ? presetTarget : null;
    if (preset.needsTarget && !target) {
      setError('ابتدا انتخاب کنید این داده بر اساس چه نوع داده‌ای ساخته شود.');
      return;
    }
    const key = nextTypeKey(types, preset.key === 'blank' ? 'custom_type' : preset.key);
    const built = preset.build({ target, key });
    setDraft({
      ...emptyDraft(types),
      key,
      ...built,
      isHierarchical: built.isHierarchical ?? false,
      fields: built.fields ?? [],
    });
    setError('');
    setStep('form');
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        isHierarchical: draft.isHierarchical,
        titleField: draft.titleField || null,
        sortOrder: draft.sortOrder,
        fields: draft.fields.map((field) => ({
          ...field,
          label: field.label.trim(),
          required: field.type === 'rollup' ? false : field.required,
          unique: field.type === 'rollup' ? false : field.unique,
          readonly: field.type === 'rollup' ? true : field.readonly,
          options: OPTION_TYPES.includes(field.type)
            ? field.options?.filter((option) => option.label.trim())
            : undefined,
          masterTypeKey: field.type === 'master' ? field.masterTypeKey : undefined,
          rollup: field.type === 'rollup' ? field.rollup : undefined,
          min: NUMBER_TYPES.includes(field.type) ? field.min : undefined,
          max: NUMBER_TYPES.includes(field.type) ? field.max : undefined,
        })),
      };
      return draft.id
        ? api.patch<MasterDataTypeDto>(`/master/types/${draft.id}`, body)
        : api.post<MasterDataTypeDto>('/master/types', { ...body, key: draft.key });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<MasterDataTypeDto[]>(['master-types'], (current) =>
        current
          ? current.some((item) => item.id === saved.id)
            ? current.map((item) => (item.id === saved.id ? saved : item))
            : [...current, saved]
          : [saved],
      );
      void queryClient.invalidateQueries({ queryKey: ['master-types'] });
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      void queryClient.invalidateQueries({ queryKey: ['master-records', saved.id] });
      toast.success('نوع داده ذخیره شد.', 'فیلدها بلافاصله در فرم‌ها و لیست‌ها قابل استفاده‌اند.');
      onSaved(saved);
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const removeType = useMutation({
    mutationFn: () => api.delete(`/master/types/${draft.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['master-types'] });
      void queryClient.invalidateQueries({ queryKey: ['master-options'] });
      toast.success('نوع داده حذف شد.');
      onDeleted?.();
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const update = (patch: Partial<Draft>) => {
    setError('');
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.key && patch.key !== current.key) {
        next.fields = current.fields.map((field) =>
          field.masterTypeKey === current.key
            ? { ...field, masterTypeKey: patch.key! }
            : field,
        );
      }
      return next;
    });
  };

  const updateField = (index: number, patch: Partial<FieldDef>) => {
    setError('');
    setDraft((current) => {
      const fields = [...current.fields];
      fields[index] = { ...fields[index]!, ...patch };
      return { ...current, fields };
    });
  };

  const changeFieldType = (index: number, nextType: FieldType) => {
    const field = draft.fields[index]!;
    updateField(index, {
      type: nextType,
      masterTypeKey:
        nextType === 'master'
          ? field.masterTypeKey ?? (draft.key || undefined)
          : undefined,
      options: OPTION_TYPES.includes(nextType)
        ? field.options?.length
          ? field.options
          : [{ label: '', value: '' }]
        : undefined,
      rollup:
        nextType === 'rollup'
          ? (field.rollup ?? { sourceTypeKey: '', referenceField: '', op: 'sum' })
          : undefined,
      required: nextType === 'rollup' ? false : field.required,
      unique: nextType === 'rollup' ? false : field.unique,
      readonly: nextType === 'rollup' ? true : field.readonly,
    });
  };

  const addField = () => {
    setError('');
    setDraft((current) => ({
      ...current,
      fields: [
        ...current.fields,
        { key: nextFieldKey(current.fields), label: '', type: 'text', width: 'half' },
      ],
    }));
  };

  const removeField = (index: number) => {
    setError('');
    setDraft((current) => {
      const target = current.fields[index];
      if (!target || target.locked) return current;
      const fields = current.fields.filter((_, position) => position !== index);
      return {
        ...current,
        fields,
        titleField: fields.some((field) => field.key === current.titleField)
          ? current.titleField
          : '',
      };
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    setError('');
    setDraft((current) => {
      const target = current.fields[index];
      const swap = current.fields[index + direction];
      if (!target || !swap) return current;
      const fields = [...current.fields];
      fields[index] = swap;
      fields[index + direction] = target;
      return { ...current, fields };
    });
  };

  const toggleHierarchy = (checked: boolean) => {
    setError('');
    setDraft((current) => {
      const withoutParent = current.fields.filter(
        (field) =>
          !(
            field.key === 'parent' &&
            field.type === 'master' &&
            (field.masterTypeKey === current.key || !field.masterTypeKey)
          ),
      );
      if (!checked) {
        return { ...current, isHierarchical: false, fields: withoutParent };
      }
      return {
        ...current,
        isHierarchical: true,
        fields: [
          ...withoutParent,
          {
            key: 'parent',
            label: 'والد',
            type: 'master',
            masterTypeKey: current.key,
            width: 'half',
            help: 'برای ساخت سلسله‌مراتب، رکورد بالادستی را انتخاب کنید.',
          },
        ],
      };
    });
  };

  const submit = () => {
    if (draft.name.trim().length < 2) {
      setError('نام نوع داده را وارد کنید.');
      return;
    }
    if (!draft.id && !KEY_PATTERN.test(draft.key)) {
      setError('شناسه فنی باید با حرف لاتین شروع شود و فقط حرف، عدد و زیرخط داشته باشد.');
      return;
    }
    if (!draft.fields.length) {
      setError('حداقل یک فیلد تعریف کنید.');
      return;
    }
    const keys = new Set<string>();
    for (const field of draft.fields) {
      if (!KEY_PATTERN.test(field.key)) {
        setError('شناسه فنی همهٔ فیلدها باید با حرف لاتین شروع شود.');
        return;
      }
      if (keys.has(field.key)) {
        setError(`شناسه فنی «${field.key}» تکراری است.`);
        return;
      }
      keys.add(field.key);
      if (!field.label.trim()) {
        setError('نام نمایشی همهٔ فیلدها را وارد کنید.');
        return;
      }
      if (field.type === 'master' && !field.masterTypeKey) {
        setError(`نوع داده مقصد را برای فیلد «${field.label}» انتخاب کنید.`);
        return;
      }
      if (field.hidden && field.required) {
        setError(`فیلد «${field.label}» پنهان است و نمی‌تواند الزامی باشد.`);
        return;
      }
      if (field.type === 'rollup') {
        if (!field.rollup?.sourceTypeKey || !field.rollup.referenceField) {
          setError(`منبع محاسبهٔ فیلد «${field.label}» را کامل انتخاب کنید.`);
          return;
        }
        if (field.rollup.op !== 'count' && !field.rollup.valueField) {
          setError(`فیلد مقدار محاسبهٔ «${field.label}» را انتخاب کنید.`);
          return;
        }
      }
      if (OPTION_TYPES.includes(field.type) && !(field.options?.length ?? 0)) {
        setError(`برای فیلد «${field.label}» حداقل یک گزینه وارد کنید.`);
        return;
      }
    }
    if (draft.titleField && !keys.has(draft.titleField)) {
      setError('فیلد عنوان باید یکی از فیلدهای همین نوع باشد.');
      return;
    }
    save.mutate();
  };

  const isNew = !draft.id;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          step === 'preset'
            ? 'چه داده‌ای می‌سازید؟'
            : draft.id
              ? `تنظیمات ${draft.name || 'نوع داده'}`
              : 'نوع داده جدید'
        }
        description={
          step === 'preset'
            ? 'یک الگوی آماده انتخاب کنید؛ بعد همهٔ پارامترها را مطابق کسب‌وکار خود تغییر دهید.'
            : draft.isSystem
              ? 'این نوع داده بخشی از موتور سیستم است؛ می‌توانید فیلدهای دلخواه اضافه کنید، اما فیلدهای سیستمی قابل حذف نیستند.'
              : 'هر پارامتری که کسب‌وکار شما لازم دارد را به‌صورت فیلد تعریف کنید.'
        }
        size="xl"
        footer={
          step === 'preset' ? (
            <Button variant="ghost" onClick={onClose}>
              انصراف
            </Button>
          ) : (
            <>
              {draft.id && !draft.isSystem ? (
                <Button
                  variant="ghost"
                  className="me-auto text-stamp-600 hover:bg-stamp-50"
                  icon={<Trash size={14} />}
                  onClick={() => setConfirmDelete(true)}
                >
                  حذف نوع
                </Button>
              ) : null}
              {isNew ? (
                <Button
                  variant="ghost"
                  className="me-auto"
                  icon={<ArrowLeft size={14} />}
                  onClick={() => {
                    setStep('preset');
                    setError('');
                  }}
                >
                  تغییر الگو
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onClose}>
                انصراف
              </Button>
              <Button variant="ink" loading={save.isPending} onClick={submit}>
                ذخیره
              </Button>
            </>
          )
        }
      >
        {step === 'preset' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-3 text-[11px] leading-6 text-copper-800">
              داده‌ها می‌توانند ساده باشند (طرف حساب، کالا) یا به دادهٔ دیگری وصل شوند
              (گردش انبار، پرداخت روی فاکتور) یا از روی آن محاسبه شوند (جمع پرداخت‌ها).
              برای شروع یک الگو انتخاب کنید.
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {PRESETS.map((preset) => {
                const disabled = Boolean(preset.needsTarget && !presetTargets.length);
                return (
                  <button
                    key={preset.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'focus-ring flex items-start gap-3 rounded-xl border border-line bg-paper-50 p-3 text-start transition',
                      disabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:-translate-y-0.5 hover:border-copper-300 hover:shadow-folio',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-100 text-ink-600">
                      {preset.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink-900">
                        {preset.title}
                      </span>
                      <span className="mt-1 block text-[10px] leading-5 text-ink-400">
                        {preset.description}
                      </span>
                      {preset.needsTarget ? (
                        <span className="mt-1.5 block text-[10px] text-copper-700">
                          وابسته به دادهٔ دیگر — نوع آن را پایین انتخاب کنید
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <Field
              label="دادهٔ مرجع برای گردش / تراکنش"
              hint="مثلاً کالا برای گردش انبار، یا فاکتور برای پرداخت."
            >
              <Select
                value={presetTargetId}
                onChange={(event) => {
                  setPresetTargetId(event.target.value);
                  setError('');
                }}
              >
                <option value="">انتخاب کنید…</option>
                {presetTargets.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </Select>
            </Field>

            {error ? (
              <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام نمایشی" required>
                <Input
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="مثلاً قراردادها، انباردارها، پرداخت‌ها"
                />
              </Field>
              <Field
                label="شناسه فنی"
                hint={draft.id ? 'پس از ساخت قابل تغییر نیست.' : 'حروف لاتین، عدد و زیرخط'}
              >
                <Input
                  value={draft.key}
                  onChange={(event) => update({ key: event.target.value })}
                  dir="ltr"
                  disabled={Boolean(draft.id)}
                  className="font-mono"
                />
              </Field>
            </div>

            <Field label="توضیح کوتاه">
              <Input
                value={draft.description}
                onChange={(event) => update({ description: event.target.value })}
                placeholder="این داده چه چیزی را نگه می‌دارد؟"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="فیلد عنوان" hint="برای نمایش هر رکورد در لیست‌ها و انتخابگرها.">
                <Select
                  value={draft.titleField}
                  onChange={(event) => update({ titleField: event.target.value })}
                >
                  <option value="">خودکار (اولین فیلد متنی)</option>
                  {draft.fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label || field.key}
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.isSystem ? (
                <Field label="نوع داده سیستمی">
                  <div className="flex h-9 items-center rounded-md border border-line bg-paper-100/70 px-3 text-[11px] text-ink-500">
                    ساخته‌شده توسط سیستم، قابل حذف نیست
                  </div>
                </Field>
              ) : (
                <Field
                  label="دسته‌بندی درختی"
                  hint="برای ساختارهای چندسطحی؛ فیلد «والد» خودکار اضافه می‌شود."
                >
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-paper-50 px-3 text-xs text-ink-700">
                    <input
                      type="checkbox"
                      checked={draft.isHierarchical}
                      onChange={(event) => toggleHierarchy(event.target.checked)}
                      className="h-4 w-4 accent-copper-500"
                    />
                    زیرمجموعهٔ رکورد دیگر باشد
                  </label>
                </Field>
              )}
            </div>

            <div className="rounded-xl border border-line bg-paper-100/40">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-ink-800">پارامترها</p>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    هر پارامتر همان چیزی است که کاربر در فرم پر می‌کند.
                  </p>
                </div>
                <Button variant="paper" size="sm" icon={<Plus size={12} />} onClick={addField}>
                  افزودن پارامتر
                </Button>
              </div>

              <div className="space-y-2.5 p-3">
                {draft.fields.map((field, index) => {
                  const rollupSource = types.find(
                    (candidate) => candidate.key === field.rollup?.sourceTypeKey,
                  );
                  const referenceOptions = (rollupSource?.fields ?? []).filter((candidate) =>
                    REFERENCE_TYPES.includes(candidate.type),
                  );
                  const valueOptions = (rollupSource?.fields ?? []).filter((candidate) =>
                    NUMBER_TYPES.includes(candidate.type),
                  );
                  return (
                    <div
                      key={`${field.key}-${index}`}
                      className="rounded-lg border border-line/80 bg-paper-50 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveField(index, -1)}
                            disabled={index === 0}
                            className="focus-ring rounded p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                            aria-label="جابه‌جایی به بالا"
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveField(index, 1)}
                            disabled={index === draft.fields.length - 1}
                            className="focus-ring rounded p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                            aria-label="جابه‌جایی به پایین"
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>
                        <Input
                          value={field.label}
                          onChange={(event) => updateField(index, { label: event.target.value })}
                          placeholder="نام نمایشی پارامتر"
                          className="h-9 flex-1 text-xs"
                        />
                        <Input
                          value={field.key}
                          onChange={(event) => updateField(index, { key: event.target.value })}
                          dir="ltr"
                          disabled={Boolean(field.locked)}
                          className="h-9 w-32 font-mono text-[11px]"
                          placeholder="field_key"
                        />
                        <Select
                          value={field.type}
                          onChange={(event) =>
                            changeFieldType(index, event.target.value as FieldType)
                          }
                          disabled={Boolean(field.locked)}
                          className="h-9 w-44 text-xs"
                        >
                          {FIELD_TYPE_GROUPS.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.types.map((type) => (
                                <option key={type} value={type}>
                                  {FIELD_TYPE_FA[type] ?? type}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                        {field.locked ? (
                          <span className="inline-flex items-center gap-1 rounded border border-line bg-paper-100 px-1.5 py-1 text-[9px] text-ink-500">
                            <LockSimple size={10} />
                            سیستمی
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeField(index)}
                            className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                            aria-label="حذف پارامتر"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {field.type !== 'rollup' ? (
                        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-ink-600">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={Boolean(field.required) && !field.hidden}
                              disabled={Boolean(field.hidden)}
                              onChange={(event) =>
                                updateField(index, { required: event.target.checked })
                              }
                              className="h-3.5 w-3.5 accent-copper-500 disabled:cursor-not-allowed"
                            />
                            الزامی
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={Boolean(field.unique)}
                              onChange={(event) =>
                                updateField(index, { unique: event.target.checked })
                              }
                              className="h-3.5 w-3.5 accent-copper-500"
                            />
                            یکتا
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={Boolean(field.hidden)}
                              onChange={(event) =>
                                updateField(index, {
                                  hidden: event.target.checked,
                                  required: event.target.checked ? false : field.required,
                                })
                              }
                              className="h-3.5 w-3.5 accent-copper-500"
                            />
                            پنهان در فرم
                          </label>
                          <span className="flex flex-1 items-center gap-2">
                            <span className="text-ink-400">گروه:</span>
                            <Input
                              value={field.section ?? ''}
                              onChange={(event) =>
                                updateField(index, { section: event.target.value || undefined })
                              }
                              placeholder="مثلاً اطلاعات تماس"
                              className="h-7 flex-1 text-[11px]"
                            />
                          </span>
                        </div>
                      ) : null}

                      {field.type !== 'rollup' ? (
                        <Input
                          value={field.help ?? ''}
                          onChange={(event) =>
                            updateField(index, { help: event.target.value || undefined })
                          }
                          placeholder="راهنمای پارامتر (اختیاری)"
                          className="mt-2 h-7 text-[11px]"
                        />
                      ) : null}

                      {OPTION_TYPES.includes(field.type) ? (
                        <div className="mt-2">
                          <Textarea
                            value={optionsToLines(field.options)}
                            onChange={(event) =>
                              updateField(index, {
                                options: linesToOptions(event.target.value, field.options),
                              })
                            }
                            placeholder={'هر خط یک گزینه:\nمشتری\nتأمین‌کننده'}
                            className="min-h-16 text-xs"
                          />
                          <p className="mt-1 text-[10px] text-ink-400">
                            هر خط یک گزینه است؛ ترتیب خطوط، ترتیب نمایش را تعیین می‌کند.
                          </p>
                        </div>
                      ) : null}

                      {field.type === 'master' ? (
                        <Select
                          value={field.masterTypeKey ?? ''}
                          disabled={Boolean(field.locked)}
                          onChange={(event) =>
                            updateField(index, {
                              masterTypeKey: event.target.value || undefined,
                            })
                          }
                          className="mt-2 h-9 text-xs"
                        >
                          <option value="">نوع داده مقصد…</option>
                          {masterTargets.map((candidate) => (
                            <option key={candidate.key} value={candidate.key}>
                              {candidate.name}
                            </option>
                          ))}
                          {field.masterTypeKey === draft.key ? (
                            <option value={draft.key}>
                              {draft.name || draft.key} (همین نوع)
                            </option>
                          ) : null}
                        </Select>
                      ) : null}

                      {field.type === 'rollup' ? (
                        <div className="mt-2 rounded-lg border border-copper-100 bg-copper-50/50 p-2.5">
                          <p className="mb-2 text-[10px] font-semibold text-copper-800">
                            این مقدار دستی وارد نمی‌شود؛ از رکوردهای یک دادهٔ دیگر محاسبه
                            می‌شود.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Select
                              value={field.rollup?.sourceTypeKey ?? ''}
                              onChange={(event) =>
                                updateField(index, {
                                  rollup: {
                                    sourceTypeKey: event.target.value,
                                    referenceField: '',
                                    valueField: '',
                                    op: field.rollup?.op ?? 'sum',
                                  },
                                })
                              }
                              className="h-8 text-[11px]"
                            >
                              <option value="">دادهٔ منبع…</option>
                              {sourceTypes.map((candidate) => (
                                <option key={candidate.key} value={candidate.key}>
                                  {candidate.name}
                                </option>
                              ))}
                            </Select>
                            <Select
                              value={field.rollup?.referenceField ?? ''}
                              onChange={(event) =>
                                updateField(index, {
                                  rollup: {
                                    sourceTypeKey: field.rollup?.sourceTypeKey ?? '',
                                    referenceField: event.target.value,
                                    valueField: field.rollup?.valueField,
                                    op: field.rollup?.op ?? 'sum',
                                  },
                                })
                              }
                              className="h-8 text-[11px]"
                            >
                              <option value="">پارامتر ارجاع به این داده…</option>
                              {referenceOptions.map((candidate) => (
                                <option key={candidate.key} value={candidate.key}>
                                  {candidate.label}
                                </option>
                              ))}
                            </Select>
                            <Select
                              value={field.rollup?.op ?? 'sum'}
                              onChange={(event) =>
                                updateField(index, {
                                  rollup: {
                                    sourceTypeKey: field.rollup?.sourceTypeKey ?? '',
                                    referenceField: field.rollup?.referenceField ?? '',
                                    valueField: field.rollup?.valueField,
                                    op: event.target.value as NonNullable<
                                      FieldDef['rollup']
                                    >['op'],
                                  },
                                })
                              }
                              className="h-8 text-[11px]"
                            >
                              {ROLLUP_OPS.map((op) => (
                                <option key={op} value={op}>
                                  {ROLLUP_OP_LABELS[op]}
                                </option>
                              ))}
                            </Select>
                            {field.rollup?.op !== 'count' ? (
                              <Select
                                value={field.rollup?.valueField ?? ''}
                                onChange={(event) =>
                                  updateField(index, {
                                    rollup: {
                                      sourceTypeKey: field.rollup?.sourceTypeKey ?? '',
                                      referenceField: field.rollup?.referenceField ?? '',
                                      valueField: event.target.value,
                                      op: field.rollup?.op ?? 'sum',
                                    },
                                  })
                                }
                                className="h-8 text-[11px]"
                              >
                                <option value="">پارامتر مقدار…</option>
                                {valueOptions.map((candidate) => (
                                  <option key={candidate.key} value={candidate.key}>
                                    {candidate.label}
                                  </option>
                                ))}
                              </Select>
                            ) : null}
                          </div>
                          <p className="mt-1.5 text-[10px] leading-5 text-ink-400">
                            مثال: روی «فاکتور» یک پارامتر محاسبه‌شده بسازید که «جمع» مبلغ
                            «پرداخت‌ها» باشد؛ پرداخت‌ها پارامتری دارند که به فاکتور اشاره می‌کند.
                          </p>
                        </div>
                      ) : null}

                      {NUMBER_TYPES.includes(field.type) ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            type="number"
                            value={field.min === undefined ? '' : String(field.min)}
                            onChange={(event) =>
                              updateField(index, {
                                min:
                                  event.target.value === ''
                                    ? undefined
                                    : Number(event.target.value),
                              })
                            }
                            placeholder="حداقل"
                            dir="ltr"
                            className="h-8 text-[11px]"
                          />
                          <Input
                            type="number"
                            value={field.max === undefined ? '' : String(field.max)}
                            onChange={(event) =>
                              updateField(index, {
                                max:
                                  event.target.value === ''
                                    ? undefined
                                    : Number(event.target.value),
                              })
                            }
                            placeholder="حداکثر"
                            dir="ltr"
                            className="h-8 text-[11px]"
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="حذف نوع داده"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              loading={removeType.isPending}
              onClick={() => removeType.mutate()}
            >
              حذف قطعی
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-ink-600">
          با حذف «{draft.name}»، همهٔ رکوردهای آن هم حذف می‌شوند. این کار قابل بازگشت نیست.
        </p>
        <p className="mt-2 text-[11px] text-ink-400">
          اگر این نوع در نوع دیگری استفاده شده باشد، حذف انجام نمی‌شود.
        </p>
      </Modal>
    </>
  );
}
