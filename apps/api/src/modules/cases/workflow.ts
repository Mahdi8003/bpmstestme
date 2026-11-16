import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  allDefinitionFields,
  evaluateCondition,
  fieldsForStage,
  nextWorkingHours,
  validateCaseData,
  type CaseTypeDefinition,
  type StageDef,
  type StageTransition,
  type TaskDef,
} from '@ravand/shared';
import type { DbLike } from '../../db/client.js';
import {
  caseTasks,
  caseTypes,
  caseTypeVersions,
  cases,
  users,
} from '../../db/schema.js';
import { addCaseEvent, writeAudit } from '../../lib/audit.js';
import { AppError, badRequest } from '../../lib/errors.js';
import { validateReferenceFields } from '../../lib/domain-validation.js';
import { createReference } from '../../lib/numbering.js';
import { findUsersByRole, notifyUsers } from '../../lib/notifications.js';

export type CaseRow = typeof cases.$inferSelect;
export type TaskRow = typeof caseTasks.$inferSelect;

export async function loadDefinition(
  db: DbLike,
  tenantId: string,
  versionId: string,
): Promise<CaseTypeDefinition> {
  const rows = await db
    .select({ definition: caseTypeVersions.definition })
    .from(caseTypeVersions)
    .where(
      and(eq(caseTypeVersions.id, versionId), eq(caseTypeVersions.tenantId, tenantId)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw badRequest('نسخه فرآیند پیدا نشد.');
  return row.definition;
}

export type ConfigurableNotificationEvent =
  | 'case.created'
  | 'task.assigned'
  | 'case.completed'
  | 'case.rejected'
  | 'sla.breached';

/**
 * Notification preferences live on the process definition. When a definition
 * declares notifications, only the listed events/channels are delivered;
 * definitions that do not configure anything keep the legacy in-app behavior.
 */
export function notificationEnabled(
  definition: CaseTypeDefinition,
  event: ConfigurableNotificationEvent,
): boolean {
  const config = definition.notifications;
  if (!config || config.length === 0) return true;
  const entry = config.find((item) => item.event === event);
  if (!entry) return false;
  return !entry.channels || entry.channels.includes('inapp');
}

export function stageOf(
  definition: CaseTypeDefinition,
  stageKey: string,
): StageDef | undefined {
  return definition.stages.find((stage) => stage.key === stageKey);
}

export function taskDefOf(
  definition: CaseTypeDefinition,
  stageKey: string,
  taskKey: string,
): TaskDef | undefined {
  return stageOf(definition, stageKey)?.tasks.find((task) => task.key === taskKey);
}

export function nextStageOf(
  definition: CaseTypeDefinition,
  stageKey: string,
): StageDef | undefined {
  const index = definition.stages.findIndex((stage) => stage.key === stageKey);
  if (index < 0) return undefined;
  return definition.stages[index + 1];
}

export function previousStageOf(
  definition: CaseTypeDefinition,
  stageKey: string,
): StageDef | undefined {
  const index = definition.stages.findIndex((stage) => stage.key === stageKey);
  if (index <= 0) return undefined;
  return definition.stages[index - 1];
}

export async function resolveAssignee(
  db: DbLike,
  tenantId: string,
  createdBy: string,
  task: TaskDef,
): Promise<{ assigneeId: string | null; candidateRole: string | null; notifyIds: string[] }> {
  if (task.assignee.type === 'creator') {
    return { assigneeId: createdBy, candidateRole: null, notifyIds: [createdBy] };
  }
  if (task.assignee.type === 'user') {
    const id = task.assignee.value ?? null;
    if (!id) throw badRequest(`کار «${task.name}» کاربر مسئول ندارد.`);
    const row = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, id),
            eq(users.tenantId, tenantId),
            eq(users.isActive, true),
          ),
        )
        .limit(1)
    )[0];
    if (!row) {
      throw badRequest(`کاربر انتخاب‌شده برای کار «${task.name}» در این سازمان فعال نیست.`);
    }
    return { assigneeId: row.id, candidateRole: null, notifyIds: [row.id] };
  }
  if (task.assignee.type === 'manager') {
    const notifyIds = await findUsersByRole(db, tenantId, 'manager');
    return { assigneeId: null, candidateRole: 'manager', notifyIds };
  }
  const role = task.assignee.value ?? 'member';
  const notifyIds = await findUsersByRole(db, tenantId, role);
  return { assigneeId: null, candidateRole: role, notifyIds };
}

