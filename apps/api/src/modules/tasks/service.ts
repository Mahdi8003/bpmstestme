import { and, asc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  nextWorkingHours,
  validateCaseData,
  type CaseTypeDefinition,
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
import type { AuthContext } from '../../lib/auth.js';
import { taskDto } from '../cases/dto.js';
import { getCaseDetail } from '../cases/service.js';
import type { CaseRow, TaskRow } from '../cases/workflow.js';
import {
  activateWaitingInfoTasks,
  advanceIfReady,
  createTasksForStage,
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
  query: { scope: 'mine' | 'available' | 'all' | 'completed'; q?: string; limit: number },
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
    .limit(query.limit);

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
  await db.transaction(async (tx) => {
    await tx
      .update(caseTasks)
      .set({
        assigneeId: auth.userId,
        candidateRole: null,
        status: 'claimed',
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, taskId));
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
  await db.transaction(async (tx) => {
    await tx
      .update(caseTasks)
      .set({
        assigneeId: null,
        candidateRole: context.task.candidateRole,
        status: 'pending',
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, taskId));
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

async function performCompletion(
  auth: AuthContext,
  context: TaskContext,
  input: { data?: Record<string, unknown>; comment?: string; outcome: 'completed' | 'approved' },
): Promise<void> {
  const { task, caseRow, definition } = context;
  if (!canAct(auth, task)) throw forbidden('این کار به شما تخصیص داده نشده است.');
  if (!['pending', 'claimed'].includes(task.status)) {
    throw badRequest('این کار در وضعیت قابل تکمیل نیست.');
  }

  const taskDef = taskDefOf(definition, task.stageKey, task.taskKey);
  const data = input.data ?? {};
  const mergedData = { ...caseRow.data, ...data };
  const formFields = taskDef?.formFields ?? [];
  const issues = validateCaseData(definition.fields, mergedData, { onlyFields: formFields });
  issues.push(
    ...(await validateReferenceFields(db, auth.tenantId, definition.fields, mergedData)),
  );
  if (issues.length) throw badRequest('اطلاعات فرم کامل یا معتبر نیست.', issues);

  await db.transaction(async (tx) => {
    await checkRequiredDocuments(auth, context, tx);

    if (task.kind === 'info') {
      await tx
        .update(caseTasks)
        .set({
          status: 'completed',
          outcome: 'completed',
          data,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(caseTasks.id, task.id));
      await activateWaitingInfoTasks(tx, caseRow.id);
      await tx
        .update(cases)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(cases.id, caseRow.id));
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
      if (input.comment?.trim()) {
        await tx.insert(caseComments).values({
          tenantId: auth.tenantId,
          caseId: caseRow.id,
          taskId: task.id,
          authorId: auth.userId,
          body: input.comment.trim(),
        });
      }
      await notifyUsers(tx, {
        tenantId: auth.tenantId,
        userIds: [caseRow.createdBy],
        type: 'case.info_provided',
        title: `اطلاعات تکمیلی ثبت شد: ${caseRow.title}`,
        body: caseRow.reference,
        link: `/cases/${caseRow.id}`,
      });
      return;
    }

    const titleField = definition.settings?.titleField;
    const titleFromData = titleField ? mergedData[titleField] : undefined;
    const title =
      typeof titleFromData === 'string' && titleFromData.trim()
        ? titleFromData.trim()
        : caseRow.title;

    await tx
      .update(caseTasks)
      .set({
        status: 'completed',
        outcome: input.outcome,
        data,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, task.id));
    await tx
      .update(cases)
      .set({ data: mergedData, title, updatedAt: new Date() })
      .where(eq(cases.id, caseRow.id));

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
      type: input.outcome === 'approved' ? 'task.approved' : 'task.completed',
      title:
        input.outcome === 'approved'
          ? `تأیید شد: ${task.name}`
          : `کار انجام شد: ${task.name}`,
      body: caseRow.reference,
      link: `/cases/${caseRow.id}`,
    });

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
  input: { data?: Record<string, unknown>; comment?: string },
): Promise<TaskDetailDto> {
  const context = await loadTaskContext(auth, taskId);
  if (context.task.kind === 'approval') {
    throw badRequest('برای کار تأیید، از یکی از اقدام‌های تأیید یا رد استفاده کنید.');
  }
  await performCompletion(auth, context, {
    data: input.data,
    comment: input.comment,
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
  if (!canAct(auth, task)) throw forbidden('این کار به شما تخصیص داده نشده است.');
  if (!['pending', 'claimed'].includes(task.status)) {
    throw badRequest('این کار در وضعیت قابل اقدام نیست.');
  }

  if (decision === 'approve') {
    if (task.kind !== 'approval') {
      throw badRequest('این کار از نوع تأیید نیست.');
    }
    await performCompletion(auth, context, { comment, outcome: 'approved' });
    return getTaskDetail(auth, taskId);
  }

  if ((decision === 'reject' || decision === 'return' || decision === 'request_info') && !comment?.trim()) {
    throw badRequest('برای این اقدام، ثبت دلیل الزامی است.');
  }

  if (decision === 'request_info') {
    await db.transaction(async (tx) => {
      await tx
        .update(caseTasks)
        .set({ status: 'waiting_info', updatedAt: new Date() })
        .where(eq(caseTasks.id, task.id));
      const [infoTask] = await tx
        .insert(caseTasks)
        .values({
          tenantId: auth.tenantId,
          caseId: caseRow.id,
          stageKey: task.stageKey,
          taskKey: `info_${task.id.slice(0, 8)}`,
          name: 'ارائه اطلاعات تکمیلی',
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
        .where(eq(cases.id, caseRow.id));
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
        title: `اطلاعات تکمیلی لازم است: ${caseRow.title}`,
        body: comment?.trim(),
        link: infoTask ? `/tasks/${infoTask.id}` : `/cases/${caseRow.id}`,
      });
    });
    return getTaskDetail(auth, taskId);
  }

  if (decision === 'reject') {
    await db.transaction(async (tx) => {
      await tx
        .update(caseTasks)
        .set({
          status: 'completed',
          outcome: 'rejected',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(caseTasks.id, task.id));
      await tx
        .update(caseTasks)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(caseTasks.caseId, caseRow.id),
            eq(caseTasks.stageKey, task.stageKey),
            inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
          ),
        );
      await tx
        .update(cases)
        .set({ status: 'rejected', dueAt: null, updatedAt: new Date() })
        .where(eq(cases.id, caseRow.id));
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
        body: `رد شد: ${comment?.trim()}`,
      });
      await writeAudit(tx, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        action: 'task.rejected',
        entityType: 'case',
        entityId: caseRow.id,
        after: { reason: comment?.trim() },
      });
      await notifyUsers(tx, {
        tenantId: auth.tenantId,
        userIds: [caseRow.createdBy],
        type: 'case.rejected',
        title: `پرونده رد شد: ${caseRow.title}`,
        body: comment?.trim() ?? caseRow.reference,
        link: `/cases/${caseRow.id}`,
      });
    });
    return getTaskDetail(auth, taskId);
  }

  const previous = previousStageOf(definition, task.stageKey);
  if (!previous) throw badRequest('این مرحله مرحله قبل ندارد.');

  await db.transaction(async (tx) => {
    await tx
      .update(caseTasks)
      .set({
        status: 'completed',
        outcome: 'returned',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(caseTasks.id, task.id));
    await tx
      .update(caseTasks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(caseTasks.caseId, caseRow.id),
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
      .where(eq(cases.id, caseRow.id));
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
      body: `بازگردانده شد: ${comment?.trim()}`,
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
      title: `پرونده بازگردانده شد: ${caseRow.title}`,
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
  if (!['admin', 'builder', 'manager'].includes(auth.user.role)) {
    throw forbidden('اجازه واگذاری کار را ندارید.');
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
    await notifyUsers(tx, {
      tenantId: auth.tenantId,
      userIds: [target.id],
      type: 'task.assigned',
      title: `کار به شما واگذار شد: ${context.task.name}`,
      body: context.caseRow.reference,
      link: `/tasks/${taskId}`,
    });
  });
  return getTaskDetail(auth, taskId);
}
