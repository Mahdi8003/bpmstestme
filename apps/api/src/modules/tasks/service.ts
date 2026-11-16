import { and, asc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  allDefinitionFields,
  fieldsForStage,
  nextWorkingHours,
  validateCaseData,
  type CaseTypeDefinition,
  type FieldDef,
  type TaskDef,
  type TaskDetailDto,
  type TaskDto,
} from '@ravand/shared';
import { db } from '../../db/client.js';
import {
  caseComments,
  caseDocuments,
  caseTasks,
  caseTypes,
  caseTypeVersions,
  cases,
  users,
} from '../../db/schema.js';
import { addCaseEvent, writeAudit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { validateReferenceFields } from '../../lib/domain-validation.js';
import { notifyUsers } from '../../lib/notifications.js';
import { hasPermission, type AuthContext } from '../../lib/auth.js';
import { taskDto } from '../cases/dto.js';
import {
  getCaseDetail,
  resolveTitleFromField,
} from '../cases/service.js';
import { caseVisibilityFilter } from '../../lib/visibility.js';
import type { CaseRow, TaskRow } from '../cases/workflow.js';
import {
  activateWaitingInfoTasks,
  advanceIfReady,
  createTasksForStage,
  notificationEnabled,
  previousStageOf,
  requiredDocumentsForTask,
  syncCaseDue,
  taskDefOf,
} from '../cases/workflow.js';

const assigneeUser = alias(users, 'task_assignee_user');

interface TaskContext {
  task: TaskRow;
  caseRow: CaseRow;
  definition: CaseTypeDefinition;
  caseTypeName: string;
  caseTypeIcon: string;
  assigneeName: string | null;
  version: number;
}

async function loadTaskContext(auth: AuthContext, taskId: string): Promise<TaskContext> {
  const rows = await db
    .select({
      task: caseTasks,
      caseRow: cases,
      definition: caseTypeVersions.definition,
      version: caseTypeVersions.version,
      caseTypeName: caseTypes.name,
      caseTypeIcon: caseTypes.icon,
      assigneeName: assigneeUser.name,
    })
    .from(caseTasks)
    .innerJoin(cases, eq(cases.id, caseTasks.caseId))
    .innerJoin(caseTypeVersions, eq(caseTypeVersions.id, cases.versionId))
    .innerJoin(caseTypes, eq(caseTypes.id, cases.caseTypeId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, caseTasks.assigneeId))
    .where(and(eq(caseTasks.id, taskId), eq(caseTasks.tenantId, auth.tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('کار پیدا نشد.');
  return row;
}

function canAct(auth: AuthContext, task: TaskRow): boolean {
  if (auth.user.role === 'admin') return true;
  if (task.assigneeId === auth.userId) return true;
  return !task.assigneeId && task.candidateRole === auth.user.role;
}

function dtoOf(context: TaskContext, auth: AuthContext): TaskDto {
  return taskDto(
    context.task,
    context.caseRow,
    context.definition,
    context.caseTypeName,
    context.caseTypeIcon,
    context.assigneeName,
    auth,
  );
}

export async function listTasks(
  auth: AuthContext,
  query: {
    scope: 'mine' | 'available' | 'all' | 'completed';
    q?: string;
    limit: number;
    offset?: number;
  },
): Promise<TaskDto[]> {
  const conditions = [eq(caseTasks.tenantId, auth.tenantId)];
  if (query.scope === 'mine') {
    conditions.push(
      eq(caseTasks.assigneeId, auth.userId),
      inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
    );
  } else if (query.scope === 'available') {
    conditions.push(
      isNull(caseTasks.assigneeId),
      eq(caseTasks.candidateRole, auth.user.role),
      eq(caseTasks.status, 'pending'),
    );
  } else if (query.scope === 'completed') {
    conditions.push(
      eq(caseTasks.assigneeId, auth.userId),
      inArray(caseTasks.status, ['completed', 'cancelled']),
    );
  } else {
    conditions.push(inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']));
    const visibility = caseVisibilityFilter(auth);
    if (visibility) conditions.push(visibility);
  }

  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    const search = or(
      ilike(caseTasks.name, term),
      ilike(cases.reference, term),
      ilike(cases.title, term),
    );
    if (search) conditions.push(search);
  }

  const rows = await db
    .select({
      task: caseTasks,
      caseRow: cases,
      caseTypeName: caseTypes.name,
      caseTypeIcon: caseTypes.icon,
      definition: caseTypeVersions.definition,
      assigneeName: assigneeUser.name,
    })
    .from(caseTasks)
    .innerJoin(cases, eq(cases.id, caseTasks.caseId))
    .innerJoin(caseTypes, eq(caseTypes.id, cases.caseTypeId))
    .innerJoin(caseTypeVersions, eq(caseTypeVersions.id, cases.versionId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, caseTasks.assigneeId))
    .where(and(...conditions))
    .orderBy(asc(caseTasks.dueAt), asc(caseTasks.createdAt))
    .limit(query.limit)
    .offset(query.offset ?? 0);

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

export async function getTaskDetail(
  auth: AuthContext,
  taskId: string,
): Promise<TaskDetailDto> {
  const context = await loadTaskContext(auth, taskId);
  const caseDetail = await getCaseDetail(auth, context.caseRow.id);
  return { task: dtoOf(context, auth), case: caseDetail };
}

export async function claimTask(auth: AuthContext, taskId: string): Promise<TaskDetailDto> {
  const context = await loadTaskContext(auth, taskId);
  if (!canAct(auth, context.task) || context.task.assigneeId) {
    throw badRequest('این کار قابل تصاحب نیست.');
  }
  const conditions = [
    eq(caseTasks.id, taskId),
    eq(caseTasks.tenantId, auth.tenantId),
    eq(caseTasks.status, 'pending'),
    isNull(caseTasks.assigneeId),
  ];
  if (auth.user.role !== 'admin') {
    conditions.push(eq(caseTasks.candidateRole, auth.user.role));
  }
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(caseTasks)
      .set({
        assigneeId: auth.userId,
        status: 'claimed',
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning({ id: caseTasks.id });
    if (!claimed) throw badRequest('این کار هم‌اکنون توسط کاربر دیگری تصاحب شد.');
    await tx
      .update(cases)
      .set({ updatedAt: new Date() })
      .where(and(eq(cases.id, context.caseRow.id), eq(cases.tenantId, auth.tenantId)));
    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId: context.caseRow.id,
      type: 'task.claimed',
      actorId: auth.userId,
      data: { taskId, name: context.task.name },
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'task.claimed',
      entityType: 'task',
      entityId: taskId,
    });
  });
  return getTaskDetail(auth, taskId);
}

export async function releaseTask(auth: AuthContext, taskId: string): Promise<TaskDetailDto> {
  const context = await loadTaskContext(auth, taskId);
  if (context.task.assigneeId !== auth.userId && auth.user.role !== 'admin') {
    throw forbidden();
  }
  // Releasing a directly-assigned task must not orphan it: if the task had no
  // candidate role, hand it back to the previous assignee's role so it shows up
  // in that team's "available" queue instead of disappearing for everyone.
  let candidateRole = context.task.candidateRole;
  if (!candidateRole && context.task.assigneeId) {
    const previous = await db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, context.task.assigneeId), eq(users.tenantId, auth.tenantId)))
      .limit(1);
    candidateRole = previous[0]?.role ?? null;
  }
  const conditions = [
    eq(caseTasks.id, taskId),
    eq(caseTasks.tenantId, auth.tenantId),
    eq(caseTasks.status, 'claimed'),
  ];
  if (auth.user.role !== 'admin') {
    conditions.push(eq(caseTasks.assigneeId, auth.userId));
  }
  await db.transaction(async (tx) => {
    const [released] = await tx
      .update(caseTasks)
      .set({
        assigneeId: null,
        candidateRole,
        status: 'pending',
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning({ id: caseTasks.id });
    if (!released) throw badRequest('این کار در وضعیت قابل آزادسازی نیست.');
    await tx
      .update(cases)
      .set({ updatedAt: new Date() })
      .where(and(eq(cases.id, context.caseRow.id), eq(cases.tenantId, auth.tenantId)));
    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId: context.caseRow.id,
      type: 'task.released',
      actorId: auth.userId,
      data: { taskId, name: context.task.name },
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'task.released',
      entityType: 'task',
      entityId: taskId,
      before: { assigneeId: context.task.assigneeId },
      after: { assigneeId: null },
    });
  });
  return getTaskDetail(auth, taskId);
}

