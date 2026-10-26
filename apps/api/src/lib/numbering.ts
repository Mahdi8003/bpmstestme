import { sql } from 'drizzle-orm';
import type { DbLike } from '../db/client.js';
import { sequences } from '../db/schema.js';
import { formatReference, getJalaliYear } from '@ravand/shared';

export async function nextSequence(
  db: DbLike,
  tenantId: string,
  key: string,
  year: number,
): Promise<number> {
  const rows = await db
    .insert(sequences)
    .values({ tenantId, key, year, value: 1 })
    .onConflictDoUpdate({
      target: [sequences.tenantId, sequences.key, sequences.year],
      set: { value: sql`${sequences.value} + 1` },
    })
    .returning({ value: sequences.value });
  return rows[0]?.value ?? 1;
}

export async function createReference(
  db: DbLike,
  tenantId: string,
  prefix: string,
  year = getJalaliYear(),
): Promise<string> {
  const sequence = await nextSequence(db, tenantId, prefix, year);
  return formatReference(prefix, year, sequence);
}
