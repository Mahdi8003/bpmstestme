import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './client.js';

export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
  console.log('مهاجرت‌های دیتابیس با موفقیت اجرا شدند.');
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('src/db/migrate.ts');

if (isMain) {
  runMigrations()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
