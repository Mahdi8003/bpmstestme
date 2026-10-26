import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CASE_ICONS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  FIELD_WIDTHS,
  FIELD_WIDTH_LABELS,
  ROLE_KEYS,
  ROLE_LABELS,
  type CaseTypeDefinition,
  type CaseTypeDetail,
  type Condition,
  type DocumentDef,
  type FieldDef,
  type FieldType,
  type HealthResult,
  type NotificationEvent,
  type RoleKey,
  type StageDef,
  type TaskDef,
} from '@ravand/shared';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Circle,
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
import { useMasterOptions } from '@/components/DynamicFields';
import { useToast } from '@/components/ToastProvider';

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const FIELD_TYPE_OPTIONS = FIELD_TYPES;

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

type AssigneeOption = keyof typeof assigneeTypeLabels;
type BuilderTab = 'general' | 'fields' | 'stages' | 'documents' | 'settings';

type FieldEditor = { index: number | null; draft: FieldDef };
type TaskEditor = { stageIndex: number; taskIndex: number | null; draft: TaskDef };
type DocumentEditor = { index: number | null; draft: DocumentDef };
type DeleteTarget =
  | { type: 'field'; index: number }
  | { type: 'stage'; index: number }
  | { type: 'task'; stageIndex: number; taskIndex: number }
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
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: RoleKey[];
  disabled: boolean;
  onChange: (roles: RoleKey[]) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-ink-700">{label}</div>
      <div className="mt-1 text-[9px] text-ink-400">{hint}</div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {ROLE_KEYS.map((role) => {
          const selected = value.includes(role);
          return (
            <button
              key={role}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  selected ? value.filter((candidate) => candidate !== role) : [...value, role],
                )
              }
              className={cn(
                'focus-ring rounded-full border px-2 py-0.5 text-[9px] font-medium transition',
                selected
                  ? 'border-ink-900 bg-ink-900 text-paper-50'
                  : 'border-line bg-white text-ink-500 hover:border-ink-300',
                disabled ? 'cursor-not-allowed opacity-50' : undefined,
              )}
              aria-pressed={selected}
            >
              {ROLE_LABELS[role]}
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
  const [meta, setMeta] = useState({ name: '', description: '', icon: 'file', referencePrefix: '' });
  const [definition, setDefinition] = useState<CaseTypeDefinition>({ fields: [], stages: [] });
  const [tab, setTab] = useState<BuilderTab>('general');
  const [dirty, setDirty] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [fieldEditor, setFieldEditor] = useState<FieldEditor | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditor | null>(null);
  const [documentEditor, setDocumentEditor] = useState<DocumentEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editorError, setEditorError] = useState('');
  const initializedId = useRef<string | null>(null);
  const canBuild = Boolean(user && ['admin', 'builder', 'manager'].includes(user.role));

  const detail = useQuery({
    queryKey: ['case-type', id],
    queryFn: () => api.get<CaseTypeDetail>(`/case-types/${id}`),
    enabled: Boolean(id) && canBuild,
  });

  useEffect(() => {
    if (!detail.data || initializedId.current === detail.data.id) return;
    initializedId.current = detail.data.id;
    setMeta({
      name: detail.data.name,
      description: detail.data.description,
      icon: detail.data.icon,
      referencePrefix: detail.data.referencePrefix,
    });
    setDefinition(structuredClone(detail.data.definition));
    setDirty(false);
    setHealth(null);
  }, [detail.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<CaseTypeDetail>(`/case-types/${id}`, {
        ...meta,
        name: meta.name.trim(),
        description: meta.description.trim(),
        definition,
      }),
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

  const openNewField = () => {
    const key = uniqueKey('field', new Set(definition.fields.map((field) => field.key)));
    setEditorError('');
    setFieldEditor({
      index: null,
      draft: { key, label: '', type: 'text', required: false, placeholder: '', help: '' },
    });
  };

  const openField = (index: number) => {
    const field = definition.fields[index];
    if (!field) return;
    setEditorError('');
    setFieldEditor({ index, draft: structuredClone(field) });
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
    if (
      definition.fields.some(
        (field, index) => index !== fieldEditor.index && field.key === draft.key,
      )
    ) {
      setEditorError('این کلید قبلاً برای فیلد دیگری استفاده شده است.');
      return;
    }
    if (draft.visibleWhen && !draft.visibleWhen.field) {
      setEditorError('فیلد شرط نمایش را انتخاب کنید.');
      return;
    }
    const options = ['select', 'radio', 'multiselect'].includes(draft.type)
      ? (draft.options ?? []).filter((option) => option.label.trim() && option.value.trim())
      : undefined;
    const nextField: FieldDef = {
      ...draft,
      label: draft.label.trim(),
      placeholder: draft.placeholder?.trim() || undefined,
      help: draft.help?.trim() || undefined,
      options,
    };
    updateDefinition((current) => {
      const previousKey =
        fieldEditor.index === null ? undefined : current.fields[fieldEditor.index]?.key;
      if (previousKey && previousKey !== nextField.key) {
        for (const stage of current.stages) {
          for (const task of stage.tasks) {
            task.formFields = task.formFields?.map((key) =>
              key === previousKey ? nextField.key : key,
            );
            if (task.condition?.field === previousKey) task.condition.field = nextField.key;
          }
        }
        for (const field of current.fields) {
          if (field.visibleWhen?.field === previousKey) {
            field.visibleWhen.field = nextField.key;
          }
        }
        if (current.settings?.titleField === previousKey) {
          current.settings.titleField = nextField.key;
        }
        if (current.settings?.descriptionField === previousKey) {
          current.settings.descriptionField = nextField.key;
        }
      }
      if (fieldEditor.index === null) current.fields.push(nextField);
      else current.fields[fieldEditor.index] = nextField;
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
    const nextTask: TaskDef = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      dueInHours: draft.dueInHours && draft.dueInHours > 0 ? draft.dueInHours : undefined,
      formFields: draft.formFields?.length ? draft.formFields : undefined,
      requiredDocuments: draft.requiredDocuments?.length ? draft.requiredDocuments : undefined,
      condition: draft.condition?.field ? draft.condition : undefined,
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
      if (deleteTarget.type === 'field') {
        const removed = current.fields[deleteTarget.index];
        current.fields.splice(deleteTarget.index, 1);
        if (removed) {
          for (const stage of current.stages) {
            for (const task of stage.tasks) {
              task.formFields = task.formFields?.filter((key) => key !== removed.key);
              if (task.condition?.field === removed.key) delete task.condition;
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
      } else if (deleteTarget.type === 'stage') {
        const removed = current.stages[deleteTarget.index];
        current.stages.splice(deleteTarget.index, 1);
        if (removed) {
          for (const document of current.documents ?? []) {
            if (document.stageKey === removed.key) delete document.stageKey;
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
        toast.error('فرآیند هنوز خطای ساختاری دارد.', 'موارد خطا را در کارت سلامت برطرف کنید.');
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

  const readOnly = detail.data.status === 'archived';
  const stages = definition.stages;
  const taskTotal = countTasks(definition);
  const documents = definition.documents ?? [];
  const currentIndex = taskEditor?.stageIndex ?? 0;
  const currentStage = stages[currentIndex];

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
              icon={<ShieldCheck size={14} />}
              loading={checking}
              onClick={() => void runHealthCheck()}
            >
              بررسی سلامت
            </Button>
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
          این فرآیند بایگانی شده است و فقط برای مشاهده در دسترس است. برای تغییر، از نسخهٔ آن کپی
          بگیرید.
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
                { value: 'stages', label: 'مراحل', count: stages.length },
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
                  <div className="divide-y divide-line/70 rounded-lg border border-line bg-white/40">
                    {definition.fields.map((field, index) => (
                      <div key={field.key} className="flex items-center gap-2.5 px-3 py-2.5">
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
                    <h2 className="text-sm font-semibold text-ink-900">مسیر مراحل</h2>
                    <p className="mt-1 text-[10px] leading-5 text-ink-400">
                      پرونده مرحله‌به‌مرحله جلو می‌رود؛ کارهای هر مرحله تعیین می‌کنند چه کسی چه کاری
                      انجام دهد.
                    </p>
                  </div>
                  {!readOnly ? (
                    <Button variant="paper" size="sm" icon={<Plus size={13} />} onClick={addStage}>
                      مرحله جدید
                    </Button>
                  ) : null}
                </div>

                {stages.length ? (
                  <div className="space-y-3">
                    {stages.map((stage, stageIndex) => (
                      <div
                        key={stage.key}
                        className="rounded-xl border border-line bg-white/50 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-copper-200 bg-copper-50 font-mono text-[10px] font-semibold text-copper-600">
                            {faNum(stageIndex + 1)}
                          </span>
                          <Input
                            value={stage.name}
                            onChange={(event) =>
                              updateStage(stageIndex, { name: event.target.value })
                            }
                            aria-label="نام مرحله"
                            className="h-8 max-w-56 text-xs font-semibold"
                            disabled={readOnly}
                          />
                          <KeyChip>{stage.key}</KeyChip>
                          <div className="ms-auto flex items-center gap-0.5">
                            <ReorderButtons
                              disabled={readOnly}
                              canUp={stageIndex > 0}
                              canDown={stageIndex < stages.length - 1}
                              onUp={() =>
                                updateDefinition((current) => {
                                  current.stages = moveItem(current.stages, stageIndex, stageIndex - 1);
                                  return current;
                                })
                              }
                              onDown={() =>
                                updateDefinition((current) => {
                                  current.stages = moveItem(current.stages, stageIndex, stageIndex + 1);
                                  return current;
                                })
                              }
                            />
                            {!readOnly ? (
                              <IconAction
                                label="حذف مرحله"
                                danger
                                onClick={() => setDeleteTarget({ type: 'stage', index: stageIndex })}
                              >
                                <Trash size={13} />
                              </IconAction>
                            ) : null}
                          </div>
                        </div>
                        <Textarea
                          value={stage.description ?? ''}
                          onChange={(event) =>
                            updateStage(stageIndex, { description: event.target.value })
                          }
                          aria-label="توضیح مرحله"
                          placeholder="این مرحله چه هدفی دارد؟"
                          className="mt-2 min-h-14 text-[11px]"
                          disabled={readOnly}
                        />

                        <details className="mt-2 rounded-lg border border-line bg-paper-50/70 px-2.5 py-2">
                          <summary className="cursor-pointer text-[10px] font-semibold text-ink-600">
                            دسترسی‌های این مرحله
                          </summary>
                          <div className="mt-3 space-y-3">
                            <RoleChecklist
                              label="ویرایش اطلاعات پرونده"
                              hint="مدیر سیستم، ثبت‌کننده و مسئول کار در هر حال مجاز هستند."
                              value={stage.permissions?.editRoles ?? []}
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

                        <div className="mt-3 space-y-2">
                          {stage.tasks.map((task, taskIndex) => (
                            <div
                              key={task.key}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-line/80 bg-paper-50 px-2.5 py-2"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-paper-200 text-[9px] text-ink-500">
                                {faNum(taskIndex + 1)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-ink-800">
                                    {task.name}
                                  </span>
                                  <span
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                                      task.kind === 'approval'
                                        ? 'bg-ink-900 text-paper-50'
                                        : 'bg-paper-200 text-ink-600',
                                    )}
                                  >
                                    {task.kind === 'approval' ? 'تأیید' : 'اقدام'}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-ink-400">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="h-1 w-1 rounded-full bg-copper-400" />
                                    {task.assignee.type === 'role'
                                      ? ROLE_LABELS[task.assignee.value as keyof typeof ROLE_LABELS] ??
                                        'نقش نامشخص'
                                      : assigneeTypeLabels[
                                          task.assignee.type as AssigneeOption
                                        ] ?? task.assignee.type}
                                  </span>
                                  {task.dueInHours ? <span>{faNum(task.dueInHours)} ساعت</span> : null}
                                  {task.formFields?.length ? (
                                    <span>{faNum(task.formFields.length)} فیلد فرم</span>
                                  ) : null}
                                  {task.requiredDocuments?.length ? (
                                    <span>{faNum(task.requiredDocuments.length)} مدرک</span>
                                  ) : null}
                                  {task.condition ? <span>شرطی</span> : null}
                                </div>
                              </div>
                              {!readOnly ? (
                                <div className="flex items-center gap-0.5">
                                  <IconAction
                                    label="ویرایش کار"
                                    onClick={() => openTask(stageIndex, taskIndex)}
                                  >
                                    <PencilSimple size={12} />
                                  </IconAction>
                                  <IconAction
                                    label="حذف کار"
                                    danger
                                    onClick={() =>
                                      setDeleteTarget({ type: 'task', stageIndex, taskIndex })
                                    }
                                  >
                                    <Trash size={12} />
                                  </IconAction>
                                </div>
                              ) : null}
                            </div>
                          ))}
                          {!stage.tasks.length ? (
                            <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[10px] text-ink-400">
                              این مرحله کار ندارد و خودکار عبور می‌کند.
                            </p>
                          ) : null}
                          {!readOnly ? (
                            <button
                              type="button"
                              onClick={() => openNewTask(stageIndex)}
                              className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-copper-600 hover:bg-copper-50"
                            >
                              <Plus size={11} />
                              افزودن کار به این مرحله
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="مسیر هنوز مرحله‌ای ندارد."
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
                  <div className="divide-y divide-line/70 rounded-lg border border-line bg-white/40">
                    {documents.map((document, index) => (
                      <div key={document.key} className="flex items-center gap-2.5 px-3 py-2.5">
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
                <h2 className="text-xs font-semibold text-ink-900">جانمای مسیر</h2>
                <p className="mt-0.5 text-[9px] text-ink-400">پیش‌نمایش آنچه ثبت‌کننده می‌بیند</p>
              </div>
              <span className="rounded-full border border-line bg-paper-100 px-2 py-0.5 font-mono text-[9px] text-ink-400">
                {faNum(stages.length)} مرحله
              </span>
            </div>
            <div className="px-4 py-4">
              {stages.length ? (
                <div className="relative">
                  <div className="absolute bottom-3 right-[9px] top-3 w-px bg-line" />
                  <div className="space-y-3">
                    {stages.map((stage, index) => (
                      <div key={stage.key} className="relative flex gap-3">
                        <span
                          className={cn(
                            'relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border',
                            index === 0
                              ? 'border-copper-500 bg-copper-500 text-white shadow-[0_0_0_4px_var(--color-copper-50)]'
                              : 'border-line bg-paper-50 text-ink-300',
                          )}
                        >
                          <Circle size={6} weight="fill" />
                        </span>
                        <div className="min-w-0 pb-1">
                          <div className="truncate text-[11px] font-semibold text-ink-700">
                            {stage.name}
                          </div>
                          <div className="mt-0.5 text-[9px] text-ink-400">
                            {stage.tasks.length
                              ? `${faNum(stage.tasks.length)} کار · ${stage.tasks
                                  .map((task) =>
                                    task.assignee.type === 'role'
                                      ? ROLE_LABELS[
                                          task.assignee.value as keyof typeof ROLE_LABELS
                                        ] ?? 'نقش'
                                      : assigneeTypeLabels[
                                          task.assignee.type as AssigneeOption
                                        ] ?? '',
                                  )
                                  .join('، ')}`
                              : 'بدون کار · عبور خودکار'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-3 text-center text-[10px] text-ink-400">مرحله‌ای تعریف نشده است.</p>
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
                <h2 className="text-xs font-semibold text-ink-900">سلامت ساختار</h2>
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
                  پیش از انتشار، ساختار فرم، مراحل، شرط‌ها و مدارک را بررسی کنید.
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
                  {health.issues.map((issue, index) => (
                    <div
                      key={`${issue.path ?? ''}-${index}`}
                      className={cn(
                        'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[9px] leading-5',
                        issue.level === 'error'
                          ? 'border-stamp-100 bg-stamp-50 text-stamp-600'
                          : 'border-ochre-100 bg-ochre-50 text-ochre-600',
                      )}
                    >
                      {issue.level === 'error' ? (
                        <WarningCircle size={13} className="mt-0.5 shrink-0" />
                      ) : (
                        <Warning size={13} className="mt-0.5 shrink-0" />
                      )}
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        open={Boolean(fieldEditor)}
        onClose={() => setFieldEditor(null)}
        title={fieldEditor?.index === null ? 'فیلد جدید' : 'ویرایش فیلد'}
        description="کلید فنی برای ذخیره‌سازی استفاده می‌شود و بعد از انتشار بهتر است تغییر نکند."
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
            fields={definition.fields.filter((field) => field.key !== fieldEditor.draft.key)}
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
            fields={definition.fields}
            documents={documents}
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
          deleteTarget?.type === 'field'
            ? 'این فیلد از فرم حذف می‌شود و از کارها و تنظیمات مرتبط هم برداشته می‌شود. دادهٔ پرونده‌های موجود پاک نمی‌شود.'
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
  readOnly,
  onChange,
}: {
  meta: { name: string; description: string; icon: string; referencePrefix: string };
  caseKey: string;
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
                    : 'border-line bg-white/60 text-ink-400 hover:border-ink-300 hover:text-ink-700',
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
  error,
  onChange,
  onError,
}: {
  draft: FieldDef;
  fields: FieldDef[];
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
                options: needsOptions
                  ? draft.options?.length
                    ? draft.options
                    : [{ label: '', value: '' }]
                  : undefined,
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
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
            <input
              type="checkbox"
              checked={Boolean(draft.required)}
              onChange={(event) => onChange({ required: event.target.checked })}
              className="h-4 w-4 accent-copper-500"
            />
            تکمیل این فیلد الزامی است
          </label>
        </div>
      </div>

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

      <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
        <input
          type="checkbox"
          checked={Boolean(draft.readonly)}
          onChange={(event) => onChange({ readonly: event.target.checked })}
          className="h-4 w-4 accent-copper-500"
        />
        این فیلد فقط‌خواندنی باشد
      </label>

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

function TaskEditorFields({
  draft,
  fields,
  documents,
  error,
  onChange,
}: {
  draft: TaskDef;
  fields: FieldDef[];
  documents: DocumentDef[];
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
            onChange={(event) => onChange({ kind: event.target.value as 'approval' | 'action' })}
          >
            <option value="approval">تأیید / رد</option>
            <option value="action">اقدام</option>
          </Select>
        </Field>
        <Field label="مسئول">
          <Select
            value={assigneeType}
            onChange={(event) => {
              const type = event.target.value as AssigneeOption;
              const defaultRole = type === 'role' ? 'manager' : undefined;
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
              {ROLE_KEYS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
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
          {fields.length ? (
            <div className="max-h-40 space-y-1 overflow-y-auto scroll-thin rounded-lg border border-line bg-paper-50 p-2">
              {fields.map((field) => (
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
