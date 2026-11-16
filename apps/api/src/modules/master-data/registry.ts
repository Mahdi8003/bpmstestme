import type { FieldDef, MasterEntity } from '@ravand/shared';

export interface MasterTypeSeed {
  key: string;
  entity: MasterEntity;
  name: string;
  description: string;
  icon: string;
  titleField: string;
  sortOrder: number;
  isSystem: boolean;
  isHierarchical: boolean;
  fields: FieldDef[];
}

const PARTY_FIELDS: FieldDef[] = [
  { key: 'name', label: 'نام طرف حساب', type: 'text', required: true, width: 'half', locked: true },
  {
    key: 'code',
    label: 'کد',
    type: 'text',
    unique: true,
    width: 'half',
    locked: true,
    help: 'اگر خالی بماند خودکار ساخته می‌شود.',
  },
  {
    key: 'kind',
    label: 'نوع طرف حساب',
    type: 'select',
    required: true,
    width: 'half',
    locked: true,
    options: [
      { label: 'تأمین‌کننده', value: 'supplier' },
      { label: 'مشتری', value: 'customer' },
    ],
  },
  { key: 'phone', label: 'تلفن', type: 'phone', width: 'half', locked: true },
  { key: 'email', label: 'ایمیل', type: 'email', width: 'half', locked: true },
  { key: 'taxId', label: 'شناسه مالیاتی', type: 'text', width: 'half', locked: true },
  { key: 'address', label: 'نشانی', type: 'textarea', width: 'full', locked: true },
];

const ITEM_FIELDS: FieldDef[] = [
  { key: 'name', label: 'نام کالا', type: 'text', required: true, width: 'half', locked: true },
  {
    key: 'sku',
    label: 'کد کالا',
    type: 'text',
    unique: true,
    width: 'half',
    locked: true,
    help: 'اگر خالی بماند خودکار ساخته می‌شود.',
  },
  { key: 'unit', label: 'واحد شمارش', type: 'text', width: 'half', locked: true },
  {
    key: 'category',
    label: 'دسته‌بندی',
    type: 'master',
    masterTypeKey: 'item_category',
    width: 'half',
    locked: true,
    help: 'دسته‌ها را در نوع داده «دسته‌بندی کالا» بسازید؛ می‌توانید دسته‌های تو در تو داشته باشید.',
  },
  { key: 'unitCost', label: 'بهای واحد (ریال)', type: 'currency', width: 'half', locked: true },
  { key: 'reorderPoint', label: 'نقطه سفارش', type: 'number', width: 'half', locked: true },
  { key: 'active', label: 'فعال', type: 'checkbox', width: 'half', locked: true },
];

const WAREHOUSE_FIELDS: FieldDef[] = [
  { key: 'name', label: 'نام انبار', type: 'text', required: true, width: 'half', locked: true },
  {
    key: 'code',
    label: 'کد انبار',
    type: 'text',
    unique: true,
    width: 'half',
    locked: true,
    help: 'اگر خالی بماند خودکار ساخته می‌شود.',
  },
  { key: 'location', label: 'موقعیت', type: 'text', width: 'full', locked: true },
];

const MOVEMENT_FIELDS: FieldDef[] = [
  { key: 'item', label: 'کالا', type: 'item', required: true, width: 'half', locked: true },
  { key: 'warehouse', label: 'انبار', type: 'warehouse', required: true, width: 'half', locked: true },
  {
    key: 'type',
    label: 'نوع گردش',
    type: 'select',
    required: true,
    width: 'half',
    locked: true,
    options: [
      { label: 'ورود', value: 'in' },
      { label: 'خروج', value: 'out' },
      { label: 'اصلاح موجودی', value: 'adjust' },
    ],
  },
  { key: 'quantity', label: 'مقدار', type: 'number', required: true, min: 0, width: 'half', locked: true },
  { key: 'reference', label: 'مرجع', type: 'text', width: 'half', locked: true },
  { key: 'note', label: 'یادداشت', type: 'textarea', width: 'full', locked: true },
];

const CATEGORY_FIELDS: FieldDef[] = [
  { key: 'title', label: 'نام دسته', type: 'text', required: true, width: 'half' },
  { key: 'code', label: 'کد دسته', type: 'text', width: 'half', unique: true },
  {
    key: 'parent',
    label: 'دسته بالادستی',
    type: 'master',
    masterTypeKey: 'item_category',
    width: 'half',
    help: 'برای ساخت دسته‌بندی درختی، دسته بالاتر را انتخاب کنید.',
  },
  { key: 'description', label: 'توضیح', type: 'textarea', width: 'full' },
];

export const MASTER_TYPE_SEEDS: MasterTypeSeed[] = [
  {
    key: 'party',
    entity: 'party',
    name: 'طرف حساب‌ها',
    description: 'مشتریان و تأمین‌کنندگان سازمان.',
    icon: 'users',
    titleField: 'name',
    sortOrder: 10,
    isSystem: true,
    isHierarchical: false,
    fields: PARTY_FIELDS,
  },
  {
    key: 'item',
    entity: 'item',
    name: 'کالاها',
    description: 'کالاها و خدمات، همراه با دسته‌بندی و موجودی.',
    icon: 'package',
    titleField: 'name',
    sortOrder: 20,
    isSystem: true,
    isHierarchical: false,
    fields: ITEM_FIELDS,
  },
  {
    key: 'warehouse',
    entity: 'warehouse',
    name: 'انبارها',
    description: 'انبارها و محل‌های نگهداری کالا.',
    icon: 'warehouse',
    titleField: 'name',
    sortOrder: 30,
    isSystem: true,
    isHierarchical: false,
    fields: WAREHOUSE_FIELDS,
  },
  {
    key: 'movement',
    entity: 'movement',
    name: 'گردش انبار',
    description: 'ورود، خروج و اصلاح موجودی کالاها.',
    icon: 'arrows',
    titleField: 'item',
    sortOrder: 40,
    isSystem: true,
    isHierarchical: false,
    fields: MOVEMENT_FIELDS,
  },
  {
    key: 'item_category',
    entity: 'custom',
    name: 'دسته‌بندی کالا',
    description: 'دسته‌های کالا؛ می‌توانید دسته‌های تو در تو بسازید.',
    icon: 'tags',
    titleField: 'title',
    sortOrder: 50,
    isSystem: true,
    isHierarchical: true,
    fields: CATEGORY_FIELDS,
  },
];

/** Field keys backed by real columns for each system entity. */
export const CORE_FIELD_KEYS: Record<string, string[]> = {
  party: ['name', 'code', 'kind', 'email', 'phone', 'taxId', 'address'],
  item: ['name', 'sku', 'unit', 'category', 'unitCost', 'reorderPoint', 'active'],
  warehouse: ['name', 'code', 'location'],
  movement: ['item', 'warehouse', 'type', 'quantity', 'reference', 'note'],
};

export function seedFor(entity: string): MasterTypeSeed | undefined {
  return MASTER_TYPE_SEEDS.find((seed) => seed.entity === entity);
}

export function coreFieldKeys(entity: MasterEntity): string[] {
  return CORE_FIELD_KEYS[entity] ?? [];
}
