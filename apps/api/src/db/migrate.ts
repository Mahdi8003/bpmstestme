import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './client.js';
import { tenants } from './schema.js';
import { ensureBuiltInRoles } from '../modules/roles/service.js';
import { ensureMasterTypes } from '../modules/master-data/service.js';

export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
  const tenantRows = await db.select({ id: tenants.id }).from(tenants);
  for (const tenant of tenantRows) {
    await ensureBuiltInRoles(tenant.id);
    await ensureMasterTypes(tenant.id);
  }
  console.log('مایگریشن‌های پایگاه داده با موفقیت اجرا شد.');
}

const isMain = process.argv[1]
  ?.replace(/\\/g, '/')
  .match(/\/(src|dist)\/db\/migrate\.(ts|js)$/);

if (isMain) {
  runMigrations()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
