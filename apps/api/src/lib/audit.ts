import type { DbLike } from '../db/client.js';
import { auditLogs, caseEvents } from '../db/schema.js';

export async function writeAudit(
  db: DbLike,
  input: {
    tenantId: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
  });
}

export async function addCaseEvent(
  db: DbLike,
  input: {
    tenantId: string;
    caseId: string;
    type: string;
    actorId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(caseEvents).values({
    tenantId: input.tenantId,
    caseId: input.caseId,
    type: input.type,
    actorId: input.actorId ?? null,
    data: input.data ?? {},
  });
}
