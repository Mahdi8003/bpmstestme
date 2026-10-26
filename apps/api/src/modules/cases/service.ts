import { and, asc, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  validateCaseData,
  type CaseDetail,
  type CaseListItem,
  type CaseTypeDefinition,
  type CommentDto,
  type DocumentDto,
  type EventDto,
  type FieldDef,
  type TaskDto,
} from '@ravand/shared';
import { db } from '../../db/client.js';
import {
  caseComments,
  caseDocuments,
  caseEvents,
  caseTasks,
  caseTypes,
  caseTypeVersions,
  cases,
  items,
  parties,
  users,
  warehouses,
} from '../../db/schema.js';
import { addCaseEvent, writeAudit } from '../../lib/audit.js';
import { createReference } from '../../lib/numbering.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';
import { validateReferenceFields } from '../../lib/domain-validation.js';
import { notifyUsers } from '../../lib/notifications.js';
import type { AuthContext } from '../../lib/auth.js';
import { getCaseType, publishedTypeForCase } from '../case-types/service.js';
import { taskDto } from './dto.js';
import {
  advanceIfReady,
  createTasksForStage,
  stageOf,
  syncCaseDue,
  type CaseRow,
} from './workflow.js';

const creatorUser = alias(users, 'creator_user');
const assigneeUser = alias(users, 'assignee_user');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTitleFromField(
  field: FieldDef | undefined,
  value: unknown,
  tenantId: string,
): Promise<string> {
  if (!field || value === undefined || value === null || value === '') return '';
  if (field.type === 'select' || field.type === 'radio') {
    return field.options?.find((option) => option.value === String(value))?.label ?? String(value);
  }
  if (field.type === 'multiselect' && Array.isArray(value)) {
    return value
      .map(
        (item) =>
          field.options?.find((option) => option.value === String(item))?.label ?? String(item),
      )
      .join('، ');
  }
  if (field.type === 'checkbox') return value ? 'بله' : 'خیر';
  if (field.type === 'user') {
    const id = typeof value === 'string' ? value : '';
    if (!UUID_PATTERN.test(id)) return String(value);
    const row = (
      await db
        .select({ name: users.name })
        .from(users)
        .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
        .limit(1)
    )[0];
    return row?.name ?? String(value);
  }
  if (field.type === 'party' || field.type === 'item' || field.type === 'warehouse') {
    const id = typeof value === 'string' ? value : '';
    if (!UUID_PATTERN.test(id)) return String(value);
    if (field.type === 'party') {
      const row = (
        await db
          .select({ name: parties.name })
          .from(parties)
          .where(and(eq(parties.id, id), eq(parties.tenantId, tenantId)))
          .limit(1)
      )[0];
      return row?.name ?? String(value);
    }
    if (field.type === 'item') {
      const row = (
        await db
          .select({ name: items.name, sku: items.sku })
          .from(items)
          .where(and(eq(items.id, id), eq(items.tenantId, tenantId)))
          .limit(1)
      )[0];
      return row ? `${row.name} (${row.sku})` : String(value);
    }
    const row = (
      await db
        .select({ name: warehouses.name })
        .from(warehouses)
        .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, tenantId)))
        .limit(1)
    )[0];
    return row?.name ?? String(value);
  }
  if (typeof value === 'number') return value.toLocaleString('fa-IR');
  return String(value).trim();
}

function listItem(row: {
  id: string;
  reference: string;
  title: string;
  status: CaseRow['status'];
  stageKey: string;
  stageName: string;
  caseTypeId: string;
  caseTypeName: string;
  caseTypeIcon: string;
  priority: CaseRow['priority'];
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  assigneeName: string | null;
}): CaseListItem {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status,
    stageKey: row.stageKey,
    stageName: row.stageName,
    caseTypeId: row.caseTypeId,
    caseTypeName: row.caseTypeName,
    caseTypeIcon: row.caseTypeIcon,
    priority: row.priority,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByName: row.createdByName,
    assigneeName: row.assigneeName,
  };
}