export async function createTasksForStage(
  db: DbLike,
  input: {
    tenantId: string;
    caseRow: CaseRow;
    definition: CaseTypeDefinition;
    stage: StageDef;
    actorId: string | null;
  },
): Promise<TaskRow[]> {
  const created: TaskRow[] = [];
  const now = new Date();

  const stageFields = fieldsForStage(input.definition, input.stage.key);
  for (const task of input.stage.tasks) {
    if (!evaluateCondition(task.condition, stageFields, input.caseRow.data)) {
      continue;
    }
    const resolved = await resolveAssignee(
      db,
      input.tenantId,
      input.caseRow.createdBy,
      task,
    );
    const dueAt = task.dueInHours ? nextWorkingHours(task.dueInHours, now) : null;
    const [row] = await db
      .insert(caseTasks)
      .values({
        tenantId: input.tenantId,
        caseId: input.caseRow.id,
        stageKey: input.stage.key,
        taskKey: task.key,
        name: task.name,
        description: task.description ?? null,
        status: 'pending',
        kind: task.kind ?? 'action',
        assigneeId: resolved.assigneeId,
        candidateRole: resolved.candidateRole,
        dueAt,
        data: {},
      })
      .returning();
    if (!row) continue;
    created.push(row);
    await addCaseEvent(db, {
      tenantId: input.tenantId,
      caseId: input.caseRow.id,
      type: 'task.created',
      actorId: input.actorId,
      data: { taskId: row.id, name: row.name, stageKey: input.stage.key },
    });
    if (resolved.notifyIds.length && notificationEnabled(input.definition, 'task.assigned')) {
      await notifyUsers(db, {
        tenantId: input.tenantId,
        userIds: resolved.notifyIds,
        type: 'task.assigned',
        title: `کار جدید: ${row.name}`,
        body: `${input.caseRow.reference} · ${input.caseRow.title}`,
        link: `/tasks/${row.id}`,
      });
    }
  }

  return created;
}

export async function syncCaseDue(
  db: DbLike,
  tenantId: string,
  caseId: string,
): Promise<void> {
  const rows = await db
    .select({
      dueAt: sql<Date | null>`min(${caseTasks.dueAt})`,
    })
    .from(caseTasks)
    .where(
      and(
        eq(caseTasks.tenantId, tenantId),
        eq(caseTasks.caseId, caseId),
        inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
      ),
    );
  const dueAt = rows[0]?.dueAt ?? null;
  await db
    .update(cases)
    .set({ dueAt: dueAt ? new Date(dueAt) : null, updatedAt: new Date() })
    .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));
}

export function transitionForStage(
  definition: CaseTypeDefinition,
  stage: StageDef,
  data: Record<string, unknown>,
): StageTransition | undefined {
  const fields = fieldsForStage(definition, stage.key);
  for (const transition of stage.transitions ?? []) {
    if (!transition.condition || evaluateCondition(transition.condition, fields, data)) {
      return transition;
    }
  }
  return undefined;
}

