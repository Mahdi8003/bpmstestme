import { eq } from 'drizzle-orm';
import {
  CASE_TYPE_TEMPLATES,
  formatReference,
  getJalaliYear,
  type CaseStatus,
  type CaseTypeDefinition,
  type RoleKey,
  type TaskKind,
  type TaskOutcome,
  type TaskStatus,
} from '@ravand/shared';
import { db, pool } from './client.js';
import { env } from '../env.js';
import { hashPassword } from '../lib/password.js';
import { createReference } from '../lib/numbering.js';
import {
  caseComments,
  caseEvents,
  caseTasks,
  caseTypes,
  caseTypeVersions,
  cases,
  items,
  notifications,
  parties,
  stockMovements,
  tenants,
  users,
  warehouses,
} from './schema.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DEMO_PASSWORD = 'Demo1234!';

const userSeed: {
  email: string;
  name: string;
  role: RoleKey;
  jobTitle: string;
  avatarColor: string;
}[] = [
  {
    email: 'admin@ravand.local',
    name: 'سارا احمدی',
    role: 'admin',
    jobTitle: 'مدیر عملیات',
    avatarColor: '#1E3A5F',
  },
  {
    email: 'builder@ravand.local',
    name: 'مریم رضایی',
    role: 'builder',
    jobTitle: 'طراح فرآیند',
    avatarColor: '#8B5E3C',
  },
  {
    email: 'manager@ravand.local',
    name: 'علی محمدی',
    role: 'manager',
    jobTitle: 'مدیر عامل',
    avatarColor: '#3F5F4A',
  },
  {
    email: 'finance@ravand.local',
    name: 'نگار کریمی',
    role: 'finance',
    jobTitle: 'کارشناس مالی',
    avatarColor: '#6B4C7A',
  },
  {
    email: 'procurement@ravand.local',
    name: 'رضا قاسمی',
    role: 'procurement',
    jobTitle: 'کارشناس تأمین',
    avatarColor: '#7A5C2E',
  },
  {
    email: 'warehouse@ravand.local',
    name: 'حسین نادری',
    role: 'warehouse',
    jobTitle: 'سرپرست انبار',
    avatarColor: '#2F6572',
  },
  {
    email: 'member@ravand.local',
    name: 'پویا صادقی',
    role: 'member',
    jobTitle: 'کارشناس فروش',
    avatarColor: '#5B6475',
  },
];

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

interface SeedTaskInput {
  stageKey: string;
  taskKey: string;
  name: string;
  status: TaskStatus;
  kind?: TaskKind;
  outcome?: TaskOutcome | null;
  assigneeRole?: RoleKey | null;
  assigneeId?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  data?: Record<string, unknown>;
}

interface SeedCaseInput {
  key: string;
  typeKey: string;
  title: string;
  data: Record<string, unknown>;
  stageKey: string;
  status: CaseStatus;
  priority?: 'low' | 'normal' | 'high';
  createdBy: string;
  createdAt: Date;
  completedAt?: Date | null;
  tasks: SeedTaskInput[];
}

interface SeededCase {
  id: string;
  reference: string;
  title: string;
}

interface CaseTypeRef {
  id: string;
  versionId: string;
  definition: CaseTypeDefinition;
  referencePrefix: string;
}

