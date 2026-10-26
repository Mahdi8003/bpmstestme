import { z } from 'zod';
import {
  CASE_STATUSES,
  FIELD_TYPES,
  FIELD_WIDTHS,
  ROLE_KEYS,
  TASK_OUTCOMES,
  TASK_STATUSES,
} from './types.js';

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

export const fieldDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید فیلد باید با حرف شروع شود'),
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  section: z.string().max(80).optional(),
  width: z.enum(FIELD_WIDTHS).optional(),
  readonly: z.boolean().optional(),
  options: z.array(selectOptionSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  visibleWhen: conditionSchema.optional(),
});

export const stagePermissionsSchema = z.object({
  editRoles: z.array(z.enum(ROLE_KEYS)).optional(),
  uploadRoles: z.array(z.enum(ROLE_KEYS)).optional(),
});

export const assigneeSchema = z.object({
  type: z.enum(['role', 'user', 'creator', 'manager']),
  value: z.string().optional(),
});

export const taskDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید کار باید با حرف شروع شود'),
  name: z.string().min(1),
  description: z.string().optional(),
  assignee: assigneeSchema,
  dueInHours: z.number().positive().optional(),
  formFields: z.array(z.string()).optional(),
  condition: conditionSchema.optional(),
  kind: z.enum(['approval', 'action']).optional(),
  requiredDocuments: z.array(z.string()).optional(),
});

export const stageDefSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'کلید مرحله باید با حرف شروع شود'),
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  permissions: stagePermissionsSchema.optional(),
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
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(ROLE_KEYS),
  jobTitle: z.string().max(100).optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(ROLE_KEYS).optional(),
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
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(100),
});

export const caseListQuerySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  type: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(100),
});

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskOutcomeSchema = z.enum(TASK_OUTCOMES);
