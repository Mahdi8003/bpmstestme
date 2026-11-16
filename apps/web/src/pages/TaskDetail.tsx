import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allDefinitionFields,
  evaluateCondition,
  fieldsForStage,
  type CommentDto,
  type DocumentDto,
  type FieldDef,
  type TaskDetailDto,
} from '@ravand/shared';
import {
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  FileArrowUp,
  FileText,
  DownloadSimple,
  Info,
  PaperPlaneTilt,
  SealCheck,
  Trash,
  User,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  faNum,
  formatDate,
  formatDateTime,
  formatMoney,
  taskAssigneeLabel,
} from '@/lib/format';
import { hasPermission, useRoleName } from '@/lib/roles';
import {
  Avatar,
  Button,
  Card,
  Field,
  Modal,
  Select,
  Spinner,
  Textarea,
  cn,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import {
  CaseTypeIcon,
  DueChip,
  PriorityBadge,
  StageRail,
  TaskKindBadge,
  TaskStatusBadge,
} from '@/components/domain';
import { DynamicFields, fieldDisplayValue, useMasterOptions } from '@/components/DynamicFields';
import { useToast } from '@/components/ToastProvider';

type Decision = 'approve' | 'reject' | 'return' | 'request_info';

const decisionMeta: Record<
  Decision,
  { label: string; title: string; description: string; button: string; tone: 'green' | 'red' | 'amber' | 'ink'; requireComment: boolean }
> = {
  approve: {
    label: 'تأیید',
    title: 'تأیید این مرحله',
    description: 'با تأیید، این کار بسته می‌شود و پرونده به مرحله بعد می‌رود.',
    button: 'تأیید و ادامه',
    tone: 'green',
    requireComment: false,
  },
  reject: {
    label: 'رد',
    title: 'رد پرونده',
    description: 'پرونده بسته می‌شود و امکان ادامهٔ مسیر وجود ندارد. دلیل را برای سابقه بنویسید.',
    button: 'رد پرونده',
    tone: 'red',
    requireComment: true,
  },
  return: {
    label: 'بازگشت',
    title: 'بازگشت به مرحله قبل',
    description: 'پرونده به مرحله قبل برمی‌گردد تا اطلاعات اصلاح شود. دلیل بازگشت را بنویسید.',
    button: 'بازگشت پرونده',
    tone: 'amber',
    requireComment: true,
  },
  request_info: {
    label: 'درخواست اطلاعات',
    title: 'درخواست اطلاعات تکمیلی',
    description: 'برای ثبت‌کننده کار جدیدی ایجاد می‌شود تا اطلاعات یا مدرک لازم را ارائه کند.',
    button: 'ثبت درخواست',
    tone: 'ink',
    requireComment: true,
  },
};

const outcomeLabels: Record<string, string> = {
  approved: 'تأییدشده',
  rejected: 'ردشده',
  returned: 'بازگشته',
  completed: 'تکمیل‌شده',
  info_requested: 'اطلاعات درخواست شده',
};

interface DetailIssue {
  field?: string;
  message?: string;
  name?: string;
  key?: string;
}

function issuesOf(error: unknown): DetailIssue[] {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    return error.details.filter((item): item is DetailIssue => Boolean(item) && typeof item === 'object');
  }
  return [];
}

