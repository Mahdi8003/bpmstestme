import type { CaseTypeDefinition, TaskDto } from '@ravand/shared';
import type { AuthContext } from '../../lib/auth.js';
import type { CaseRow, TaskRow } from './workflow.js';
import { stageOf, taskDefOf } from './workflow.js';

const ACTIVE = new Set(['pending', 'claimed', 'waiting_info']);

export function taskDto(
  task: TaskRow,
  caseRow: CaseRow,
  definition: CaseTypeDefinition,
  caseTypeName: string,
  caseTypeIcon: string,
  assigneeName: string | null,
  auth: AuthContext,
): TaskDto {
  const active = ACTIVE.has(task.status);
  const isAdmin = auth.user.role === 'admin';
  const assignedToMe = task.assigneeId === auth.userId;
  const availableToRole =
    !task.assigneeId && task.candidateRole !== null && task.candidateRole === auth.user.role;
  const canAct = active && (isAdmin || assignedToMe || availableToRole);
  const canClaim = active && !task.assigneeId && (isAdmin || availableToRole);
  const stage = stageOf(definition, task.stageKey);
  const taskDef = taskDefOf(definition, task.stageKey, task.taskKey);

  return {
    id: task.id,
    caseId: task.caseId,
    caseReference: caseRow.reference,
    caseTitle: caseRow.title,
    caseTypeName,
    caseTypeIcon,
    stageKey: task.stageKey,
    stageName: stage?.name ?? task.stageKey,
    taskKey: task.taskKey,
    name: task.name,
    description: task.description,
    status: task.status,
    kind: task.kind,
    outcome: task.outcome,
    assigneeId: task.assigneeId,
    assigneeName,
    candidateRole: task.candidateRole,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    data: task.data,
    formFields: taskDef?.formFields ?? [],
    requiredDocuments: taskDef?.requiredDocuments ?? [],
    canAct,
    canClaim,
  };
}
