import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  CaseStatus,
  CaseTypeDefinition,
  CaseTypeStatus,
  CasePriority,
  RoleKey,
  TaskKind,
  TaskOutcome,
  TaskStatus,
} from '@ravand/shared';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tenants_slug_unique').on(table.slug)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: text('role').$type<RoleKey>().notNull().default('member'),
    jobTitle: text('job_title'),
    avatarColor: text('avatar_color').notNull().default('#1E3A5F'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    index('users_tenant_idx').on(table.tenantId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
  ],
);

export const caseTypes = pgTable(
  'case_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('file'),
    referencePrefix: text('reference_prefix').notNull().default('CASE'),
    status: text('status').$type<CaseTypeStatus>().notNull().default('draft'),
    definition: jsonb('definition').$type<CaseTypeDefinition>().notNull(),
    version: integer('version').notNull().default(0),
    publishedVersionId: uuid('published_version_id'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('case_types_tenant_key_unique').on(table.tenantId, table.key),
    index('case_types_tenant_status_idx').on(table.tenantId, table.status),
  ],
);

export const caseTypeVersions = pgTable(
  'case_type_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseTypeId: uuid('case_type_id')
      .notNull()
      .references(() => caseTypes.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    definition: jsonb('definition').$type<CaseTypeDefinition>().notNull(),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('case_type_versions_unique').on(table.caseTypeId, table.version),
    index('case_type_versions_tenant_idx').on(table.tenantId),
  ],
);

export const cases = pgTable(
  'cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    caseTypeId: uuid('case_type_id')
      .notNull()
      .references(() => caseTypes.id, { onDelete: 'restrict' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => caseTypeVersions.id, { onDelete: 'restrict' }),
    reference: text('reference').notNull(),
    title: text('title').notNull(),
    status: text('status').$type<CaseStatus>().notNull().default('in_progress'),
    stageKey: text('stage_key').notNull(),
    stageName: text('stage_name').notNull(),
    priority: text('priority').$type<CasePriority>().notNull().default('normal'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cases_tenant_reference_unique').on(table.tenantId, table.reference),
    index('cases_tenant_status_idx').on(table.tenantId, table.status),
    index('cases_tenant_type_idx').on(table.tenantId, table.caseTypeId),
    index('cases_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export const caseTasks = pgTable(
  'case_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    stageKey: text('stage_key').notNull(),
    taskKey: text('task_key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').$type<TaskStatus>().notNull().default('pending'),
    kind: text('kind').$type<TaskKind>().notNull().default('action'),
    outcome: text('outcome').$type<TaskOutcome>(),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    candidateRole: text('candidate_role'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('case_tasks_case_idx').on(table.caseId),
    index('case_tasks_tenant_assignee_status_idx').on(
      table.tenantId,
      table.assigneeId,
      table.status,
    ),
    index('case_tasks_tenant_role_status_idx').on(
      table.tenantId,
      table.candidateRole,
      table.status,
    ),
    index('case_tasks_tenant_due_idx').on(table.tenantId, table.dueAt),
  ],
);

export const caseEvents = pgTable(
  'case_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('case_events_case_created_idx').on(table.caseId, table.createdAt)],
);

export const caseComments = pgTable(
  'case_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => caseTasks.id, { onDelete: 'set null' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('case_comments_case_idx').on(table.caseId, table.createdAt)],
);

export const caseDocuments = pgTable(
  'case_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => caseTasks.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    documentKey: text('document_key'),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storagePath: text('storage_path').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('case_documents_case_idx').on(table.caseId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_read_idx').on(table.tenantId, table.userId, table.readAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt)],
);

export const sequences = pgTable(
  'sequences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    year: integer('year').notNull(),
    value: integer('value').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.key, table.year] })],
);

export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'customer' | 'supplier'>().notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    email: text('email'),
    phone: text('phone'),
    taxId: text('tax_id'),
    address: text('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('parties_tenant_code_unique').on(table.tenantId, table.code),
    index('parties_tenant_kind_idx').on(table.tenantId, table.kind),
  ],
);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    unit: text('unit').notNull().default('عدد'),
    category: text('category'),
    unitCost: numeric('unit_cost', { precision: 18, scale: 2 }).notNull().default('0'),
    reorderPoint: numeric('reorder_point', { precision: 18, scale: 4 }).notNull().default('0'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('items_tenant_sku_unique').on(table.tenantId, table.sku),
    index('items_tenant_name_idx').on(table.tenantId, table.name),
  ],
);

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    location: text('location'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('warehouses_tenant_code_unique').on(table.tenantId, table.code)],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    type: text('type').$type<'in' | 'out' | 'adjust'>().notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    reference: text('reference'),
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('stock_movements_tenant_item_idx').on(table.tenantId, table.itemId),
    index('stock_movements_tenant_warehouse_idx').on(table.tenantId, table.warehouseId),
  ],
);
