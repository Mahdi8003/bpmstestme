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
    field('neededBy', 'تاریخ نیاز', 'date', { required: true }),
    field('justification', 'دلیل نیاز و توضیحات', 'textarea'),
    field('requestItems', 'اقلام درخواستی', 'table', {
      required: true,
      width: 'full',
      minRows: 1,
      addLabel: 'افزودن قلم',
      help: 'برای هر کالا یک ردیف ثبت کنید؛ مقدار و مشخصات فنی را دقیق وارد کنید.',
      columns: [
        field('item', 'کالا', 'item', { required: true }),
        field('quantity', 'مقدار', 'number', { required: true, min: 0 }),
        field('specs', 'مشخصات / توضیح', 'text'),
      ],
    }),
    field('estimatedTotal', 'مبلغ برآوردی کل (ریال)', 'currency', { min: 0 }),
    field('selectedSupplier', 'تأمین‌کننده انتخاب‌شده', 'party', { hidden: true }),
    field('selectedAmount', 'مبلغ انتخاب‌شده (ریال)', 'currency', { hidden: true }),
    field('selectedDeliveryDays', 'زمان تحویل انتخاب‌شده (روز)', 'number', { hidden: true }),
    field('selectedQuoteFile', 'پیش‌فاکتور انتخاب‌شده', 'file', { hidden: true }),
  ],
  stages: [
    {
      key: 'request_approval',
      name: 'تأیید درخواست',
      description: 'مدیر، درخواست و اقلام آن را بررسی و تأیید می‌کند',
      tasks: [
        {
          key: 'request_manager_approval',
          name: 'تأیید درخواست خرید',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    },
    {
      key: 'quote_collection',
      name: 'دریافت پیش‌فاکتور',
      description: 'تدارکات پیش‌فاکتور تأمین‌کنندگان را ثبت و پیوست می‌کند',
      fields: [
        field('quotes', 'پیش‌فاکتورهای دریافتی', 'table', {
          required: true,
          width: 'full',
          minRows: 1,
          addLabel: 'افزودن پیش‌فاکتور',
          help: 'برای هر تأمین‌کننده یک ردیف با مبلغ، زمان تحویل و فایل پیش‌فاکتور ثبت کنید.',
          columns: [
            field('supplier', 'تأمین‌کننده', 'party', { required: true }),
            field('amount', 'مبلغ پیشنهادی (ریال)', 'currency', { required: true, min: 0 }),
            field('deliveryDays', 'زمان تحویل (روز)', 'number', { min: 0 }),
            field('validUntil', 'اعتبار پیش‌فاکتور تا', 'date'),
            field('quoteFile', 'فایل پیش‌فاکتور', 'file'),
            field('notes', 'توضیح', 'text'),
          ],
        }),
      ],
      tasks: [
        {
          key: 'collect_quotes',
          name: 'ثبت پیش‌فاکتورها',
          assignee: { type: 'role', value: 'procurement' },
          dueInHours: 48,
          formFields: ['quotes'],
        },
      ],
    },
    {
      key: 'quote_selection',
      name: 'انتخاب پیش‌فاکتور',
      description: 'مدیر یکی از پیش‌فاکتورها را برای خرید انتخاب می‌کند',
      tasks: [
        {
          key: 'select_quote',
          name: 'انتخاب پیش‌فاکتور برتر',
          kind: 'selection',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
          selection: {
            sourceField: 'quotes',
            labelColumn: 'supplier',
            copy: [
              { from: 'supplier', to: 'selectedSupplier' },
              { from: 'amount', to: 'selectedAmount' },
              { from: 'deliveryDays', to: 'selectedDeliveryDays' },
              { from: 'quoteFile', to: 'selectedQuoteFile' },
            ],
          },
        },
      ],
    },
    {
      key: 'purchase',
      name: 'تأمین و خرید',
      description: 'ثبت سفارش خرید بر اساس پیش‌فاکتور انتخاب‌شده',
      fields: [
        field('purchaseOrderNo', 'شماره سفارش خرید', 'text', { required: true }),
        field('purchaseDate', 'تاریخ ثبت سفارش', 'date'),
        field('purchaseNotes', 'توضیحات خرید', 'textarea'),
      ],
      tasks: [
        {
          key: 'place_order',
          name: 'ثبت سفارش خرید',
          assignee: { type: 'role', value: 'procurement' },
          dueInHours: 48,
          formFields: ['purchaseOrderNo', 'purchaseDate', 'purchaseNotes'],
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
          condition: { field: 'selectedAmount', op: 'gte', value: 50_000_000 },
        },
      ],
    },
    {
      key: 'receiving',
      name: 'رسید کالا',
      description: 'انبار کالاهای خریداری‌شده را تحویل و فاکتور را بارگذاری می‌کند',
      fields: [
        field('receivedDate', 'تاریخ رسید', 'date'),
        field('receivedNotes', 'توضیحات رسید', 'textarea'),
      ],
      tasks: [
        {
          key: 'receive_goods',
          name: 'ثبت رسید کالا',
          assignee: { type: 'role', value: 'warehouse' },
          dueInHours: 48,
          formFields: ['receivedDate', 'receivedNotes'],
          requiredDocuments: ['invoice'],
        },
      ],
    },
  ],
  documents: [
    { key: 'purchase_order', name: 'سفارش خرید', stageKey: 'purchase' },
    { key: 'invoice', name: 'فاکتور خرید', required: true, stageKey: 'receiving' },
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
