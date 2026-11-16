import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { hasPermission, type AuthContext } from './auth.js';
import { db } from '../db/client.js';
import { caseTasks, cases } from '../db/schema.js';
import { notFound } from './errors.js';

export function canSeeAllCases(auth: AuthContext): boolean {
  return hasPermission(auth, 'viewAllCases');
}

/**
 * SQL predicate that limits a `cases` query to records the caller participates in.
 * Returns undefined when the caller may see every case in the tenant.
 */
export function caseVisibilityFilter(auth: AuthContext): SQL | undefined {
  if (canSeeAllCases(auth)) return undefined;
  return or(
    eq(cases.createdBy, auth.userId),
    eq(cases.assigneeId, auth.userId),
    sql`exists (
      select 1 from case_tasks ct
      where ct.case_id = ${cases.id}
        and ct.tenant_id = ${auth.tenantId}
        and (ct.assignee_id = ${auth.userId} or ct.candidate_role = ${auth.user.role})
    )`,
  );
}

export async function assertCanViewCase(
  auth: AuthContext,
  caseRow: { id: string; createdBy: string; assigneeId: string | null },
): Promise<void> {
  if (canSeeAllCases(auth)) return;
  if (caseRow.createdBy === auth.userId || caseRow.assigneeId === auth.userId) return;
  const rows = await db
    .select({ id: caseTasks.id })
    .from(caseTasks)
    .where(
      and(
        eq(caseTasks.caseId, caseRow.id),
        eq(caseTasks.tenantId, auth.tenantId),
        or(
          eq(caseTasks.assigneeId, auth.userId),
          eq(caseTasks.candidateRole, auth.user.role),
        ),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound('پرونده پیدا نشد.');
}
