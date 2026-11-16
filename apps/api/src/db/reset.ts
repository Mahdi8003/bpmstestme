import { env } from '../env.js';
import { pool } from './client.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'db:reset is destructive and is disabled in production. Use migrations and an explicit maintenance procedure instead.',
    );
  }
  if (!['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('db:reset is only allowed in development or test environments.');
  }
  console.log('در حال پاک‌سازی Schema عمومی...');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runMigrations();
  await seed();
  console.log('دیتابیس با داده نمایشی بازسازی شد.');
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
