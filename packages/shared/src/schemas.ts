import { z } from 'zod';
import {
  CASE_STATUSES,
  FIELD_TYPES,
  FIELD_WIDTHS,
  ROLE_PERMISSIONS,
  ROLLUP_OPS,
  TASK_OUTCOMES,
  TASK_STATUSES,
} from './types.js';
import type { FieldDef } from './types.js';

export const fieldTypeSchema = z.enum(FIELD_TYPES);

export const selectOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const rollupSchema = z.object({
  sourceTypeKey: z.string().min(1).max(60),
  referenceField: z.string().min(1).max(60),
  valueField: z.string().max(60).optional(),
  op: z.enum(ROLLUP_OPS),
});

export const fieldDefSchema: z.ZodType<FieldDef> = z.lazy(() =>
  z.object({
    key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید فیلد باید با حرف شروع شود'),
    label: z.string().min(1),
    type: fieldTypeSchema,
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    help: z.string().optional(),
    section: z.string().max(80).optional(),
    width: z.enum(FIELD_WIDTHS).optional(),
    readonly: z.boolean().optional(),
    hidden: z.boolean().optional(),
    unique: z.boolean().optional(),
    locked: z.boolean().optional(),
    options: z.array(selectOptionSchema).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    masterTypeKey: z.string().max(60).optional(),
    rollup: rollupSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    columns: z.array(fieldDefSchema).optional(),
    minRows: z.number().int().min(0).optional(),
    maxRows: z.number().int().min(1).optional(),
    addLabel: z.string().max(80).optional(),
  }),
);

export const roleKeySchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, 'کلید نقش باید با حرف لاتین کوچک شروع شود.');

export const rolePermissionSchema = z.enum(ROLE_PERMISSIONS);

export const createRoleSchema = z.object({
  key: roleKeySchema,
  name: z.string().min(2).max(80),
  description: z.string().max(300).optional().default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'رنگ نقش باید به شکل #RRGGBB باشد.')
    .optional(),
  permissions: z.array(rolePermissionSchema).optional().default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(300).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'رنگ نقش باید به شکل #RRGGBB باشد.')
    .optional(),
  permissions: z.array(rolePermissionSchema).optional(),
});

export const stagePermissionsSchema = z.object({
  editRoles: z.array(z.string().min(1).max(60)).optional(),
  uploadRoles: z.array(z.string().min(1).max(60)).optional(),
});

export const assigneeSchema = z.object({
  type: z.enum(['role', 'user', 'creator', 'manager']),
  value: z.string().optional(),
});

export const selectionCopySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const taskSelectionSchema = z.object({
  sourceField: z.string().min(1),
  labelColumn: z.string().min(1).optional(),
  copy: z.array(selectionCopySchema).optional(),
});

export const taskDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید کار باید با حرف شروع شود'),
  name: z.string().min(1),
  description: z.string().optional(),
  assignee: assigneeSchema,
  dueInHours: z.number().positive().optional(),
  formFields: z.array(z.string()).optional(),
  condition: conditionSchema.optional(),
  kind: z.enum(['approval', 'action', 'selection']).optional(),
  requiredDocuments: z.array(z.string()).optional(),
  selection: taskSelectionSchema.optional(),
});

export const stageTransitionSchema = z.object({
  label: z.string().max(120).optional(),
  condition: conditionSchema.optional(),
  type: z.enum(['stage', 'case_type', 'end']),
  stageKey: z.string().max(80).optional(),
  caseTypeKey: z.string().max(80).optional(),
});

export const stageDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید مرحله باید با حرف انگلیسی شروع شود.'),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  permissions: stagePermissionsSchema.optional(),
  fields: z.array(fieldDefSchema).optional(),
  transitions: z.array(stageTransitionSchema).optional(),
  tasks: z.array(taskDefSchema),
});

export const documentDefSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  required: z.boolean().optional(),
  stageKey: z.string().optional(),
});

export const notificationDefSchema = z.object({
  event: z.enum([
    'case.created',
    'task.assigned',
    'case.completed',
    'case.rejected',
    'sla.breached',
  ]),
  channels: z.array(z.enum(['inapp', 'email'])).optional(),
});

export const caseTypeSettingsSchema = z.object({
  titleField: z.string().optional(),
  descriptionField: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  formLayout: z.enum(['two-column', 'single-column']).optional(),
});

export const caseTypeDefinitionSchema = z.object({
  fields: z.array(fieldDefSchema),
  stages: z.array(stageDefSchema),
  documents: z.array(documentDefSchema).optional(),
  settings: caseTypeSettingsSchema.optional(),
  notifications: z.array(notificationDefSchema).optional(),
});

export const createCaseTypeSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().default(''),
  icon: z.string().min(1).default('file'),
  templateKey: z.string().optional(),
  referencePrefix: z.string().min(2).max(8).optional(),
  definition: caseTypeDefinitionSchema.optional(),
});

export const updateCaseTypeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().min(1).optional(),
  referencePrefix: z.string().min(2).max(8).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  definition: caseTypeDefinitionSchema.optional(),
});

export const createCaseSchema = z.object({
  caseTypeId: z.string().uuid(),
  title: z.string().max(200).optional(),
  data: z.record(z.unknown()).default({}),
});

export const updateCaseDataSchema = z.object({
  title: z.string().max(200).optional(),
  data: z.record(z.unknown()),
});

export const completeTaskSchema = z.object({
  data: z.record(z.unknown()).optional().default({}),
  comment: z.string().max(2000).optional(),
  selectionRowKey: z.string().max(200).optional(),
});

export const decisionSchema = z.object({
  comment: z.string().max(2000).optional(),
});

export const requestInfoSchema = z.object({
  comment: z.string().min(1).max(2000),
});

export const reassignSchema = z.object({
  userId: z.string().uuid(),
  comment: z.string().max(500).optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  jobTitle: z.string().max(100).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: roleKeySchema,
  jobTitle: z.string().max(100).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: roleKeySchema.optional(),
  isActive: z.boolean().optional(),
  jobTitle: z.string().max(100).optional(),
});

export const partySchema = z.object({
  kind: z.enum(['customer', 'supplier']),
  name: z.string().min(2).max(200),
  code: z.string().min(1).max(50),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
});

export const itemSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(2).max(200),
  unit: z.string().min(1).max(30).default('عدد'),
  category: z.string().max(100).optional(),
  unitCost: z.number().min(0).default(0),
  reorderPoint: z.number().min(0).default(0),
});

export const warehouseSchema = z.object({
  code: z.string().min(1).max(30),
  name: z.string().min(2).max(100),
  location: z.string().max(200).optional(),
});

export const masterDataTypeSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید نوع داده باید با حرف لاتین شروع شود.'),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  titleField: z.string().max(60).nullable().optional(),
  isHierarchical: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  fields: z.array(fieldDefSchema).min(1).max(100),
});

export const masterDataTypeUpdateSchema = masterDataTypeSchema
  .omit({ key: true })
  .partial();

export const masterDataRecordSchema = z.object({
  data: z.record(z.unknown()),
});

export const stockMovementSchema = z.object({
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.number().positive(),
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

export const taskListQuerySchema = z.object({
  scope: z.enum(['mine', 'available', 'all', 'completed']).optional().default('mine'),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
});

export const caseListQuerySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  type: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
});

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskOutcomeSchema = z.enum(TASK_OUTCOMES);
