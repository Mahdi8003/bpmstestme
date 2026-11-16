export const ROLE_KEYS = [
  'admin',
  'builder',
  'manager',
  'finance',
  'procurement',
  'warehouse',
  'member',
] as const;

/** Built-in role keys; tenants may define additional custom roles. */
export type BuiltinRoleKey = (typeof ROLE_KEYS)[number];

/** Role keys are tenant-defined strings. Built-in keys always exist. */
export type RoleKey = string;

export const ROLE_LABELS: Record<string, string> = {
  admin: 'مدیر سیستم',
  builder: 'طراح فرآیند',
  manager: 'مدیر',
  finance: 'مالی',
  procurement: 'تدارکات',
  warehouse: 'انبار',
  member: 'کارشناس',
};

export const ROLE_PERMISSIONS = [
  'buildProcesses',
  'viewAllCases',
  'manageUsers',
  'manageRoles',
  'manageMasterData',
  'reassignTasks',
] as const;

export type RolePermission = (typeof ROLE_PERMISSIONS)[number];

export const ROLE_PERMISSION_LABELS: Record<RolePermission, string> = {
  buildProcesses: 'ساخت و ویرایش فرآیندها',
  viewAllCases: 'مشاهدهٔ همهٔ پرونده‌ها',
  manageUsers: 'مدیریت کاربران',
  manageRoles: 'تعریف و ویرایش نقش‌ها',
  manageMasterData: 'مدیریت داده‌های پایه',
  reassignTasks: 'واگذاری کار دیگران',
};