async function checkRequiredDocuments(
  auth: AuthContext,
  context: TaskContext,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  const taskDef = taskDefOf(context.definition, context.task.stageKey, context.task.taskKey);
  const required = await requiredDocumentsForTask(
    context.definition,
    context.task.stageKey,
    taskDef,
  );
  if (!required.length) return;
  const keys = required.map((document) => document.key);
  const rows = await tx
    .select({ documentKey: caseDocuments.documentKey })
    .from(caseDocuments)
    .where(
      and(
        eq(caseDocuments.caseId, context.caseRow.id),
        inArray(caseDocuments.documentKey, keys),
      ),
    );
  const uploaded = new Set(rows.map((row) => row.documentKey).filter(Boolean));
  const missing = required.filter((document) => !uploaded.has(document.key));
  if (missing.length) {
    throw badRequest(
      'پیش از تکمیل این مرحله مدارک الزامی را بارگذاری کنید.',
      missing.map((document) => ({ key: document.key, name: document.name })),
    );
  }
}

function pickSubmittedData(
  fields: FieldDef[],
  formFields: string[] | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = formFields && formFields.length ? new Set(formFields) : null;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.readonly || field.hidden) continue;
    if (allowed && !allowed.has(field.key)) continue;
    if (Object.prototype.hasOwnProperty.call(input, field.key)) {
      out[field.key] = input[field.key];
    }
  }
  return out;
}