export function TaskDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const options = useMasterOptions();
  const roleName = useRoleName();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [actionComment, setActionComment] = useState('');
  const [chatComment, setChatComment] = useState('');
  const [formError, setFormError] = useState('');
  const [formIssues, setFormIssues] = useState<DetailIssue[]>([]);
  const [commentError, setCommentError] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionIssues, setDecisionIssues] = useState<DetailIssue[]>([]);
  const [showCaseData, setShowCaseData] = useState(false);
  const [selectionRowKey, setSelectionRowKey] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignComment, setReassignComment] = useState('');
  const [reassignError, setReassignError] = useState('');
  const [docToDelete, setDocToDelete] = useState<{ id: string; name: string } | null>(null);
  const initializedFor = useRef<string | null>(null);

  const detail = useQuery({
    queryKey: ['task', id],
    queryFn: () => api.get<TaskDetailDto>(`/tasks/${id}`),
    enabled: Boolean(id),
  });

  const task = detail.data?.task;
  const caseItem = detail.data?.case;

  useEffect(() => {
    if (!task || !caseItem || initializedFor.current === task.id) return;
    const stageFields = fieldsForStage(caseItem.definition, task.stageKey);
    const fields =
      task.kind === 'info'
        ? stageFields.filter((field) => !field.readonly && !field.hidden)
        : stageFields.filter((field) => task.formFields.includes(field.key));
    const next: Record<string, unknown> = {};
    for (const field of fields) {
      next[field.key] =
        task.data[field.key] ??
        caseItem.data[field.key] ??
        (field.type === 'table' || field.type === 'multiselect' ? [] : '');
    }
    setFormData(next);
    setActionComment('');
    setChatComment('');
    setFormError('');
    setFormIssues([]);
    setSelectionRowKey('');
    setShowCaseData(task.kind === 'approval');
    initializedFor.current = task.id;
  }, [caseItem, task]);

  const applyDetail = (updated: TaskDetailDto) => {
    queryClient.setQueryData(['task', id], updated);
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['case', updated.task.caseId] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const claimTask = useMutation({
    mutationFn: () => api.post<TaskDetailDto>(`/tasks/${id}/claim`),
    onSuccess: (updated) => {
      applyDetail(updated);
      toast.success('کار برداشته شد.', 'این کار اکنون در صندوق شماست.');
    },
    onError: (error) => toast.error('برداشتن کار ممکن نشد.', errorMessage(error)),
  });

  const releaseTask = useMutation({
    mutationFn: () => api.post<TaskDetailDto>(`/tasks/${id}/release`),
    onSuccess: (updated) => {
      applyDetail(updated);
      toast.info('کار آزاد شد.', 'کار به صندوق نقش مربوطه برگشت.');
    },
    onError: (error) => toast.error('آزاد کردن کار ممکن نشد.', errorMessage(error)),
  });

  const completeTask = useMutation({
    mutationFn: () =>
      api.post<TaskDetailDto>(`/tasks/${id}/complete`, {
        data: formData,
        comment: actionComment.trim() || undefined,
        selectionRowKey: selectionRowKey || undefined,
      }),
    onSuccess: (updated) => {
      applyDetail(updated);
      setFormError('');
      setFormIssues([]);
      setActionComment('');
      setSelectionRowKey('');
      toast.success('کار تکمیل شد.', updated.task.outcome ? outcomeLabels[updated.task.outcome] : undefined);
    },
    onError: (error) => {
      setFormError(errorMessage(error));
      setFormIssues(issuesOf(error));
    },
  });

  const reassignTask = useMutation({
    mutationFn: () =>
      api.post<TaskDetailDto>(`/tasks/${id}/reassign`, {
        userId: reassignUserId,
        comment: reassignComment.trim() || undefined,
      }),
    onSuccess: (updated) => {
      applyDetail(updated);
      setReassignOpen(false);
      setReassignUserId('');
      setReassignComment('');
      setReassignError('');
      toast.success('کار واگذار شد.');
    },
    onError: (error) => setReassignError(errorMessage(error)),
  });

  const decideTask = useMutation({
    mutationFn: ({ decision: action, text }: { decision: Decision; text: string }) =>
      api.post<TaskDetailDto>(`/tasks/${id}/decision`, {
        decision: action,
        comment: text.trim() || undefined,
      }),
    onSuccess: (updated) => {
      applyDetail(updated);
      setDecision(null);
      setDecisionComment('');
      setDecisionError('');
      setDecisionIssues([]);
      const message =
        updated.task.outcome === 'approved'
          ? 'مرحله تأیید شد.'
          : updated.task.outcome === 'rejected'
            ? 'پرونده رد شد.'
            : updated.task.outcome === 'returned'
              ? 'پرونده به مرحله قبل بازگشت.'
              : 'درخواست اطلاعات ثبت شد.';
      toast.success(message);
    },
    onError: (error) => {
      setDecisionError(errorMessage(error));
      setDecisionIssues(issuesOf(error));
    },
  });

  const uploadDocument = useMutation({
    mutationFn: ({ file, documentKey }: { file: File; documentKey: string }) => {
      if (!file.size) throw new Error('فایل انتخاب‌شده خالی است.');
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.');
      }
      return api.upload<DocumentDto>(
        `/cases/${caseItem?.id}/documents?documentKey=${encodeURIComponent(documentKey)}&taskId=${id}`,
        file,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      void queryClient.invalidateQueries({ queryKey: ['case', caseItem?.id] });
      toast.success('مدرک بارگذاری شد.');
    },
    onError: (error) => toast.error('بارگذاری مدرک ممکن نشد.', errorMessage(error)),
  });

  const deleteDocument = useMutation({
    mutationFn: (documentId: string) =>
      api.delete(`/cases/${caseItem?.id}/documents/${documentId}`),
    onSuccess: () => {
      setDocToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      void queryClient.invalidateQueries({ queryKey: ['case', caseItem?.id] });
      toast.success('مدرک حذف شد.');
    },
    onError: (error) => toast.error('حذف مدرک ممکن نشد.', errorMessage(error)),
  });

  const addComment = useMutation({
    mutationFn: (body: string) => api.post<CommentDto>(`/tasks/${id}/comments`, { body }),
    onSuccess: () => {
      setChatComment('');
      setCommentError('');
      void queryClient.invalidateQueries({ queryKey: ['task', id] });
      void queryClient.invalidateQueries({ queryKey: ['case', caseItem?.id] });
    },
    onError: (error) => setCommentError(errorMessage(error)),
  });

  if (detail.isLoading) {
    return <TaskDetailSkeleton />;
  }

  if (detail.isError || !task || !caseItem) {
    return (
      <Card className="mx-auto mt-10 max-w-lg px-6 py-12 text-center">
        <WarningCircle size={30} className="mx-auto text-stamp-500" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">کار پیدا نشد.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          {detail.isError ? errorMessage(detail.error) : 'این کار وجود ندارد یا به آن دسترسی ندارید.'}
        </p>
        <Link
          to="/inbox"
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50"
        >
          بازگشت به صندوق کار
        </Link>
      </Card>
    );
  }

  const definition = caseItem.definition;
  const stageFields = fieldsForStage(definition, task.stageKey);
  const formFields =
    task.kind === 'info'
      ? stageFields.filter((field) => !field.readonly && !field.hidden)
      : stageFields.filter((field) => task.formFields.includes(field.key));
  const isSelection = task.kind === 'selection';
  const selectionDef = task.selection;
  const selectionField = selectionDef
    ? allDefinitionFields(definition).find(
        (field) => field.key === selectionDef.sourceField && field.type === 'table',
      )
    : undefined;
  const selectionColumns = selectionField?.columns ?? [];
  const selectionLabelKey = selectionDef?.labelColumn;
  const selectionLabelField = selectionLabelKey
    ? selectionColumns.find((column) => column.key === selectionLabelKey)
    : undefined;
  const selectionRows =
    selectionField && Array.isArray(caseItem.data[selectionField.key])
      ? (caseItem.data[selectionField.key] as unknown[]).filter(
          (row): row is Record<string, unknown> =>
            Boolean(row) && typeof row === 'object' && !Array.isArray(row),
        )
      : [];
  const requiredDocMap = new Map<string, { key: string; name: string }>();
  for (const document of definition.documents ?? []) {
    if (document.required && (!document.stageKey || document.stageKey === task.stageKey)) {
      requiredDocMap.set(document.key, { key: document.key, name: document.name });
    }
  }
  for (const key of task.requiredDocuments) {
    const document = (definition.documents ?? []).find((item) => item.key === key);
    requiredDocMap.set(key, { key, name: document?.name ?? key });
  }
  const requiredDocs = [...requiredDocMap.values()].map((document) => {
    const uploaded = caseItem.documents.find(
      (entry) => entry.documentKey === document.key,
    );
    return {
      key: document.key,
      name: document.name,
      uploaded: Boolean(uploaded),
      documentId: uploaded?.id,
    };
  });
  const missingDocs =
    task.kind === 'info' ? [] : requiredDocs.filter((document) => !document.uploaded);
  const selectionSummary =
    task.kind === 'selection' &&
    typeof task.data.selectionLabel === 'string' &&
    task.data.selectionLabel.trim()
      ? task.data.selectionLabel.trim()
      : '';
  const isActive = ['pending', 'claimed', 'waiting_info'].includes(task.status);
  const actionable = task.status === 'pending' || task.status === 'claimed';
  const isApproval = task.kind === 'approval';
  const isMine = task.assigneeId === user?.id;
  const canReassign = isActive && hasPermission(user, 'reassignTasks');
  const canDecide = isApproval && task.canAct && !task.canClaim && actionable;
  const stageIndex = definition.stages.findIndex((stage) => stage.key === task.stageKey);
  const isLastStage = stageIndex >= 0 && stageIndex === definition.stages.length - 1;
  const decisionCopy = decision
    ? decision === 'approve' && isLastStage
      ? {
          title: 'تأیید و بستن پرونده',
          description:
            'این آخرین مرحلهٔ مسیر است؛ با تأیید، کار بسته می‌شود و پرونده کامل و بسته می‌شود.',
          button: 'تأیید و بستن پرونده',
        }
      : decisionMeta[decision]
    : null;
  const canComplete = !isApproval && task.canAct && !task.canClaim && actionable;
  const otherTasks = caseItem.tasks.filter(
    (candidate) =>
      candidate.id !== task.id &&
      ['pending', 'claimed', 'waiting_info'].includes(candidate.status),
  );
  const allCaseFields = allDefinitionFields(definition);
  const globalCaseKeys = new Set(definition.fields.map((field) => field.key));
  const isEmptyCaseValue = (value: unknown): boolean =>
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  const visibleCaseFields = allCaseFields
    .filter(
      (field) =>
        !field.visibleWhen ||
        evaluateCondition(field.visibleWhen, allCaseFields, caseItem.data),
    )
    .filter((field) => {
      const value = caseItem.data[field.key];
      if (field.hidden) return !isEmptyCaseValue(value);
      if (globalCaseKeys.has(field.key)) return true;
      return !isEmptyCaseValue(value);
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/inbox"
          className="focus-ring inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
        >
          <ArrowRight size={13} />
          صندوق کار
        </Link>
        <span className="text-ink-300">/</span>
        <Link
          to={`/cases/${caseItem.id}`}
          className="focus-ring inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
        >
          <span className="font-mono" dir="ltr">
            {caseItem.reference}
          </span>
          <span>·</span>
          <span className="max-w-48 truncate">{caseItem.title}</span>
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <TaskKindBadge kind={task.kind} />
            <span>{task.stageName}</span>
            <span className="text-ink-300">·</span>
            <span>{formatDate(task.createdAt)}</span>
          </span>
        }
        title={task.name}
        description={task.description ?? 'برای این کار توضیح بیشتری ثبت نشده است.'}
        actions={
          <>
            <TaskStatusBadge status={task.status} />
            {caseItem.priority !== 'normal' ? <PriorityBadge priority={caseItem.priority} /> : null}
            <DueChip value={task.dueAt} />
          </>
        }
      />

      {task.status === 'waiting_info' ? (
        <InfoBanner
          tone="amber"
          icon={<Clock size={18} weight="fill" />}
          title="این کار در انتظار اطلاعات تکمیلی است."
          text="ثبت‌کننده پرونده باید اطلاعات یا مدارک درخواستی را ارائه کند. پس از آن کار دوباره فعال می‌شود."
        />
      ) : task.status === 'completed' ? (
        <InfoBanner
          tone="green"
          icon={<CheckCircle size={18} weight="fill" />}
          title={`این کار ${outcomeLabels[task.outcome ?? 'completed'] ?? 'بسته'} شده است.`}
          text={
            [
              task.completedAt ? `تاریخ تکمیل: ${formatDateTime(task.completedAt)}` : null,
              selectionSummary ? `گزینه انتخاب‌شده: ${selectionSummary}` : null,
            ]
              .filter(Boolean)
              .join(' • ') || undefined
          }
        />
      ) : task.status === 'cancelled' ? (
        <InfoBanner
          tone="neutral"
          icon={<XCircle size={18} weight="fill" />}
          title="این کار لغو شده است."
          text="پرونده ممکن است رد، لغو یا به مرحله دیگری منتقل شده باشد."
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.8fr)]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
                  <SealCheck size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">اقدام روی کار</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    {!isActive
                      ? 'این کار بسته شده است؛ فقط نتیجه و سابقه قابل مشاهده است.'
                      : isApproval
                        ? 'این کار نیاز به تصمیم تأیید یا رد دارد.'
                        : task.kind === 'info'
                          ? 'اطلاعات یا مدارک درخواستی را ارائه کنید.'
                          : task.kind === 'selection'
                            ? 'یکی از گزینه‌ها را انتخاب کنید تا اطلاعات آن در پرونده ثبت شود.'
                            : 'اطلاعات لازم را تکمیل و کار را ببندید.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canReassign ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => {
                      setReassignOpen(true);
                      setReassignUserId('');
                      setReassignComment('');
                      setReassignError('');
                    }}
                  >
                    واگذاری
                  </Button>
                ) : null}
                {isMine && task.status === 'claimed' ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    loading={releaseTask.isPending}
                    onClick={() => releaseTask.mutate()}
                  >
                    آزاد کردن کار
                  </Button>
                ) : null}
              </div>
            </div>

            {task.canClaim && isActive ? (
              <div className="px-4 py-6">
                <div className="rounded-xl border border-copper-200 bg-copper-50/55 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-copper-500 text-on-accent">
                      <SealCheck size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-copper-800">
                        این کار در انتظار مسئول است.
                      </div>
                      <p className="mt-1 text-[10px] leading-6 text-copper-700/80">
                        اگر این کار در حوزهٔ مسئولیت شماست، آن را بردارید تا در صندوق شما قرار بگیرد.
                      </p>
                      <Button
                        variant="copper"
                        size="sm"
                        className="mt-3"
                        loading={claimTask.isPending}
                        onClick={() => claimTask.mutate()}
                      >
                        برداشتن کار
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!isActive ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs leading-6 text-ink-500">
                  این کار بسته شده است و اقدام جدیدی روی آن ممکن نیست.
                </p>
                <Link
                  to={`/cases/${caseItem.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-copper-600 hover:text-copper-700"
                >
                  مشاهدهٔ پرونده
                  <ArrowRight size={12} className="rotate-180" />
                </Link>
              </div>
            ) : canDecide ? (
              <div className="px-4 py-4">
                {requiredDocs.length ? (
                  <div className="mb-3">
                    <RequiredDocsPanel
                      documents={requiredDocs}
                      pending={uploadDocument.isPending}
                      activeKey={uploadDocument.variables?.documentKey}
                      onUpload={(file, documentKey) =>
                        uploadDocument.mutate({ file, documentKey })
                      }
                      onRemove={
                        caseItem.canUpload
                          ? (document) => setDocToDelete(document)
                          : undefined
                      }
                    />
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <DecisionButton
                    tone="green"
                    icon={<Check size={16} weight="bold" />}
                    title={isLastStage ? 'تأیید و بستن' : 'تأیید مرحله'}
                    description={isLastStage ? 'پایان مسیر و بسته‌شدن پرونده' : 'ادامهٔ مسیر پرونده'}
                    onClick={() => {
                      setDecision('approve');
                      setDecisionComment('');
                      setDecisionError('');
                    }}
                  />
                  <DecisionButton
                    tone="amber"
                    icon={<ArrowRight size={16} />}
                    title="بازگشت"
                    description="اصلاح در مرحله قبل"
                    onClick={() => {
                      setDecision('return');
                      setDecisionComment('');
                      setDecisionError('');
                    }}
                  />
                  <DecisionButton
                    tone="ink"
                    icon={<Info size={16} />}
                    title="درخواست اطلاعات"
                    description="از ثبت‌کننده"
                    onClick={() => {
                      setDecision('request_info');
                      setDecisionComment('');
                      setDecisionError('');
                    }}
                  />
                  <DecisionButton
                    tone="red"
                    icon={<XCircle size={16} />}
                    title="رد پرونده"
                    description="بستن مسیر پرونده"
                    onClick={() => {
                      setDecision('reject');
                      setDecisionComment('');
                      setDecisionError('');
                    }}
                  />
                </div>
              </div>
            ) : canComplete ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (missingDocs.length) {
                    setFormError('پیش از تکمیل، مدارک الزامی را بارگذاری کنید.');
                    return;
                  }
                  if (isSelection && !selectionRowKey) {
                    setFormError('برای ادامه، یکی از گزینه‌ها را انتخاب کنید.');
                    return;
                  }
                  completeTask.mutate();
                }}
                className="px-4 py-4"
              >
                <div className="space-y-4">
                  {isSelection ? (
                    selectionRows.length ? (
                      <div className="space-y-2">
                        {selectionRows.map((row, index) => {
                          const rowKey = String(row._key ?? index);
                          const selected = selectionRowKey === rowKey;
                          return (
                            <label
                              key={rowKey}
                              className={cn(
                                'block cursor-pointer rounded-xl border px-3 py-2.5 transition',
                                selected
                                  ? 'border-copper-400 bg-copper-50/60 ring-1 ring-copper-200'
                                  : 'border-line bg-paper-50/40 hover:border-copper-200',
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <input
                                  type="radio"
                                  name={`selection-${task.id}`}
                                  checked={selected}
                                  onChange={() => {
                                    setSelectionRowKey(rowKey);
                                    setFormError('');
                                  }}
                                  disabled={completeTask.isPending}
                                  className="mt-1 h-3.5 w-3.5 accent-copper-500"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-ink-900">
                                    {selectionLabelField
                                      ? fieldDisplayValue(
                                          selectionLabelField,
                                          row[selectionLabelField.key],
                                          options.data,
                                          caseItem.documents,
                                        )
                                      : `گزینه ${(index + 1).toLocaleString('fa-IR')}`}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-500">
                                    {selectionColumns
                                      .filter(
                                        (column) => column.key !== selectionLabelField?.key,
                                      )
                                      .map((column) => {
                                        const cell = row[column.key];
                                        return (
                                          <span key={column.key}>
                                            {column.label}:{' '}
                                            {column.type === 'file' &&
                                            typeof cell === 'string' &&
                                            cell ? (
                                              <a
                                                href={`/api/documents/${cell}/download`}
                                                className="font-medium text-copper-700 hover:underline"
                                              >
                                                {fieldDisplayValue(
                                                  column,
                                                  cell,
                                                  options.data,
                                                  caseItem.documents,
                                                )}
                                              </a>
                                            ) : column.type === 'currency' ? (
                                              formatMoney(cell as number | string)
                                            ) : (
                                              fieldDisplayValue(
                                                column,
                                                cell,
                                                options.data,
                                                caseItem.documents,
                                              )
                                            )}
                                          </span>
                                        );
                                      })}
                                  </div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-line px-4 py-4 text-center text-[11px] text-ink-400">
                        گزینه‌ای برای انتخاب ثبت نشده است. ابتدا جدول مرحلهٔ قبل را تکمیل کنید.
                      </div>
                    )
                  ) : formFields.length ? (
                    <DynamicFields
                      fields={formFields}
                      values={{ ...caseItem.data, ...formData }}
                      onChange={(key, value) =>
                        setFormData((current) => ({ ...current, [key]: value }))
                      }
                      options={options.data}
                      layout={definition.settings?.formLayout}
                      disabled={completeTask.isPending}
                      caseId={caseItem.id}
                      taskId={task.id}
                      documents={caseItem.documents}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-line px-4 py-4 text-center text-[11px] text-ink-400">
                      این کار فیلد ورودی اختصاصی ندارد.
                    </div>
                  )}

                  {requiredDocs.length ? (
                    <RequiredDocsPanel
                      documents={requiredDocs}
                      pending={uploadDocument.isPending}
                      activeKey={uploadDocument.variables?.documentKey}
                      onUpload={(file, documentKey) =>
                        uploadDocument.mutate({ file, documentKey })
                      }
                      onRemove={
                        caseItem.canUpload
                          ? (document) => setDocToDelete(document)
                          : undefined
                      }
                    />
                  ) : null}

                  <Field label="یادداشت اقدام" hint="اختیاری؛ در سابقهٔ پرونده ثبت می‌شود.">
                    <Textarea
                      value={actionComment}
                      onChange={(event) => setActionComment(event.target.value)}
                      placeholder="توضیح کوتاهی برای تیم یا ثبت‌کننده بنویسید…"
                      className="min-h-20 bg-paper-50 text-xs"
                      disabled={completeTask.isPending}
                    />
                  </Field>

                  {formError ? (
                    <div className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium leading-6 text-stamp-700">{formError}</p>
                      {formIssues.length ? (
                        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] leading-5 text-stamp-600">
                          {formIssues.map((issue, index) => (
                            <li key={`${issue.key ?? issue.field ?? 'issue'}-${index}`}>
                              {issue.name ?? issue.message ?? issue.key ?? issue.field}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <p className="text-[10px] text-ink-400">
                      با تکمیل، این کار بسته و مسیر پرونده به‌روز می‌شود.
                    </p>
                    <Button
                      type="submit"
                      variant="ink"
                      loading={completeTask.isPending}
                      icon={<Check size={15} weight="bold" />}
                    >
                      {task.kind === 'info'
                        ? 'ثبت اطلاعات'
                        : task.kind === 'selection'
                          ? 'ثبت انتخاب و ادامه'
                          : 'تکمیل کار'}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="px-4 py-6">
                <div className="rounded-lg border border-line bg-paper-100/50 px-4 py-3 text-[11px] leading-6 text-ink-500">
                  {task.assigneeName
                    ? `این کار در اختیار ${task.assigneeName} است.`
                    : task.candidateRole
                      ? `این کار قابل برداشت توسط نقش «${roleName(task.candidateRole)}» است.`
                      : 'این کار در وضعیت قابل اقدام برای شما نیست.'}
                </div>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCaseData((current) => !current)}
              className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
                  <FileText size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">اطلاعات پرونده</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    برای تصمیم‌گیری، جزئیات ثبت‌شده را ببینید.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-copper-600">
                {showCaseData ? 'بستن' : 'نمایش'}
              </span>
            </button>
            {showCaseData ? (
              <dl className="grid gap-x-6 border-t border-line px-4 py-2 sm:grid-cols-2">
                {visibleCaseFields.map((field) => (
                  <div
                    key={field.key}
                    className={cn(
                      'border-b border-line/60 py-3',
                      field.type === 'textarea' && 'sm:col-span-2',
                    )}
                  >
                    <dt className="text-[10px] text-ink-400">{field.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-xs leading-6 text-ink-800">
                      {field.type === 'table' ? (
                        <TaskTableValue
                          field={field}
                          value={caseItem.data[field.key]}
                          options={options.data}
                          documents={caseItem.documents}
                        />
                      ) : field.type === 'file' &&
                      typeof caseItem.data[field.key] === 'string' &&
                      caseItem.data[field.key] ? (
                        <a
                          href={`/api/documents/${String(caseItem.data[field.key])}/download`}
                          className="font-medium text-copper-700 hover:underline"
                        >
                          {fieldDisplayValue(
                            field,
                            caseItem.data[field.key],
                            options.data,
                            caseItem.documents,
                          )}
                        </a>
                      ) : (
                        fieldDisplayValue(
                          field,
                          caseItem.data[field.key],
                          options.data,
                          caseItem.documents,
                        )
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
                  <PaperPlaneTilt size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">یادداشت‌های پرونده</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    گفتگو روی این پرونده؛ برای همهٔ اعضای درگیر قابل مشاهده است.
                  </p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-ink-400">
                {faNum(caseItem.comments.length)}
              </span>
            </div>
            <div className="px-4 py-4">
              {caseItem.comments.length ? (
                <div className="space-y-4">
                  {caseItem.comments.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2.5">
                      <Avatar name={entry.authorName} color={colorForName(entry.authorName)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[11px] font-semibold text-ink-800">
                            {entry.authorName}
                          </span>
                          <span className="text-[9px] text-ink-400">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-6 text-ink-600">
                          {entry.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[11px] text-ink-400">
                  هنوز یادداشتی ثبت نشده است.
                </p>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!chatComment.trim()) {
                  setCommentError('متن یادداشت را بنویسید.');
                  return;
                }
                addComment.mutate(chatComment.trim());
              }}
              className="border-t border-line bg-paper-100/35 px-4 py-3"
            >
              <div className="flex items-start gap-2.5">
                <Avatar name={user?.name ?? ''} color={user?.avatarColor ?? '#172B39'} size="sm" />
                <div className="min-w-0 flex-1">
                  <Textarea
                    value={chatComment}
                    onChange={(event) => setChatComment(event.target.value)}
                    placeholder="یادداشت یا توضیحی برای تیم بنویسید…"
                    className="min-h-20 bg-paper-50 text-xs"
                    disabled={addComment.isPending}
                  />
                  {commentError ? (
                    <p className="mt-1 text-[10px] text-stamp-600">{commentError}</p>
                  ) : null}
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      variant="ink"
                      loading={addComment.isPending}
                      disabled={!chatComment.trim()}
                    >
                      ثبت یادداشت
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-900">پروندهٔ مرتبط</h2>
            </div>
            <Link
              to={`/cases/${caseItem.id}`}
              className="focus-ring group block px-4 py-3.5 transition hover:bg-paper-100/60"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-50 text-ink-500">
                  <CaseTypeIcon icon={caseItem.caseTypeIcon} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-ink-900 group-hover:text-copper-700">
                    {caseItem.title}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-400">
                    <span className="font-mono" dir="ltr">
                      {caseItem.reference}
                    </span>
                    <span className="text-ink-300">·</span>
                    <span>{caseItem.caseTypeName}</span>
                  </div>
                </div>
              </div>
            </Link>
            <div className="px-2 pb-3">
              <StageRail
                definition={definition}
                currentStageKey={caseItem.stageKey}
                status={caseItem.status}
                compact
              />
            </div>
            <div className="border-t border-line px-4 py-2">
              <div className="flex items-center justify-between py-1.5 text-[10px]">
                <span className="text-ink-400">مسئول پرونده</span>
                <span className="font-medium text-ink-700">{caseItem.assigneeName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-[10px]">
                <span className="text-ink-400">ثبت‌کننده</span>
                <span className="font-medium text-ink-700">{caseItem.createdByName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 text-[10px]">
                <span className="text-ink-400">مهلت پرونده</span>
                <DueChip value={caseItem.dueAt} />
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink-900">مشخصات کار</h2>
            <div className="mt-3 divide-y divide-line/70">
              <MetaRow label="مرحله" value={task.stageName} />
              <MetaRow
                label="مسئول"
                value={taskAssigneeLabel(task, roleName)}
                icon={<User size={13} />}
              />
              <MetaRow
                label="نقش پیشنهادی"
                value={task.candidateRole ? roleName(task.candidateRole) : '—'}
              />
              <MetaRow
                label="مهلت"
                value={task.dueAt ? formatDateTime(task.dueAt) : 'تعیین نشده'}
                icon={<Clock size={13} />}
              />
              <MetaRow label="ایجاد" value={formatDateTime(task.createdAt)} />
              {task.outcome ? <MetaRow label="نتیجه" value={outcomeLabels[task.outcome] ?? task.outcome} /> : null}
            </div>
          </Card>

          {otherTasks.length ? (
            <Card className="overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink-900">کارهای دیگر این پرونده</h2>
              </div>
              <div className="divide-y divide-line/70">
                {otherTasks.slice(0, 5).map((candidate) => (
                  <Link
                    key={candidate.id}
                    to={`/tasks/${candidate.id}`}
                    className="focus-ring group flex items-center gap-2.5 px-4 py-3 hover:bg-paper-100/60"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-ink-700">
                        {candidate.name}
                      </div>
                      <div className="mt-0.5 text-[9px] text-ink-400">
                        {candidate.status === 'waiting_info' ? 'در انتظار اطلاعات' : candidate.stageName}
                      </div>
                    </div>
                    <TaskStatusBadge status={candidate.status} />
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>

      <Modal
        open={Boolean(decision)}
        onClose={() => {
          setDecision(null);
          setDecisionError('');
          setDecisionIssues([]);
        }}
        title={decisionCopy?.title ?? ''}
        description={decisionCopy?.description ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={decideTask.isPending}>
              انصراف
            </Button>
            <Button
              variant={
                decision === 'reject'
                  ? 'danger'
                  : decision === 'approve'
                    ? 'primary'
                    : 'copper'
              }
              loading={decideTask.isPending}
              disabled={
                (Boolean(decision && decisionMeta[decision].requireComment) &&
                  !decisionComment.trim()) ||
                (decision === 'approve' && missingDocs.length > 0)
              }
              onClick={() => {
                if (!decision) return;
                if (decisionMeta[decision].requireComment && !decisionComment.trim()) {
                  setDecisionError('برای این اقدام، ثبت دلیل الزامی است.');
                  return;
                }
                decideTask.mutate({ decision, text: decisionComment });
              }}
            >
              {decisionCopy?.button ?? 'تأیید'}
            </Button>
          </>
        }
      >
        <Field
          label={decision === 'approve' ? 'یادداشت تأیید' : 'دلیل / توضیح'}
          required={Boolean(decision && decisionMeta[decision].requireComment)}
          hint={
            decision === 'approve'
              ? 'اختیاری؛ در سابقهٔ پرونده ثبت می‌شود.'
              : 'برای ثبت در سابقه و اطلاع ثبت‌کننده الزامی است.'
          }
        >
          <Textarea
            value={decisionComment}
            onChange={(event) => {
              setDecisionComment(event.target.value);
              setDecisionError('');
            }}
            placeholder="توضیح خود را بنویسید…"
            className="min-h-24"
            autoFocus
          />
        </Field>
        {decision === 'approve' && missingDocs.length ? (
          <p className="mt-2 rounded-lg border border-ochre-100 bg-ochre-50 px-3 py-2 text-[11px] leading-6 text-ochre-600">
            برای تأیید، ابتدا این مدارک الزامی را بارگذاری کنید:{" "}
            {missingDocs.map((document) => document.name).join('، ')}
          </p>
        ) : null}
        {decisionError ? (
          <p className="mt-2 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
            {decisionError}
          </p>
        ) : null}
        {decisionIssues.length ? (
          <ul className="mt-2 list-inside list-disc space-y-0.5 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[10px] leading-5 text-stamp-600">
            {decisionIssues.map((issue, index) => (
              <li key={`${issue.key ?? issue.field ?? 'issue'}-${index}`}>
                {issue.name ?? issue.message ?? issue.key ?? issue.field}
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>

      <Modal
        open={reassignOpen}
        onClose={() => {
          setReassignOpen(false);
          setReassignError('');
        }}
        title="واگذاری کار"
        description="این کار مستقیماً به کاربر انتخاب‌شده واگذار می‌شود و در صندوق او قرار می‌گیرد."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setReassignOpen(false)}
              disabled={reassignTask.isPending}
            >
              انصراف
            </Button>
            <Button
              variant="ink"
              loading={reassignTask.isPending}
              disabled={!reassignUserId}
              onClick={() => {
                if (!reassignUserId) {
                  setReassignError('کاربر مقصد را انتخاب کنید.');
                  return;
                }
                reassignTask.mutate();
              }}
            >
              واگذاری
            </Button>
          </>
        }
      >
        <Field label="کاربر مقصد" required>
          <Select
            value={reassignUserId}
            onChange={(event) => {
              setReassignUserId(event.target.value);
              setReassignError('');
            }}
            autoFocus
          >
            <option value="">انتخاب کاربر…</option>
            {(options.data?.users ?? []).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} — {roleName(candidate.role)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="یادداشت واگذاری" hint="اختیاری؛ در سابقهٔ پرونده ثبت می‌شود.">
          <Textarea
            value={reassignComment}
            onChange={(event) => setReassignComment(event.target.value)}
            placeholder="دلیل یا توضیح واگذاری…"
            className="mt-3 min-h-20"
          />
        </Field>
        {reassignError ? (
          <p className="mt-2 rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
            {reassignError}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(docToDelete)}
        onClose={() => setDocToDelete(null)}
        title="حذف مدرک"
        description="فایل از پرونده حذف می‌شود؛ برای جایگزینی، پس از حذف فایل جدید را بارگذاری کنید."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDocToDelete(null)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              loading={deleteDocument.isPending}
              onClick={() => docToDelete && deleteDocument.mutate(docToDelete.id)}
            >
              حذف مدرک
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-ink-600">
          «{docToDelete?.name}» حذف شود؟ این کار قابل بازگشت نیست.
        </p>
      </Modal>
    </div>
  );
}

function TaskTableValue({
  field,
  value,
  options,
  documents,
}: {
  field: FieldDef;
  value: unknown;
  options?: Parameters<typeof fieldDisplayValue>[2];
  documents?: DocumentDto[];
}) {
  const rows = Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
  const columns = field.columns ?? [];
  if (!rows.length || !columns.length) return <>—</>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="min-w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-paper-100/70 text-ink-500">
            {columns.map((column) => (
              <th
                key={column.key}
                className="whitespace-nowrap border-b border-line px-2 py-1.5 text-start font-medium"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row._key ?? index)} className="align-top">
              {columns.map((column) => {
                const cell = row[column.key];
                return (
                  <td
                    key={column.key}
                    className="border-b border-line/60 px-2 py-1.5 text-ink-800"
                  >
                    {column.type === 'file' && typeof cell === 'string' && cell ? (
                      <a
                        href={`/api/documents/${cell}/download`}
                        className="font-medium text-copper-700 hover:underline"
                      >
                        {fieldDisplayValue(column, cell, options, documents)}
                      </a>
                    ) : column.type === 'currency' ? (
                      formatMoney(cell as number | string)
                    ) : (
                      fieldDisplayValue(column, cell, options, documents)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequiredDocsPanel({
  documents,
  pending,
  activeKey,
  onUpload,
  onRemove,
}: {
  documents: { key: string; name: string; uploaded: boolean; documentId?: string }[];
  pending: boolean;
  activeKey?: string;
  onUpload: (file: File, documentKey: string) => void;
  onRemove?: (document: { id: string; name: string }) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper-100/50 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-ink-600">
        <FileArrowUp size={13} />
        مدارک الزامی این مرحله
      </div>
      <div className="space-y-2">
        {documents.map((document) => (
          <div
            key={document.key}
            className="flex items-center gap-2 rounded-lg border border-line bg-paper-50/65 px-2.5 py-2"
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                document.uploaded
                  ? 'bg-verdigris-100 text-verdigris-700'
                  : 'bg-stamp-50 text-stamp-500',
              )}
            >
              {document.uploaded ? (
                <CheckCircle size={12} weight="fill" />
              ) : (
                <FileText size={11} />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-ink-600">
              {document.name}
            </span>
            {document.uploaded ? (
              <div className="flex items-center gap-1">
                {document.documentId ? (
                  <a
                    href={`/api/documents/${document.documentId}/download`}
                    className="focus-ring inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold text-verdigris-700 hover:bg-verdigris-50"
                    aria-label="دانلود مدرک"
                  >
                    <DownloadSimple size={11} />
                    دانلود
                  </a>
                ) : (
                  <span className="text-[9px] font-semibold text-verdigris-700">
                    پیوست شد
                  </span>
                )}
                {onRemove && document.documentId ? (
                  <button
                    type="button"
                    onClick={() =>
                      onRemove({ id: document.documentId!, name: document.name })
                    }
                    className="focus-ring flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-stamp-50 hover:text-stamp-600"
                    aria-label="حذف مدرک"
                    title="حذف"
                  >
                    <Trash size={12} />
                  </button>
                ) : null}
              </div>
            ) : (
              <label className="focus-ring cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-semibold text-copper-600 hover:bg-copper-50">
                {pending && activeKey === document.key ? <Spinner size={12} /> : 'بارگذاری'}
                <input
                  type="file"
                  className="hidden"
                  disabled={pending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file, document.key);
                    event.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionButton({
  tone,
  icon,
  title,
  description,
  onClick,
}: {
  tone: 'green' | 'amber' | 'red' | 'ink';
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition',
        tone === 'green' && 'border-verdigris-100 bg-verdigris-50/50 hover:border-verdigris-400 hover:bg-verdigris-50',
        tone === 'amber' && 'border-ochre-100 bg-ochre-50/50 hover:border-ochre-500 hover:bg-ochre-50',
        tone === 'red' && 'border-stamp-100 bg-stamp-50/50 hover:border-stamp-500 hover:bg-stamp-50',
        tone === 'ink' && 'border-line bg-paper-100/50 hover:border-ink-300 hover:bg-paper-100',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-paper-50',
          tone === 'green' && 'border-verdigris-100 text-verdigris-600',
          tone === 'amber' && 'border-ochre-100 text-ochre-600',
          tone === 'red' && 'border-stamp-100 text-stamp-600',
          tone === 'ink' && 'border-line text-ink-500',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-ink-800">{title}</span>
        <span className="mt-0.5 block text-[9px] text-ink-400">{description}</span>
      </span>
    </button>
  );
}

function InfoBanner({
  tone,
  icon,
  title,
  text,
}: {
  tone: 'green' | 'amber' | 'neutral';
  icon: ReactNode;
  title: string;
  text?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex items-start gap-3 rounded-xl border px-4 py-3',
        tone === 'green' && 'border-verdigris-100 bg-verdigris-50/70',
        tone === 'amber' && 'border-ochre-100 bg-ochre-50/70',
        tone === 'neutral' && 'border-line bg-paper-200/50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0',
          tone === 'green' && 'text-verdigris-600',
          tone === 'amber' && 'text-ochre-600',
          tone === 'neutral' && 'text-ink-400',
        )}
      >
        {icon}
      </span>
      <div>
        <div
          className={cn(
            'text-xs font-semibold',
            tone === 'green' && 'text-verdigris-700',
            tone === 'amber' && 'text-ochre-600',
            tone === 'neutral' && 'text-ink-700',
          )}
        >
          {title}
        </div>
        {text ? <div className="mt-0.5 text-[10px] leading-5 text-ink-500">{text}</div> : null}
      </div>
    </div>
  );
}

function MetaRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-[10px] text-ink-400">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-end text-[11px] font-medium text-ink-700">
        {icon ? <span className="shrink-0 text-ink-300">{icon}</span> : null}
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function colorForName(name: string): string {
  const palette = ['#315364', '#406B5D', '#A95F3D', '#9A6B22', '#9A4038', '#4B5D8A'];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0]!;
}

function TaskDetailSkeleton() {
  return (
    <div>
      <div className="mb-5 space-y-3">
        <div className="h-2.5 w-28 animate-pulse rounded bg-paper-200" />
        <div className="h-8 w-1/2 animate-pulse rounded bg-paper-200" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-paper-200" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.8fr)]">
        <div className="space-y-6">
          <div className="h-72 animate-pulse rounded-xl bg-paper-200" />
          <div className="h-48 animate-pulse rounded-xl bg-paper-200" />
        </div>
        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-xl bg-paper-200" />
          <div className="h-48 animate-pulse rounded-xl bg-paper-200" />
        </div>
      </div>
    </div>
  );
}
