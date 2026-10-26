export const ROLE_KEYS = [
  'admin',
  'builder',
  'manager',
  'finance',
  'procurement',
  'warehouse',
  'member',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin: 'مدیر سیستم',
  builder: 'طراح فرآیند',
  manager: 'مدیر',
  finance: 'مالی',
  procurement: 'تدارکات',
  warehouse: 'انبار',
  member: 'کارشناس',
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

export const TASK_KINDS = ['approval', 'action', 'info'] as const;
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
  options?: SelectOption[];
  min?: number;
  max?: number;
  visibleWhen?: Condition;
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

export type TaskKindDef = 'approval' | 'action';

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
}

export interface StagePermissions {
  editRoles?: RoleKey[];
  uploadRoles?: RoleKey[];
}

export interface StageDef {
  key: string;
  name: string;
  description?: string;
  color?: string;
  permissions?: StagePermissions;
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

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
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