function applySelection(input: {
  definition: CaseTypeDefinition;
  taskDef: TaskDef | undefined;
  taskData: Record<string, unknown>;
  mergedData: Record<string, unknown>;
  selectionRowKey: string | undefined;
}): {
  taskData: Record<string, unknown>;
  mergedData: Record<string, unknown>;
  labelField?: FieldDef;
  labelValue?: unknown;
} {
  const selection = input.taskDef?.selection;
  if (!selection) {
    throw badRequest('پیکربندی کار انتخاب کامل نیست.');
  }
  const sourceField = allDefinitionFields(input.definition).find(
    (field) => field.key === selection.sourceField,
  );
  if (!sourceField || sourceField.type !== 'table') {
    throw badRequest('جدول منبع انتخاب معتبر نیست.');
  }
  if (!input.selectionRowKey) {
    throw badRequest('برای ادامه، یکی از گزینه‌ها را انتخاب کنید.');
  }
  const rows = Array.isArray(input.mergedData[selection.sourceField])
    ? (input.mergedData[selection.sourceField] as unknown[])
    : [];
  const rowIndex = rows.findIndex((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const key = (row as Record<string, unknown>)._key;
    return key === input.selectionRowKey || String(index) === input.selectionRowKey;
  });
  if (rowIndex < 0) {
    throw badRequest('گزینهٔ انتخاب‌شده معتبر نیست.');
  }
  const row = rows[rowIndex] as Record<string, unknown>;
  const taskData: Record<string, unknown> = {
    ...input.taskData,
    selectionRowKey: input.selectionRowKey,
  };
  const mergedData = { ...input.mergedData };
  for (const copy of selection.copy ?? []) {
    if (Object.prototype.hasOwnProperty.call(row, copy.from)) {
      mergedData[copy.to] = row[copy.from];
    }
  }
  const labelField = selection.labelColumn
    ? sourceField.columns?.find((column) => column.key === selection.labelColumn)
    : undefined;
  const labelValue = selection.labelColumn ? row[selection.labelColumn] : undefined;
  if (labelValue !== undefined) {
    taskData.selectionLabel = labelValue;
  }
  return { taskData, mergedData, labelField, labelValue };
}

async function resolveCaseTitle(
  definition: CaseTypeDefinition,
  fields: FieldDef[],
  data: Record<string, unknown>,
  tenantId: string,
  fallback: string,
): Promise<string> {
  const titleField = definition.settings?.titleField;
  const titleFieldDef = titleField
    ? fields.find((field) => field.key === titleField)
    : undefined;
  const resolved = await resolveTitleFromField(
    titleFieldDef,
    titleField ? data[titleField] : undefined,
    tenantId,
  );
  return resolved || fallback;
}

