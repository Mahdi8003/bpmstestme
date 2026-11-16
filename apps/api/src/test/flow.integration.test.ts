import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { db, pool } from '../db/client.js';
import { roles, tenants, users } from '../db/schema.js';
import { hashPassword } from '../lib/password.js';
import { builtinRoleSeedValues } from '../modules/roles/service.js';

async function databaseAvailable(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}

const available = await databaseAvailable();

describe.skipIf(!available)('process + base data flow', () => {
  let app: FastifyInstance;
  let cookie = '';
  let tenantId = '';
  const suffix = randomUUID().slice(0, 6);
  const email = `qa-${suffix}@example.test`;
  const password = 'Qa123456!';
  const typeKeys = {
    invoice: `qa_invoice_${suffix}`,
    payment: `qa_payment_${suffix}`,
  };

  let processId = '';
  let caseId = '';
  let invoiceTypeId = '';
  let paymentTypeId = '';
  let invoiceRecordId = '';

  const call = async (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const response = await app.inject({
      method,
      url: `/api${url}`,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    let body: any = undefined;
    if (response.body) {
      try {
        body = JSON.parse(response.body);
      } catch {
        body = response.body;
      }
    }
    return { status: response.statusCode, body };
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const slug = `qa-${suffix}`;
    const [tenant] = await db.insert(tenants).values({ name: `QA ${suffix}`, slug }).returning();
    tenantId = tenant!.id;
    await db.insert(roles).values(builtinRoleSeedValues(tenantId));
    await db.insert(users).values({
      tenantId,
      email,
      passwordHash: await hashPassword(password),
      name: 'QA Admin',
      role: 'admin',
      avatarColor: '#123456',
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
  });

  afterAll(async () => {
    if (tenantId) {
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
    await app?.close();
  });

  it('creates custom data types, records and computes rollups', async () => {
    const invoice = await call('POST', '/master/types', {
      key: typeKeys.invoice,
      name: 'فاکتور QA',
      titleField: 'title',
      fields: [
        { key: 'title', label: 'شماره فاکتور', type: 'text', required: true },
        { key: 'amount', label: 'مبلغ', type: 'currency' },
      ],
    });
    expect(invoice.status).toBe(201);
    invoiceTypeId = invoice.body.id;

    const payment = await call('POST', '/master/types', {
      key: typeKeys.payment,
      name: 'پرداخت QA',
      titleField: 'title',
      fields: [
        { key: 'title', label: 'عنوان', type: 'text', required: true },
        { key: 'invoice', label: 'فاکتور', type: 'master', masterTypeKey: typeKeys.invoice },
        { key: 'amount', label: 'مبلغ', type: 'currency' },
      ],
    });
    expect(payment.status).toBe(201);
    paymentTypeId = payment.body.id;

    const invoiceRecord = await call('POST', `/master/types/${invoiceTypeId}/records`, {
      data: { title: 'INV-QA', amount: 1000 },
    });
    expect(invoiceRecord.status).toBe(201);
    invoiceRecordId = invoiceRecord.body.id;

    for (const [title, amount] of [
      ['PAY-1', 400],
      ['PAY-2', 250],
    ] as const) {
      const created = await call('POST', `/master/types/${payment.body.id}/records`, {
        data: { title, invoice: invoiceRecordId, amount },
      });
      expect(created.status).toBe(201);
    }

    const patched = await call('PATCH', `/master/types/${invoiceTypeId}`, {
      fields: [
        { key: 'title', label: 'شماره فاکتور', type: 'text', required: true },
        { key: 'amount', label: 'مبلغ', type: 'currency' },
        {
          key: 'paid',
          label: 'جمع پرداخت‌ها',
          type: 'rollup',
          readonly: true,
          rollup: {
            sourceTypeKey: typeKeys.payment,
            referenceField: 'invoice',
            valueField: 'amount',
            op: 'sum',
          },
        },
        {
          key: 'payment_count',
          label: 'تعداد پرداخت‌ها',
          type: 'rollup',
          readonly: true,
          rollup: { sourceTypeKey: typeKeys.payment, referenceField: 'invoice', op: 'count' },
        },
      ],
    });
    expect(patched.status).toBe(200);

    const records = await call('GET', `/master/types/${invoiceTypeId}/records`);
    expect(records.status).toBe(200);
    expect(records.body[0].data.paid).toBe(650);
    expect(records.body[0].data.payment_count).toBe(2);
  });

  it('publishes a process that uses base data and runs it to completion', async () => {
    const type = await call('POST', '/case-types', {
      name: `فرآیند QA ${suffix}`,
      icon: 'file',
      definition: {
        fields: [
          { key: 'subject', label: 'موضوع', type: 'text', required: true },
          {
            key: 'invoice',
            label: 'فاکتور',
            type: 'master',
            masterTypeKey: typeKeys.invoice,
          },
        ],
        stages: [
          {
            key: 'review',
            name: 'بررسی',
            tasks: [
              {
                key: 'review_task',
                name: 'بررسی درخواست',
                assignee: { type: 'role', value: 'admin' },
              },
            ],
          },
        ],
        settings: { titleField: 'subject' },
      },
    });
    expect(type.status).toBe(201);
    processId = type.body.id;

    const published = await call('POST', `/case-types/${processId}/publish`);
    expect(published.status).toBe(200);

    const created = await call('POST', '/cases', {
      caseTypeId: processId,
      data: { subject: 'پرونده آزمایشی', invoice: invoiceRecordId },
    });
    expect(created.status).toBe(201);
    caseId = created.body.id;
    expect(created.body.title).toBe('پرونده آزمایشی');
    expect(created.body.tasks).toHaveLength(1);

    const task = created.body.tasks[0];
    const completed = await call('POST', `/tasks/${task.id}/complete`, { data: {} });
    expect(completed.status).toBe(200);

    const detail = await call('GET', `/cases/${caseId}`);
    expect(detail.body.status).toBe('completed');

    const search = await call('GET', `/cases?q=${encodeURIComponent('پرونده آزمایشی')}`);
    expect(search.status).toBe(200);
    expect(search.body.some((row: { id: string }) => row.id === caseId)).toBe(true);
  });

  it('refuses to delete base data that a process or case relies on', async () => {
    const payments = await call('GET', `/master/types/${paymentTypeId}/records`);
    expect(payments.status).toBe(200);
    for (const row of payments.body as { id: string }[]) {
      expect((await call('DELETE', `/master/records/${row.id}`)).status).toBe(204);
    }

    const linkedType = await call('DELETE', `/master/types/${paymentTypeId}`);
    expect(linkedType.status).toBe(409);
    expect(linkedType.body.message).toContain('محاسبه');

    const unlinked = await call('PATCH', `/master/types/${invoiceTypeId}`, {
      fields: [
        { key: 'title', label: 'شماره فاکتور', type: 'text', required: true },
        { key: 'amount', label: 'مبلغ', type: 'currency' },
      ],
    });
    expect(unlinked.status).toBe(200);
    expect((await call('DELETE', `/master/types/${paymentTypeId}`)).status).toBe(204);

    const record = await call('DELETE', `/master/records/${invoiceRecordId}`);
    expect(record.status).toBe(409);
    expect(record.body.message).toContain('پرونده');

    const type = await call('DELETE', `/master/types/${invoiceTypeId}`);
    expect(type.status).toBe(409);
    expect(type.body.message).toContain('فرآیند');
  });

  it('deletes built-in records only when nothing refers to them', async () => {
    const types = await call('GET', '/master/types');
    expect(types.status).toBe(200);
    const typeId = (key: string) =>
      (types.body as { key: string; id: string }[]).find((row) => row.key === key)?.id ?? '';

    const category = await call('POST', `/master/types/${typeId('item_category')}/records`, {
      data: { title: 'دستهٔ QA' },
    });
    expect(category.status).toBe(201);

    const item = await call('POST', `/master/types/${typeId('item')}/records`, {
      data: { sku: `QA-${suffix}`, name: 'کالای QA', category: category.body.id },
    });
    expect(item.status).toBe(201);

    const warehouse = await call('POST', `/master/types/${typeId('warehouse')}/records`, {
      data: { code: `WH-${suffix}`, name: 'انبار QA' },
    });
    expect(warehouse.status).toBe(201);

    const movement = await call('POST', `/master/types/${typeId('movement')}/records`, {
      data: {
        item: item.body.id,
        warehouse: warehouse.body.id,
        type: 'in',
        quantity: 3,
      },
    });
    expect(movement.status).toBe(201);

    const itemPath = `/master/types/${typeId('item')}/records/${item.body.id}`;
    expect((await call('DELETE', itemPath)).status).toBe(409);
    expect(
      (await call('DELETE', `/master/types/${typeId('item_category')}/records/${category.body.id}`))
        .status,
    ).toBe(409);

    expect(
      (await call('DELETE', `/master/types/${typeId('movement')}/records/${movement.body.id}`))
        .status,
    ).toBe(204);
    expect((await call('DELETE', itemPath)).status).toBe(204);
    expect(
      (await call('DELETE', `/master/types/${typeId('item_category')}/records/${category.body.id}`))
        .status,
    ).toBe(204);
  });

  it('refuses a process field that points at a built-in data type as custom data', async () => {
    const type = await call('POST', '/case-types', {
      name: `فرآیند نامعتبر ${suffix}`,
      icon: 'file',
      definition: {
        fields: [
          { key: 'subject', label: 'موضوع', type: 'text', required: true },
          { key: 'partner', label: 'طرف حساب', type: 'master', masterTypeKey: 'party' },
        ],
        stages: [
          {
            key: 'review',
            name: 'بررسی',
            tasks: [
              {
                key: 'review_task_bad',
                name: 'بررسی',
                assignee: { type: 'role', value: 'admin' },
              },
            ],
          },
        ],
      },
    });
    expect(type.status).toBe(400);
  });

  it('completes an info request without locking the case', async () => {
    const type = await call('POST', '/case-types', {
      name: `فرآیند اطلاعات ${suffix}`,
      icon: 'file',
      definition: {
        fields: [{ key: 'subject', label: 'موضوع', type: 'text', required: true }],
        stages: [
          {
            key: 'approval',
            name: 'تأیید',
            fields: [
              { key: 'note', label: 'توضیح تکمیلی', type: 'textarea', required: true },
            ],
            tasks: [
              {
                key: 'approval_task',
                name: 'تأیید درخواست',
                kind: 'approval',
                assignee: { type: 'role', value: 'admin' },
              },
            ],
          },
        ],
      },
    });
    expect(type.status).toBe(201);
    expect((await call('POST', `/case-types/${type.body.id}/publish`)).status).toBe(200);

    const created = await call('POST', '/cases', {
      caseTypeId: type.body.id,
      data: { subject: 'نیاز به اطلاعات' },
    });
    expect(created.status).toBe(201);
    const approvalTaskId = created.body.tasks[0].id;

    const requested = await call('POST', `/tasks/${approvalTaskId}/decision`, {
      decision: 'request_info',
      comment: 'لطفاً توضیح تکمیلی را وارد کنید.',
    });
    expect(requested.status).toBe(200);

    const withInfo = await call('GET', `/cases/${created.body.id}`);
    const infoTask = withInfo.body.tasks.find(
      (task: { kind: string; status: string }) => task.kind === 'info',
    );
    expect(infoTask).toBeTruthy();

    const infoCompleted = await call('POST', `/tasks/${infoTask.id}/complete`, {
      data: { note: 'توضیح تکمیلی ثبت شد.' },
    });
    expect(infoCompleted.status).toBe(200);

    const approved = await call('POST', `/tasks/${approvalTaskId}/decision`, {
      decision: 'approve',
    });
    expect(approved.status).toBe(200);

    const detail = await call('GET', `/cases/${created.body.id}`);
    expect(detail.body.status).toBe('completed');
  });
});
