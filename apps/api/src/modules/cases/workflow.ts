import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  evaluateCondition,
  nextWorkingHours,
  type CaseTypeDefinition,
  type StageDef,
  type TaskDef,
} from '@ravand/shared';
import type { DbLike } from '../../db/client.js';
import { caseTasks, caseTypeVersions, cases } from '../../db/schema.js';
import { addCaseEvent, writeAudit } from '../../lib/audit.js';
import { AppError, badRequest } from '../../lib/errors.js';
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
    return { assigneeId: id, candidateRole: null, notifyIds: id ? [id] : [] };
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

  for (const task of input.stage.tasks) {
    if (!evaluateCondition(task.condition, input.definition.fields, input.caseRow.data)) {
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
    if (resolved.notifyIds.length) {
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
  await notifyUsers(db, {
    tenantId: input.tenantId,
    userIds: [input.caseRow.createdBy],
    type: 'case.completed',
    title: `پرونده تکمیل شد: ${input.caseRow.title}`,
    body: input.caseRow.reference,
    link: `/cases/${input.caseRow.id}`,
  });
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
        .where(eq(cases.id, caseRow.id));
      await syncCaseDue(db, input.tenantId, caseRow.id);
      return;
    }
    if (active.length) {
      await db
        .update(cases)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(cases.id, caseRow.id));
      await syncCaseDue(db, input.tenantId, caseRow.id);
      return;
    }

    const next = nextStageOf(input.definition, caseRow.stageKey);
    if (!next) {
      await completeCase(db, {
        tenantId: input.tenantId,
        caseRow,
        actorId: input.actorId,
        definition: input.definition,
      });
      return;
    }

    await db
      .update(cases)
      .set({
        stageKey: next.key,
        stageName: next.name,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(cases.id, caseRow.id));
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