async function performCompletion(
  auth: AuthContext,
  context: TaskContext,
  input: {
    data?: Record<string, unknown>;
    comment?: string;
    outcome: 'completed' | 'approved';
    selectionRowKey?: string;
  },
): Promise<void> {
  const { task, definition } = context;
  if (!canAct(auth, task)) throw forbidden('شما اجازهٔ انجام این اقدام را ندارید.');
  if (!['pending', 'claimed'].includes(task.status)) {
    throw badRequest('این کار در وضعیت قابل تکمیل نیست.');
  }

  await db.transaction(async (tx) => {
    const lockedRows = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.id, context.caseRow.id), eq(cases.tenantId, auth.tenantId)))
      .for('update')
      .limit(1);
    const caseRow = lockedRows[0];
    if (!caseRow) throw notFound('پرونده پیدا نشد.');
    if (task.kind !== 'info' && ['completed', 'cancelled', 'rejected'].includes(caseRow.status)) {
      throw badRequest('این پرونده دیگر قابل ویرایش نیست.');
    }

    const taskDef = taskDefOf(definition, task.stageKey, task.taskKey);
    const fields = fieldsForStage(definition, task.stageKey);
    const formFields = taskDef?.formFields;
    const isInfoTask = task.kind === 'info';
    // A request for information is answered by editing the case itself, so it
    // accepts any editable field of the stage rather than the original task form.
    let data = pickSubmittedData(fields, isInfoTask ? undefined : formFields, input.data ?? {});
    let mergedData: Record<string, unknown> = { ...caseRow.data, ...data };
    if (task.kind === 'selection') {
      const selected = applySelection({
        definition,
        taskDef,
        taskData: data,
        mergedData,
        selectionRowKey: input.selectionRowKey,
      });
      data = selected.taskData;
      mergedData = selected.mergedData;
      if (selected.labelValue !== undefined) {
        const label = await resolveTitleFromField(
          selected.labelField,
          selected.labelValue,
          auth.tenantId,
        );
        if (label) data.selectionLabel = label;
      }
    }
    // A request for information only carries the fields the responder actually
    // sends. Re-validating the whole stage would demand values the task does not
    // offer and would leave the case blocked.
    const submittedKeys = Object.keys(data);
    // Approval tasks only accept a decision (approve/reject); they never carry a
    // form payload, so validating form fields here would block approvals that
    // were configured with (even optional) fields the approver cannot edit.
    const validationScope = isInfoTask
      ? submittedKeys
      : task.kind === 'approval'
        ? []
        : formFields?.length
          ? formFields
          : undefined;
    const issues = validateCaseData(fields, mergedData, {
      onlyFields: validationScope,
    });
    issues.push(
      ...(await validateReferenceFields(
        tx,
        auth.tenantId,
        isInfoTask ? fields.filter((field) => submittedKeys.includes(field.key)) : fields,
        mergedData,
        caseRow.id,
      )),
    );
    if (issues.length) throw badRequest('اطلاعات فرم کامل یا معتبر نیست.', issues);

    if (!isInfoTask) await checkRequiredDocuments(auth, context, tx);

    const [completed] = await tx
      .update(caseTasks)
      .set({
        status: 'completed',
        outcome: task.kind === 'info' ? 'completed' : input.outcome,
        data,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(caseTasks.id, task.id),
          eq(caseTasks.tenantId, auth.tenantId),
          inArray(caseTasks.status, ['pending', 'claimed']),
        ),
      )
      .returning({ id: caseTasks.id });
    if (!completed) throw badRequest('این کار هم‌اکنون توسط کاربر دیگری تکمیل شد.');

    const title = await resolveCaseTitle(
      definition,
      fields,
      mergedData,
      auth.tenantId,
      caseRow.title,
    );
    const nextStatus =
      task.kind === 'info' && caseRow.status === 'on_hold' ? 'in_progress' : caseRow.status;
    await tx
      .update(cases)
      .set({ data: mergedData, title, status: nextStatus, updatedAt: new Date() })
      .where(and(eq(cases.id, caseRow.id), eq(cases.tenantId, auth.tenantId)));

    if (task.kind === 'info') {
      await activateWaitingInfoTasks(tx, caseRow.id);
      await addCaseEvent(tx, {
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        type: 'case.info_provided',
        actorId: auth.userId,
        data: { taskId: task.id },
      });
      await writeAudit(tx, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: 'task.info_completed',
        entityType: 'task',
        entityId: task.id,
      });
    } else {
      await addCaseEvent(tx, {
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        type: 'task.completed',
        actorId: auth.userId,
        data: {
          taskId: task.id,
          name: task.name,
          outcome: input.outcome,
          stageKey: task.stageKey,
        },
      });
      await writeAudit(tx, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: 'task.completed',
        entityType: 'task',
        entityId: task.id,
        before: { status: task.status, data: caseRow.data },
        after: { status: 'completed', data: mergedData },
      });
    }

    if (input.comment?.trim()) {
      const [comment] = await tx
        .insert(caseComments)
        .values({
          tenantId: auth.tenantId,
          caseId: caseRow.id,
          taskId: task.id,
          authorId: auth.userId,
          body: input.comment.trim(),
        })
        .returning();
      if (comment) {
        await addCaseEvent(tx, {
          tenantId: auth.tenantId,
          caseId: caseRow.id,
          type: 'comment.added',
          actorId: auth.userId,
          data: { commentId: comment.id, preview: comment.body.slice(0, 120) },
        });
      }
    }

    await notifyUsers(tx, {
      tenantId: auth.tenantId,
      userIds: [caseRow.createdBy],
      type: task.kind === 'info'
        ? 'case.info_provided'
        : input.outcome === 'approved'
          ? 'task.approved'
          : 'task.completed',
      title:
        task.kind === 'info'
          ? `اطلاعات تکمیلی دریافت شد: ${caseRow.title}`
          : input.outcome === 'approved'
            ? `تأیید شد: ${task.name}`
            : `کار انجام شد: ${task.name}`,
      body: caseRow.reference,
      link: `/cases/${caseRow.id}`,
    });

    await syncCaseDue(tx, auth.tenantId, caseRow.id);
    await advanceIfReady(tx, {
      tenantId: auth.tenantId,
      caseId: caseRow.id,
      actorId: auth.userId,
      definition,
    });
  });
}

