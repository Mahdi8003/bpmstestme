import 'dotenv/config';
import pg from 'pg';
import { env } from '../env.js';

const { Client } = pg;

function databaseName(url: string): string {
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

async function main(): Promise<void> {
  const target = databaseName(env.DATABASE_URL);
  if (!/^[a-zA-Z0-9_]+$/.test(target)) {
    throw new Error('نام دیتابیس فقط می‌تواند شامل حروف، عدد و زیرخط باشد.');
  }

  const adminUrl = new URL(env.DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      target,
    ]);
    if (existing.rowCount) {
      console.log(`دیتابیس «${target}» از قبل وجود دارد.`);
      return;
    }
    await client.query(`CREATE DATABASE "${target}"`);
    console.log(`دیتابیس «${target}» ساخته شد.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
