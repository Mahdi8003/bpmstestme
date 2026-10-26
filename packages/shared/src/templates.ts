import type {
  CaseIcon,
  CaseTypeDefinition,
  FieldDef,
  StageDef,
  TemplateSummary,
} from './types.js';

const field = (
  key: string,
  label: string,
  type: FieldDef['type'],
  options: Partial<FieldDef> = {},
): FieldDef => ({
  key,
  label,
  type,
  ...options,
});

const purchaseDefinition: CaseTypeDefinition = {
  fields: [
    field('subject', 'موضوع درخواست', 'text', {
      required: true,
      placeholder: 'مثلاً خرید لپ‌تاپ برای تیم فروش',
    }),
    field('vendor', 'تأمین‌کننده پیشنهادی', 'party', { required: true }),
    field('amount', 'مبلغ برآوردی (ریال)', 'currency', { required: true, min: 0 }),
    field('neededBy', 'تاریخ نیاز', 'date'),
    field('items', 'شرح اقلام', 'textarea', {
      required: true,
      placeholder: 'اقلام، تعداد و مشخصات فنی',
    }),
    field('justification', 'دلیل نیاز', 'textarea'),
  ],
  stages: [
    {
      key: 'review',
      name: 'بررسی تدارکات',
      description: 'تکمیل اطلاعات و بررسی تأمین‌کننده',
      tasks: [
        {
          key: 'procurement_review',
          name: 'بررسی و تکمیل درخواست',
          assignee: { type: 'role', value: 'procurement' },
          dueInHours: 24,
          formFields: ['vendor', 'amount', 'neededBy', 'items', 'justification'],
        },
      ],
    },
    {
      key: 'approval',
      name: 'تأیید مدیریت',
      description: 'تأیید مدیر واحد درخواست‌کننده',
      tasks: [
        {
          key: 'manager_approval',
          name: 'تأیید مدیر',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    },
    {
      key: 'finance',
      name: 'کنترل مالی',
      description: 'تأیید مالی برای مبالغ بالای سقف تعیین‌شده',
      tasks: [
        {
          key: 'finance_approval',
          name: 'تأیید مالی',
          kind: 'approval',
          assignee: { type: 'role', value: 'finance' },
          dueInHours: 24,
          condition: { field: 'amount', op: 'gte', value: 50_000_000 },
        },
      ],
    },
    {
      key: 'fulfillment',
      name: 'تأمین و رسید',
      description: 'ثبت سفارش، دریافت کالا و بارگذاری فاکتور',
      tasks: [
        {
          key: 'receive_goods',
          name: 'ثبت تأمین و رسید',
          assignee: { type: 'role', value: 'procurement' },
          dueInHours: 72,
          formFields: ['items'],
          requiredDocuments: ['invoice'],
        },
      ],
    },
  ],
  documents: [
    { key: 'quote', name: 'پیش‌فاکتور', stageKey: 'review' },
    { key: 'invoice', name: 'فاکتور خرید', required: true, stageKey: 'fulfillment' },
  ],
  settings: { titleField: 'subject', priority: 'normal' },
};

const paymentDefinition: CaseTypeDefinition = {
  fields: [
    field('subject', 'موضوع پرداخت', 'text', { required: true }),
    field('payee', 'دریافت‌کننده', 'party', { required: true }),
    field('invoiceNo', 'شماره فاکتور', 'text', { required: true }),
    field('amount', 'مبلغ پرداخت (ریال)', 'currency', { required: true, min: 0 }),
    field('dueDate', 'تاریخ سررسید', 'date', { required: true }),
    field('bankAccount', 'حساب پرداخت', 'text'),
    field('description', 'توضیحات', 'textarea'),
  ],
  stages: [
    {
      key: 'review',
      name: 'بررسی مالی',
      tasks: [
        {
          key: 'finance_review',
          name: 'بررسی فاکتور و مدارک',
          assignee: { type: 'role', value: 'finance' },
          dueInHours: 24,
          formFields: ['payee', 'invoiceNo', 'amount', 'dueDate', 'bankAccount', 'description'],
        },
      ],
    },
    {
      key: 'approval',
      name: 'تأیید مدیر',
      tasks: [
        {
          key: 'payment_approval',
          name: 'تأیید پرداخت',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    },
    {
      key: 'payment',
      name: 'اجرای پرداخت',
      tasks: [
        {
          key: 'execute_payment',
          name: 'ثبت پرداخت',
          assignee: { type: 'role', value: 'finance' },
          dueInHours: 24,
          formFields: ['bankAccount'],
          requiredDocuments: ['invoice'],
        },
      ],
    },
  ],
  documents: [{ key: 'invoice', name: 'فاکتور', required: true, stageKey: 'payment' }],
  settings: { titleField: 'subject', priority: 'high' },
};

const leaveDefinition: CaseTypeDefinition = {
  fields: [
    field('leaveType', 'نوع مرخصی', 'select', {
      required: true,
      options: [
        { label: 'استحقاقی', value: 'annual' },
        { label: 'استعلاجی', value: 'sick' },
        { label: 'بدون حقوق', value: 'unpaid' },
      ],
    }),
    field('fromDate', 'از تاریخ', 'date', { required: true }),
    field('toDate', 'تا تاریخ', 'date', { required: true }),
    field('reason', 'توضیحات', 'textarea'),
  ],
  stages: [
    {
      key: 'approval',
      name: 'تأیید مدیر',
      tasks: [
        {
          key: 'leave_approval',
          name: 'تأیید مرخصی',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 48,
        },
      ],
    },
  ],
  settings: { titleField: 'leaveType', priority: 'normal' },
};

const salesDefinition: CaseTypeDefinition = {
  fields: [
    field('subject', 'موضوع سفارش', 'text', { required: true }),
    field('customer', 'مشتری', 'party', { required: true }),
    field('amount', 'مبلغ سفارش (ریال)', 'currency', { required: true, min: 0 }),
    field('deliveryDate', 'تاریخ تحویل', 'date'),
    field('items', 'شرح اقلام', 'textarea', { required: true }),
    field('notes', 'یادداشت', 'textarea'),
  ],
  stages: [
    {
      key: 'sales_review',
      name: 'بررسی فروش',
      tasks: [
        {
          key: 'sales_review_task',
          name: 'تکمیل مشخصات سفارش',
          assignee: { type: 'role', value: 'member' },
          dueInHours: 24,
          formFields: ['customer', 'amount', 'deliveryDate', 'items', 'notes'],
        },
      ],
    },
    {
      key: 'approval',
      name: 'تأیید مدیریت',
      tasks: [
        {
          key: 'sales_approval',
          name: 'تأیید سفارش',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    },
    {
      key: 'fulfillment',
      name: 'آماده‌سازی و تحویل',
      tasks: [
        {
          key: 'warehouse_fulfillment',
          name: 'آماده‌سازی ارسال',
          assignee: { type: 'role', value: 'warehouse' },
          dueInHours: 48,
          formFields: ['items'],
        },
      ],
    },
  ],
  settings: { titleField: 'subject', priority: 'normal' },
};

const stockDefinition: CaseTypeDefinition = {
  fields: [
    field('item', 'کالا', 'item', { required: true }),
    field('warehouse', 'انبار', 'warehouse', { required: true }),
    field('quantity', 'مقدار', 'number', { required: true, min: 0.0001 }),
    field('reason', 'دلیل اصلاح', 'textarea', { required: true }),
  ],
  stages: [
    {
      key: 'warehouse_review',
      name: 'بررسی انبار',
      tasks: [
        {
          key: 'stock_review',
          name: 'بررسی موجودی و دلیل',
          assignee: { type: 'role', value: 'warehouse' },
          dueInHours: 24,
          formFields: ['item', 'warehouse', 'quantity', 'reason'],
        },
      ],
    },
    {
      key: 'approval',
      name: 'تأیید مدیریت',
      tasks: [
        {
          key: 'stock_approval',
          name: 'تأیید اصلاح موجودی',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    },
  ],
  settings: { titleField: 'reason', priority: 'normal' },
};

const productionDefinition: CaseTypeDefinition = {
  fields: [
    field('product', 'محصول', 'item', { required: true }),
    field('quantity', 'تعداد تولید', 'number', { required: true, min: 1 }),
    field('dueDate', 'تاریخ تحویل', 'date', { required: true }),
    field('notes', 'توضیحات', 'textarea'),
  ],
  stages: [
    {
      key: 'planning',
      name: 'برنامه‌ریزی تولید',
      tasks: [
        {
          key: 'production_planning',
          name: 'بررسی مواد و ظرفیت',
          assignee: { type: 'role', value: 'procurement' },
          dueInHours: 24,
          formFields: ['product', 'quantity', 'dueDate', 'notes'],
        },
      ],
    },
    {
      key: 'production',
      name: 'اجرای تولید',
      tasks: [
        {
          key: 'production_execution',
          name: 'ثبت پیشرفت تولید',
          assignee: { type: 'role', value: 'warehouse' },
          dueInHours: 72,
        },
      ],
    },
    {
      key: 'qc',
      name: 'کنترل کیفیت',
      tasks: [
        {
          key: 'qc_approval',
          name: 'تأیید کیفیت',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    },
  ],
  settings: { titleField: 'product', priority: 'high' },
};

const adminDefinition: CaseTypeDefinition = {
  fields: [
    field('requestType', 'نوع درخواست', 'select', {
      required: true,
      options: [
        { label: 'نامه اداری', value: 'letter' },
        { label: 'تحویل تجهیزات', value: 'equipment' },
        { label: 'پشتیبانی', value: 'support' },
        { label: 'سایر', value: 'other' },
      ],
    }),
    field('subject', 'موضوع', 'text', { required: true }),
    field('description', 'شرح درخواست', 'textarea', { required: true }),
    field('neededBy', 'تاریخ نیاز', 'date'),
  ],
  stages: [
    {
      key: 'approval',
      name: 'تأیید مدیر',
      tasks: [
        {
          key: 'admin_approval',
          name: 'تأیید درخواست اداری',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 48,
        },
      ],
    },
    {
      key: 'fulfillment',
      name: 'اجرا',
      tasks: [
        {
          key: 'admin_fulfillment',
          name: 'انجام درخواست',
          assignee: { type: 'role', value: 'member' },
          dueInHours: 48,
        },
      ],
    },
  ],
  settings: { titleField: 'subject', priority: 'normal' },
};

export const CASE_TYPE_TEMPLATES: TemplateSummary[] = [
  {
    key: 'purchase',
    name: 'درخواست خرید',
    description: 'از ثبت نیاز تا تأیید مدیریت، کنترل مالی و ثبت رسید کالا.',
    icon: 'cart' as CaseIcon,
    referencePrefix: 'PR',
    definition: purchaseDefinition,
  },
  {
    key: 'payment',
    name: 'درخواست پرداخت',
    description: 'بررسی فاکتور، تأیید و اجرای پرداخت با کنترل مدارک.',
    icon: 'wallet' as CaseIcon,
    referencePrefix: 'PAY',
    definition: paymentDefinition,
  },
  {
    key: 'leave',
    name: 'درخواست مرخصی',
    description: 'ثبت و تأیید مرخصی با گردش کار ساده.',
    icon: 'users' as CaseIcon,
    referencePrefix: 'LV',
    definition: leaveDefinition,
  },
  {
    key: 'sales',
    name: 'سفارش فروش',
    description: 'از بررسی سفارش تا تأیید مدیریت و آماده‌سازی ارسال.',
    icon: 'truck' as CaseIcon,
    referencePrefix: 'SO',
    definition: salesDefinition,
  },
  {
    key: 'stock',
    name: 'اصلاح موجودی',
    description: 'ثبت مغایرت انبار با تأیید سرپرست و مدیر.',
    icon: 'package' as CaseIcon,
    referencePrefix: 'ST',
    definition: stockDefinition,
  },
  {
    key: 'production',
    name: 'دستور تولید',
    description: 'برنامه‌ریزی، اجرا و کنترل کیفیت دستور تولید.',
    icon: 'factory' as CaseIcon,
    referencePrefix: 'WO',
    definition: productionDefinition,
  },
  {
    key: 'admin',
    name: 'درخواست اداری',
    description: 'نامه، تجهیزات و پشتیبانی با مسیر تأیید و اجرا.',
    icon: 'clipboard' as CaseIcon,
    referencePrefix: 'ADM',
    definition: adminDefinition,
  },
];

export function getTemplate(key: string): TemplateSummary | undefined {
  return CASE_TYPE_TEMPLATES.find((template) => template.key === key);
}

export const BLANK_DEFINITION: CaseTypeDefinition = {
  fields: [
    field('subject', 'موضوع', 'text', { required: true }),
    field('description', 'توضیحات', 'textarea'),
  ],
  stages: [
    {
      key: 'review',
      name: 'بررسی',
      tasks: [
        {
          key: 'review_task',
          name: 'بررسی درخواست',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 48,
          formFields: ['description'],
        },
      ],
    },
  ],
  settings: { titleField: 'subject' },
};