export async function completeTask(
  auth: AuthContext,
  taskId: string,
  input: { data?: Record<string, unknown>; comment?: string; selectionRowKey?: string },
): Promise<TaskDetailDto> {
  const context = await loadTaskContext(auth, taskId);
  if (context.task.kind === 'approval') {
    throw badRequest('برای کار تأیید، از یکی از اقدام‌های تأیید یا رد استفاده کنید.');
  }
  await performCompletion(auth, context, {
    data: input.data,
    comment: input.comment,
    selectionRowKey: input.selectionRowKey,
    outcome: 'completed',
  });
  return getTaskDetail(auth, taskId);
}

export async function decideTask(
  auth: AuthContext,
  taskId: string,
  decision: 'approve' | 'reject' | 'return' | 'request_info',
  comment?: string,
): Promise<TaskDetailDto> {
  const context = await loadTaskContext(auth, taskId);
  const { task, caseRow, definition } = context;
  if (!canAct(auth, task)) throw forbidden('شما اجازهٔ انجام این اقدام را ندارید.');
  if (!['pending', 'claimed'].includes(task.status)) {
    throw badRequest('این کار در وضعیت قابل تصمیم‌گیری نیست.');
  }
  if (['completed', 'cancelled', 'rejected'].includes(caseRow.status)) {
    throw badRequest('این پرونده دیگر قابل تغییر نیست.');
  }

  if (decision === 'approve') {
    if (task.kind !== 'approval') {
      throw badRequest('این کار از نوع تأیید نیست.');
    }
    await performCompletion(auth, context, { comment, outcome: 'approved' });
    return getTaskDetail(auth, taskId);
  }

  if (task.kind !== 'approval') {
    throw badRequest('تنها کارهای تأیید قابل رد، بازگشت یا درخواست اطلاعات هستند.');
  }

  if (!comment?.trim()) {
    throw badRequest('برای این تصمیم، ثبت توضیحات الزامی است.');
  }

  if (decision === 'request_info') {
    await db.transaction(async (tx) => {
      const [waiting] = await tx
        .update(caseTasks)
        .set({ status: 'waiting_info', updatedAt: new Date() })
        .where(
          and(
            eq(caseTasks.id, task.id),
            eq(caseTasks.tenantId, auth.tenantId),
            inArray(caseTasks.status, ['pending', 'claimed']),
          ),
        )
        .returning({ id: caseTasks.id });
      if (!waiting) throw badRequest('این کار هم‌اکنون توسط کاربر دیگری تغییر کرده است.');
      const [infoTask] = await tx
        .insert(caseTasks)
        .values({
          tenantId: auth.tenantId,
          caseId: caseRow.id,
          stageKey: task.stageKey,
          taskKey: `info_${task.id.slice(0, 8)}_${Date.now().toString(36)}`,
          name: 'درخواست اطلاعات تکمیلی',
          description: comment?.trim(),
          status: 'pending',
          kind: 'info',
          assigneeId: caseRow.createdBy,
          candidateRole: null,
          dueAt: nextWorkingHours(24),
          data: {},
        })
        .returning();
      await tx
        .update(cases)
        .set({ status: 'on_hold', updatedAt: new Date() })
        .where(and(eq(cases.id, caseRow.id), eq(cases.tenantId, auth.tenantId)));
      await addCaseEvent(tx, {
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        type: 'case.info_requested',
        actorId: auth.userId,
        data: { taskId: task.id, infoTaskId: infoTask?.id, comment: comment?.trim() },
      });
      await tx.insert(caseComments).values({
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        taskId: task.id,
        authorId: auth.userId,
        body: `درخواست اطلاعات تکمیلی: ${comment?.trim()}`,
      });
      await writeAudit(tx, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: 'task.info_requested',
        entityType: 'task',
        entityId: task.id,
      });
      await notifyUsers(tx, {
        tenantId: auth.tenantId,
        userIds: [caseRow.createdBy],
        type: 'task.info_requested',
        title: `درخواست اطلاعات تکمیلی برای: ${caseRow.title}`,
        body: comment?.trim(),
        link: infoTask ? `/tasks/${infoTask.id}` : `/cases/${caseRow.id}`,
      });
      await syncCaseDue(tx, auth.tenantId, caseRow.id);
    });
    return getTaskDetail(auth, taskId);
  }

  if (decision === 'reject') {
    await db.transaction(async (tx) => {
      const [rejected] = await tx
        .update(caseTasks)
        .set({
          status: 'completed',
          outcome: 'rejected',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(caseTasks.id, task.id),
            eq(caseTasks.tenantId, auth.tenantId),
            inArray(caseTasks.status, ['pending', 'claimed']),
          ),
        )
        .returning({ id: caseTasks.id });
      if (!rejected) throw badRequest('این کار هم‌اکنون توسط کاربر دیگری تغییر کرده است.');
      await tx
        .update(caseTasks)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(caseTasks.caseId, caseRow.id),
            eq(caseTasks.tenantId, auth.tenantId),
            eq(caseTasks.stageKey, task.stageKey),
            inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
          ),
        );
      await tx
        .update(cases)
        .set({ status: 'rejected', dueAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(cases.id, caseRow.id),
            eq(cases.tenantId, auth.tenantId),
            inArray(cases.status, ['in_progress', 'on_hold']),
          ),
        );
      await addCaseEvent(tx, {
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        type: 'case.rejected',
        actorId: auth.userId,
        data: { taskId: task.id, comment: comment?.trim() },
      });
      await tx.insert(caseComments).values({
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        taskId: task.id,
        authorId: auth.userId,
        body: `دلیل رد: ${comment?.trim()}`,
      });
      await writeAudit(tx, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: 'task.rejected',
        entityType: 'case',
        entityId: caseRow.id,
        after: { reason: comment?.trim() },
      });
      if (notificationEnabled(definition, 'case.rejected')) {
        await notifyUsers(tx, {
          tenantId: auth.tenantId,
          userIds: [caseRow.createdBy],
          type: 'case.rejected',
          title: `پرونده رد شد: ${caseRow.title}`,
          body: comment?.trim() ?? caseRow.reference,
          link: `/cases/${caseRow.id}`,
        });
      }
    });
    return getTaskDetail(auth, taskId);
  }

  const previous = previousStageOf(definition, task.stageKey);
  if (!previous) throw badRequest('امکان بازگشت به مرحلهٔ قبل وجود ندارد.');

  await db.transaction(async (tx) => {
    const [returned] = await tx
      .update(caseTasks)
      .set({
        status: 'completed',
        outcome: 'returned',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(caseTasks.id, task.id),
          eq(caseTasks.tenantId, auth.tenantId),
          inArray(caseTasks.status, ['pending', 'claimed']),
        ),
      )
      .returning({ id: caseTasks.id });
    if (!returned) throw badRequest('این کار هم‌اکنون توسط کاربر دیگری تغییر کرده است.');
    await tx
      .update(caseTasks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(caseTasks.caseId, caseRow.id),
          eq(caseTasks.tenantId, auth.tenantId),
          eq(caseTasks.stageKey, task.stageKey),
          inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
        ),
      );
    await tx
      .update(cases)
      .set({
        stageKey: previous.key,
        stageName: previous.name,
        status: 'in_progress',
        dueAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(cases.id, caseRow.id), eq(cases.tenantId, auth.tenantId)));
    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId: caseRow.id,
      type: 'case.returned',
      actorId: auth.userId,
      data: {
        taskId: task.id,
        fromStage: task.stageKey,
        toStage: previous.key,
        comment: comment?.trim(),
        taskCount: previous.tasks.length,
      },
    });
    await tx.insert(caseComments).values({
      tenantId: auth.tenantId,
      caseId: caseRow.id,
      taskId: task.id,
      authorId: auth.userId,
      body: `بازگشت به مرحلهٔ قبل: ${comment?.trim()}`,
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'task.returned',
      entityType: 'case',
      entityId: caseRow.id,
      after: { toStage: previous.key, reason: comment?.trim() },
    });
    await notifyUsers(tx, {
      tenantId: auth.tenantId,
      userIds: [caseRow.createdBy],
      type: 'case.returned',
      title: `پرونده به مرحلهٔ قبل بازگشت: ${caseRow.title}`,
      body: comment?.trim() ?? caseRow.reference,
      link: `/cases/${caseRow.id}`,
    });
    const updatedCase = { ...caseRow, stageKey: previous.key, stageName: previous.name };
    const created = await createTasksForStage(tx, {
      tenantId: auth.tenantId,
      caseRow: updatedCase,
      definition,
      stage: previous,
      actorId: auth.userId,
    });
    if (!created.length) {
      await advanceIfReady(tx, {
        tenantId: auth.tenantId,
        caseId: caseRow.id,
        actorId: auth.userId,
        definition,
      });
    } else {
      await syncCaseDue(tx, auth.tenantId, caseRow.id);
    }
  });
  return getTaskDetail(auth, taskId);
}

