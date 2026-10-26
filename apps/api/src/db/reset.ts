import { pool } from './client.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

async function main(): Promise<void> {
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
