import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CASE_ICONS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  FIELD_WIDTHS,
  FIELD_WIDTH_LABELS,
  ROLE_LABELS,
  allDefinitionFields,
  fieldsForStage,
  type CaseTypeDefinition,
  type CaseTypeDetail,
  type CaseTypeSummary,
  type Condition,
  type DocumentDef,
  type FieldDef,
  type FieldType,
  type HealthIssue,
  type HealthResult,
  type MasterDataTypeDto,
  type NotificationEvent,
  type RoleDto,
  type RoleKey,
  type StageDef,
  type StageTransition,
  type TaskDef,
  type UserSummary,
} from '@ravand/shared';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CaretDown,
  CheckCircle,
  Eye,
  FilePlus,
  FloppyDisk,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasPermission, useRoles } from '@/lib/roles';
import { faNum } from '@/lib/format';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  cn,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { CaseTypeIcon } from '@/components/domain';
import { CaseFormPreview } from '@/components/CaseFormPreview';
import { useMasterOptions } from '@/components/DynamicFields';
import { useToast } from '@/components/ToastProvider';

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const FIELD_TYPE_OPTIONS = FIELD_TYPES.filter((type) => type !== 'rollup');

const notificationEventLabels: Record<NotificationEvent, string> = {
  'case.created': 'ثبت پرونده جدید',
  'task.assigned': 'ارجاع کار به مسئول',
  'case.completed': 'تکمیل پرونده',
  'case.rejected': 'رد پرونده',
  'sla.breached': 'عبور از مهلت',
};

const assigneeTypeLabels = {
  role: 'نقش سازمانی',
  user: 'کاربر مشخص',
  creator: 'ثبت‌کنندهٔ پرونده',
  manager: 'مدیر پرونده',
} as const;

const transitionTypeLabels: Record<StageTransition['type'], string> = {
  stage: 'رفتن به مرحله',
  case_type: 'شروع فرآیند دیگر',
  end: 'پایان پرونده',
};

const conditionOperatorLabels: Record<Condition['op'], string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'شامل',
};

type AssigneeOption = keyof typeof assigneeTypeLabels;
type BuilderTab = 'general' | 'fields' | 'stages' | 'documents' | 'settings';

type FieldEditor = {
  scope: 'case' | 'stage';
  stageIndex?: number;
  index: number | null;
  draft: FieldDef;
};
type TaskEditor = { stageIndex: number; taskIndex: number | null; draft: TaskDef };
type TransitionEditor = {
  stageIndex: number;
  index: number | null;
  draft: StageTransition;
};
type DocumentEditor = { index: number | null; draft: DocumentDef };
type DeleteTarget =
  | { type: 'field'; index: number }
  | { type: 'stage_field'; stageIndex: number; index: number }
  | { type: 'stage'; index: number }
  | { type: 'task'; stageIndex: number; taskIndex: number }
  | { type: 'transition'; stageIndex: number; index: number }
  | { type: 'document'; index: number };

function uniqueKey(base: string, keys: Set<string>) {
  let index = 1;
  while (keys.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

function countTasks(definition: CaseTypeDefinition) {
  return definition.stages.reduce((total, stage) => total + stage.tasks.length, 0);
}

function roleDisplay(key: string | undefined, roles: RoleDto[]): string {
  if (!key) return 'نقش تعیین‌نشده';
  return roles.find((role) => role.key === key)?.name ?? ROLE_LABELS[key] ?? key;
}

function KeyChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-line bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] text-ink-400" dir="ltr">
      {children}
    </span>
  );
}