export const ROLE_PERMISSION_HINTS: Record<RolePermission, string> = {
  buildProcesses: 'دسترسی به سازندهٔ فرآیند و امکان ساخت فرآیند جدید.',
  viewAllCases: 'مشاهدهٔ پرونده‌های همهٔ همکاران، نه فقط پرونده‌های مرتبط با خود.',
  manageUsers: 'ساخت و ویرایش کاربران و بازنشانی رمز عبور.',
  manageRoles: 'تعریف نقش جدید و تغییر دسترسی نقش‌های سازمان.',
  manageMasterData: 'ویرایش طرف‌حساب‌ها، کالاها، انبارها و داده‌های سفارشی.',
  reassignTasks: 'واگذاری کارهای در جریان به کاربران دیگر.',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermission[]> = {
  admin: [...ROLE_PERMISSIONS],
  builder: [
    'buildProcesses',
    'viewAllCases',
    'manageMasterData',
    'reassignTasks',
  ],
  manager: [
    'buildProcesses',
    'viewAllCases',
    'manageMasterData',
    'reassignTasks',
  ],
  finance: [],
  procurement: ['manageMasterData'],
  warehouse: ['manageMasterData'],
  member: [],
};

export const NON_ADMIN_ROLES: RoleKey[] = [
  'builder',
  'manager',
  'finance',
  'procurement',
  'warehouse',
  'member',
];

export const CASE_STATUSES = [
  'in_progress',
  'on_hold',
  'completed',
  'rejected',
  'cancelled',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  in_progress: 'در جریان',
  on_hold: 'در انتظار اطلاعات',
  completed: 'تکمیل‌شده',
  rejected: 'ردشده',
  cancelled: 'لغوشده',
};

export const TASK_STATUSES = [
  'pending',
  'claimed',
  'waiting_info',
  'completed',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'در انتظار اقدام',
  claimed: 'در حال بررسی',
  waiting_info: 'در انتظار اطلاعات',
  completed: 'انجام‌شده',
  cancelled: 'لغوشده',
};

export const TASK_KINDS = ['approval', 'action', 'info', 'selection'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_OUTCOMES = [
  'approved',
  'rejected',
  'returned',
  'completed',
  'info_requested',
] as const;

export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'select',
  'radio',
  'multiselect',
  'checkbox',
  'email',
  'phone',
  'url',
  'party',
  'item',
  'warehouse',
  'user',
  'master',
  'rollup',
  'table',
  'file',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'متن کوتاه',
  textarea: 'متن بلند',
  number: 'عدد',
  currency: 'مبلغ',
  date: 'تاریخ',
  select: 'انتخابی (لیست)',
  radio: 'انتخابی (دکمه‌ای)',
  multiselect: 'چندانتخابی',
  checkbox: 'بله / خیر',
  email: 'ایمیل',
  phone: 'تلفن',
  url: 'نشانی وب',
  party: 'طرف حساب',
  item: 'کالا',
  warehouse: 'انبار',
  user: 'کاربر',
  master: 'داده پایه سفارشی',
  rollup: 'محاسبه‌شده از داده دیگر',
  table: 'جدول چندردیفی',
  file: 'فایل پیوست',
};

export const FIELD_WIDTHS = ['full', 'half', 'third'] as const;
export type FieldWidth = (typeof FIELD_WIDTHS)[number];

export const FIELD_WIDTH_LABELS: Record<FieldWidth, string> = {
  full: 'تمام عرض',
  half: 'نیم‌عرض',
  third: 'یک‌سوم عرض',
};

export interface SelectOption {
  label: string;
  value: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  section?: string;
  width?: FieldWidth;
  readonly?: boolean;
  /** When true the field is kept in case data but hidden from forms. */
  hidden?: boolean;
  /** Values of this field must be unique among the records of its data type. */
  unique?: boolean;
  /** Built-in field of a system data type: label and options can change, key/type cannot. */
  locked?: boolean;
  options?: SelectOption[];
  min?: number;
  max?: number;
  masterTypeKey?: string;
  /** Configuration of a `rollup` field: an aggregate computed from another data type. */
  rollup?: RollupDef;
  visibleWhen?: Condition;
  /** Column definitions for the `table` field type. Each column is a regular field. */
  columns?: FieldDef[];
  minRows?: number;
  maxRows?: number;
  addLabel?: string;
}

export const ROLLUP_OPS = ['sum', 'count', 'avg', 'min', 'max'] as const;

export type RollupOp = (typeof ROLLUP_OPS)[number];

export const ROLLUP_OP_LABELS: Record<RollupOp, string> = {
  sum: 'جمع',
  count: 'تعداد',
  avg: 'میانگین',
  min: 'کمینه',
  max: 'بیشینه',
};

/**
 * A value computed from the records of another data type. For example the total
 * amount of payments that point to an invoice, or the stock of an item.
 */
export interface RollupDef {
  /** Key of the data type that holds the source records. */
  sourceTypeKey: string;
  /** Field of the source type that points back to this record. */
  referenceField: string;
  /** Field of the source type that is aggregated (not needed for `count`). */
  valueField?: string;
  op: RollupOp;
}

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

export interface Condition {
  field: string;
  op: ConditionOp;
  value: string | number | boolean;
}

export type AssigneeType = 'role' | 'user' | 'creator' | 'manager';

export interface AssigneeDef {
  type: AssigneeType;
  value?: string;
}

export type TaskKindDef = 'approval' | 'action' | 'selection';

export interface SelectionCopy {
  from: string;
  to: string;
}

/**
 * Configuration for a `selection` task: the assignee picks one row of a table
 * field and the chosen values are copied into regular case fields.
 */
export interface TaskSelectionDef {
  sourceField: string;
  labelColumn?: string;
  copy?: SelectionCopy[];
}

export interface TaskDef {
  key: string;
  name: string;
  description?: string;
  assignee: AssigneeDef;
  dueInHours?: number;
  formFields?: string[];
  condition?: Condition;
  kind?: TaskKindDef;
  requiredDocuments?: string[];
  selection?: TaskSelectionDef;
}

export interface StagePermissions {
  editRoles?: RoleKey[];
  uploadRoles?: RoleKey[];
}

export type StageTransitionType = 'stage' | 'case_type' | 'end';

export interface StageTransition {
  label?: string;
  condition?: Condition;
  type: StageTransitionType;
  stageKey?: string;
  caseTypeKey?: string;
}

export interface StageDef {
  key: string;
  name: string;
  description?: string;
  color?: string;
  permissions?: StagePermissions;
  fields?: FieldDef[];
  transitions?: StageTransition[];
  tasks: TaskDef[];
}

export interface DocumentDef {
  key: string;
  name: string;
  required?: boolean;
  stageKey?: string;
}

export type NotificationEvent =
  | 'case.created'
  | 'task.assigned'
  | 'case.completed'
  | 'case.rejected'
  | 'sla.breached';

export interface NotificationDef {
  event: NotificationEvent;
  channels?: ('inapp' | 'email')[];
}

export interface CaseTypeSettings {
  titleField?: string;
  descriptionField?: string;
  priority?: 'low' | 'normal' | 'high';
  formLayout?: 'two-column' | 'single-column';
}

export interface CaseTypeDefinition {
  fields: FieldDef[];
  stages: StageDef[];
  documents?: DocumentDef[];
  settings?: CaseTypeSettings;
  notifications?: NotificationDef[];
}

export type CaseTypeStatus = 'draft' | 'published' | 'archived';

export type CasePriority = 'low' | 'normal' | 'high';

export interface HealthIssue {
  level: 'error' | 'warning';
  message: string;
  path?: string;
}

export interface HealthResult {
  ok: boolean;
  issues: HealthIssue[];
}

export interface ValidationIssue {
  field?: string;
  message: string;
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  isSystem: boolean;
  permissions: RolePermission[];
  userCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  roleName?: string;
  permissions?: RolePermission[];
  jobTitle: string | null;
  avatarColor: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AuthSession {
  user: UserSummary;
  tenant: TenantSummary;
}

export interface CaseTypeSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  referencePrefix: string;
  status: CaseTypeStatus;
  version: number;
  caseCount: number;
  hasDraftChanges: boolean;
  updatedAt: string;
  publishedAt: string | null;
  ownerId: string | null;
  ownerName?: string | null;
}

export interface CaseTypeDetail extends CaseTypeSummary {
  definition: CaseTypeDefinition;
}

export interface CaseListItem {
  id: string;
  reference: string;
  title: string;
  status: CaseStatus;
  stageKey: string;
  stageName: string;
  caseTypeId: string;
  caseTypeName: string;
  caseTypeIcon: string;
  priority: CasePriority;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  assigneeName: string | null;
}

export interface TaskDto {
  id: string;
  caseId: string;
  caseReference: string;
  caseTitle: string;
  caseTypeName: string;
  caseTypeIcon: string;
  stageKey: string;
  stageName: string;
  taskKey: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  kind: TaskKind;
  outcome: TaskOutcome | null;
  assigneeId: string | null;
  assigneeName: string | null;
  candidateRole: string | null;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  data: Record<string, unknown>;
  formFields: string[];
  requiredDocuments: string[];
  selection?: TaskSelectionDef;
  canAct: boolean;
  canClaim: boolean;
}

export interface TaskDetailDto {
  task: TaskDto;
  case: CaseDetail;
}

export interface CommentDto {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface DocumentDto {
  id: string;
  name: string;
  documentKey: string | null;
  mimeType: string;
  size: number;
  uploadedByName: string | null;
  createdAt: string;
}

export interface EventDto {
  id: string;
  type: string;
  actorName: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface CaseLink {
  id: string;
  reference: string;
  title: string;
  status: CaseStatus;
  caseTypeName: string;
  caseTypeIcon: string;
  createdAt: string;
  stageName: string;
}

export interface CaseDetail extends CaseListItem {
  data: Record<string, unknown>;
  createdBy: string;
  completedAt: string | null;
  version: number;
  definition: CaseTypeDefinition;
  tasks: TaskDto[];
  comments: CommentDto[];
  documents: DocumentDto[];
  events: EventDto[];
  parentCase: CaseLink | null;
  childCases: CaseLink[];
  canEdit: boolean;
  canUpload: boolean;
  canCancel: boolean;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DashboardDto {
  metrics: {
    openCases: number;
    dueToday: number;
    completedThisMonth: number;
    avgCycleHours: number;
    overdueTasks: number;
  };
  myTasks: TaskDto[];
  recentCases: CaseListItem[];
  typeBreakdown: { name: string; count: number; icon: string }[];
  weekly: { day: string; created: number; completed: number }[];
}

export interface InsightTypeRow {
  id: string;
  name: string;
  icon: string;
  status: CaseTypeStatus;
  total: number;
  open: number;
  completed: number;
  avgCycleHours: number;
  overdueTasks: number;
}

export interface InsightsDto {
  statusBreakdown: { status: CaseStatus; count: number }[];
  taskOutcomes: { outcome: string; count: number }[];
  types: InsightTypeRow[];
  weekly: { day: string; created: number; completed: number }[];
  totalCases: number;
  totalTasks: number;
}

export interface PartyDto {
  id: string;
  kind: 'customer' | 'supplier';
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  createdAt: string;
}

export interface ItemDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  unitCost: number;
  reorderPoint: number;
  active: boolean;
  stock?: number;
}

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  location: string | null;
}

export const MASTER_ENTITIES = ['custom', 'party', 'item', 'warehouse', 'movement'] as const;

/** Which storage a master data type uses. `custom` types live in the generic record table. */
export type MasterEntity = (typeof MASTER_ENTITIES)[number];

export const MASTER_ENTITY_LABELS: Record<MasterEntity, string> = {
  custom: 'داده سفارشی',
  party: 'طرف حساب',
  item: 'کالا',
  warehouse: 'انبار',
  movement: 'گردش انبار',
};

export interface MasterDataTypeDto {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  entity: MasterEntity;
  isSystem: boolean;
  isHierarchical: boolean;
  sortOrder: number;
  fields: FieldDef[];
  titleField: string | null;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MasterDataRecordDto {
  id: string;
  typeId: string;
  typeKey: string;
  typeName: string;
  typeEntity: MasterEntity;
  title: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MasterOptionsDto {
  parties: PartyDto[];
  items: ItemDto[];
  warehouses: WarehouseDto[];
  users: UserSummary[];
  customTypes: MasterDataTypeDto[];
  customRecords: Record<string, MasterDataRecordDto[]>;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

export interface AdminUserDto extends UserSummary {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface NotificationsDto {
  items: NotificationDto[];
  unread: number;
}

export interface SearchResultsDto {
  cases: CaseListItem[];
  tasks: TaskDto[];
  parties: PartyDto[];
  items: ItemDto[];
}

export interface TemplateSummary {
  key: string;
  name: string;
  description: string;
  icon: string;
  referencePrefix: string;
  definition: CaseTypeDefinition;
}

export const CASE_ICONS = [
  'cart',
  'wallet',
  'users',
  'factory',
  'package',
  'file',
  'receipt',
  'truck',
  'clipboard',
] as const;

export type CaseIcon = (typeof CASE_ICONS)[number];
