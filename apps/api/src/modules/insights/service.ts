import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { InsightsDto, InsightTypeRow } from '@ravand/shared';
import { db } from '../../db/client.js';
import { caseTasks, caseTypes, cases } from '../../db/schema.js';
import type { AuthContext } from '../../lib/auth.js';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function weeklySeries(
  tenantId: string,
): Promise<{ day: string; created: number; completed: number }[]> {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - 6);
  const createdRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${cases.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(cases)
    .where(and(eq(cases.tenantId, tenantId), sql`${cases.createdAt} >= ${start}`))
    .groupBy(sql`date_trunc('day', ${cases.createdAt})`);
  const completedRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${cases.completedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(cases)
    .where(
      and(
        eq(cases.tenantId, tenantId),
        eq(cases.status, 'completed'),
        sql`${cases.completedAt} >= ${start}`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${cases.completedAt})`);
  const createdMap = new Map(createdRows.map((row) => [row.day, Number(row.count)]));
  const completedMap = new Map(completedRows.map((row) => [row.day, Number(row.count)]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      created: createdMap.get(day) ?? 0,
      completed: completedMap.get(day) ?? 0,
    };
  });
}

export async function getInsights(auth: AuthContext): Promise<InsightsDto> {
  const [caseRows, typeRows, statusRows, outcomeRows, overdueRows, totalTasksRows, weekly] =
    await Promise.all([
      db
        .select({
          caseTypeId: cases.caseTypeId,
          status: cases.status,
          createdAt: cases.createdAt,
          completedAt: cases.completedAt,
        })
        .from(cases)
        .where(eq(cases.tenantId, auth.tenantId)),
      db
        .select({
          id: caseTypes.id,
          name: caseTypes.name,
          icon: caseTypes.icon,
          status: caseTypes.status,
        })
        .from(caseTypes)
        .where(eq(caseTypes.tenantId, auth.tenantId)),
      db
        .select({ status: cases.status, count: sql<number>`count(*)::int` })
        .from(cases)
        .where(eq(cases.tenantId, auth.tenantId))
        .groupBy(cases.status),
      db
        .select({ outcome: caseTasks.outcome, count: sql<number>`count(*)::int` })
        .from(caseTasks)
        .where(
          and(
            eq(caseTasks.tenantId, auth.tenantId),
            eq(caseTasks.status, 'completed'),
            sql`${caseTasks.outcome} is not null`,
          ),
        )
        .groupBy(caseTasks.outcome),
      db
        .select({
          caseTypeId: cases.caseTypeId,
          count: sql<number>`count(*)::int`,
        })
        .from(caseTasks)
        .innerJoin(cases, eq(cases.id, caseTasks.caseId))
        .where(
          and(
            eq(caseTasks.tenantId, auth.tenantId),
            inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
            lte(caseTasks.dueAt, new Date()),
          ),
        )
        .groupBy(cases.caseTypeId),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(caseTasks)
        .where(eq(caseTasks.tenantId, auth.tenantId)),
      weeklySeries(auth.tenantId),
    ]);

  const overdueMap = new Map(overdueRows.map((row) => [row.caseTypeId, Number(row.count)]));
  const typeStats: InsightTypeRow[] = typeRows.map((type) => {
    const typeCases = caseRows.filter((row) => row.caseTypeId === type.id);
    const completed = typeCases.filter((row) => row.status === 'completed');
    const open = typeCases.filter((row) =>
      ['in_progress', 'on_hold'].includes(row.status),
    ).length;
    const cycleHours = completed
      .map((row) =>
        row.completedAt ? (row.completedAt.getTime() - row.createdAt.getTime()) / 3_600_000 : null,
      )
      .filter((value): value is number => value !== null && Number.isFinite(value));
    return {
      id: type.id,
      name: type.name,
      icon: type.icon,
      status: type.status,
      total: typeCases.length,
      open,
      completed: completed.length,
      avgCycleHours:
        cycleHours.length > 0
          ? Math.round((cycleHours.reduce((sum, value) => sum + value, 0) / cycleHours.length) * 10) /
            10
          : 0,
      overdueTasks: overdueMap.get(type.id) ?? 0,
    };
  });

  return {
    statusBreakdown: statusRows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    })),
    taskOutcomes: outcomeRows
      .filter((row) => row.outcome)
      .map((row) => ({ outcome: row.outcome as string, count: Number(row.count) })),
    types: typeStats.sort((a, b) => b.total - a.total),
    weekly,
    totalCases: caseRows.length,
    totalTasks: Number(totalTasksRows[0]?.count ?? 0),
  };
}
