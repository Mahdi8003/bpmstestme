import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { CaseListItem, DashboardDto, TaskDto } from '@ravand/shared';
import { db } from '../../db/client.js';
import { caseTasks, caseTypes, cases } from '../../db/schema.js';
import type { AuthContext } from '../../lib/auth.js';
import { activeTasksForUser, listCases } from '../cases/service.js';
import { listTasks } from '../tasks/service.js';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
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
    .where(and(eq(cases.tenantId, tenantId), gte(cases.createdAt, start)))
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
        gte(cases.completedAt, start),
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

export async function getDashboard(auth: AuthContext): Promise<DashboardDto> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeStatuses = ['in_progress', 'on_hold'] as const;

  const [openRows, dueRows, completedRows, cycleRows, overdueRows, typeRows, recentCases, weekly] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.tenantId, auth.tenantId),
            inArray(cases.status, [...activeStatuses]),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.tenantId, auth.tenantId),
            inArray(cases.status, [...activeStatuses]),
            lte(cases.dueAt, endOfDay(now)),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.tenantId, auth.tenantId),
            eq(cases.status, 'completed'),
            gte(cases.completedAt, monthStart),
          ),
        ),
      db
        .select({
          hours: sql<number>`coalesce(avg(extract(epoch from (${cases.completedAt} - ${cases.createdAt})) / 3600), 0)::float`,
        })
        .from(cases)
        .where(
          and(eq(cases.tenantId, auth.tenantId), eq(cases.status, 'completed')),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(caseTasks)
        .where(
          and(
            eq(caseTasks.tenantId, auth.tenantId),
            inArray(caseTasks.status, ['pending', 'claimed', 'waiting_info']),
            lte(caseTasks.dueAt, now),
          ),
        ),
      db
        .select({
          name: caseTypes.name,
          icon: caseTypes.icon,
          count: sql<number>`count(${cases.id})::int`,
        })
        .from(caseTypes)
        .leftJoin(
          cases,
          and(
            eq(cases.caseTypeId, caseTypes.id),
            inArray(cases.status, [...activeStatuses]),
          ),
        )
        .where(eq(caseTypes.tenantId, auth.tenantId))
        .groupBy(caseTypes.id, caseTypes.name, caseTypes.icon)
        .orderBy(sql`count(${cases.id}) desc`),
      listCases(auth, { limit: 6 }),
      weeklySeries(auth.tenantId),
    ]);

  let myTasks: TaskDto[];
  if (auth.user.role === 'admin') {
    myTasks = await listTasks(auth, { scope: 'all', limit: 8 });
  } else {
    myTasks = await activeTasksForUser(auth, 8);
  }

  return {
    metrics: {
      openCases: Number(openRows[0]?.count ?? 0),
      dueToday: Number(dueRows[0]?.count ?? 0),
      completedThisMonth: Number(completedRows[0]?.count ?? 0),
      avgCycleHours: Math.round(Number(cycleRows[0]?.hours ?? 0) * 10) / 10,
      overdueTasks: Number(overdueRows[0]?.count ?? 0),
    },
    myTasks,
    recentCases: recentCases as CaseListItem[],
    typeBreakdown: typeRows.map((row) => ({
      name: row.name,
      icon: row.icon,
      count: Number(row.count),
    })),
    weekly,
  };
}

export async function getRecentActivity(auth: AuthContext): Promise<CaseListItem[]> {
  return listCases(auth, { limit: 8 });
}