async function insertSeedCase(
  tx: Tx,
  tenantId: string,
  userIds: Map<RoleKey, string>,
  typeRef: CaseTypeRef,
  input: SeedCaseInput,
  result: Map<string, SeededCase>,
): Promise<void> {
  const stage = typeRef.definition.stages.find((item) => item.key === input.stageKey);
  if (!stage) throw new Error(`Unknown stage ${input.stageKey} for ${input.typeKey}`);
  const reference = await createReference(tx, tenantId, typeRef.referencePrefix);
  const activeTask = input.tasks.find((task) =>
    ['pending', 'claimed', 'waiting_info'].includes(task.status),
  );
  const [created] = await tx
    .insert(cases)
    .values({
      tenantId,
      caseTypeId: typeRef.id,
      versionId: typeRef.versionId,
      reference,
      title: input.title,
      status: input.status,
      stageKey: stage.key,
      stageName: stage.name,
      priority: input.priority ?? 'normal',
      data: input.data,
      createdBy: input.createdBy,
      dueAt: input.status === 'in_progress' ? (activeTask?.dueAt ?? null) : null,
      completedAt: input.completedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.completedAt ?? input.createdAt,
    })
    .returning();
  if (!created) throw new Error('Could not insert seed case');
  result.set(input.key, created);

  const taskRows = await tx
    .insert(caseTasks)
    .values(
      input.tasks.map((task) => ({
        tenantId,
        caseId: created.id,
        stageKey: task.stageKey,
        taskKey: task.taskKey,
        name: task.name,
        status: task.status,
        kind: task.kind ?? 'action',
        outcome: task.outcome ?? null,
        assigneeId:
          task.assigneeId ??
          (task.assigneeRole ? (userIds.get(task.assigneeRole) ?? null) : null),
        candidateRole: task.assigneeId ? null : (task.assigneeRole ?? null),
        dueAt: task.dueAt ?? null,
        claimedAt:
          task.status === 'pending' || task.status === 'waiting_info'
            ? null
            : (task.completedAt ?? input.createdAt),
        completedAt: task.completedAt ?? null,
        data: task.data ?? {},
        createdAt: input.createdAt,
        updatedAt: task.completedAt ?? input.createdAt,
      })),
    )
    .returning();

  await tx.insert(caseEvents).values({
    tenantId,
    caseId: created.id,
    type: 'case.created',
    actorId: input.createdBy,
    data: { reference, caseType: input.typeKey },
    createdAt: input.createdAt,
  });

  for (const task of taskRows) {
    if (task.status !== 'completed') continue;
    await tx.insert(caseEvents).values({
      tenantId,
      caseId: created.id,
      type: 'task.completed',
      actorId: task.assigneeId,
      data: {
        taskId: task.id,
        name: task.name,
        outcome: task.outcome,
        stageKey: task.stageKey,
      },
      createdAt: task.completedAt ?? input.createdAt,
    });
  }

  const waiting = taskRows.find((task) => task.status === 'waiting_info');
  if (waiting) {
    await tx.insert(caseEvents).values({
      tenantId,
      caseId: created.id,
      type: 'case.info_requested',
      actorId: userIds.get('procurement') ?? input.createdBy,
      data: { taskId: waiting.id, name: waiting.name },
      createdAt: input.createdAt,
    });
  }

  if (input.status === 'completed') {
    await tx.insert(caseEvents).values({
      tenantId,
      caseId: created.id,
      type: 'case.completed',
      actorId: input.createdBy,
      data: { reference },
      createdAt: input.completedAt ?? input.createdAt,
    });
  }
}

