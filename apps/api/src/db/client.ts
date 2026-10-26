import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = Db | Tx;

export async function closeDb(): Promise<void> {
  await pool.end();
}