export async function listCases(
  auth: AuthContext,
  query: { status?: CaseRow['status']; type?: string; q?: string; limit: number },
): Promise<CaseListItem[]> {
  const conditions = [eq(cases.tenantId, auth.tenantId)];
  if (query.status) conditions.push(eq(cases.status, query.status));
  if (query.type) conditions.push(eq(cases.caseTypeId, query.type));
  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    const search = or(ilike(cases.reference, term), ilike(cases.title, term));
    if (search) conditions.push(search);
  }

  const rows = await db
    .select({
      id: cases.id,
      reference: cases.reference,
      title: cases.title,
      status: cases.status,
      stageKey: cases.stageKey,
      stageName: cases.stageName,
      caseTypeId: cases.caseTypeId,
      caseTypeName: caseTypes.name,
      caseTypeIcon: caseTypes.icon,
      priority: cases.priority,
      dueAt: cases.dueAt,
      createdAt: cases.createdAt,
      updatedAt: cases.updatedAt,
      createdByName: creatorUser.name,
      assigneeName: assigneeUser.name,
    })
    .from(cases)
    .innerJoin(caseTypes, eq(caseTypes.id, cases.caseTypeId))
    .leftJoin(creatorUser, eq(creatorUser.id, cases.createdBy))
    .leftJoin(assigneeUser, eq(assigneeUser.id, cases.assigneeId))
    .where(and(...conditions))
    .orderBy(desc(cases.updatedAt))
    .limit(query.limit);

  return rows.map(listItem);
}

export async function getCaseRow(
  auth: AuthContext,
  id: string,
): Promise<CaseRow> {
  const rows = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, id), eq(cases.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('پرونده پیدا نشد.');
  return row;
}

async function definitionForCase(caseRow: CaseRow): Promise<CaseTypeDefinition> {
  const definition = (
    await db
      .select({ definition: caseTypeVersions.definition })
      .from(caseTypeVersions)
      .where(eq(caseTypeVersions.id, caseRow.versionId))
      .limit(1)
  )[0]?.definition;
  if (!definition) throw badRequest('نسخه فرآیند پیدا نشد.');
  return definition;
}