export async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Seeding demo data is not allowed in production.');
  }

  await pool.query('TRUNCATE TABLE tenants CASCADE');

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: 'شرکت روند', slug: 'ravand' })
      .returning();
    if (!tenant) throw new Error('Could not insert tenant');

    const passwordHash = hashPassword(DEMO_PASSWORD);
    const insertedUsers = await tx
      .insert(users)
      .values(
        userSeed.map((user) => ({
          tenantId: tenant.id,
          email: user.email,
          passwordHash,
          name: user.name,
          role: user.role,
          jobTitle: user.jobTitle,
          avatarColor: user.avatarColor,
        })),
      )
      .returning();
    const userIds = new Map<RoleKey, string>();
    for (const user of insertedUsers) userIds.set(user.role, user.id);
    const adminId = userIds.get('admin');
    const builderId = userIds.get('builder');
    const memberId = userIds.get('member');
    const managerId = userIds.get('manager');
    const procurementId = userIds.get('procurement');
    const financeId = userIds.get('finance');
    const warehouseId = userIds.get('warehouse');
    if (
      !adminId ||
      !builderId ||
      !memberId ||
      !managerId ||
      !procurementId ||
      !financeId ||
      !warehouseId
    ) {
      throw new Error('Seed users are incomplete');
    }

    const caseTypeRefs = new Map<string, CaseTypeRef>();
    const now = new Date();
    for (const template of CASE_TYPE_TEMPLATES) {
      const [caseType] = await tx
        .insert(caseTypes)
        .values({
          tenantId: tenant.id,
          key: template.key,
          name: template.name,
          description: template.description,
          icon: template.icon,
          referencePrefix: template.referencePrefix,
          status: 'published',
          definition: template.definition,
          version: 1,
          ownerId: builderId,
          createdBy: builderId,
          publishedAt: now,
        })
        .returning();
      if (!caseType) throw new Error(`Could not insert case type ${template.key}`);
      const [version] = await tx
        .insert(caseTypeVersions)
        .values({
          caseTypeId: caseType.id,
          tenantId: tenant.id,
          version: 1,
          definition: template.definition,
          publishedBy: builderId,
        })
        .returning();
      if (!version) throw new Error(`Could not insert version for ${template.key}`);
      await tx
        .update(caseTypes)
        .set({ publishedVersionId: version.id })
        .where(eq(caseTypes.id, caseType.id));
      caseTypeRefs.set(template.key, {
        id: caseType.id,
        versionId: version.id,
        definition: template.definition,
        referencePrefix: template.referencePrefix,
      });
    }

    const insertedParties = await tx
      .insert(parties)
      .values([
        {
          tenantId: tenant.id,
          kind: 'supplier',
          name: 'شرکت کاغذ پارس',
          code: 'SUP-001',
          email: 'sales@paperpars.example',
          phone: '021-88990011',
          address: 'تهران، جاده مخصوص کرج، کیلومتر ۱۲',
        },
        {
          tenantId: tenant.id,
          kind: 'supplier',
          name: 'فناوران شبکه آریا',
          code: 'SUP-002',
          email: 'info@aria-net.example',
          phone: '021-77665544',
          address: 'تهران، خیابان ولیعصر',
        },
        {
          tenantId: tenant.id,
          kind: 'supplier',
          name: 'صنایع فلزی البرز',
          code: 'SUP-003',
          email: 'orders@alborz-steel.example',
          phone: '026-44556677',
          address: 'کرج، شهرک صنعتی',
        },
        {
          tenantId: tenant.id,
          kind: 'customer',
          name: 'فروشگاه آرمان',
          code: 'CUS-001',
          email: 'arman@example.com',
          phone: '021-22334455',
          address: 'تهران، بازار بزرگ',
        },
        {
          tenantId: tenant.id,
          kind: 'customer',
          name: 'شرکت داده‌پرداز نوین',
          code: 'CUS-002',
          email: 'buy@dadehnovin.example',
          phone: '021-99887766',
          address: 'تهران، سعادت‌آباد',
        },
      ])
      .returning();
    const partyId = (code: string) =>
      insertedParties.find((party) => party.code === code)?.id ?? null;

    const insertedWarehouses = await tx
      .insert(warehouses)
      .values([
        { tenantId: tenant.id, code: 'WH-01', name: 'انبار مرکزی', location: 'تهران' },
        { tenantId: tenant.id, code: 'WH-02', name: 'انبار تولید', location: 'کرج' },
      ])
      .returning();
    const mainWarehouse = insertedWarehouses.find((warehouse) => warehouse.code === 'WH-01');
    if (!mainWarehouse) throw new Error('Seed warehouse missing');

    const insertedItems = await tx
      .insert(items)
      .values([
        {
          tenantId: tenant.id,
          sku: 'LAP-014',
          name: 'لپ‌تاپ ۱۴ اینچ',
          unit: 'دستگاه',
          category: 'تجهیزات',
          unitCost: '185000000',
          reorderPoint: '2',
        },
        {
          tenantId: tenant.id,
          sku: 'NET-024',
          name: 'سوییچ ۲۴ پورت',
          unit: 'دستگاه',
          category: 'شبکه',
          unitCost: '46000000',
          reorderPoint: '3',
        },
        {
          tenantId: tenant.id,
          sku: 'PAP-A4',
          name: 'کاغذ A4 (کارتن)',
          unit: 'کارتن',
          category: 'ملزومات',
          unitCost: '28000000',
          reorderPoint: '10',
        },
        {
          tenantId: tenant.id,
          sku: 'RAW-STL',
          name: 'ورق فولادی',
          unit: 'کیلوگرم',
          category: 'مواد اولیه',
          unitCost: '820000',
          reorderPoint: '500',
        },
        {
          tenantId: tenant.id,
          sku: 'PRD-001',
          name: 'محصول نهایی',
          unit: 'عدد',
          category: 'محصول',
          unitCost: '2400000',
          reorderPoint: '20',
        },
      ])
      .returning();
    const itemId = (sku: string) => insertedItems.find((item) => item.sku === sku)?.id ?? null;
    const requiredItemId = (sku: string): string => {
      const id = itemId(sku);
      if (!id) throw new Error(`Seed item missing: ${sku}`);
      return id;
    };

    await tx.insert(stockMovements).values([
      {
        tenantId: tenant.id,
        itemId: requiredItemId('PAP-A4'),
        warehouseId: mainWarehouse.id,
        type: 'in',
        quantity: '80',
        reference: 'IN-1405-001',
        note: 'خرید ابتدای دوره',
        createdBy: warehouseId,
      },
      {
        tenantId: tenant.id,
        itemId: requiredItemId('LAP-014'),
        warehouseId: mainWarehouse.id,
        type: 'out',
        quantity: '3',
        reference: 'OUT-1405-014',
        note: 'تحویل به تیم طراحی',
        createdBy: warehouseId,
      },
      {
        tenantId: tenant.id,
        itemId: requiredItemId('RAW-STL'),
        warehouseId: mainWarehouse.id,
        type: 'adjust',
        quantity: '18',
        reference: 'ADJ-1405-003',
        note: 'اصلاح مغایرت شمارش',
        createdBy: warehouseId,
      },
    ]);

    const seededCases = new Map<string, SeededCase>();
    const purchase = caseTypeRefs.get('purchase');
    const payment = caseTypeRefs.get('payment');
    const leave = caseTypeRefs.get('leave');
    const sales = caseTypeRefs.get('sales');
    const stock = caseTypeRefs.get('stock');
    const production = caseTypeRefs.get('production');
    const adminType = caseTypeRefs.get('admin');
    if (!purchase || !payment || !leave || !sales || !stock || !production || !adminType) {
      throw new Error('Seed case types are incomplete');
    }

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      purchase,
      {
        key: 'purchase-review',
        typeKey: 'purchase',
        title: 'خرید دو لپ‌تاپ برای تیم طراحی',
        data: {
          subject: 'خرید دو لپ‌تاپ برای تیم طراحی',
          vendor: partyId('SUP-002'),
          amount: 185_000_000,
          neededBy: '1405-08-20',
          items: '۲ دستگاه لپ‌تاپ ۱۴ اینچ با مشخصات استاندارد تیم طراحی',
          justification: 'تجهیزات فعلی فرسوده شده و سرعت کار تیم طراحی افت کرده است.',
        },
        stageKey: 'review',
        status: 'in_progress',
        createdBy: memberId,
        createdAt: daysAgo(1),
        tasks: [
          {
            stageKey: 'review',
            taskKey: 'procurement_review',
            name: 'بررسی و تکمیل درخواست',
            status: 'pending',
            assigneeRole: 'procurement',
            dueAt: hoursFromNow(18),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      purchase,
      {
        key: 'purchase-approval',
        typeKey: 'purchase',
        title: 'خرید تجهیزات شبکه برای شعبه مرکزی',
        data: {
          subject: 'خرید تجهیزات شبکه برای شعبه مرکزی',
          vendor: partyId('SUP-002'),
          amount: 92_000_000,
          neededBy: '1405-08-12',
          items: '۲ دستگاه سوییچ ۲۴ پورت و لوازم نصب',
          justification: 'توسعه شبکه شعبه مرکزی و نیاز به پورت‌های اضافه.',
        },
        stageKey: 'approval',
        status: 'in_progress',
        priority: 'high',
        createdBy: memberId,
        createdAt: daysAgo(3),
        tasks: [
          {
            stageKey: 'review',
            taskKey: 'procurement_review',
            name: 'بررسی و تکمیل درخواست',
            status: 'completed',
            outcome: 'completed',
            assigneeRole: 'procurement',
            dueAt: daysAgo(2),
            completedAt: daysAgo(2),
            data: { vendor: partyId('SUP-002'), amount: 92_000_000 },
          },
          {
            stageKey: 'approval',
            taskKey: 'manager_approval',
            name: 'تأیید مدیر',
            kind: 'approval',
            status: 'pending',
            assigneeRole: 'manager',
            dueAt: hoursFromNow(6),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      payment,
      {
        key: 'payment-review',
        typeKey: 'payment',
        title: 'پرداخت فاکتور کاغذ A4',
        data: {
          subject: 'پرداخت فاکتور کاغذ A4',
          payee: partyId('SUP-001'),
          invoiceNo: '1405/778',
          amount: 68_000_000,
          dueDate: '1405-08-08',
          bankAccount: 'بانک ملت - ۱۲۳۴۵۶۷۸۹',
          description: 'فاکتور خرید ۲ کارتن کاغذ A4 مطابق سفارش ۴۵۱',
        },
        stageKey: 'review',
        status: 'in_progress',
        createdBy: financeId,
        createdAt: daysAgo(2),
        tasks: [
          {
            stageKey: 'review',
            taskKey: 'finance_review',
            name: 'بررسی فاکتور و مدارک',
            status: 'claimed',
            assigneeRole: 'finance',
            assigneeId: financeId,
            dueAt: hoursFromNow(28),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      leave,
      {
        key: 'leave-approval',
        typeKey: 'leave',
        title: 'مرخصی استحقاقی ۲ روزه',
        data: {
          leaveType: 'annual',
          fromDate: '1405-08-10',
          toDate: '1405-08-11',
          reason: 'سفر خانوادگی',
        },
        stageKey: 'approval',
        status: 'in_progress',
        createdBy: memberId,
        createdAt: daysAgo(1),
        tasks: [
          {
            stageKey: 'approval',
            taskKey: 'leave_approval',
            name: 'تأیید مرخصی',
            kind: 'approval',
            status: 'pending',
            assigneeRole: 'manager',
            dueAt: hoursFromNow(40),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      sales,
      {
        key: 'sales-fulfillment',
        typeKey: 'sales',
        title: 'سفارش ۲۴۰ عدد محصول برای داده‌پرداز نوین',
        data: {
          subject: 'سفارش ۲۴۰ عدد محصول برای داده‌پرداز نوین',
          customer: partyId('CUS-002'),
          amount: 576_000_000,
          deliveryDate: '1405-08-18',
          items: '۲۴۰ عدد محصول نهایی، بسته‌بندی استاندارد',
          notes: 'تحویل در انبار مشتری، هماهنگی با آقای رضایی',
        },
        stageKey: 'fulfillment',
        status: 'in_progress',
        priority: 'high',
        createdBy: memberId,
        createdAt: daysAgo(5),
        tasks: [
          {
            stageKey: 'sales_review',
            taskKey: 'sales_review_task',
            name: 'تکمیل مشخصات سفارش',
            status: 'completed',
            outcome: 'completed',
            assigneeRole: 'member',
            assigneeId: memberId,
            dueAt: daysAgo(4),
            completedAt: daysAgo(4),
            data: { customer: partyId('CUS-002'), amount: 576_000_000 },
          },
          {
            stageKey: 'approval',
            taskKey: 'sales_approval',
            name: 'تأیید سفارش',
            kind: 'approval',
            status: 'completed',
            outcome: 'approved',
            assigneeRole: 'manager',
            dueAt: daysAgo(3),
            completedAt: daysAgo(3),
          },
          {
            stageKey: 'fulfillment',
            taskKey: 'warehouse_fulfillment',
            name: 'آماده‌سازی ارسال',
            status: 'pending',
            assigneeRole: 'warehouse',
            dueAt: hoursFromNow(20),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      stock,
      {
        key: 'stock-approval',
        typeKey: 'stock',
        title: 'مغایرت موجودی ورق فولادی',
        data: {
          item: requiredItemId('RAW-STL'),
          warehouse: mainWarehouse.id,
          quantity: 18,
          reason: 'مغایرت ۱۸ کیلوگرم در شمارش پایان ماه',
        },
        stageKey: 'approval',
        status: 'in_progress',
        createdBy: warehouseId,
        createdAt: daysAgo(2),
        tasks: [
          {
            stageKey: 'warehouse_review',
            taskKey: 'stock_review',
            name: 'بررسی موجودی و دلیل',
            status: 'completed',
            outcome: 'completed',
            assigneeRole: 'warehouse',
            assigneeId: warehouseId,
            dueAt: daysAgo(1),
            completedAt: daysAgo(1),
            data: {
              item: requiredItemId('RAW-STL'),
              warehouse: mainWarehouse.id,
              quantity: 18,
              reason: 'مغایرت ۱۸ کیلوگرم در شمارش پایان ماه',
            },
          },
          {
            stageKey: 'approval',
            taskKey: 'stock_approval',
            name: 'تأیید اصلاح موجودی',
            kind: 'approval',
            status: 'pending',
            assigneeRole: 'manager',
            dueAt: hoursFromNow(12),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      adminType,
      {
        key: 'admin-completed',
        typeKey: 'admin',
        title: 'تحویل تجهیزات اداری به واحد مالی',
        data: {
          requestType: 'equipment',
          subject: 'تحویل تجهیزات اداری به واحد مالی',
          description: 'تحویل دو عدد مانیتور و یک عدد صندلی ارگونومیک به واحد مالی.',
          neededBy: '1405-08-05',
        },
        stageKey: 'fulfillment',
        status: 'completed',
        priority: 'low',
        createdBy: adminId,
        createdAt: daysAgo(7),
        completedAt: daysAgo(2),
        tasks: [
          {
            stageKey: 'approval',
            taskKey: 'admin_approval',
            name: 'تأیید درخواست اداری',
            kind: 'approval',
            status: 'completed',
            outcome: 'approved',
            assigneeRole: 'manager',
            dueAt: daysAgo(5),
            completedAt: daysAgo(5),
          },
          {
            stageKey: 'fulfillment',
            taskKey: 'admin_fulfillment',
            name: 'انجام درخواست',
            status: 'completed',
            outcome: 'completed',
            assigneeRole: 'member',
            dueAt: daysAgo(3),
            completedAt: daysAgo(2),
          },
        ],
      },
      seededCases,
    );

    await insertSeedCase(
      tx,
      tenant.id,
      userIds,
      production,
      {
        key: 'production-onhold',
        typeKey: 'production',
        title: 'دستور تولید محصول نهایی - سفارش ۴۵۱',
        data: {
          product: requiredItemId('PRD-001'),
          quantity: 240,
          dueDate: '1405-08-28',
          notes: 'مشخصات رنگ و بسته‌بندی مطابق نمونه تأییدشده.',
        },
        stageKey: 'planning',
        status: 'on_hold',
        priority: 'high',
        createdBy: memberId,
        createdAt: daysAgo(2),
        tasks: [
          {
            stageKey: 'planning',
            taskKey: 'production_planning',
            name: 'بررسی مواد و ظرفیت',
            status: 'waiting_info',
            assigneeRole: 'procurement',
            dueAt: hoursFromNow(10),
          },
          {
            stageKey: 'planning',
            taskKey: 'info_seed_production',
            name: 'ارائه اطلاعات تکمیلی',
            kind: 'info',
            status: 'pending',
            assigneeId: memberId,
            dueAt: hoursFromNow(24),
          },
        ],
      },
      seededCases,
    );

    const purchaseApproval = seededCases.get('purchase-approval');
    if (purchaseApproval) {
      await tx.insert(caseComments).values([
        {
          tenantId: tenant.id,
          caseId: purchaseApproval.id,
          authorId: procurementId,
          body: 'استعلام قیمت از دو تأمین‌کننده انجام شد؛ پیشنهاد فناوران شبکه از نظر قیمت و زمان تحویل مناسب است.',
          createdAt: daysAgo(2),
        },
        {
          tenantId: tenant.id,
          caseId: purchaseApproval.id,
          authorId: memberId,
          body: 'درخواست افزایش پورت‌ها هم اضافه شده است؛ لطفاً در تأیید لحاظ شود.',
          createdAt: daysAgo(1),
        },
      ]);
    }

    const productionCase = seededCases.get('production-onhold');
    if (productionCase) {
      await tx.insert(caseComments).values({
        tenantId: tenant.id,
        caseId: productionCase.id,
        authorId: procurementId,
        body: 'برای برنامه‌ریزی تولید، ظرفیت هفتگی خط دوم و تاریخ دقیق تأمین ورق فولادی را اعلام کنید.',
        createdAt: hoursFromNow(-20),
      });
    }

    await tx.insert(notifications).values([
      {
        tenantId: tenant.id,
        userId: adminId,
        type: 'case.created',
        title: 'پرونده جدید در صف بررسی',
        body: 'خرید دو لپ‌تاپ برای تیم طراحی ثبت شد.',
        link: seededCases.get('purchase-review')
          ? `/cases/${seededCases.get('purchase-review')!.id}`
          : '/cases',
      },
      {
        tenantId: tenant.id,
        userId: managerId,
        type: 'task.assigned',
        title: 'کار در انتظار تأیید شما',
        body: 'خرید تجهیزات شبکه برای شعبه مرکزی',
        link: '/inbox',
      },
      {
        tenantId: tenant.id,
        userId: memberId,
        type: 'task.info_requested',
        title: 'درخواست اطلاعات تکمیلی',
        body: 'برای دستور تولید سفارش ۴۵۱ اطلاعات تکمیلی لازم است.',
        link: productionCase ? `/tasks/${productionCase.id}` : '/inbox',
      },
    ]);

    console.log(
      `Seeded tenant ${tenant.name} with ${insertedUsers.length} users, ${caseTypeRefs.size} case types, ${seededCases.size} cases.`,
    );
    console.log(`Login: admin@ravand.local / ${DEMO_PASSWORD}`);
  });
}

const invokedDirectly =
  process.argv[1]?.replaceAll('\\', '/').endsWith('/src/db/seed.ts') ||
  process.argv[1]?.replaceAll('\\', '/').endsWith('/dist/db/seed.js');

if (invokedDirectly) {
  seed()
    .then(async () => {
      console.log(
        `Reference year: ${getJalaliYear()} (${formatReference('PR', getJalaliYear(), 1)})`,
      );
      await pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exitCode = 1;
    });
}