async function startLinkedCase(
  db: DbLike,
  input: {
    tenantId: string;
    caseRow: CaseRow;
    transition: StageTransition;
    actorId: string | null;
  },
): Promise<string> {
  const key = input.transition.caseTypeKey;
  if (!key) throw badRequest('فرآیند مقصد برای اتصال مشخص نشده است.');

  const target = (
    await db
      .select({
        caseType: caseTypes,
        version: caseTypeVersions,
      })
      .from(caseTypes)
      .innerJoin(caseTypeVersions, eq(caseTypeVersions.id, caseTypes.publishedVersionId))
      .where(
        and(
          eq(caseTypes.tenantId, input.tenantId),
          eq(caseTypes.key, key),
          eq(caseTypes.status, 'published'),
        ),
      )
      .limit(1)
  )[0];
  if (!target) {
    throw badRequest(`فرآیند مقصد «${key}» منتشر نشده یا در دسترس نیست.`);
  }

  const definition = target.version.definition;
  const firstStage = definition.stages[0];
  if (!firstStage) throw badRequest('فرآیند مقصد مرحله آغازین ندارد.');

  const targetFields = allDefinitionFields(definition);
  const allowed = new Set(targetFields.map((field) => field.key));
  const data: Record<string, unknown> = {};
  for (const [fieldKey, value] of Object.entries(input.caseRow.data)) {
    if (allowed.has(fieldKey)) data[fieldKey] = value;
  }

  const firstStageFields = fieldsForStage(definition, firstStage.key);
  const issues = validateCaseData(firstStageFields, data);
  issues.push(
    ...(await validateReferenceFields(db, input.tenantId, firstStageFields, data)),
  );
  if (issues.length) {
    throw badRequest(
      `داده‌های لازم برای شروع فرآیند «${target.caseType.name}» کامل نیست.`,
      issues,
    );
  }

  const titleField = definition.settings?.titleField;
  const rawTitle = titleField ? data[titleField] : undefined;
  const title =
    typeof rawTitle === 'string' && rawTitle.trim()
      ? rawTitle.trim()
      : `${input.caseRow.title} · ${target.caseType.name}`;
  const reference = await createReference(
    db,
    input.tenantId,
    target.caseType.referencePrefix,
  );
  const [created] = await db
    .insert(cases)
    .values({
      tenantId: input.tenantId,
      caseTypeId: target.caseType.id,
      versionId: target.version.id,
      reference,
      title,
      status: 'in_progress',
      stageKey: firstStage.key,
      stageName: firstStage.name,
      priority: definition.settings?.priority ?? 'normal',
      data,
      createdBy: input.caseRow.createdBy,
      parentCaseId: input.caseRow.id,
      rootCaseId: input.caseRow.rootCaseId ?? input.caseRow.id,
    })
    .returning();
  if (!created) throw new AppError(500, 'ایجاد پرونده مقصد ممکن نشد.');

  await addCaseEvent(db, {
    tenantId: input.tenantId,
    caseId: created.id,
    type: 'case.created',
    actorId: input.actorId,
    data: {
      reference,
      caseTypeName: target.caseType.name,
      parentCaseId: input.caseRow.id,
    },
  });
  await addCaseEvent(db, {
    tenantId: input.tenantId,
    caseId: input.caseRow.id,
    type: 'case.converted',
    actorId: input.actorId,
    data: {
      childCaseId: created.id,
      childReference: reference,
      caseTypeName: target.caseType.name,
    },
  });
  await writeAudit(db, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'case.converted',
    entityType: 'case',
    entityId: input.caseRow.id,
    after: {
      childCaseId: created.id,
      caseTypeKey: key,
      reference,
    },
  });

  await db
    .update(cases)
    .set({
      status: 'completed',
      completedAt: new Date(),
      dueAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(cases.id, input.caseRow.id), eq(cases.tenantId, input.tenantId)));

  const childTasks = await createTasksForStage(db, {
    tenantId: input.tenantId,
    caseRow: created,
    definition,
    stage: firstStage,
    actorId: input.actorId,
  });
  if (childTasks.length) {
    await syncCaseDue(db, input.tenantId, created.id);
  } else {
    await advanceIfReady(db, {
      tenantId: input.tenantId,
      caseId: created.id,
      actorId: input.actorId,
      definition,
    });
  }

  if (notificationEnabled(definition, 'case.created')) {
    await notifyUsers(db, {
      tenantId: input.tenantId,
      userIds: [input.caseRow.createdBy],
      type: 'case.converted',
      title: `فرآیند بعدی آغاز شد: ${target.caseType.name}`,
      body: `${input.caseRow.reference} ← ${reference}`,
      link: `/cases/${created.id}`,
    });
  }

  return created.id;
}

export async function completeCase(
  db: DbLike,
  input: {
    tenantId: string;
    caseRow: CaseRow;
    actorId: string | null;
    definition: CaseTypeDefinition;
  },
): Promise<void> {
  await db
    .update(cases)
    .set({
      status: 'completed',
      completedAt: new Date(),
      dueAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(cases.id, input.caseRow.id), eq(cases.tenantId, input.tenantId)));

  await addCaseEvent(db, {
    tenantId: input.tenantId,
    caseId: input.caseRow.id,
    type: 'case.completed',
    actorId: input.actorId,
    data: { stageKey: input.caseRow.stageKey },
  });
  await writeAudit(db, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: 'case.completed',
    entityType: 'case',
    entityId: input.caseRow.id,
    after: { status: 'completed' },
  });
  if (notificationEnabled(input.definition, 'case.completed')) {
    await notifyUsers(db, {
      tenantId: input.tenantId,
      userIds: [input.caseRow.createdBy],
      type: 'case.completed',
      title: `پرونده تکمیل شد: ${input.caseRow.title}`,
      body: input.caseRow.reference,
      link: `/cases/${input.caseRow.id}`,
    });
  }
}