async function hasActiveTaskOnCase(auth: AuthContext, caseId: string): Promise<boolean> {
  const rows = await db
    .select({ id: caseTasks.id })
    .from(caseTasks)
    .where(
      and(
        eq(caseTasks.caseId, caseId),
        eq(caseTasks.assigneeId, auth.userId),
        inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

function canEditAtStage(
  auth: AuthContext,
  caseRow: CaseRow,
  definition: CaseTypeDefinition,
  hasActiveTask: boolean,
): boolean {
  if (!['in_progress', 'on_hold'].includes(caseRow.status)) return false;
  if (auth.user.role === 'admin' || caseRow.createdBy === auth.userId || hasActiveTask) {
    return true;
  }
  const stage = stageOf(definition, caseRow.stageKey);
  return Boolean(stage?.permissions?.editRoles?.includes(auth.user.role));
}

function canUploadAtStage(
  auth: AuthContext,
  caseRow: CaseRow,
  definition: CaseTypeDefinition,
  hasActiveTask: boolean,
): boolean {
  if (canEditAtStage(auth, caseRow, definition, hasActiveTask)) return true;
  if (!['in_progress', 'on_hold'].includes(caseRow.status)) return false;
  const stage = stageOf(definition, caseRow.stageKey);
  return Boolean(stage?.permissions?.uploadRoles?.includes(auth.user.role));
}

export async function getCaseDetail(
  auth: AuthContext,
  id: string,
): Promise<CaseDetail> {
  const rows = await db
    .select({
      caseRow: cases,
      caseTypeName: caseTypes.name,
      caseTypeIcon: caseTypes.icon,
      createdByName: creatorUser.name,
      assigneeName: assigneeUser.name,
      version: caseTypeVersions.version,
      definition: caseTypeVersions.definition,
    })
    .from(cases)
    .innerJoin(caseTypes, eq(caseTypes.id, cases.caseTypeId))
    .innerJoin(caseTypeVersions, eq(caseTypeVersions.id, cases.versionId))
    .leftJoin(creatorUser, eq(creatorUser.id, cases.createdBy))
    .leftJoin(assigneeUser, eq(assigneeUser.id, cases.assigneeId))
    .where(and(eq(cases.id, id), eq(cases.tenantId, auth.tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw notFound('پرونده پیدا نشد.');
  const caseRow = row.caseRow;

  const taskRows = await db
    .select({ task: caseTasks, assigneeName: assigneeUser.name })
    .from(caseTasks)
    .leftJoin(assigneeUser, eq(assigneeUser.id, caseTasks.assigneeId))
    .where(eq(caseTasks.caseId, caseRow.id))
    .orderBy(asc(caseTasks.createdAt));

  const comments = await db
    .select({ comment: caseComments, authorName: creatorUser.name })
    .from(caseComments)
    .leftJoin(creatorUser, eq(creatorUser.id, caseComments.authorId))
    .where(eq(caseComments.caseId, caseRow.id))
    .orderBy(asc(caseComments.createdAt));

  const documents = await db
    .select({ document: caseDocuments, uploaderName: creatorUser.name })
    .from(caseDocuments)
    .leftJoin(creatorUser, eq(creatorUser.id, caseDocuments.uploadedBy))
    .where(eq(caseDocuments.caseId, caseRow.id))
    .orderBy(desc(caseDocuments.createdAt));

  const events = await db
    .select({ event: caseEvents, actorName: creatorUser.name })
    .from(caseEvents)
    .leftJoin(creatorUser, eq(creatorUser.id, caseEvents.actorId))
    .where(eq(caseEvents.caseId, caseRow.id))
    .orderBy(asc(caseEvents.createdAt));

  const hasActiveTask = taskRows.some(
    ({ task }) =>
      task.assigneeId === auth.userId &&
      ['pending', 'claimed', 'waiting_info'].includes(task.status),
  );
  const canEdit = canEditAtStage(auth, caseRow, row.definition, hasActiveTask);
  const canUpload = canUploadAtStage(auth, caseRow, row.definition, hasActiveTask);

  const base = listItem({
    id: caseRow.id,
    reference: caseRow.reference,
    title: caseRow.title,
    status: caseRow.status,
    stageKey: caseRow.stageKey,
    stageName: caseRow.stageName,
    caseTypeId: caseRow.caseTypeId,
    caseTypeName: row.caseTypeName,
    caseTypeIcon: row.caseTypeIcon,
    priority: caseRow.priority,
    dueAt: caseRow.dueAt,
    createdAt: caseRow.createdAt,
    updatedAt: caseRow.updatedAt,
    createdByName: row.createdByName,
    assigneeName: row.assigneeName,
  });

  return {
    ...base,
    data: caseRow.data,
    createdBy: caseRow.createdBy,
    completedAt: caseRow.completedAt?.toISOString() ?? null,
    version: row.version,
    definition: row.definition,
    tasks: taskRows.map(({ task, assigneeName }) =>
      taskDto(
        task,
        caseRow,
        row.definition,
        row.caseTypeName,
        row.caseTypeIcon,
        assigneeName,
        auth,
      ),
    ),
    comments: comments.map(
      ({ comment, authorName }): CommentDto => ({
        id: comment.id,
        body: comment.body,
        authorId: comment.authorId,
        authorName: authorName ?? 'کاربر',
        createdAt: comment.createdAt.toISOString(),
      }),
    ),
    documents: documents.map(
      ({ document, uploaderName }): DocumentDto => ({
        id: document.id,
        name: document.name,
        documentKey: document.documentKey,
        mimeType: document.mimeType,
        size: document.size,
        uploadedByName: uploaderName,
        createdAt: document.createdAt.toISOString(),
      }),
    ),
    events: events.map(
      ({ event, actorName }): EventDto => ({
        id: event.id,
        type: event.type,
        actorName,
        data: event.data,
        createdAt: event.createdAt.toISOString(),
      }),
    ),
    canEdit,
    canUpload,
    canCancel:
      (auth.user.role === 'admin' || caseRow.createdBy === auth.userId) &&
      !['completed', 'cancelled', 'rejected'].includes(caseRow.status),
  };
}

export async function createCase(
  auth: AuthContext,
  input: { caseTypeId: string; title?: string; data: Record<string, unknown> },
): Promise<CaseDetail> {
  const { caseType, version } = await publishedTypeForCase(auth, input.caseTypeId);
  const definition = version.definition;
  const issues = validateCaseData(definition.fields, input.data);
  issues.push(...(await validateReferenceFields(db, auth.tenantId, definition.fields, input.data)));
  if (issues.length) {
    throw badRequest('اطلاعات پرونده کامل یا معتبر نیست.', issues);
  }
  const firstStage = definition.stages[0];
  if (!firstStage) throw badRequest('فرآیند مرحله‌ای ندارد.');

  const titleField = definition.settings?.titleField;
  const titleFieldDef = titleField
    ? definition.fields.find((field) => field.key === titleField)
    : undefined;
  const titleFromData = await resolveTitleFromField(
    titleFieldDef,
    titleField ? input.data[titleField] : undefined,
    auth.tenantId,
  );
  const title = input.title?.trim() || titleFromData || caseType.name;

  const caseId = await db.transaction(async (tx) => {
    const reference = await createReference(tx, auth.tenantId, caseType.referencePrefix);
    const [created] = await tx
      .insert(cases)
      .values({
        tenantId: auth.tenantId,
        caseTypeId: caseType.id,
        versionId: version.id,
        reference,
        title,
        status: 'in_progress',
        stageKey: firstStage.key,
        stageName: firstStage.name,
        priority: definition.settings?.priority ?? 'normal',
        data: input.data,
        createdBy: auth.userId,
      })
      .returning();
    if (!created) throw new AppError(500, 'ایجاد پرونده ناموفق بود.');

    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId: created.id,
      type: 'case.created',
      actorId: auth.userId,
      data: { reference, caseTypeName: caseType.name },
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'case.created',
      entityType: 'case',
      entityId: created.id,
      after: { reference, title, caseTypeId: caseType.id },
    });

    const tasks = await createTasksForStage(tx, {
      tenantId: auth.tenantId,
      caseRow: created,
      definition,
      stage: firstStage,
      actorId: auth.userId,
    });
    if (!tasks.length) {
      await advanceIfReady(tx, {
        tenantId: auth.tenantId,
        caseId: created.id,
        actorId: auth.userId,
        definition,
      });
    } else {
      await syncCaseDue(tx, auth.tenantId, created.id);
    }
    return created.id;
  });

  return getCaseDetail(auth, caseId);
}

export async function updateCaseData(
  auth: AuthContext,
  id: string,
  input: { title?: string; data: Record<string, unknown> },
): Promise<CaseDetail> {
  const caseRow = await getCaseRow(auth, id);
  if (!['in_progress', 'on_hold'].includes(caseRow.status)) {
    throw badRequest('این پرونده در وضعیت قابل ویرایش نیست.');
  }
  const definition = await definitionForCase(caseRow);
  const hasActiveTask = await hasActiveTaskOnCase(auth, caseRow.id);
  if (!canEditAtStage(auth, caseRow, definition, hasActiveTask)) {
    throw forbidden('شما در مرحلهٔ فعلی اجازهٔ ویرایش این پرونده را ندارید.');
  }

  const issues = validateCaseData(definition.fields, input.data);
  issues.push(
    ...(await validateReferenceFields(db, auth.tenantId, definition.fields, input.data)),
  );
  if (issues.length) throw badRequest('اطلاعات پرونده کامل یا معتبر نیست.', issues);

  const titleField = definition.settings?.titleField;
  const titleFieldDef = titleField
    ? definition.fields.find((field) => field.key === titleField)
    : undefined;
  const titleFromData = await resolveTitleFromField(
    titleFieldDef,
    titleField ? input.data[titleField] : undefined,
    auth.tenantId,
  );
  const title = input.title?.trim() || titleFromData || caseRow.title;

  await db.transaction(async (tx) => {
    await tx
      .update(cases)
      .set({ title, data: input.data, updatedAt: new Date() })
      .where(and(eq(cases.id, id), eq(cases.tenantId, auth.tenantId)));
    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId: id,
      type: 'case.updated',
      actorId: auth.userId,
      data: { title },
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'case.updated',
      entityType: 'case',
      entityId: id,
      before: { title: caseRow.title, data: caseRow.data },
      after: { title, data: input.data },
    });
  });
  return getCaseDetail(auth, id);
}

export async function addComment(
  auth: AuthContext,
  caseId: string,
  body: string,
  taskId?: string | null,
): Promise<CommentDto> {
  const caseRow = await getCaseRow(auth, caseId);
  if (taskId) {
    const taskRows = await db
      .select({ id: caseTasks.id })
      .from(caseTasks)
      .where(and(eq(caseTasks.id, taskId), eq(caseTasks.caseId, caseRow.id)))
      .limit(1);
    if (!taskRows[0]) throw badRequest('کار موردنظر به این پرونده تعلق ندارد.');
  }
  const [comment] = await db
    .insert(caseComments)
    .values({
      tenantId: auth.tenantId,
      caseId,
      taskId: taskId ?? null,
      authorId: auth.userId,
      body,
    })
    .returning();
  if (!comment) throw new AppError(500, 'ثبت یادداشت ناموفق بود.');

  await addCaseEvent(db, {
    tenantId: auth.tenantId,
    caseId,
    type: 'comment.added',
    actorId: auth.userId,
    data: { commentId: comment.id, preview: body.slice(0, 120) },
  });
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'case.comment_added',
    entityType: 'case',
    entityId: caseId,
    after: { commentId: comment.id },
  });

  const activeTasks = await db
    .select({ assigneeId: caseTasks.assigneeId })
    .from(caseTasks)
    .where(
      and(
        eq(caseTasks.caseId, caseId),
        inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
      ),
    );
  const recipients = [
    caseRow.createdBy,
    ...activeTasks.map((task) => task.assigneeId).filter((value): value is string => !!value),
  ].filter((userId) => userId !== auth.userId);
  await notifyUsers(db, {
    tenantId: auth.tenantId,
    userIds: recipients,
    type: 'case.comment',
    title: `یادداشت جدید روی ${caseRow.reference}`,
    body: body.slice(0, 160),
    link: `/cases/${caseId}`,
  });

  return {
    id: comment.id,
    body: comment.body,
    authorId: comment.authorId,
    authorName: auth.user.name,
    createdAt: comment.createdAt.toISOString(),
  };
}