function RoleChecklist({
  label,
  hint,
  value,
  roles,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: RoleKey[];
  roles: RoleDto[];
  disabled: boolean;
  onChange: (roles: RoleKey[]) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-ink-700">{label}</div>
      <div className="mt-1 text-[9px] text-ink-400">{hint}</div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {roles.map((role) => {
          const selected = value.includes(role.key);
          return (
            <button
              key={role.key}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((candidate) => candidate !== role.key)
                    : [...value, role.key],
                )
              }
              className={cn(
                'focus-ring rounded-full border px-2 py-0.5 text-[9px] font-medium transition',
                selected
                  ? 'border-ink-900 bg-ink-900 text-paper-50'
                  : 'border-line bg-paper-50 text-ink-500 hover:border-ink-300',
                disabled ? 'cursor-not-allowed opacity-50' : undefined,
              )}
              aria-pressed={selected}
              title={role.key}
            >
              {role.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BuilderEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [meta, setMeta] = useState({
    name: '',
    description: '',
    icon: 'file',
    referencePrefix: '',
    ownerId: null as string | null,
  });
  const [definition, setDefinition] = useState<CaseTypeDefinition>({ fields: [], stages: [] });
  const [tab, setTab] = useState<BuilderTab>('general');
  const [dirty, setDirty] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [fieldEditor, setFieldEditor] = useState<FieldEditor | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditor | null>(null);
  const [transitionEditor, setTransitionEditor] = useState<TransitionEditor | null>(null);
  const [documentEditor, setDocumentEditor] = useState<DocumentEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editorError, setEditorError] = useState('');
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [flashTarget, setFlashTarget] = useState<string | null>(null);
  const initializedId = useRef<string | null>(null);
  const healthRef = useRef<HTMLHeadingElement>(null);
  const masterOptions = useMasterOptions();
  const rolesQuery = useRoles();
  const roleOptions = rolesQuery.data ?? [];
  const canBuild = hasPermission(user, 'buildProcesses');

  const detail = useQuery({
    queryKey: ['case-type', id],
    queryFn: () => api.get<CaseTypeDetail>(`/case-types/${id}`),
    enabled: Boolean(id) && canBuild,
  });
  const caseTypes = useQuery({
    queryKey: ['case-types'],
    queryFn: () => api.get<CaseTypeSummary[]>('/case-types'),
    enabled: canBuild,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!detail.data || initializedId.current === detail.data.id) return;
    initializedId.current = detail.data.id;
    setMeta({
      name: detail.data.name,
      description: detail.data.description,
      icon: detail.data.icon,
      referencePrefix: detail.data.referencePrefix,
      ownerId: detail.data.ownerId,
    });
    setDefinition(structuredClone(detail.data.definition));
    setDirty(false);
    setHealth(null);
    setExpandedStage(null);
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () => {
      const name = meta.name.trim();
      if (name.length < 2) throw new Error('نام فرآیند باید حداقل ۲ نویسه باشد.');
      const prefix = meta.referencePrefix.trim();
      if (prefix.length < 2) throw new Error('پیشوند شماره پرونده باید بین ۲ تا ۸ نویسه باشد.');
      return api.put<CaseTypeDetail>(`/case-types/${id}`, {
        ...meta,
        name,
        description: meta.description.trim(),
        referencePrefix: prefix,
        definition,
      });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['case-type', id], saved);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['case-types'] });
      toast.success('پیش‌نویس ذخیره شد.', 'تغییرات فرآیند در حافظهٔ امن ذخیره شد.');
    },
    onError: (error) => toast.error('ذخیره ممکن نشد.', errorMessage(error)),
  });

  const updateMeta = (patch: Partial<typeof meta>) => {
    setMeta((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const updateDefinition = (mutator: (current: CaseTypeDefinition) => CaseTypeDefinition) => {
    setDefinition((current) => mutator(structuredClone(current)));
    setDirty(true);
    setHealth(null);
  };

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClickCapture = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('#') ||
        anchor.target === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        href === window.location.pathname
      ) {
        return;
      }
      if (!window.confirm('تغییرات ذخیره نشده‌اند. از این صفحه خارج می‌شوید؟')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [dirty]);

  const openNewField = () => {
    const key = uniqueKey(
      'field',
      new Set(allDefinitionFields(definition).map((field) => field.key)),
    );
    setEditorError('');
    setFieldEditor({
      scope: 'case',
      index: null,
      draft: { key, label: '', type: 'text', required: false, placeholder: '', help: '' },
    });
  };

  const openField = (index: number) => {
    const field = definition.fields[index];
    if (!field) return;
    setEditorError('');
    setFieldEditor({ scope: 'case', index, draft: structuredClone(field) });
  };

  const openNewStageField = (stageIndex: number) => {
    const stage = definition.stages[stageIndex];
    if (!stage) return;
    const key = uniqueKey(
      `${stage.key}_field`,
      new Set(allDefinitionFields(definition).map((field) => field.key)),
    );
    setEditorError('');
    setFieldEditor({
      scope: 'stage',
      stageIndex,
      index: null,
      draft: { key, label: '', type: 'text', required: false, placeholder: '', help: '' },
    });
  };

  const openStageField = (stageIndex: number, index: number) => {
    const field = definition.stages[stageIndex]?.fields?.[index];
    if (!field) return;
    setEditorError('');
    setFieldEditor({
      scope: 'stage',
      stageIndex,
      index,
      draft: structuredClone(field),
    });
  };

  const saveField = () => {
    if (!fieldEditor) return;
    const draft = fieldEditor.draft;
    if (!KEY_PATTERN.test(draft.key)) {
      setEditorError('کلید فیلد باید با حرف لاتین شروع شود و فقط حرف، عدد و زیرخط داشته باشد.');
      return;
    }
    if (!draft.label.trim()) {
      setEditorError('نام فیلد را وارد کنید.');
      return;
    }
    const previousKey =
      fieldEditor.scope === 'case'
        ? fieldEditor.index === null
          ? undefined
          : definition.fields[fieldEditor.index]?.key
        : fieldEditor.index === null
          ? undefined
          : definition.stages[fieldEditor.stageIndex ?? -1]?.fields?.[fieldEditor.index]?.key;
    if (
      allDefinitionFields(definition).some(
        (field) => field.key === draft.key && field.key !== previousKey,
      )
    ) {
      setEditorError('این کلید قبلاً برای فیلد دیگری استفاده شده است.');
      return;
    }
    if (draft.visibleWhen && !draft.visibleWhen.field) {
      setEditorError('فیلد شرط نمایش را انتخاب کنید.');
      return;
    }
    if (draft.type === 'master' && !draft.masterTypeKey) {
      setEditorError('نوع داده پایه مقصد را انتخاب کنید.');
      return;
    }
    if (draft.type === 'table') {
      const columns = draft.columns ?? [];
      if (!columns.length) {
        setEditorError('برای جدول حداقل یک ستون تعریف کنید.');
        return;
      }
      const columnKeys = new Set<string>();
      for (const column of columns) {
        if (!KEY_PATTERN.test(column.key)) {
          setEditorError('کلید هر ستون باید با حرف لاتین شروع شود و فقط حرف، عدد و زیرخط داشته باشد.');
          return;
        }
        if (!column.label.trim()) {
          setEditorError('برچسب همهٔ ستون‌ها را وارد کنید.');
          return;
        }
        if (columnKeys.has(column.key)) {
          setEditorError('کلید ستون‌های جدول باید یکتا باشد.');
          return;
        }
        columnKeys.add(column.key);
        if (column.type === 'table') {
          setEditorError('ستون جدول نمی‌تواند از نوع جدول باشد.');
          return;
        }
        if (
          ['select', 'radio', 'multiselect'].includes(column.type) &&
          !(column.options ?? []).some(
            (option) => option.label.trim() && option.value.trim(),
          )
        ) {
          setEditorError('برای ستون‌های انتخابی حداقل یک گزینه معتبر تعریف کنید.');
          return;
        }
        if (column.type === 'master' && !column.masterTypeKey) {
          setEditorError('نوع داده پایه ستون‌های سفارشی را انتخاب کنید.');
          return;
        }
      }
      if (
        draft.minRows !== undefined &&
        draft.maxRows !== undefined &&
        draft.minRows > draft.maxRows
      ) {
        setEditorError('حداقل ردیف نمی‌تواند از حداکثر ردیف بیشتر باشد.');
        return;
      }
    }
    const needsOptions = ['select', 'radio', 'multiselect'].includes(draft.type);
    const options = needsOptions
      ? (draft.options ?? []).filter((option) => option.label.trim() && option.value.trim())
      : undefined;
    if (needsOptions) {
      if (!options?.length) {
        setEditorError('برای این نوع فیلد، حداقل یک گزینه با برچسب و مقدار لازم است.');
        return;
      }
      const seenValues = new Set<string>();
      for (const option of options) {
        if (seenValues.has(option.value.trim())) {
          setEditorError('مقدار گزینه‌ها باید یکتا باشد.');
          return;
        }
        seenValues.add(option.value.trim());
      }
    }
    if (draft.min !== undefined && draft.max !== undefined && draft.min > draft.max) {
      setEditorError('حداقل مقدار نمی‌تواند از حداکثر مقدار بیشتر باشد.');
      return;
    }
    const nextField: FieldDef = {
      ...draft,
      required: draft.hidden || draft.readonly ? false : draft.required,
      label: draft.label.trim(),
      placeholder: draft.placeholder?.trim() || undefined,
      help: draft.help?.trim() || undefined,
      options,
      columns:
        draft.type === 'table'
          ? (draft.columns ?? []).map((column) => ({
              ...column,
              key: column.key.trim(),
              label: column.label.trim(),
            }))
          : undefined,
      minRows: draft.type === 'table' ? (draft.minRows ?? 0) : undefined,
      maxRows: draft.type === 'table' ? draft.maxRows : undefined,
      addLabel:
        draft.type === 'table' ? draft.addLabel?.trim() || undefined : undefined,
    };
    updateDefinition((current) => {
      const currentPreviousKey =
        fieldEditor.scope === 'case'
          ? fieldEditor.index === null
            ? undefined
            : current.fields[fieldEditor.index]?.key
          : fieldEditor.index === null
            ? undefined
            : current.stages[fieldEditor.stageIndex ?? -1]?.fields?.[fieldEditor.index]?.key;
      if (currentPreviousKey && currentPreviousKey !== nextField.key) {
        for (const stage of current.stages) {
          for (const field of stage.fields ?? []) {
            if (field.visibleWhen?.field === currentPreviousKey) {
              field.visibleWhen.field = nextField.key;
            }
          }
          for (const task of stage.tasks) {
            task.formFields = task.formFields?.map((key) =>
              key === currentPreviousKey ? nextField.key : key,
            );
            if (task.condition?.field === currentPreviousKey) {
              task.condition.field = nextField.key;
            }
            if (task.selection) {
              if (task.selection.sourceField === currentPreviousKey) {
                task.selection.sourceField = nextField.key;
              }
              task.selection.copy = task.selection.copy?.map((copy) =>
                copy.to === currentPreviousKey ? { ...copy, to: nextField.key } : copy,
              );
            }
          }
          for (const transition of stage.transitions ?? []) {
            if (transition.condition?.field === currentPreviousKey) {
              transition.condition.field = nextField.key;
            }
          }
        }
        for (const field of current.fields) {
          if (field.visibleWhen?.field === currentPreviousKey) {
            field.visibleWhen.field = nextField.key;
          }
        }
        if (current.settings?.titleField === currentPreviousKey) {
          current.settings.titleField = nextField.key;
        }
        if (current.settings?.descriptionField === currentPreviousKey) {
          current.settings.descriptionField = nextField.key;
        }
      }
      if (fieldEditor.scope === 'stage') {
        const stage = current.stages[fieldEditor.stageIndex ?? -1];
        if (!stage) return current;
        stage.fields ??= [];
        if (fieldEditor.index === null) stage.fields.push(nextField);
        else stage.fields[fieldEditor.index] = nextField;
      } else if (fieldEditor.index === null) {
        current.fields.push(nextField);
      } else {
        current.fields[fieldEditor.index] = nextField;
      }
      return current;
    });
    setFieldEditor(null);
  };

  const openNewTask = (stageIndex: number) => {
    const stage = definition.stages[stageIndex];
    if (!stage) return;
    const allTaskKeys = new Set(
      definition.stages.flatMap((candidate) => candidate.tasks.map((task) => task.key)),
    );
    setEditorError('');
    setTaskEditor({
      stageIndex,
      taskIndex: null,
      draft: {
        key: uniqueKey(`${stage.key}_task`, allTaskKeys),
        name: 'بررسی و تأیید',
        description: '',
        kind: 'approval',
        assignee: { type: 'role', value: 'manager' },
        dueInHours: 24,
        formFields: [],
        requiredDocuments: [],
      },
    });
  };

  const openTask = (stageIndex: number, taskIndex: number) => {
    const task = definition.stages[stageIndex]?.tasks[taskIndex];
    if (!task) return;
    setEditorError('');
    setTaskEditor({ stageIndex, taskIndex, draft: structuredClone(task) });
  };

  const saveTask = () => {
    if (!taskEditor) return;
    const draft = taskEditor.draft;
    if (!KEY_PATTERN.test(draft.key)) {
      setEditorError('کلید کار باید با حرف لاتین شروع شود و فقط حرف، عدد و زیرخط داشته باشد.');
      return;
    }
    if (!draft.name.trim()) {
      setEditorError('نام کار را وارد کنید.');
      return;
    }
    const duplicate = definition.stages.some((stage, stageIndex) =>
      stage.tasks.some(
        (task, taskIndex) =>
          !(stageIndex === taskEditor.stageIndex && taskIndex === taskEditor.taskIndex) &&
          task.key === draft.key,
      ),
    );
    if (duplicate) {
      setEditorError('کلید کار در کل فرآیند باید یکتا باشد.');
      return;
    }
    if (draft.assignee.type === 'role' && !draft.assignee.value) {
      setEditorError('نقش مسئول کار را انتخاب کنید.');
      return;
    }
    if (draft.assignee.type === 'user' && !draft.assignee.value) {
      setEditorError('کاربر مسئول کار را انتخاب کنید.');
      return;
    }
    if (draft.condition && !draft.condition.field) {
      setEditorError('فیلد شرط اجرا را انتخاب کنید.');
      return;
    }
    if (draft.kind === 'selection') {
      const selection = draft.selection;
      if (!selection?.sourceField) {
        setEditorError('برای کار انتخاب، جدول منبع را انتخاب کنید.');
        return;
      }
      const source = allDefinitionFields(definition).find(
        (field) => field.key === selection.sourceField && field.type === 'table',
      );
      if (!source) {
        setEditorError('جدول منبع کار انتخاب معتبر نیست.');
        return;
      }
      const columnKeys = new Set((source.columns ?? []).map((column) => column.key));
      if (selection.labelColumn && !columnKeys.has(selection.labelColumn)) {
        setEditorError('ستون عنوان گزینه معتبر نیست.');
        return;
      }
      const allFieldKeys = new Set(allDefinitionFields(definition).map((field) => field.key));
      const targets = new Set<string>();
      for (const copy of selection.copy ?? []) {
        if (!columnKeys.has(copy.from)) {
          setEditorError('یکی از ستون‌های انتخابی برای کپی معتبر نیست.');
          return;
        }
        if (!allFieldKeys.has(copy.to)) {
          setEditorError('یکی از فیلدهای مقصد کپی معتبر نیست.');
          return;
        }
        if (targets.has(copy.to)) {
          setEditorError('هر فیلد مقصد فقط یک بار می‌تواند انتخاب شود.');
          return;
        }
        targets.add(copy.to);
      }
    }
    const nextTask: TaskDef = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      dueInHours: draft.dueInHours && draft.dueInHours > 0 ? draft.dueInHours : undefined,
      formFields: draft.formFields?.length ? draft.formFields : undefined,
      requiredDocuments: draft.requiredDocuments?.length ? draft.requiredDocuments : undefined,
      condition: draft.condition?.field ? draft.condition : undefined,
      selection: draft.kind === 'selection' ? draft.selection : undefined,
    };
    updateDefinition((current) => {
      const stage = current.stages[taskEditor.stageIndex];
      if (!stage) return current;
      if (taskEditor.taskIndex === null) stage.tasks.push(nextTask);
      else stage.tasks[taskEditor.taskIndex] = nextTask;
      return current;
    });
    setTaskEditor(null);
  };

  const openNewTransition = (stageIndex: number) => {
    const stage = definition.stages[stageIndex];
    if (!stage) return;
    const fallbackStage = definition.stages[stageIndex + 1];
    setEditorError('');
    setTransitionEditor({
      stageIndex,
      index: null,
      draft: {
        type: fallbackStage ? 'stage' : 'end',
        stageKey: fallbackStage?.key,
      },
    });
  };

  const openTransition = (stageIndex: number, index: number) => {
    const transition = definition.stages[stageIndex]?.transitions?.[index];
    if (!transition) return;
    setEditorError('');
    setTransitionEditor({ stageIndex, index, draft: structuredClone(transition) });
  };

  const saveTransition = () => {
    if (!transitionEditor) return;
    const draft = transitionEditor.draft;
    if (draft.type === 'stage') {
      const target = definition.stages.find((stage) => stage.key === draft.stageKey);
      if (!target) {
        setEditorError("مرحله مقصد باید معتبر باشد.");
        return;
      }
      if (
        target.key === definition.stages[transitionEditor.stageIndex]?.key
      ) {
        setEditorError("مرحله مقصد نباید همان مرحله فعلی باشد.");
        return;
      }
    }
    if (draft.type === 'case_type' && !draft.caseTypeKey) {
      setEditorError("برای شروع فرآیند دیگر، فرآیند مقصد را انتخاب کنید.");
      return;
    }
    if (draft.condition && !draft.condition.field) {
      setEditorError('برای شرط اجرا، فیلد را انتخاب کنید.');
      return;
    }
    const nextTransition: StageTransition = {
      ...draft,
      label: draft.label?.trim() || undefined,
      condition: draft.condition?.field ? draft.condition : undefined,
      stageKey: draft.type === 'stage' ? draft.stageKey : undefined,
      caseTypeKey: draft.type === 'case_type' ? draft.caseTypeKey : undefined,
    };
    updateDefinition((current) => {
      const stage = current.stages[transitionEditor.stageIndex];
      if (!stage) return current;
      stage.transitions ??= [];
      if (transitionEditor.index === null) stage.transitions.push(nextTransition);
      else stage.transitions[transitionEditor.index] = nextTransition;
      return current;
    });
    setTransitionEditor(null);
  };

  const addStage = () => {
    const stageKeys = new Set(definition.stages.map((stage) => stage.key));
    const taskKeys = new Set(
      definition.stages.flatMap((stage) => stage.tasks.map((task) => task.key)),
    );
    const stageKey = uniqueKey('stage', stageKeys);
    const stage: StageDef = {
      key: stageKey,
      name: `مرحله ${faNum(definition.stages.length + 1)}`,
      description: '',
      tasks: [
        {
          key: uniqueKey(`${stageKey}_task`, taskKeys),
          name: 'بررسی و تأیید',
          kind: 'approval',
          assignee: { type: 'role', value: 'manager' },
          dueInHours: 24,
        },
      ],
    };
    updateDefinition((current) => {
      current.stages.push(stage);
      return current;
    });
    setExpandedStage(stageKey);
  };

  const updateStage = (index: number, patch: Partial<StageDef>) => {
    updateDefinition((current) => {
      const stage = current.stages[index];
      if (stage) Object.assign(stage, patch);
      return current;
    });
  };

  const openNewDocument = () => {
    const key = uniqueKey('document', new Set((definition.documents ?? []).map((doc) => doc.key)));
    setEditorError('');
    setDocumentEditor({ index: null, draft: { key, name: '', required: false } });
  };

  const openDocument = (index: number) => {
    const document = definition.documents?.[index];
    if (!document) return;
    setEditorError('');
    setDocumentEditor({ index, draft: structuredClone(document) });
  };

  const saveDocument = () => {
    if (!documentEditor) return;
    const draft = documentEditor.draft;
    if (!KEY_PATTERN.test(draft.key)) {
      setEditorError('کلید مدرک باید با حرف لاتین شروع شود و فقط حرف، عدد و زیرخط داشته باشد.');
      return;
    }
    if (!draft.name.trim()) {
      setEditorError('نام مدرک را وارد کنید.');
      return;
    }
    if (
      (definition.documents ?? []).some(
        (document, index) => index !== documentEditor.index && document.key === draft.key,
      )
    ) {
      setEditorError('این کلید قبلاً برای مدرک دیگری استفاده شده است.');
      return;
    }
    const nextDocument: DocumentDef = {
      ...draft,
      name: draft.name.trim(),
      stageKey: draft.stageKey || undefined,
    };
    updateDefinition((current) => {
      current.documents ??= [];
      const previousKey =
        documentEditor.index === null
          ? undefined
          : current.documents[documentEditor.index]?.key;
      if (previousKey && previousKey !== nextDocument.key) {
        for (const stage of current.stages) {
          for (const task of stage.tasks) {
            task.requiredDocuments = task.requiredDocuments?.map((key) =>
              key === previousKey ? nextDocument.key : key,
            );
          }
        }
      }
      if (documentEditor.index === null) current.documents.push(nextDocument);
      else current.documents[documentEditor.index] = nextDocument;
      return current;
    });
    setDocumentEditor(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    updateDefinition((current) => {
      if (deleteTarget.type === 'field' || deleteTarget.type === 'stage_field') {
        let removed: FieldDef | undefined;
        if (deleteTarget.type === 'stage_field') {
          const stage = current.stages[deleteTarget.stageIndex];
          removed = stage?.fields?.[deleteTarget.index];
          stage?.fields?.splice(deleteTarget.index, 1);
        } else {
          removed = current.fields[deleteTarget.index];
          current.fields.splice(deleteTarget.index, 1);
        }
        if (removed) {
          for (const stage of current.stages) {
            for (const field of stage.fields ?? []) {
              if (field.visibleWhen?.field === removed.key) delete field.visibleWhen;
            }
            for (const task of stage.tasks) {
              task.formFields = task.formFields?.filter((key) => key !== removed.key);
              if (task.condition?.field === removed.key) delete task.condition;
              if (task.selection?.sourceField === removed.key) {
                delete task.selection;
              } else if (task.selection?.copy) {
                task.selection.copy = task.selection.copy.filter(
                  (copy) => copy.to !== removed.key,
                );
              }
            }
            for (const transition of stage.transitions ?? []) {
              if (transition.condition?.field === removed.key) delete transition.condition;
            }
          }
          for (const field of current.fields) {
            if (field.visibleWhen?.field === removed.key) delete field.visibleWhen;
          }
          if (current.settings?.titleField === removed.key) delete current.settings.titleField;
          if (current.settings?.descriptionField === removed.key) {
            delete current.settings.descriptionField;
          }
        }
      } else if (deleteTarget.type === 'transition') {
        current.stages[deleteTarget.stageIndex]?.transitions?.splice(deleteTarget.index, 1);
      } else if (deleteTarget.type === 'stage') {
        const removed = current.stages[deleteTarget.index];
        current.stages.splice(deleteTarget.index, 1);
        if (removed) {
          for (const document of current.documents ?? []) {
            if (document.stageKey === removed.key) delete document.stageKey;
          }
          for (const stage of current.stages) {
            stage.transitions = stage.transitions?.filter(
              (transition) => transition.stageKey !== removed.key,
            );
          }
        }
      } else if (deleteTarget.type === 'task') {
        current.stages[deleteTarget.stageIndex]?.tasks.splice(deleteTarget.taskIndex, 1);
      } else {
        const removed = current.documents?.[deleteTarget.index];
        current.documents?.splice(deleteTarget.index, 1);
        if (removed) {
          for (const stage of current.stages) {
            for (const task of stage.tasks) {
              task.requiredDocuments = task.requiredDocuments?.filter(
                (key) => key !== removed.key,
              );
            }
          }
        }
      }
      return current;
    });
    setDeleteTarget(null);
  };

  const runHealthCheck = async () => {
    if (!id) return null;
    setChecking(true);
    try {
      const result = await api.post<HealthResult>(`/case-types/${id}/health-check`, {
        definition,
      });
      setHealth(result);
      return result;
    } catch (error) {
      toast.error('بررسی سلامت ممکن نشد.', errorMessage(error));
      return null;
    } finally {
      setChecking(false);
    }
  };

  const publish = async () => {
    if (!id || !detail.data) return;
    setPublishing(true);
    try {
      const result = health ?? (await runHealthCheck());
      if (!result) return;
      if (!result.ok) {
        const errors = result.issues.filter((issue) => issue.level === 'error').length;
        const warnings = result.issues.length - errors;
        healthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast.error(
          'انتشار انجام نشد.',
          `${faNum(errors)} خطا و ${faNum(warnings)} هشدار در کارت «اعتبارسنجی ساختار» پیدا شد؛ ابتدا آن‌ها را برطرف کنید.`,
        );
        return;
      }
      if (dirty) await save.mutateAsync();
      await api.post(`/case-types/${id}/publish`);
      await queryClient.invalidateQueries({ queryKey: ['case-types'] });
      await detail.refetch();
      setHealth(null);
      toast.success('فرآیند منتشر شد.', 'اکنون در فهرست «پرونده جدید» قابل انتخاب است.');
    } catch (error) {
      toast.error('انتشار ممکن نشد.', errorMessage(error));
    } finally {
      setPublishing(false);
    }
  };

  if (!canBuild) {
    return (
      <Card className="mx-auto mt-12 max-w-lg px-6 py-12 text-center">
        <ShieldCheck size={30} className="mx-auto text-ink-300" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">اجازهٔ ویرایش فرآیند ندارید.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          این بخش برای مدیر، مدیر سیستم و طراح فرآیند در دسترس است.
        </p>
      </Card>
    );
  }

  if (detail.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.75fr)]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Card className="mx-auto mt-10 max-w-xl px-6 py-14 text-center">
        <WarningCircle size={30} className="mx-auto text-stamp-500" />
        <h1 className="mt-4 text-base font-semibold text-ink-900">فرآیند پیدا نشد.</h1>
        <p className="mt-2 text-xs text-ink-400">{errorMessage(detail.error)}</p>
        <Link
          to="/builder"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50"
        >
          <ArrowRight size={13} />
          بازگشت به سازنده
        </Link>
      </Card>
    );
  }

  const readOnly =
    detail.data.status === 'archived' ||
    (user?.role !== 'admin' && detail.data.ownerId !== user?.id);
  const stages = definition.stages;
  const taskTotal = countTasks(definition);
  const documents = definition.documents ?? [];
  const currentIndex = taskEditor?.stageIndex ?? 0;
  const currentStage = stages[currentIndex];

  const focusElement = (elementId: string) => {
    window.setTimeout(() => {
      const element = document.getElementById(elementId);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashTarget(elementId);
      window.setTimeout(
        () => setFlashTarget((current) => (current === elementId ? null : current)),
        1800,
      );
    }, 80);
  };

  const issueTarget = (
    issue: HealthIssue,
  ): { tab: BuilderTab; label: string; elementId?: string; stageKey?: string } | null => {
    const path = issue.path;
    if (!path) return null;
    const [root, second] = path.split('.');
    if (root === 'fields') {
      return second
        ? { tab: 'fields', label: 'فرم', elementId: `builder-field-${second}` }
        : { tab: 'fields', label: 'فرم' };
    }
    if (root === 'stages') {
      if (!second) return { tab: 'stages', label: 'گردش کار' };
      if (/^\d+$/.test(second)) {
        const stage = stages[Number(second)];
        return stage
          ? { tab: 'stages', label: 'گردش کار', elementId: `builder-stage-${stage.key}` }
          : { tab: 'stages', label: 'گردش کار' };
      }
      return {
        tab: 'stages',
        label: 'گردش کار',
        elementId: `builder-stage-${second}`,
        stageKey: second,
      };
    }
    if (root === 'documents') {
      return second
        ? { tab: 'documents', label: 'مدارک', elementId: `builder-document-${second}` }
        : { tab: 'documents', label: 'مدارک' };
    }
    if (root === 'settings') return { tab: 'settings', label: 'تنظیمات' };
    return null;
  };

  const jumpToIssue = (issue: HealthIssue) => {
    const target = issueTarget(issue);
    if (!target) return;
    setTab(target.tab);
    if (target.stageKey) setExpandedStage(target.stageKey);
    if (target.elementId) focusElement(target.elementId);
  };

  const nextStep = !definition.fields.length
    ? {
        tab: 'fields' as BuilderTab,
        title: 'فرم پرونده را بسازید',
        body: 'ثبت‌کننده باید حداقل یک فیلد برای وارد کردن اطلاعات داشته باشد.',
        cta: 'افزودن فیلد',
        focusId: undefined as string | undefined,
      }
    : !stages.length
      ? {
          tab: 'stages' as BuilderTab,
          title: 'حداقل یک مرحله اضافه کنید',
          body: 'پرونده بدون مرحله مسیری برای حرکت ندارد.',
          cta: 'افزودن مرحله',
          focusId: undefined as string | undefined,
        }
      : !stages[0].tasks.length
        ? {
            tab: 'stages' as BuilderTab,
            title: `برای مرحلهٔ «${stages[0].name}» کار تعریف کنید`,
            body: 'مرحلهٔ اول بدون کار آغاز نمی‌شود؛ کارِ مسئول مشخص می‌کند چه کسی چه کاری انجام دهد.',
            cta: 'دیدن مرحله',
            focusId: `builder-stage-${stages[0].key}` as string | undefined,
          }
        : null;

  return (
    <div>
      <Link
        to="/builder"
        className="focus-ring mb-4 inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
      >
        <ArrowRight size={13} />
        سازنده فرآیند
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span>ویرایش فرآیند</span>
            <KeyChip>{detail.data.key}</KeyChip>
            {detail.data.status === 'published' ? (
              <span className="rounded-full border border-verdigris-100 bg-verdigris-50 px-2 py-0.5 text-[9px] font-semibold text-verdigris-700">
                منتشرشده · نسخهٔ {faNum(detail.data.version)}
              </span>
            ) : detail.data.status === 'archived' ? (
              <span className="rounded-full border border-line bg-paper-100 px-2 py-0.5 text-[9px] font-semibold text-ink-400">
                بایگانی
              </span>
            ) : (
              <span className="rounded-full border border-ochre-100 bg-ochre-50 px-2 py-0.5 text-[9px] font-semibold text-ochre-600">
                پیش‌نویس
              </span>
            )}
            {dirty ? (
              <span className="rounded-full bg-copper-50 px-2 py-0.5 text-[9px] font-semibold text-copper-600">
                تغییر ذخیره‌نشده
              </span>
            ) : null}
          </span>
        }
        title={meta.name || 'فرآیند بدون نام'}
        description={meta.description || 'توضیح کوتاهی برای این فرآیند بنویسید.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="paper"
              size="sm"
              icon={<Eye size={14} />}
              onClick={() => setPreviewOpen(true)}
            >
              پیش‌نمایش فرم
            </Button>
            <Button
              variant="paper"
              size="sm"
              icon={<ShieldCheck size={14} />}
              loading={checking}
              onClick={() => void runHealthCheck()}
            >
              بررسی سلامت
            </Button>
            {detail.data.status === 'published' ? (
              <Link
                to={`/cases/new?type=${detail.data.id}`}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper-50/55 px-3.5 text-xs font-semibold text-ink-600 hover:bg-paper-50"
              >
                <FilePlus size={14} />
                ثبت پرونده آزمایشی
              </Link>
            ) : null}
            {!readOnly ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FloppyDisk size={14} />}
                  disabled={!dirty}
                  loading={save.isPending}
                  onClick={() => save.mutate()}
                >
                  ذخیره پیش‌نویس
                </Button>
                <Button
                  variant="copper"
                  size="sm"
                  icon={<CheckCircle size={14} />}
                  loading={publishing}
                  onClick={() => void publish()}
                >
                  انتشار
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {readOnly ? (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-line bg-paper-200/50 px-4 py-3 text-[11px] leading-6 text-ink-500">
          <WarningCircle size={15} className="mt-0.5 shrink-0" />
          {detail.data.status === 'archived'
            ? 'این فرآیند بایگانی شده است و فقط برای مشاهده در دسترس است. برای تغییر، از نسخهٔ آن کپی بگیرید.'
            : 'شما مالک این فرآیند نیستید و فقط می‌توانید آن را مشاهده کنید. برای ویرایش، مالک فرآیند باید این فرآیند را به شما واگذار کند.'}
        </div>
      ) : null}

      {!readOnly && nextStep ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-copper-200 bg-copper-50/50 px-3.5 py-2.5">
          <span className="rounded bg-paper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-700">
            قدم بعدی
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-copper-800">{nextStep.title}</p>
            <p className="mt-0.5 text-[9px] leading-5 text-copper-700/80">{nextStep.body}</p>
          </div>
          <Button
            variant="paper"
            size="sm"
            className="h-7 px-2.5 text-[10px]"
            onClick={() => {
              setTab(nextStep.tab);
              if (nextStep.focusId) focusElement(nextStep.focusId);
            }}
          >
            {nextStep.cta}
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.75fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="px-3 pt-1 sm:px-4">
            <Tabs
              value={tab}
              onChange={(value) => setTab(value as BuilderTab)}
              items={[
                { value: 'general', label: 'اطلاعات کلی' },
                { value: 'fields', label: 'فرم', count: definition.fields.length },
                { value: 'stages', label: 'گردش کار', count: stages.length },
                { value: 'documents', label: 'مدارک', count: documents.length },
                { value: 'settings', label: 'تنظیمات' },
              ]}
            />
          </div>

          <div className="p-4 sm:p-5">
            {tab === 'general' ? (
              <GeneralTab
                meta={meta}
                caseKey={detail.data.key}
                users={masterOptions.data?.users ?? []}
                readOnly={readOnly}
                onChange={updateMeta}
              />
            ) : null}

            {tab === 'fields' ? (
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">فرم پرونده</h2>
                    <p className="mt-1 text-[10px] leading-5 text-ink-400">
                      فیلدهایی که هنگام ثبت و ویرایش پرونده نمایش داده می‌شوند.
                    </p>
                  </div>
                  {!readOnly ? (
                    <Button variant="paper" size="sm" icon={<Plus size={13} />} onClick={openNewField}>
                      فیلد جدید
                    </Button>
                  ) : null}
                </div>
                {definition.fields.length ? (
                  <div className="divide-y divide-line/70 rounded-lg border border-line bg-paper-50/40">
                    {definition.fields.map((field, index) => (
                      <div
                        key={field.key}
                        id={`builder-field-${field.key}`}
                        className={cn(
                          'flex scroll-mt-24 items-center gap-2.5 px-3 py-2.5 transition',
                          flashTarget === `builder-field-${field.key}` && 'bg-copper-50/70',
                        )}
                      >
                        <span className="w-5 shrink-0 text-center font-mono text-[9px] text-ink-300">
                          {faNum(index + 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-ink-800">
                              {field.label}
                            </span>
                            {field.required ? (
                              <span className="rounded bg-copper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-600">
                                الزامی
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-ink-400">
                            <span>{FIELD_TYPE_LABELS[field.type]}</span>
                            <KeyChip>{field.key}</KeyChip>
                            {field.section ? <span>بخش: {field.section}</span> : null}
                            {field.options?.length ? (
                              <span>{faNum(field.options.length)} گزینه</span>
                            ) : null}
                            {field.visibleWhen ? <span>نمایش شرطی</span> : null}
                            {field.readonly ? <span>فقط‌خواندنی</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <ReorderButtons
                            disabled={readOnly}
                            canUp={index > 0}
                            canDown={index < definition.fields.length - 1}
                            onUp={() =>
                              updateDefinition((current) => {
                                current.fields = moveItem(current.fields, index, index - 1);
                                return current;
                              })
                            }
                            onDown={() =>
                              updateDefinition((current) => {
                                current.fields = moveItem(current.fields, index, index + 1);
                                return current;
                              })
                            }
                          />
                          {!readOnly ? (
                            <>
                              <IconAction label="ویرایش فیلد" onClick={() => openField(index)}>
                                <PencilSimple size={13} />
                              </IconAction>
                              <IconAction
                                label="حذف فیلد"
                                danger
                                onClick={() => setDeleteTarget({ type: 'field', index })}
                              >
                                <Trash size={13} />
                              </IconAction>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="فرم هنوز فیلدی ندارد."
                    description="با افزودن موضوع، مبلغ یا هر دادهٔ لازم، فرم پرونده را بسازید."
                    action={
                      !readOnly ? (
                        <Button variant="paper" size="sm" onClick={openNewField}>
                          افزودن اولین فیلد
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            ) : null}

            {tab === 'stages' ? (
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">گردش کار</h2>
                    <p className="mt-1 text-[10px] leading-5 text-ink-400">
                      ترتیب مراحل و کارهای هر مرحله، مسیر حرکت پرونده را تعیین می‌کند.
                    </p>
                  </div>
                  {!readOnly ? (
                    <Button variant="paper" size="sm" icon={<Plus size={13} />} onClick={addStage}>
                      مرحله جدید
                    </Button>
                  ) : null}
                </div>

                {stages.length ? (
                  <div className="overflow-hidden rounded-lg border border-line">
                    <div className="overflow-x-auto scroll-thin">
                      <table className="w-full min-w-[640px] border-collapse text-xs">
                        <thead className="bg-paper-100/70 text-[10px] text-ink-500">
                          <tr className="border-b border-line">
                            <th className="w-14 px-3 py-2.5 text-center font-semibold">ردیف</th>
                            <th className="px-3 py-2.5 text-start font-semibold">مرحله</th>
                            <th className="w-20 px-3 py-2.5 text-start font-semibold">کارها</th>
                            <th className="w-28 px-3 py-2.5 text-start font-semibold">ویرایش فرم</th>
                            <th className="w-28 px-3 py-2.5 text-start font-semibold">وضعیت</th>
                            <th className="w-32 px-3 py-2.5 text-end font-semibold">عملیات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/70">
                          {stages.map((stage, stageIndex) => {
                            const expanded = expandedStage === stage.key;
                            const editRoles = stage.permissions?.editRoles ?? [];
                            return (
                              <Fragment key={stage.key}>
                                <tr
                                  id={`builder-stage-${stage.key}`}
                                  className={cn(
                                    'scroll-mt-24 transition hover:bg-paper-100/50',
                                    expanded && 'bg-paper-50',
                                    flashTarget === `builder-stage-${stage.key}` && 'bg-copper-50/70',
                                  )}
                                >
                                  <td className="px-3 py-3 text-center">
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-line bg-paper-50 font-mono text-[10px] font-semibold text-ink-600">
                                      {faNum(stageIndex + 1)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedStage(expanded ? null : stage.key)
                                      }
                                      className="focus-ring block text-start font-semibold text-ink-800 hover:text-copper-600"
                                    >
                                      {stage.name}
                                    </button>
                                    <div className="mt-1">
                                      <KeyChip>{stage.key}</KeyChip>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 font-mono text-[11px] text-ink-600">
                                    {stage.tasks.length ? faNum(stage.tasks.length) : '—'}
                                  </td>
                                  <td className="px-3 py-3 text-[10px] text-ink-500">
                                    {editRoles.length ? `${faNum(editRoles.length)} نقش` : 'پیش‌فرض'}
                                  </td>
                                  <td className="px-3 py-3">
                                    {stage.tasks.length ? (
                                      <span className="inline-flex items-center gap-1.5 rounded border border-verdigris-100 bg-verdigris-50 px-2 py-0.5 text-[10px] font-semibold text-verdigris-700">
                                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                        دارای کار
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 rounded border border-ochre-100 bg-ochre-50 px-2 py-0.5 text-[10px] font-semibold text-ochre-600">
                                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                        عبور خودکار
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center justify-end gap-0.5">
                                      <ReorderButtons
                                        disabled={readOnly}
                                        canUp={stageIndex > 0}
                                        canDown={stageIndex < stages.length - 1}
                                        onUp={() =>
                                          updateDefinition((current) => {
                                            current.stages = moveItem(
                                              current.stages,
                                              stageIndex,
                                              stageIndex - 1,
                                            );
                                            return current;
                                          })
                                        }
                                        onDown={() =>
                                          updateDefinition((current) => {
                                            current.stages = moveItem(
                                              current.stages,
                                              stageIndex,
                                              stageIndex + 1,
                                            );
                                            return current;
                                          })
                                        }
                                      />
                                      <IconAction
                                        label={expanded ? 'بستن جزئیات مرحله' : 'نمایش جزئیات مرحله'}
                                        onClick={() =>
                                          setExpandedStage(expanded ? null : stage.key)
                                        }
                                      >
                                        <CaretDown
                                          size={13}
                                          className={cn('transition', expanded && 'rotate-180')}
                                        />
                                      </IconAction>
                                      {!readOnly ? (
                                        <IconAction
                                          label="حذف مرحله"
                                          danger
                                          onClick={() =>
                                            setDeleteTarget({ type: 'stage', index: stageIndex })
                                          }
                                        >
                                          <Trash size={13} />
                                        </IconAction>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>

                                {expanded ? (
                                  <tr className="bg-paper-50/80">
                                    <td colSpan={6} className="border-t border-line/70 px-4 py-4">
                                      <div className="grid gap-5">
                                        <div className="space-y-3">
                                          <Field label="نام مرحله">
                                            <Input
                                              value={stage.name}
                                              onChange={(event) =>
                                                updateStage(stageIndex, {
                                                  name: event.target.value,
                                                })
                                              }
                                              className="h-9 text-xs"
                                              disabled={readOnly}
                                            />
                                          </Field>
                                          <Field label="هدف مرحله">
                                            <Textarea
                                              value={stage.description ?? ''}
                                              onChange={(event) =>
                                                updateStage(stageIndex, {
                                                  description: event.target.value,
                                                })
                                              }
                                              placeholder="این مرحله چه خروجی‌ای باید تولید کند؟"
                                              className="min-h-16 text-[11px]"
                                              disabled={readOnly}
                                            />
                                          </Field>
                                          <details className="rounded-md border border-line bg-paper-50/70 px-3 py-2">
                                            <summary className="cursor-pointer text-[10px] font-semibold text-ink-600">
                                              دسترسی‌های مرحله
                                            </summary>
                                            <div className="mt-3 space-y-3">
                                              <RoleChecklist
                                                label="ویرایش اطلاعات پرونده"
                                                hint="مدیر سیستم، ثبت‌کننده و مسئول کار در هر حال مجاز هستند."
                                                value={editRoles}
                                                roles={roleOptions}
                                                disabled={readOnly}
                                                onChange={(roles) =>
                                                  updateStage(stageIndex, {
                                                    permissions: {
                                                      ...stage.permissions,
                                                      editRoles: roles.length ? roles : undefined,
                                                    },
                                                  })
                                                }
                                              />
                                              <RoleChecklist
                                                label="بارگذاری مدرک"
                                                hint="علاوه بر افراد مجاز به ویرایش، این نقش‌ها هم می‌توانند مدرک اضافه کنند."
                                                value={stage.permissions?.uploadRoles ?? []}
                                                roles={roleOptions}
                                                disabled={readOnly}
                                                onChange={(roles) =>
                                                  updateStage(stageIndex, {
                                                    permissions: {
                                                      ...stage.permissions,
                                                      uploadRoles: roles.length ? roles : undefined,
                                                    },
                                                  })
                                                }
                                              />
                                            </div>
                                          </details>
                                        </div>

                                        <div>
                                          <div className="mb-2 flex items-center justify-between gap-2">
                                            <div>
                                              <h3 className="text-[11px] font-semibold text-ink-700">
                                                پارامترهای اختصاصی مرحله
                                              </h3>
                                              <p className="mt-0.5 text-[9px] text-ink-400">
                                                فقط در فرم کارهای همین مرحله نمایش داده می‌شوند.
                                              </p>
                                            </div>
                                            {!readOnly ? (
                                              <Button
                                                variant="paper"
                                                size="sm"
                                                icon={<Plus size={12} />}
                                                onClick={() => openNewStageField(stageIndex)}
                                              >
                                                پارامتر جدید
                                              </Button>
                                            ) : null}
                                          </div>
                                          <div className="overflow-hidden rounded-md border border-line bg-paper-50/80">
                                            {stage.fields?.length ? (
                                              <div className="divide-y divide-line/60">
                                                {stage.fields.map((field, fieldIndex) => (
                                                  <div
                                                    key={field.key}
                                                    className="flex items-center gap-2 px-3 py-2"
                                                  >
                                                    <span className="w-5 shrink-0 text-center font-mono text-[9px] text-ink-300">
                                                      {faNum(fieldIndex + 1)}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="truncate text-[11px] font-semibold text-ink-800">
                                                          {field.label}
                                                        </span>
                                                        {field.required ? (
                                                          <span className="rounded bg-copper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-600">
                                                            الزامی
                                                          </span>
                                                        ) : null}
                                                      </div>
                                                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] text-ink-400">
                                                        <span>{FIELD_TYPE_LABELS[field.type]}</span>
                                                        <KeyChip>{field.key}</KeyChip>
                                                        {field.masterTypeKey ? (
                                                          <span>مبنا: {field.masterTypeKey}</span>
                                                        ) : null}
                                                      </div>
                                                    </div>
                                                    {!readOnly ? (
                                                      <div className="flex shrink-0 items-center gap-0.5">
                                                        <IconAction
                                                          label="ویرایش پارامتر"
                                                          onClick={() =>
                                                            openStageField(stageIndex, fieldIndex)
                                                          }
                                                        >
                                                          <PencilSimple size={12} />
                                                        </IconAction>
                                                        <IconAction
                                                          label="حذف پارامتر"
                                                          danger
                                                          onClick={() =>
                                                            setDeleteTarget({
                                                              type: 'stage_field',
                                                              stageIndex,
                                                              index: fieldIndex,
                                                            })
                                                          }
                                                        >
                                                          <Trash size={12} />
                                                        </IconAction>
                                                      </div>
                                                    ) : null}
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="px-3 py-3 text-center text-[10px] text-ink-400">
                                                هنوز پارامتر اختصاصی برای این مرحله تعریف نشده است.
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        <div>
                                          <div className="mb-2 flex items-center justify-between gap-2">
                                            <h3 className="text-[11px] font-semibold text-ink-700">
                                              کارهای این مرحله
                                            </h3>
                                            {!readOnly ? (
                                              <Button
                                                variant="paper"
                                                size="sm"
                                                icon={<Plus size={12} />}
                                                onClick={() => openNewTask(stageIndex)}
                                              >
                                                کار جدید
                                              </Button>
                                            ) : null}
                                          </div>
                                          <div className="overflow-hidden rounded-md border border-line bg-paper-50/80">
                                            {stage.tasks.length ? (
                                              <div className="overflow-x-auto scroll-thin">
                                                <table className="w-full min-w-[720px] border-collapse text-[11px]">
                                                  <thead className="bg-paper-100/70 text-[9px] text-ink-500">
                                                    <tr className="border-b border-line">
                                                      <th className="w-10 px-2 py-2 text-center font-semibold">
                                                        #
                                                      </th>
                                                      <th className="px-2 py-2 text-start font-semibold">
                                                        کار
                                                      </th>
                                                      <th className="px-2 py-2 text-start font-semibold">
                                                        نوع
                                                      </th>
                                                      <th className="px-2 py-2 text-start font-semibold">
                                                        مسئول
                                                      </th>
                                                      <th className="px-2 py-2 text-start font-semibold">
                                                        مهلت
                                                      </th>
                                                      <th className="px-2 py-2 text-start font-semibold">
                                                        پیوست
                                                      </th>
                                                      <th className="w-20 px-2 py-2 text-end font-semibold">
                                                        عملیات
                                                      </th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-line/60">
                                                    {stage.tasks.map((task, taskIndex) => (
                                                      <tr
                                                        key={task.key}
                                                        className="hover:bg-paper-100/50"
                                                      >
                                                        <td className="px-2 py-2 text-center font-mono text-[10px] text-ink-400">
                                                          {faNum(taskIndex + 1)}
                                                        </td>
                                                        <td className="px-2 py-2">
                                                          <div className="font-semibold text-ink-800">
                                                            {task.name}
                                                          </div>
                                                          <div className="mt-0.5 flex items-center gap-1">
                                                            <KeyChip>{task.key}</KeyChip>
                                                            {task.condition ? (
                                                              <span className="rounded bg-ochre-50 px-1.5 py-0.5 text-[9px] text-ochre-600">
                                                                شرطی
                                                              </span>
                                                            ) : null}
                                                          </div>
                                                        </td>
                                                        <td className="px-2 py-2">
                                                          <span
                                                            className={cn(
                                                              'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                                                              task.kind === 'approval'
                                                                ? 'bg-ink-900 text-paper-50'
                                                                : task.kind === 'selection'
                                                                  ? 'bg-copper-100 text-copper-700'
                                                                  : 'bg-paper-200 text-ink-700',
                                                            )}
                                                          >
                                                            {task.kind === 'approval'
                                                              ? 'تأیید'
                                                              : task.kind === 'selection'
                                                                ? 'انتخاب'
                                                                : 'اقدام'}
                                                          </span>
                                                        </td>
                                                        <td className="px-2 py-2 text-[10px] text-ink-600">
                                                          {task.assignee.type === 'role'
                                                            ? roleDisplay(
                                                                task.assignee.value,
                                                                roleOptions,
                                                              )
                                                            : task.assignee.type === 'user'
                                                              ? (masterOptions.data?.users.find(
                                                                  (candidate) =>
                                                                    candidate.id ===
                                                                    task.assignee.value,
                                                                )?.name ?? 'کاربر مشخص')
                                                              : assigneeTypeLabels[
                                                                  task.assignee
                                                                    .type as AssigneeOption
                                                                ] ?? task.assignee.type}
                                                        </td>
                                                        <td className="px-2 py-2 font-mono text-[10px] text-ink-500">
                                                          {task.dueInHours
                                                            ? `${faNum(task.dueInHours)} ساعت`
                                                            : '—'}
                                                        </td>
                                                        <td className="px-2 py-2 text-[10px] text-ink-500">
                                                          {[
                                                            task.formFields?.length
                                                              ? `${faNum(task.formFields.length)} فیلد`
                                                              : '',
                                                            task.requiredDocuments?.length
                                                              ? `${faNum(task.requiredDocuments.length)} مدرک`
                                                              : '',
                                                          ]
                                                            .filter(Boolean)
                                                            .join(' · ') || '—'}
                                                        </td>
                                                        <td className="px-2 py-2">
                                                          {!readOnly ? (
                                                            <div className="flex items-center justify-end gap-0.5">
                                                              <IconAction
                                                                label="ویرایش کار"
                                                                onClick={() =>
                                                                  openTask(stageIndex, taskIndex)
                                                                }
                                                              >
                                                                <PencilSimple size={12} />
                                                              </IconAction>
                                                              <IconAction
                                                                label="حذف کار"
                                                                danger
                                                                onClick={() =>
                                                                  setDeleteTarget({
                                                                    type: 'task',
                                                                    stageIndex,
                                                                    taskIndex,
                                                                  })
                                                                }
                                                              >
                                                                <Trash size={12} />
                                                              </IconAction>
                                                            </div>
                                                          ) : (
                                                            <span className="block text-end text-[10px] text-ink-300">
                                                              —
                                                            </span>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            ) : (
                                              <p className="px-3 py-4 text-center text-[10px] text-ink-400">
                                                کار فعالی برای این مرحله تعریف نشده است؛ کاربران پس از تکمیل
                                                مرحله قبل به این مرحله منتقل می‌شوند.
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        <div>
                                          <div className="mb-2 flex items-center justify-between gap-2">
                                            <div>
                                              <h3 className="text-[11px] font-semibold text-ink-700">
                                                مسیرهای خروج مرحله
                                              </h3>
                                              <p className="mt-0.5 text-[9px] text-ink-400">
                                                اگر مسیری تعریف نشود، گردش به ترتیب مراحل ادامه پیدا می‌کند.
                                              </p>
                                            </div>
                                            {!readOnly ? (
                                              <Button
                                                variant="paper"
                                                size="sm"
                                                icon={<Plus size={12} />}
                                                onClick={() => openNewTransition(stageIndex)}
                                              >
                                                مسیر جدید
                                              </Button>
                                            ) : null}
                                          </div>
                                          <div className="overflow-hidden rounded-md border border-line bg-paper-50/80">
                                            {stage.transitions?.length ? (
                                              <div className="divide-y divide-line/60">
                                                {stage.transitions.map((transition, transitionIndex) => {
                                                  const targetLabel =
                                                    transition.type === 'stage'
                                                      ? stages.find(
                                                          (candidate) =>
                                                            candidate.key === transition.stageKey,
                                                        )?.name ?? transition.stageKey
                                                      : transition.type === 'case_type'
                                                        ? caseTypes.data?.find(
                                                            (candidate) =>
                                                              candidate.key ===
                                                              transition.caseTypeKey,
                                                          )?.name ?? transition.caseTypeKey
                                                        : 'پایان پرونده';
                                                  return (
                                                    <div
                                                      key={`${transition.type}-${transitionIndex}`}
                                                      className="flex items-center gap-2 px-3 py-2"
                                                    >
                                                      <span className="w-5 shrink-0 text-center font-mono text-[9px] text-ink-300">
                                                        {faNum(transitionIndex + 1)}
                                                      </span>
                                                      <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                          <span className="text-[11px] font-semibold text-ink-800">
                                                            {transition.label ||
                                                              transitionTypeLabels[transition.type]}
                                                          </span>
                                                          <span className="rounded bg-paper-200 px-1.5 py-0.5 text-[9px] font-semibold text-ink-600">
                                                            {transitionTypeLabels[transition.type]}
                                                          </span>
                                                          {transition.condition ? (
                                                            <span className="rounded bg-ochre-50 px-1.5 py-0.5 text-[9px] text-ochre-600">
                                                              شرطی
                                                            </span>
                                                          ) : null}
                                                        </div>
                                                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] text-ink-400">
                                                          <span>مقصد: {targetLabel}</span>
                                                          {transition.condition ? (
                                                            <span>
                                                              شرط: {transition.condition.field}{' '}
                                                              {conditionOperatorLabels[
                                                                transition.condition.op
                                                              ]}{' '}
                                                              {String(transition.condition.value ?? '')}
                                                            </span>
                                                          ) : (
                                                            <span>همیشه</span>
                                                          )}
                                                        </div>
                                                      </div>
                                                      {!readOnly ? (
                                                        <div className="flex shrink-0 items-center gap-0.5">
                                                          <IconAction
                                                            label="ویرایش مسیر"
                                                            onClick={() =>
                                                              openTransition(
                                                                stageIndex,
                                                                transitionIndex,
                                                              )
                                                            }
                                                          >
                                                            <PencilSimple size={12} />
                                                          </IconAction>
                                                          <IconAction
                                                            label="حذف مسیر"
                                                            danger
                                                            onClick={() =>
                                                              setDeleteTarget({
                                                                type: 'transition',
                                                                stageIndex,
                                                                index: transitionIndex,
                                                              })
                                                            }
                                                          >
                                                            <Trash size={12} />
                                                          </IconAction>
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <p className="px-3 py-3 text-center text-[10px] text-ink-400">
                                                مسیر خروج سفارشی تعریف نشده است؛ گردش پیش‌فرض فعال است.
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="گردش کار هنوز مرحله‌ای ندارد."
                    description="اولین مرحله را اضافه کنید؛ هر مرحله می‌تواند یک یا چند کار داشته باشد."
                    action={
                      !readOnly ? (
                        <Button variant="paper" size="sm" onClick={addStage}>
                          افزودن اولین مرحله
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            ) : null}

            {tab === 'documents' ? (
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink-900">مدارک ضمیمه</h2>
                    <p className="mt-1 text-[10px] leading-5 text-ink-400">
                      مدارکی که برای پرونده یا یک مرحله لازم می‌شوند.
                    </p>
                  </div>
                  {!readOnly ? (
                    <Button
                      variant="paper"
                      size="sm"
                      icon={<Plus size={13} />}
                      onClick={openNewDocument}
                    >
                      مدرک جدید
                    </Button>
                  ) : null}
                </div>
                {documents.length ? (
                  <div className="divide-y divide-line/70 rounded-lg border border-line bg-paper-50/40">
                    {documents.map((document, index) => (
                      <div
                        key={document.key}
                        id={`builder-document-${document.key}`}
                        className={cn(
                          'flex scroll-mt-24 items-center gap-2.5 px-3 py-2.5 transition',
                          flashTarget === `builder-document-${document.key}` && 'bg-copper-50/70',
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-100 text-ink-400">
                          <Warning size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-ink-800">{document.name}</span>
                            {document.required ? (
                              <span className="rounded bg-copper-50 px-1.5 py-0.5 text-[9px] font-semibold text-copper-600">
                                الزامی
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-ink-400">
                            <KeyChip>{document.key}</KeyChip>
                            <span>
                              {document.stageKey
                                ? stages.find((stage) => stage.key === document.stageKey)?.name ??
                                  'مرحله نامشخص'
                                : 'کل پرونده'}
                            </span>
                          </div>
                        </div>
                        {!readOnly ? (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <IconAction label="ویرایش مدرک" onClick={() => openDocument(index)}>
                              <PencilSimple size={13} />
                            </IconAction>
                            <IconAction
                              label="حذف مدرک"
                              danger
                              onClick={() => setDeleteTarget({ type: 'document', index })}
                            >
                              <Trash size={13} />
                            </IconAction>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="مدرکی تعریف نشده."
                    description="اگر برای پرونده فاکتور، قرارداد یا رسید لازم است، آن را اینجا اضافه کنید."
                    action={
                      !readOnly ? (
                        <Button variant="paper" size="sm" onClick={openNewDocument}>
                          افزودن مدرک
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            ) : null}

            {tab === 'settings' ? (
              <SettingsTab
                definition={definition}
                readOnly={readOnly}
                onChange={updateDefinition}
              />
            ) : null}
          </div>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-xs font-semibold text-ink-900">خلاصه گردش کار</h2>
                <p className="mt-0.5 text-[9px] text-ink-400">ترتیب اجرای مراحل</p>
              </div>
              <span className="rounded border border-line bg-paper-100 px-2 py-0.5 font-mono text-[9px] text-ink-500">
                {faNum(stages.length)} مرحله
              </span>
            </div>
            <div className="divide-y divide-line/60">
              {stages.length ? (
                stages.map((stage, index) => (
                  <div key={stage.key} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-paper-100 font-mono text-[9px] text-ink-500">
                      {faNum(index + 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-semibold text-ink-700">
                        {stage.name}
                      </div>
                      <div className="mt-0.5 truncate text-[9px] text-ink-400">
                        {stage.tasks.length
                          ? `${faNum(stage.tasks.length)} کار · ${stage.tasks
                              .map((task) =>
                                task.assignee.type === 'role'
                                  ? roleDisplay(task.assignee.value, roleOptions)
                                  : task.assignee.type === 'user'
                                    ? (masterOptions.data?.users.find(
                                        (candidate) =>
                                          candidate.id === task.assignee.value,
                                      )?.name ?? 'کاربر مشخص')
                                    : assigneeTypeLabels[
                                        task.assignee.type as AssigneeOption
                                      ] ?? '',
                              )
                              .join('، ')}`
                          : 'بدون کار · عبور خودکار'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-[10px] text-ink-400">
                  مرحله‌ای تعریف نشده است.
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center [direction:ltr]">
              <SummaryCell label="فیلد" value={definition.fields.length} />
              <SummaryCell label="کار" value={taskTotal} />
              <SummaryCell label="مدرک" value={documents.length} />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-verdigris-600" />
                <h2 ref={healthRef} className="text-xs font-semibold text-ink-900">
                  اعتبارسنجی ساختار
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                loading={checking}
                onClick={() => void runHealthCheck()}
              >
                بررسی
              </Button>
            </div>
            <div className="px-4 py-3">
              {health === null ? (
                <p className="text-[10px] leading-6 text-ink-400">
                  پیش از انتشار، صحت فرم، گردش کار، شرط‌ها و مدارک را بررسی کنید.
                </p>
              ) : health.ok && !health.issues.length ? (
                <div className="flex items-start gap-2 rounded-lg border border-verdigris-100 bg-verdigris-50 px-3 py-2.5">
                  <CheckCircle size={16} className="mt-0.5 shrink-0 text-verdigris-600" />
                  <div>
                    <p className="text-[11px] font-semibold text-verdigris-700">آمادهٔ انتشار است.</p>
                    <p className="mt-1 text-[9px] leading-5 text-verdigris-600">
                      هیچ خطا یا هشداری پیدا نشد.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {health.ok ? (
                    <p className="rounded-lg border border-verdigris-100 bg-verdigris-50 px-2.5 py-2 text-[9px] leading-5 text-verdigris-700">
                      خطای بازدارنده‌ای نیست؛ هشدارها را مرور کنید.
                    </p>
                  ) : null}
                  {health.issues.map((issue, index) => {
                    const target = issueTarget(issue);
                    const className = cn(
                      'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-[9px] leading-5',
                      issue.level === 'error'
                        ? 'border-stamp-100 bg-stamp-50 text-stamp-600'
                        : 'border-ochre-100 bg-ochre-50 text-ochre-600',
                      target
                        ? 'focus-ring text-start transition hover:brightness-[0.97]'
                        : undefined,
                    );
                    const body = (
                      <>
                        {issue.level === 'error' ? (
                          <WarningCircle size={13} className="mt-0.5 shrink-0" />
                        ) : (
                          <Warning size={13} className="mt-0.5 shrink-0" />
                        )}
                        <span className="flex-1">{issue.message}</span>
                        {target ? (
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 font-semibold opacity-60">
                            {target.label}
                            <ArrowLeft size={10} />
                          </span>
                        ) : null}
                      </>
                    );
                    const key = `${issue.path ?? ''}-${index}`;
                    return target ? (
                      <button
                        key={key}
                        type="button"
                        className={className}
                        onClick={() => jumpToIssue(issue)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={key} className={className}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="پیش‌نمایش فرم پرونده"
        description="همان چیزی که ثبت‌کنندهٔ پرونده می‌بیند؛ بدون ذخیره‌سازی."
        size="lg"
      >
        <CaseFormPreview
          definition={definition}
          options={masterOptions.data}
          onClose={() => setPreviewOpen(false)}
        />
      </Modal>

      <Modal
        open={Boolean(fieldEditor)}
        onClose={() => setFieldEditor(null)}
        title={
          fieldEditor?.scope === 'stage'
            ? fieldEditor.index === null
              ? 'پارامتر مرحله جدید'
              : 'ویرایش پارامتر مرحله'
            : fieldEditor?.index === null
              ? 'فیلد جدید'
              : 'ویرایش فیلد'
        }
        description="کلید فیلد در کل فرآیند باید یکتا باشد. پارامترهای مرحله فقط در فرم کارهای همان مرحله نمایش داده می‌شوند."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFieldEditor(null)}>
              انصراف
            </Button>
            <Button variant="ink" onClick={saveField}>
              ذخیره فیلد
            </Button>
          </>
        }
      >
        {fieldEditor ? (
          <FieldEditorFields
            draft={fieldEditor.draft}
            fields={allDefinitionFields(definition).filter(
              (field) => field.key !== fieldEditor.draft.key,
            )}
            masterTypes={(masterOptions.data?.customTypes ?? []).filter(
              (type) => type.entity === 'custom',
            )}
            error={editorError}
            onChange={(patch) =>
              setFieldEditor((current) =>
                current ? { ...current, draft: { ...current.draft, ...patch } } : current,
              )
            }
            onError={setEditorError}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(taskEditor)}
        onClose={() => setTaskEditor(null)}
        title={taskEditor?.taskIndex === null ? 'کار جدید' : 'ویرایش کار'}
        description={
          currentStage ? `در مرحلهٔ «${currentStage.name}»` : 'کارهای هر مرحله، مسیر پرونده را می‌سازند.'
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTaskEditor(null)}>
              انصراف
            </Button>
            <Button variant="ink" onClick={saveTask}>
              ذخیره کار
            </Button>
          </>
        }
      >
        {taskEditor ? (
          <TaskEditorFields
            draft={taskEditor.draft}
            fields={
              currentStage
                ? fieldsForStage(definition, currentStage.key)
                : definition.fields
            }
            allFields={allDefinitionFields(definition)}
            documents={documents}
            roles={roleOptions}
            error={editorError}
            onChange={(patch) =>
              setTaskEditor((current) =>
                current ? { ...current, draft: { ...current.draft, ...patch } } : current,
              )
            }
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(transitionEditor)}
        onClose={() => setTransitionEditor(null)}
        title={
          transitionEditor?.index === null ? 'مسیر خروج جدید' : 'ویرایش مسیر خروج'
        }
        description="تعیین کنید پس از تکمیل کارهای این مرحله، پرونده به کجا منتقل شود."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransitionEditor(null)}>
              انصراف
            </Button>
            <Button variant="ink" onClick={saveTransition}>
              ذخیره مسیر
            </Button>
          </>
        }
      >
        {transitionEditor ? (
          <div className="space-y-3">
            <Field label="عنوان مسیر">
              <Input
                value={transitionEditor.draft.label ?? ''}
                onChange={(event) =>
                  setTransitionEditor((current) =>
                    current
                      ? { ...current, draft: { ...current.draft, label: event.target.value } }
                      : current,
                  )
                }
                placeholder="مثلاً تأیید مدیر یا ارسال به خرید"
              />
            </Field>
            <Field label="نوع خروج">
              <Select
                value={transitionEditor.draft.type}
                onChange={(event) => {
                  const type = event.target.value as StageTransition['type'];
                  setTransitionEditor((current) => {
                    if (!current) return current;
                    const stage = definition.stages[current.stageIndex];
                    const fallbackStage = definition.stages.find(
                      (candidate) => candidate.key !== stage?.key,
                    );
                    const publishedCaseType = caseTypes.data?.find(
                      (candidate) => candidate.status === 'published',
                    );
                    return {
                      ...current,
                      draft: {
                        ...current.draft,
                        type,
                        stageKey:
                          type === 'stage'
                            ? current.draft.stageKey ?? fallbackStage?.key
                            : undefined,
                        caseTypeKey:
                          type === 'case_type'
                            ? current.draft.caseTypeKey ?? publishedCaseType?.key
                            : undefined,
                      },
                    };
                  });
                }}
              >
                {(Object.keys(transitionTypeLabels) as StageTransition['type'][]).map(
                  (type) => (
                    <option key={type} value={type}>
                      {transitionTypeLabels[type]}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            {transitionEditor.draft.type === 'stage' ? (
              <Field label="مرحله مقصد">
                <Select
                  value={transitionEditor.draft.stageKey ?? ''}
                  onChange={(event) =>
                    setTransitionEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, stageKey: event.target.value },
                          }
                        : current,
                    )
                  }
                >
                  <option value="">انتخاب مرحله</option>
                  {definition.stages
                    .filter(
                      (stage) =>
                        stage.key !==
                        definition.stages[transitionEditor.stageIndex]?.key,
                    )
                    .map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            {transitionEditor.draft.type === 'case_type' ? (
              <Field label="فرآیند مقصد">
                <Select
                  value={transitionEditor.draft.caseTypeKey ?? ''}
                  onChange={(event) =>
                    setTransitionEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, caseTypeKey: event.target.value },
                          }
                        : current,
                    )
                  }
                >
                  <option value="">انتخاب فرآیند منتشرشده</option>
                  {(caseTypes.data ?? [])
                    .filter((caseType) => caseType.status === 'published')
                    .map((caseType) => (
                      <option key={caseType.key} value={caseType.key}>
                        {caseType.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}
            <div className="rounded-md border border-line bg-paper-100/40 p-3">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-ink-700">
                <input
                  type="checkbox"
                  checked={Boolean(transitionEditor.draft.condition)}
                  onChange={(event) =>
                    setTransitionEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              condition: event.target.checked
                                ? {
                                    field:
                                      fieldsForStage(
                                        definition,
                                        definition.stages[current.stageIndex]?.key ?? '',
                                      )[0]?.key ?? '',
                                    op: 'eq',
                                    value: '',
                                  }
                                : undefined,
                            },
                          }
                        : current,
                    )
                  }
                />
                این مسیر فقط هنگام برقراری شرط اجرا شود
              </label>
              {transitionEditor.draft.condition ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Select
                    value={transitionEditor.draft.condition.field}
                    onChange={(event) =>
                      setTransitionEditor((current) =>
                        current && current.draft.condition
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                condition: {
                                  ...current.draft.condition,
                                  field: event.target.value,
                                },
                              },
                            }
                          : current,
                      )
                    }
                  >
                    {fieldsForStage(
                      definition,
                      definition.stages[transitionEditor.stageIndex]?.key ?? '',
                    ).map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={transitionEditor.draft.condition.op}
                    onChange={(event) =>
                      setTransitionEditor((current) =>
                        current && current.draft.condition
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                condition: {
                                  ...current.draft.condition,
                                  op: event.target.value as Condition['op'],
                                },
                              },
                            }
                          : current,
                      )
                    }
                  >
                    {(Object.keys(conditionOperatorLabels) as Condition['op'][]).map(
                      (op) => (
                        <option key={op} value={op}>
                          {conditionOperatorLabels[op]}
                        </option>
                      ),
                    )}
                  </Select>
                  <Input
                    value={String(transitionEditor.draft.condition.value ?? '')}
                    onChange={(event) =>
                      setTransitionEditor((current) =>
                        current && current.draft.condition
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                condition: {
                                  ...current.draft.condition,
                                  value: event.target.value,
                                },
                              },
                            }
                          : current,
                      )
                    }
                    placeholder="مقدار"
                  />
                </div>
              ) : null}
            </div>
            {editorError ? (
              <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] text-stamp-600">
                {editorError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(documentEditor)}
        onClose={() => setDocumentEditor(null)}
        title={documentEditor?.index === null ? 'مدرک جدید' : 'ویرایش مدرک'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDocumentEditor(null)}>
              انصراف
            </Button>
            <Button variant="ink" onClick={saveDocument}>
              ذخیره مدرک
            </Button>
          </>
        }
      >
        {documentEditor ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <Field label="نام مدرک" required>
                <Input
                  value={documentEditor.draft.name}
                  onChange={(event) =>
                    setDocumentEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, name: event.target.value },
                          }
                        : current,
                    )
                  }
                  placeholder="مثلاً فاکتور خرید"
                />
              </Field>
              <Field label="کلید فنی" required hint="حروف لاتین، عدد و زیرخط">
                <Input
                  value={documentEditor.draft.key}
                  onChange={(event) => {
                    setEditorError('');
                    setDocumentEditor((current) =>
                      current
                        ? {
                            ...current,
                            draft: { ...current.draft, key: event.target.value },
                          }
                        : current,
                    );
                  }}
                  dir="ltr"
                />
              </Field>
            </div>
            <Field label="مرتبط با مرحله">
              <Select
                value={documentEditor.draft.stageKey ?? ''}
                onChange={(event) =>
                  setDocumentEditor((current) =>
                    current
                      ? {
                          ...current,
                          draft: { ...current.draft, stageKey: event.target.value || undefined },
                        }
                      : current,
                  )
                }
              >
                <option value="">کل پرونده</option>
                {stages.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
              <input
                type="checkbox"
                checked={Boolean(documentEditor.draft.required)}
                onChange={(event) =>
                  setDocumentEditor((current) =>
                    current
                      ? {
                          ...current,
                          draft: { ...current.draft, required: event.target.checked },
                        }
                      : current,
                  )
                }
                className="h-4 w-4 accent-copper-500"
              />
              این مدرک الزامی است
            </label>
            {editorError ? (
              <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] text-stamp-600">
                {editorError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="حذف از ساختار فرآیند"
        description={
          deleteTarget?.type === 'field' || deleteTarget?.type === 'stage_field'
            ? 'این پارامتر از فرم حذف می‌شود و از کارها، شرط‌ها و تنظیمات مرتبط هم برداشته می‌شود. دادهٔ پرونده‌های موجود پاک نمی‌شود.'
            : deleteTarget?.type === 'transition'
              ? 'این مسیر خروج حذف می‌شود و گردش پیش‌فرض مرحله جای آن را می‌گیرد.'
              : deleteTarget?.type === 'stage'
                ? 'این مرحله و همهٔ کارهای آن حذف می‌شود. ارجاع مدارک به این مرحله هم برداشته می‌شود.'
                : deleteTarget?.type === 'task'
                  ? 'این کار از مرحله حذف می‌شود. پرونده‌های در جریان ممکن است به این کار نیاز داشته باشند.'
                  : 'این مدرک از فهرست مدارک حذف می‌شود و از کارهای مرتبط برداشته می‌شود.'
        }
        confirmLabel="حذف"
      />
    </div>
  );
}

function GeneralTab({
  meta,
  caseKey,
  users,
  readOnly,
  onChange,
}: {
  meta: {
    name: string;
    description: string;
    icon: string;
    referencePrefix: string;
    ownerId: string | null;
  };
  caseKey: string;
  users: UserSummary[];
  readOnly: boolean;
  onChange: (patch: Partial<typeof meta>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">اطلاعات کلی</h2>
        <p className="mt-1 text-[10px] leading-5 text-ink-400">
          نام و توصیف فرآیند در فهرست پرونده‌ها و صفحهٔ ثبت دیده می‌شود.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام فرآیند" required>
          <Input
            value={meta.name}
            onChange={(event) => onChange({ name: event.target.value })}
            disabled={readOnly}
          />
        </Field>
        <Field label="کلید فنی" hint="پس از ساخت تغییر نمی‌کند">
          <Input value={caseKey} dir="ltr" disabled />
        </Field>
      </div>
      <Field label="توضیح کوتاه">
        <Textarea
          value={meta.description}
          onChange={(event) => onChange({ description: event.target.value })}
          className="min-h-20"
          disabled={readOnly}
        />
      </Field>
      <Field
        label="مالک فرآیند"
        hint="مالک فرآیند می‌تواند این فرآیند و مراحل آن را ویرایش و منتشر کند. برای واگذاری مسئولیت فرآیند به یک کاربر مشخص، او را انتخاب کنید."
      >
        <Select
          value={meta.ownerId ?? ''}
          onChange={(event) =>
            onChange({ ownerId: event.target.value || null })
          }
          disabled={readOnly}
        >
          <option value="">بدون مالک مشخص (فقط مدیر سیستم)</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} — {user.jobTitle ?? user.email}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="پیشوند شماره پرونده" hint="۲ تا ۸ حرف لاتین">
          <Input
            value={meta.referencePrefix}
            onChange={(event) =>
              onChange({
                referencePrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
              })
            }
            dir="ltr"
            maxLength={8}
            disabled={readOnly}
          />
        </Field>
        <Field label="نگارهٔ فرآیند">
          <div className="flex flex-wrap gap-1.5">
            {CASE_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                disabled={readOnly}
                onClick={() => onChange({ icon })}
                className={cn(
                  'focus-ring flex h-8 w-8 items-center justify-center rounded-md border transition disabled:opacity-50',
                  meta.icon === icon
                    ? 'border-copper-400 bg-copper-50 text-copper-600'
                    : 'border-line bg-paper-50/60 text-ink-400 hover:border-ink-300 hover:text-ink-700',
                )}
                aria-label={icon}
              >
                <CaseTypeIcon icon={icon} size={15} />
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

function FieldEditorFields({
  draft,
  fields,
  masterTypes,
  error,
  onChange,
  onError,
}: {
  draft: FieldDef;
  fields: FieldDef[];
  masterTypes: MasterDataTypeDto[];
  error: string;
  onChange: (patch: Partial<FieldDef>) => void;
  onError: (message: string) => void;
}) {
  const supportsPlaceholder = [
    'text',
    'textarea',
    'number',
    'currency',
    'date',
    'email',
    'phone',
    'url',
  ].includes(draft.type);
  const supportsOptions = ['select', 'radio', 'multiselect'].includes(draft.type);
  const setCondition = (patch: Partial<Condition> | null) => {
    if (patch === null) {
      onChange({ visibleWhen: undefined });
      return;
    }
    const base: Condition = draft.visibleWhen ?? {
      field: fields[0]?.key ?? '',
      op: 'eq',
      value: '',
    };
    onChange({ visibleWhen: { ...base, ...patch } });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام نمایشی" required>
          <Input
            value={draft.label}
            onChange={(event) => {
              onError('');
              onChange({ label: event.target.value });
            }}
            placeholder="مثلاً مبلغ درخواست"
          />
        </Field>
        <Field label="کلید فنی" required hint="حروف لاتین، عدد و زیرخط">
          <Input
            value={draft.key}
            onChange={(event) => {
              onError('');
              onChange({ key: event.target.value });
            }}
            dir="ltr"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نوع فیلد" required>
          <Select
            value={draft.type}
            onChange={(event) => {
              const type = event.target.value as FieldType;
              const needsOptions = ['select', 'radio', 'multiselect'].includes(type);
              onChange({
                type,
                masterTypeKey: type === 'master' ? draft.masterTypeKey : undefined,
                options: needsOptions
                  ? draft.options?.length
                    ? draft.options
                    : [{ label: '', value: '' }]
                  : undefined,
                columns:
                  type === 'table'
                    ? draft.columns?.length
                      ? draft.columns
                      : [{ key: 'column_1', label: 'ستون ۱', type: 'text' }]
                    : undefined,
                minRows: type === 'table' ? (draft.minRows ?? 0) : undefined,
                maxRows: type === 'table' ? draft.maxRows : undefined,
                addLabel: type === 'table' ? draft.addLabel : undefined,
              });
            }}
          >
            {FIELD_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-1 pb-1">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
            <input
              type="checkbox"
              checked={Boolean(draft.required) && !draft.hidden && !draft.readonly}
              disabled={Boolean(draft.hidden || draft.readonly)}
              onChange={(event) => onChange({ required: event.target.checked })}
              className="h-4 w-4 accent-copper-500 disabled:cursor-not-allowed"
            />
            تکمیل این فیلد الزامی است
          </label>
          {draft.hidden || draft.readonly ? (
            <p className="text-[10px] text-ink-400">
              فیلد پنهان یا فقط‌خواندنی نمی‌تواند الزامی باشد.
            </p>
          ) : null}
        </div>
      </div>

      {draft.type === 'master' ? (
        <Field
          label="نوع داده پایه"
          required
          hint="رکوردهای این نوع در فرم پرونده قابل انتخاب خواهند بود."
        >
          <Select
            value={draft.masterTypeKey ?? ''}
            onChange={(event) => onChange({ masterTypeKey: event.target.value || undefined })}
          >
            <option value="">انتخاب نوع داده…</option>
            {masterTypes.map((type) => (
              <option key={type.key} value={type.key}>
                {type.name} ({type.recordCount} رکورد)
              </option>
            ))}
          </Select>
          {!masterTypes.length ? (
            <p className="mt-1 text-[11px] text-ink-400">
              هنوز نوع داده سفارشی تعریف نشده است. از بخش «داده‌های پایه» آن را بسازید.
            </p>
          ) : null}
        </Field>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="بخش فرم" hint="فیلدهای هم‌بخش زیر یک عنوان گروه‌بندی می‌شوند.">
          <Input
            value={draft.section ?? ''}
            onChange={(event) => onChange({ section: event.target.value || undefined })}
            placeholder="مثلاً اطلاعات مالی"
          />
        </Field>
        <Field label="عرض فیلد">
          <Select
            value={draft.width ?? ''}
            onChange={(event) =>
              onChange({ width: (event.target.value || undefined) as FieldDef['width'] })
            }
          >
            <option value="">خودکار</option>
            {FIELD_WIDTHS.map((width) => (
              <option key={width} value={width}>
                {FIELD_WIDTH_LABELS[width]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(draft.readonly)}
            onChange={(event) =>
              onChange({
                readonly: event.target.checked,
                required: event.target.checked ? false : draft.required,
              })
            }
            className="h-4 w-4 accent-copper-500"
          />
          این فیلد فقط‌خواندنی باشد
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(draft.hidden)}
            onChange={(event) =>
              onChange({
                hidden: event.target.checked,
                required: event.target.checked ? false : draft.required,
              })
            }
            className="h-4 w-4 accent-copper-500"
          />
          از فرم پنهان باشد (فقط در داده‌ها ذخیره شود)
        </label>
      </div>

      {draft.type === 'table' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="حداقل ردیف">
              <Input
                type="number"
                min={0}
                value={draft.minRows ?? 0}
                onChange={(event) =>
                  onChange({
                    minRows: event.target.value === '' ? 0 : Number(event.target.value),
                  })
                }
                dir="ltr"
                className="font-mono"
              />
            </Field>
            <Field label="حداکثر ردیف" hint="خالی یعنی بدون محدودیت">
              <Input
                type="number"
                min={1}
                value={draft.maxRows ?? ''}
                onChange={(event) =>
                  onChange({
                    maxRows:
                      event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
                dir="ltr"
                className="font-mono"
              />
            </Field>
            <Field label="برچسب دکمه افزودن">
              <Input
                value={draft.addLabel ?? ''}
                onChange={(event) => onChange({ addLabel: event.target.value })}
                placeholder="افزودن ردیف"
              />
            </Field>
          </div>
          <TableColumnsEditor
            columns={draft.columns ?? []}
            masterTypes={masterTypes}
            onChange={(columns) => onChange({ columns })}
          />
        </>
      ) : null}

      {supportsOptions ? (
        <Field label="گزینه‌ها" hint="برای هر گزینه، برچسب و مقدار ذخیره‌سازی را وارد کنید.">
          <div className="space-y-2">
            {(draft.options ?? []).map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={option.label}
                  onChange={(event) => {
                    const options = [...(draft.options ?? [])];
                    options[index] = { ...options[index]!, label: event.target.value };
                    onChange({ options });
                  }}
                  placeholder="برچسب"
                  className="h-9 text-xs"
                />
                <Input
                  value={option.value}
                  onChange={(event) => {
                    const options = [...(draft.options ?? [])];
                    options[index] = { ...options[index]!, value: event.target.value };
                    onChange({ options });
                  }}
                  placeholder="value"
                  dir="ltr"
                  className="h-9 max-w-36 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      options: (draft.options ?? []).filter((_, current) => current !== index),
                    })
                  }
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                  aria-label="حذف گزینه"
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
            <Button
              variant="paper"
              size="sm"
              icon={<Plus size={12} />}
              onClick={() =>
                onChange({
                  options: [...(draft.options ?? []), { label: '', value: '' }],
                })
              }
            >
              افزودن گزینه
            </Button>
          </div>
        </Field>
      ) : null}

      {supportsPlaceholder ? (
        <Field label="متن راهنما داخل فیلد">
          <Input
            value={draft.placeholder ?? ''}
            onChange={(event) => onChange({ placeholder: event.target.value })}
            placeholder="مثلاً مبلغ را به ریال وارد کنید"
          />
        </Field>
      ) : null}

      {draft.type === 'number' || draft.type === 'currency' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="حداقل مقدار">
            <Input
              type="number"
              value={draft.min ?? ''}
              onChange={(event) =>
                onChange({ min: event.target.value === '' ? undefined : Number(event.target.value) })
              }
              dir="ltr"
              className="font-mono"
            />
          </Field>
          <Field label="حداکثر مقدار">
            <Input
              type="number"
              value={draft.max ?? ''}
              onChange={(event) =>
                onChange({ max: event.target.value === '' ? undefined : Number(event.target.value) })
              }
              dir="ltr"
              className="font-mono"
            />
          </Field>
        </div>
      ) : null}

      <Field label="توضیح زیر فیلد">
        <Textarea
          value={draft.help ?? ''}
          onChange={(event) => onChange({ help: event.target.value })}
          className="min-h-16 text-xs"
          placeholder="اختیاری؛ اگر نیاز به توضیح بیشتر است بنویسید."
        />
      </Field>

      <div className="rounded-lg border border-line bg-paper-100/45 p-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(draft.visibleWhen)}
            onChange={(event) => setCondition(event.target.checked ? {} : null)}
            className="h-3.5 w-3.5 accent-copper-500"
            disabled={!fields.length}
          />
          فقط در صورت برقراری شرط نمایش داده شود
        </label>
        {draft.visibleWhen ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.3fr_0.8fr_1fr]">
            <Select
              value={draft.visibleWhen.field}
              onChange={(event) => setCondition({ field: event.target.value })}
            >
              <option value="">فیلد شرط…</option>
              {fields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </Select>
            <Select
              value={draft.visibleWhen.op}
              onChange={(event) =>
                setCondition({ op: event.target.value as Condition['op'] })
              }
            >
              <option value="eq">برابر است با</option>
              <option value="neq">برابر نیست با</option>
              <option value="gt">بزرگ‌تر از</option>
              <option value="gte">بزرگ‌تر یا مساوی</option>
              <option value="lt">کوچک‌تر از</option>
              <option value="lte">کوچک‌تر یا مساوی</option>
              <option value="contains">شامل</option>
            </Select>
            <Input
              value={String(draft.visibleWhen.value ?? '')}
              onChange={(event) => setCondition({ value: event.target.value })}
              placeholder="مقدار"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] text-stamp-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TableColumnsEditor({
  columns,
  masterTypes,
  onChange,
}: {
  columns: FieldDef[];
  masterTypes: MasterDataTypeDto[];
  onChange: (columns: FieldDef[]) => void;
}) {
  const update = (index: number, patch: Partial<FieldDef>) => {
    onChange(columns.map((column, current) => (current === index ? { ...column, ...patch } : column)));
  };

  const addColumn = () => {
    const keys = new Set(columns.map((column) => column.key));
    let index = columns.length + 1;
    while (keys.has(`column_${index}`)) index += 1;
    onChange([...columns, { key: `column_${index}`, label: `ستون ${index}`, type: 'text' }]);
  };

  return (
    <Field
      label="ستون‌های جدول"
      hint="هر ستون مانند یک فیلد عمل می‌کند؛ برای ستون انتخابی گزینه‌ها را با کاما جدا کنید."
    >
      <div className="space-y-2">
        {columns.map((column, index) => {
          const needsOptions = ['select', 'radio', 'multiselect'].includes(column.type);
          return (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-line bg-paper-50 p-2.5"
            >
              <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_0.9fr]">
                <Input
                  value={column.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder="برچسب ستون"
                  className="h-9 text-xs"
                />
                <Input
                  value={column.key}
                  onChange={(event) => update(index, { key: event.target.value })}
                  placeholder="key"
                  dir="ltr"
                  className="h-9 font-mono text-[11px]"
                />
                <Select
                  value={column.type}
                  onChange={(event) => {
                    const type = event.target.value as FieldType;
                    const needsOptions = ['select', 'radio', 'multiselect'].includes(type);
                    update(index, {
                      type,
                      masterTypeKey: type === 'master' ? column.masterTypeKey : undefined,
                      options: needsOptions
                        ? column.options?.length
                          ? column.options
                          : [{ label: '', value: '' }]
                        : undefined,
                    });
                  }}
                  className="h-9 text-xs"
                >
                  {FIELD_TYPES.filter((type) => type !== 'table' && type !== 'rollup').map((type) => (
                    <option key={type} value={type}>
                      {FIELD_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-ink-600">
                  <input
                    type="checkbox"
                    checked={Boolean(column.required)}
                    onChange={(event) => update(index, { required: event.target.checked })}
                    className="h-3.5 w-3.5 accent-copper-500"
                  />
                  الزامی
                </label>
                {column.type === 'master' ? (
                  <Select
                    value={column.masterTypeKey ?? ''}
                    onChange={(event) =>
                      update(index, { masterTypeKey: event.target.value || undefined })
                    }
                    className="h-8 max-w-52 text-[11px]"
                  >
                    <option value="">نوع داده پایه…</option>
                    {masterTypes.map((type) => (
                      <option key={type.key} value={type.key}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {needsOptions ? (
                  <Input
                    value={(column.options ?? []).map((option) => option.label).join('، ')}
                    onChange={(event) =>
                      update(index, {
                        options: event.target.value
                          .split(/[,،]/)
                          .map((label) => label.trim())
                          .filter(Boolean)
                          .map((label) => ({ label, value: label })),
                      })
                    }
                    placeholder="گزینه‌ها با کاما"
                    className="h-8 max-w-60 text-[11px]"
                  />
                ) : null}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() =>
                    onChange(columns.filter((_, current) => current !== index))
                  }
                  className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                  aria-label="حذف ستون"
                >
                  <Trash size={13} />
                </button>
              </div>
            </div>
          );
        })}
        <Button variant="paper" size="sm" icon={<Plus size={12} />} onClick={addColumn}>
          افزودن ستون
        </Button>
      </div>
    </Field>
  );
}

function TaskEditorFields({
  draft,
  fields,
  allFields,
  documents,
  roles,
  error,
  onChange,
}: {
  draft: TaskDef;
  fields: FieldDef[];
  allFields: FieldDef[];
  documents: DocumentDef[];
  roles: RoleDto[];
  error: string;
  onChange: (patch: Partial<TaskDef>) => void;
}) {
  const masterOptions = useMasterOptions();
  const assigneeType = (
    ['role', 'user', 'creator', 'manager'].includes(draft.assignee.type)
      ? draft.assignee.type
      : 'role'
  ) as AssigneeOption;
  const toggleField = (key: string) => {
    const current = draft.formFields ?? [];
    onChange({
      formFields: current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : [...current, key],
    });
  };
  const toggleDocument = (key: string) => {
    const current = draft.requiredDocuments ?? [];
    onChange({
      requiredDocuments: current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : [...current, key],
    });
  };
  const setCondition = (patch: Partial<Condition> | null) => {
    if (patch === null) {
      onChange({ condition: undefined });
      return;
    }
    const base: Condition = draft.condition ?? {
      field: fields[0]?.key ?? '',
      op: 'eq',
      value: '',
    };
    onChange({ condition: { ...base, ...patch } });
  };

  const assigneeUser = (masterOptions.data?.users ?? []).find(
    (user) => user.id === draft.assignee.value,
  );
  const formFieldCandidates = fields.filter((field) => !field.hidden);
  const tableFields = allFields.filter((field) => field.type === 'table');
  const selection = draft.selection;
  const sourceTable = tableFields.find((field) => field.key === selection?.sourceField);
  const selectionColumns = sourceTable?.columns ?? [];
  const selectionCopy = selection?.copy ?? [];
  const setSelection = (patch: Partial<NonNullable<TaskDef['selection']>>) => {
    onChange({
      selection: {
        sourceField: selection?.sourceField ?? '',
        labelColumn: selection?.labelColumn,
        copy: selection?.copy,
        ...patch,
      },
    });
  };
  const copyTargetFor = (from: string) =>
    selectionCopy.find((copy) => copy.from === from)?.to ?? '';
  const setCopyTarget = (from: string, to: string) => {
    const rest = selectionCopy.filter((copy) => copy.from !== from);
    setSelection({ copy: to ? [...rest, { from, to }] : rest });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام کار" required>
          <Input
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="مثلاً تأیید مدیر"
          />
        </Field>
        <Field label="کلید فنی" required hint="در کل فرآیند یکتا باشد">
          <Input
            value={draft.key}
            onChange={(event) => onChange({ key: event.target.value })}
            dir="ltr"
          />
        </Field>
      </div>

      <Field label="توضیح">
        <Textarea
          value={draft.description ?? ''}
          onChange={(event) => onChange({ description: event.target.value })}
          className="min-h-16 text-xs"
          placeholder="مسئول چه کاری باید انجام دهد؟"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="نوع کار">
          <Select
            value={draft.kind ?? 'action'}
            onChange={(event) => {
              const kind = event.target.value as 'approval' | 'action' | 'selection';
              onChange({
                kind,
                formFields: kind === 'approval' ? undefined : draft.formFields,
                selection:
                  kind === 'selection'
                    ? (draft.selection ?? { sourceField: '', copy: [] })
                    : undefined,
              });
            }}
          >
            <option value="approval">تأیید / رد</option>
            <option value="action">اقدام</option>
            <option value="selection">انتخاب از جدول</option>
          </Select>
        </Field>
        <Field label="مسئول">
          <Select
            value={assigneeType}
            onChange={(event) => {
              const type = event.target.value as AssigneeOption;
              const defaultRole =
                type === 'role' ? (roles[0]?.key ?? 'manager') : undefined;
              const firstUser = type === 'user' ? masterOptions.data?.users[0]?.id : undefined;
              onChange({
                assignee: { type, value: defaultRole ?? firstUser },
              });
            }}
          >
            {Object.entries(assigneeTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {assigneeType === 'role' ? (
          <Field label="نقش مسئول">
            <Select
              value={draft.assignee.value ?? ''}
              onChange={(event) =>
                onChange({ assignee: { type: 'role', value: event.target.value } })
              }
            >
              <option value="">انتخاب نقش…</option>
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : assigneeType === 'user' ? (
          <Field label="کاربر مسئول">
            <Select
              value={draft.assignee.value ?? ''}
              onChange={(event) =>
                onChange({ assignee: { type: 'user', value: event.target.value } })
              }
            >
              <option value="">انتخاب کاربر…</option>
              {(masterOptions.data?.users ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} — {user.jobTitle ?? user.email}
                </option>
              ))}
            </Select>
            {assigneeUser ? (
              <p className="mt-1.5 rounded-md border border-copper-100 bg-copper-50/60 px-2 py-1.5 text-[9px] leading-4 text-copper-700">
                فقط {assigneeUser.name} می‌تواند این کار را انجام دهد؛ حتی اعضای نقش
                سازمانی او نیز دسترسی نخواهند داشت.
              </p>
            ) : null}
          </Field>
        ) : (
          <Field label="مهلت انجام (ساعت)">
            <Input
              type="number"
              min={1}
              value={draft.dueInHours ?? ''}
              onChange={(event) =>
                onChange({
                  dueInHours: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              dir="ltr"
              className="font-mono"
            />
          </Field>
        )}
      </div>
      {assigneeType === 'role' || assigneeType === 'user' ? (
        <Field label="مهلت انجام (ساعت)">
          <Input
            type="number"
            min={1}
            value={draft.dueInHours ?? ''}
            onChange={(event) =>
              onChange({
                dueInHours: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
            dir="ltr"
            className="max-w-36 font-mono"
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[11px] font-semibold text-ink-700">فیلدهای فرم این کار</h3>
          {draft.kind === 'approval' ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10px] leading-5 text-ink-400">
              کار تأیید فرم ورودی ندارد؛ مسئول فقط تأیید، رد، بازگشت یا درخواست اطلاعات را ثبت می‌کند.
            </p>
          ) : formFieldCandidates.length ? (
            <div className="max-h-40 space-y-1 overflow-y-auto scroll-thin rounded-lg border border-line bg-paper-50 p-2">
              {formFieldCandidates.map((field) => (
                <label
                  key={field.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-ink-700 hover:bg-paper-100"
                >
                  <input
                    type="checkbox"
                    checked={(draft.formFields ?? []).includes(field.key)}
                    onChange={() => toggleField(field.key)}
                    className="h-3.5 w-3.5 accent-copper-500"
                  />
                  <span className="min-w-0 flex-1 truncate">{field.label}</span>
                  <KeyChip>{field.key}</KeyChip>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10px] text-ink-400">
              ابتدا در تب «فرم» فیلد بسازید.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-semibold text-ink-700">مدارک الزامی</h3>
          {documents.length ? (
            <div className="max-h-40 space-y-1 overflow-y-auto scroll-thin rounded-lg border border-line bg-paper-50 p-2">
              {documents.map((document) => (
                <label
                  key={document.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-ink-700 hover:bg-paper-100"
                >
                  <input
                    type="checkbox"
                    checked={(draft.requiredDocuments ?? []).includes(document.key)}
                    onChange={() => toggleDocument(document.key)}
                    className="h-3.5 w-3.5 accent-copper-500"
                  />
                  <span className="min-w-0 flex-1 truncate">{document.name}</span>
                  <KeyChip>{document.key}</KeyChip>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[10px] text-ink-400">
              مدرکی تعریف نشده است.
            </p>
          )}
        </div>
      </div>

      {draft.kind === 'selection' ? (
        <div className="space-y-3 rounded-lg border border-copper-200 bg-copper-50/40 p-3">
          <div>
            <h3 className="text-[11px] font-semibold text-copper-800">انتخاب از جدول</h3>
            <p className="mt-0.5 text-[10px] leading-5 text-copper-700/80">
              مسئول کار یک ردیف از جدول را انتخاب می‌کند و مقادیر ستون‌های مشخص‌شده در فیلدهای
              مقصد نوشته می‌شوند.
            </p>
          </div>
          {tableFields.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="جدول منبع" required>
                  <Select
                    value={selection?.sourceField ?? ''}
                    onChange={(event) =>
                      setSelection({
                        sourceField: event.target.value,
                        labelColumn: undefined,
                        copy: [],
                      })
                    }
                  >
                    <option value="">انتخاب جدول…</option>
                    {tableFields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="ستون عنوان گزینه" hint="برای نمایش خلاصهٔ هر گزینه">
                  <Select
                    value={selection?.labelColumn ?? ''}
                    onChange={(event) =>
                      setSelection({ labelColumn: event.target.value || undefined })
                    }
                    disabled={!sourceTable}
                  >
                    <option value="">بدون عنوان مشخص</option>
                    {selectionColumns.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {sourceTable ? (
                <Field
                  label="کپی مقادیر به فیلدهای پرونده"
                  hint="برای هر ستون، فیلد مقصد را انتخاب کنید؛ ستون‌های بدون مقصد نادیده گرفته می‌شوند."
                >
                  <div className="space-y-1.5">
                    {selectionColumns.map((column) => (
                      <div
                        key={column.key}
                        className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]"
                      >
                        <span className="truncate text-[11px] text-ink-600">
                          {column.label}
                          <KeyChip>{column.key}</KeyChip>
                        </span>
                        <Select
                          value={copyTargetFor(column.key)}
                          onChange={(event) => setCopyTarget(column.key, event.target.value)}
                          className="h-8 text-[11px]"
                        >
                          <option value="">بدون کپی</option>
                          {allFields
                            .filter((field) => field.key !== sourceTable.key)
                            .map((field) => (
                              <option key={field.key} value={field.key}>
                                {field.label} ({field.key})
                              </option>
                            ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                </Field>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-copper-200 px-3 py-3 text-[10px] text-copper-700/80">
              هنوز جدولی در فرآیند تعریف نشده است. ابتدا یک فیلد از نوع «جدول چندردیفی» بسازید.
            </p>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-line bg-paper-100/45 p-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(draft.condition)}
            onChange={(event) => setCondition(event.target.checked ? {} : null)}
            className="h-3.5 w-3.5 accent-copper-500"
          />
          این کار فقط در صورت برقراری شرط اجرا شود
        </label>
        {draft.condition ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.3fr_0.8fr_1fr]">
            <Select
              value={draft.condition.field}
              onChange={(event) => setCondition({ field: event.target.value })}
            >
              <option value="">فیلد شرط…</option>
              {fields.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </Select>
            <Select
              value={draft.condition.op}
              onChange={(event) =>
                setCondition({ op: event.target.value as Condition['op'] })
              }
            >
              <option value="eq">برابر است با</option>
              <option value="neq">برابر نیست با</option>
              <option value="gt">بزرگ‌تر از</option>
              <option value="gte">بزرگ‌تر یا مساوی</option>
              <option value="lt">کوچک‌تر از</option>
              <option value="lte">کوچک‌تر یا مساوی</option>
              <option value="contains">شامل</option>
            </Select>
            <Input
              value={String(draft.condition.value ?? '')}
              onChange={(event) => setCondition({ value: event.target.value })}
              placeholder="مقدار"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] text-stamp-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SettingsTab({
  definition,
  readOnly,
  onChange,
}: {
  definition: CaseTypeDefinition;
  readOnly: boolean;
  onChange: (mutator: (current: CaseTypeDefinition) => CaseTypeDefinition) => void;
}) {
  const notifications = definition.notifications ?? [];
  const isEnabled = (event: NotificationEvent) =>
    notifications.some((notification) => notification.event === event);
  const toggleNotification = (event: NotificationEvent) => {
    onChange((current) => {
      const currentNotifications = current.notifications ?? [];
      current.notifications = currentNotifications.some(
        (notification) => notification.event === event,
      )
        ? currentNotifications.filter((notification) => notification.event !== event)
        : [...currentNotifications, { event, channels: ['inapp'] }];
      return current;
    });
  };
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-900">تنظیمات پرونده</h2>
        <p className="mt-1 text-[10px] leading-5 text-ink-400">
          مشخص کنید عنوان و توضیح پرونده از کدام فیلدها خوانده شود و چه رویدادهایی اعلان بسازند.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="فیلد عنوان پرونده" hint="در فهرست و بالای صفحه نمایش داده می‌شود.">
          <Select
            value={definition.settings?.titleField ?? ''}
            onChange={(event) =>
              onChange((current) => {
                current.settings ??= {};
                current.settings.titleField = event.target.value || undefined;
                return current;
              })
            }
            disabled={readOnly}
          >
            <option value="">عنوان دستی هنگام ثبت</option>
            {definition.fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="فیلد توضیحات پرونده">
          <Select
            value={definition.settings?.descriptionField ?? ''}
            onChange={(event) =>
              onChange((current) => {
                current.settings ??= {};
                current.settings.descriptionField = event.target.value || undefined;
                return current;
              })
            }
            disabled={readOnly}
          >
            <option value="">بدون توضیح خودکار</option>
            {definition.fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="نوع نمایش فرم"
          hint="چیدمان فیلدها هنگام ثبت و ویرایش پرونده و کارها."
        >
          <Select
            value={definition.settings?.formLayout ?? 'two-column'}
            onChange={(event) =>
              onChange((current) => {
                current.settings ??= {};
                current.settings.formLayout = event.target.value as
                  | 'two-column'
                  | 'single-column';
                return current;
              })
            }
            disabled={readOnly}
          >
            <option value="two-column">دو ستونی</option>
            <option value="single-column">یک ستونی</option>
          </Select>
        </Field>
        <Field label="اولویت پیش‌فرض">
          <Select
            value={definition.settings?.priority ?? 'normal'}
            onChange={(event) =>
              onChange((current) => {
                current.settings ??= {};
                current.settings.priority = event.target.value as 'low' | 'normal' | 'high';
                return current;
              })
            }
            disabled={readOnly}
          >
            <option value="low">کم</option>
            <option value="normal">معمولی</option>
            <option value="high">فوری</option>
          </Select>
        </Field>
      </div>

      <div>
        <h3 className="text-[11px] font-semibold text-ink-700">اعلان‌های درون‌برنامه‌ای</h3>
        <p className="mt-1 text-[10px] text-ink-400">
          برای رویدادهای انتخاب‌شده، اعلان در سامانه ساخته می‌شود.
        </p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {(Object.keys(notificationEventLabels) as NotificationEvent[]).map((event) => (
            <label
              key={event}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-paper-50 px-3 py-2.5 text-[11px] text-ink-700"
            >
              <span>{notificationEventLabels[event]}</span>
              <input
                type="checkbox"
                checked={isEnabled(event)}
                onChange={() => toggleNotification(event)}
                className="h-4 w-4 accent-copper-500"
                disabled={readOnly}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReorderButtons({
  disabled,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <>
      <IconAction label="انتقال به بالا" disabled={disabled || !canUp} onClick={onUp}>
        <ArrowUp size={12} />
      </IconAction>
      <IconAction label="انتقال به پایین" disabled={disabled || !canDown} onClick={onDown}>
        <ArrowDown size={12} />
      </IconAction>
    </>
  );
}

function IconAction({
  label,
  children,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition-colors disabled:pointer-events-none disabled:opacity-35',
        danger ? 'hover:bg-stamp-50 hover:text-stamp-600' : 'hover:bg-paper-200 hover:text-ink-700',
      )}
    >
      {children}
    </button>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="py-2.5">
      <div className="font-mono text-sm font-semibold text-ink-800">{faNum(value)}</div>
      <div className="mt-0.5 text-[9px] text-ink-400">{label}</div>
    </div>
  );
}