export async function advanceIfReady(
  db: DbLike,
  input: {
    tenantId: string;
    caseId: string;
    actorId: string | null;
    definition: CaseTypeDefinition;
  },
): Promise<void> {
  for (let guard = 0; guard < 25; guard += 1) {
    const rows = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, input.caseId), eq(cases.tenantId, input.tenantId)))
      .for('update')
      .limit(1);
    const caseRow = rows[0];
    if (!caseRow) return;
    if (caseRow.status === 'completed' || caseRow.status === 'cancelled' || caseRow.status === 'rejected') {
      return;
    }

    const currentTasks = await db
      .select()
      .from(caseTasks)
      .where(and(eq(caseTasks.caseId, caseRow.id), eq(caseTasks.stageKey, caseRow.stageKey)));

    const active = currentTasks.filter((task) =>
      ['pending', 'claimed', 'waiting_info'].includes(task.status),
    );
    if (active.some((task) => task.kind === 'info')) {
      await db
        .update(cases)
        .set({ status: 'on_hold', updatedAt: new Date() })
        .where(and(eq(cases.id, caseRow.id), eq(cases.tenantId, input.tenantId)));
      await syncCaseDue(db, input.tenantId, caseRow.id);
      return;
    }
    if (active.length) {
      await db
        .update(cases)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(and(eq(cases.id, caseRow.id), eq(cases.tenantId, input.tenantId)));
      await syncCaseDue(db, input.tenantId, caseRow.id);
      return;
    }

    const currentStage = stageOf(input.definition, caseRow.stageKey);
    const transitions = currentStage?.transitions ?? [];
    let next: StageDef | undefined;

    if (transitions.length) {
      const transition = transitionForStage(input.definition, currentStage!, caseRow.data);
      if (!transition || transition.type === 'end') {
        await completeCase(db, {
          tenantId: input.tenantId,
          caseRow,
          actorId: input.actorId,
          definition: input.definition,
        });
        return;
      }
      if (transition.type === 'case_type') {
        await startLinkedCase(db, {
          tenantId: input.tenantId,
          caseRow,
          transition,
          actorId: input.actorId,
        });
        return;
      }
      next = transition.stageKey
        ? input.definition.stages.find((stage) => stage.key === transition.stageKey)
        : undefined;
      if (!next) {
        throw badRequest(`مرحله مقصد در مسیر خروج «${currentStage?.name ?? caseRow.stageName}» پیدا نشد.`);
      }
    } else {
      next = nextStageOf(input.definition, caseRow.stageKey);
      if (!next) {
        await completeCase(db, {
          tenantId: input.tenantId,
          caseRow,
          actorId: input.actorId,
          definition: input.definition,
        });
        return;
      }
    }

    await db
      .update(cases)
      .set({
        stageKey: next.key,
        stageName: next.name,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(and(eq(cases.id, caseRow.id), eq(cases.tenantId, input.tenantId)));
    await addCaseEvent(db, {
      tenantId: input.tenantId,
      caseId: caseRow.id,
      type: 'stage.entered',
      actorId: input.actorId,
      data: { stageKey: next.key, stageName: next.name },
    });
    const updatedCase = { ...caseRow, stageKey: next.key, stageName: next.name };
    const created = await createTasksForStage(db, {
      tenantId: input.tenantId,
      caseRow: updatedCase,
      definition: input.definition,
      stage: next,
      actorId: input.actorId,
    });
    if (created.length) {
      await syncCaseDue(db, input.tenantId, caseRow.id);
      return;
    }
  }
  throw new AppError(500, 'فرآیند در حلقه مراحل بدون کار متوقف شد.', 'WORKFLOW_LOOP');
}

export async function requiredDocumentsForTask(
  definition: CaseTypeDefinition,
  stageKey: string,
  taskDef: TaskDef | undefined,
): Promise<{ key: string; name: string }[]> {
  const required = new Map<string, { key: string; name: string }>();
  for (const document of definition.documents ?? []) {
    if (document.required && (!document.stageKey || document.stageKey === stageKey)) {
      required.set(document.key, { key: document.key, name: document.name });
    }
  }
  for (const key of taskDef?.requiredDocuments ?? []) {
    const document = (definition.documents ?? []).find((item) => item.key === key);
    required.set(key, { key, name: document?.name ?? key });
  }
  return [...required.values()];
}

export async function activateWaitingInfoTasks(
  db: DbLike,
  caseId: string,
): Promise<void> {
  await db
    .update(caseTasks)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(
      and(
        eq(caseTasks.caseId, caseId),
        eq(caseTasks.status, 'waiting_info'),
        isNull(caseTasks.completedAt),
      ),
    );
}