export async function addDocument(
  auth: AuthContext,
  caseId: string,
  input: {
    name: string;
    documentKey?: string | null;
    mimeType: string;
    size: number;
    storagePath: string;
    taskId?: string | null;
  },
): Promise<DocumentDto> {
  const caseRow = await getCaseRow(auth, caseId);
  const definition = await definitionForCase(caseRow);
  const hasActiveTask = await hasActiveTaskOnCase(auth, caseRow.id);
  if (!canUploadAtStage(auth, caseRow, definition, hasActiveTask)) {
    throw forbidden('در مرحلهٔ فعلی اجازهٔ بارگذاری مدرک ندارید.');
  }
  const [document] = await db
    .insert(caseDocuments)
    .values({
      tenantId: auth.tenantId,
      caseId,
      taskId: input.taskId ?? null,
      name: input.name,
      documentKey: input.documentKey ?? null,
      mimeType: input.mimeType,
      size: input.size,
      storagePath: input.storagePath,
      uploadedBy: auth.userId,
    })
    .returning();
  if (!document) throw new AppError(500, 'ثبت مدرک ناموفق بود.');
  await addCaseEvent(db, {
    tenantId: auth.tenantId,
    caseId,
    type: 'document.uploaded',
    actorId: auth.userId,
    data: { documentId: document.id, name: document.name, documentKey: document.documentKey },
  });
  await writeAudit(db, {
    tenantId: auth.tenantId,
    actorId: auth.userId,
    action: 'case.document_uploaded',
    entityType: 'case',
    entityId: caseId,
    after: { documentId: document.id, name: document.name },
  });
  return {
    id: document.id,
    name: document.name,
    documentKey: document.documentKey,
    mimeType: document.mimeType,
    size: document.size,
    uploadedByName: auth.user.name,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function getDocumentForDownload(auth: AuthContext, documentId: string) {
  const rows = await db
    .select()
    .from(caseDocuments)
    .where(
      and(
        eq(caseDocuments.id, documentId),
        eq(caseDocuments.tenantId, auth.tenantId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('مدرک پیدا نشد.');
  return row;
}

export async function cancelCase(
  auth: AuthContext,
  caseId: string,
  reason?: string,
): Promise<CaseDetail> {
  const caseRow = await getCaseRow(auth, caseId);
  if (auth.user.role !== 'admin' && caseRow.createdBy !== auth.userId) {
    throw forbidden('فقط ثبت‌کننده یا مدیر سیستم می‌تواند پرونده را لغو کند.');
  }
  if (['completed', 'cancelled', 'rejected'].includes(caseRow.status)) {
    throw badRequest('این پرونده قابل لغو نیست.');
  }
  await db.transaction(async (tx) => {
    await tx
      .update(cases)
      .set({ status: 'cancelled', dueAt: null, updatedAt: new Date() })
      .where(eq(cases.id, caseId));
    await tx
      .update(caseTasks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(caseTasks.caseId, caseId),
          inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
        ),
      );
    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId,
      type: 'case.cancelled',
      actorId: auth.userId,
      data: { reason: reason ?? null },
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'case.cancelled',
      entityType: 'case',
      entityId: caseId,
      after: { reason: reason ?? null },
    });
    if (reason?.trim()) {
      await tx.insert(caseComments).values({
        tenantId: auth.tenantId,
        caseId,
        authorId: auth.userId,
        body: `دلیل لغو: ${reason.trim()}`,
      });
    }
  });
  await notifyUsers(db, {
    tenantId: auth.tenantId,
    userIds: [caseRow.createdBy],
    type: 'case.cancelled',
    title: `پرونده لغو شد: ${caseRow.title}`,
    body: reason ?? caseRow.reference,
    link: `/cases/${caseId}`,
  });
  return getCaseDetail(auth, caseId);
}

export async function getCaseTypeForCase(auth: AuthContext, caseRow: CaseRow) {
  return getCaseType(auth, caseRow.caseTypeId);
}

export async function activeTasksForUser(
  auth: AuthContext,
  limit = 50,
): Promise<TaskDto[]> {
  const rows = await db
    .select({
      task: caseTasks,
      caseRow: cases,
      caseTypeName: caseTypes.name,
      caseTypeIcon: caseTypes.icon,
      assigneeName: assigneeUser.name,
      definition: caseTypeVersions.definition,
    })
    .from(caseTasks)
    .innerJoin(cases, eq(cases.id, caseTasks.caseId))
    .innerJoin(caseTypes, eq(caseTypes.id, cases.caseTypeId))
    .innerJoin(caseTypeVersions, eq(caseTypeVersions.id, cases.versionId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, caseTasks.assigneeId))
    .where(
      and(
        eq(caseTasks.tenantId, auth.tenantId),
        inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
        or(
          eq(caseTasks.assigneeId, auth.userId),
          and(isNull(caseTasks.assigneeId), eq(caseTasks.candidateRole, auth.user.role)),
        ),
      ),
    )
    .orderBy(asc(caseTasks.dueAt))
    .limit(limit);

  return rows.map((row) =>
    taskDto(
      row.task,
      row.caseRow,
      row.definition,
      row.caseTypeName,
      row.caseTypeIcon,
      row.assigneeName,
      auth,
    ),
  );
}