export async function reassignTask(
  auth: AuthContext,
  taskId: string,
  userId: string,
  comment?: string,
): Promise<TaskDetailDto> {
  if (!hasPermission(auth, 'reassignTasks')) {
    throw forbidden('اجازهٔ واگذاری کار را ندارید.');
  }
  const context = await loadTaskContext(auth, taskId);
  if (!['pending', 'claimed', 'waiting_info'].includes(context.task.status)) {
    throw badRequest('این کار قابل واگذاری نیست.');
  }
  const targetRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.tenantId, auth.tenantId),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  const target = targetRows[0];
  if (!target) throw badRequest('کاربر مقصد معتبر نیست.');

  await db.transaction(async (tx) => {
    await tx
      .update(caseTasks)
      .set({
        assigneeId: target.id,
        candidateRole: null,
        status: 'pending',
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, taskId));
    await addCaseEvent(tx, {
      tenantId: auth.tenantId,
      caseId: context.caseRow.id,
      type: 'task.reassigned',
      actorId: auth.userId,
      data: { taskId, to: target.name, comment: comment ?? null },
    });
    await writeAudit(tx, {
      tenantId: auth.tenantId,
      actorId: auth.userId,
      action: 'task.reassigned',
      entityType: 'task',
      entityId: taskId,
      after: { assigneeId: target.id },
    });
    if (notificationEnabled(context.definition, 'task.assigned')) {
      await notifyUsers(tx, {
        tenantId: auth.tenantId,
        userIds: [target.id],
        type: 'task.assigned',
        title: `کار به شما واگذار شد: ${context.task.name}`,
        body: context.caseRow.reference,
        link: `/tasks/${taskId}`,
      });
    }
  });
  return getTaskDetail(auth, taskId);
}
