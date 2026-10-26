import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  evaluateCondition,
  type CaseDetail,
  type CaseTypeDefinition,
  type CommentDto,
  type DocumentDto,
  type FieldDef,
  type TaskDto,
} from '@ravand/shared';
import {
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  ChatCircle,
  CheckCircle,
  DownloadSimple,
  FileArrowUp,
  FileText,
  Paperclip,
  PencilSimple,
  Plus,
  SealCheck,
  Trash,
  User,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  faNum,
  formatDate,
  formatDateTime,
  formatMoney,
} from '@/lib/format';
import { Avatar, Button, Card, Field, Input, Modal, Textarea, cn } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import {
  CaseTypeIcon,
  DueChip,
  PriorityBadge,
  StageRail,
  StatusBadge,
  TaskKindBadge,
  TaskStatusBadge,
} from '@/components/domain';
import { DynamicFields, fieldDisplayValue, useMasterOptions } from '@/components/DynamicFields';
import { useToast } from '@/components/ToastProvider';

const eventLabels: Record<string, string> = {
  'case.created': 'پرونده ایجاد شد',
  'case.updated': 'اطلاعات پرونده ویرایش شد',
  'case.completed': 'پرونده تکمیل شد',
  'case.rejected': 'پرونده رد شد',
  'case.cancelled': 'پرونده لغو شد',
  'case.returned': 'پرونده به مرحله قبل بازگشت',
  'case.info_requested': 'اطلاعات تکمیلی درخواست شد',
  'case.info_provided': 'اطلاعات تکمیلی ثبت شد',
  'case.comment': 'یادداشت ثبت شد',
  'comment.added': 'یادداشت ثبت شد',
  'document.uploaded': 'مدرک بارگذاری شد',
  'stage.entered': 'مرحله جدید آغاز شد',
  'task.created': 'کار ایجاد شد',
  'task.claimed': 'کار برداشته شد',
  'task.released': 'کار آزاد شد',
  'task.completed': 'کار تکمیل شد',
  'task.assigned': 'کار تخصیص داده شد',
  'task.reassigned': 'کار واگذار شد',
  'task.info_requested': 'اطلاعات تکمیلی درخواست شد',
};

export function CaseDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();
  const options = useMasterOptions();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editError, setEditError] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const generalFileRef = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: ['case', id],
    queryFn: () => api.get<CaseDetail>(`/cases/${id}`),
    enabled: Boolean(id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['case', id] });
    void queryClient.invalidateQueries({ queryKey: ['cases'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const updateCase = useMutation({
    mutationFn: (input: { title: string; data: Record<string, unknown> }) =>
      api.patch<CaseDetail>(`/cases/${id}`, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(['case', id], updated);
      setEditOpen(false);
      setEditError('');
      refresh();
      toast.success('اطلاعات پرونده به‌روز شد.');
    },
    onError: (error) => setEditError(errorMessage(error)),
  });

  const cancelCase = useMutation({
    mutationFn: () =>
      api.post<CaseDetail>(`/cases/${id}/cancel`, { reason: cancelReason.trim() || undefined }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['case', id], updated);
      setCancelOpen(false);
      toast.success('پرونده لغو شد.');
      refresh();
    },
    onError: (error) => toast.error('لغو پرونده ممکن نشد.', errorMessage(error)),
  });

  const addComment = useMutation({
    mutationFn: (body: string) => api.post<CommentDto>(`/cases/${id}/comments`, { body }),
    onSuccess: () => {
      setComment('');
      setCommentError('');
      refresh();
    },
    onError: (error) => setCommentError(errorMessage(error)),
  });

  const uploadDocument = useMutation({
    mutationFn: ({ file, documentKey }: { file: File; documentKey?: string }) => {
      const key = documentKey ? `?documentKey=${encodeURIComponent(documentKey)}` : '';
      return api.upload<DocumentDto>(`/cases/${id}/documents${key}`, file);
    },
    onSuccess: () => {
      refresh();
      toast.success('مدرک بارگذاری شد.');
    },
    onError: (error) => toast.error('بارگذاری مدرک ممکن نشد.', errorMessage(error)),
  });

  if (detail.isLoading) {
    return <CaseDetailSkeleton />;
  }

  if (detail.isError || !detail.data) {
    return (
      <Card className="mx-auto mt-10 max-w-lg px-6 py-12 text-center">
        <WarningCircle size={30} className="mx-auto text-stamp-500" />
        <h1 className="mt-4 text-lg font-semibold text-ink-900">پرونده پیدا نشد.</h1>
        <p className="mt-2 text-xs leading-6 text-ink-500">
          {detail.isError ? errorMessage(detail.error) : 'این پرونده وجود ندارد یا به آن دسترسی ندارید.'}
        </p>
        <Link
          to="/cases"
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50"
        >
          بازگشت به پرونده‌ها
        </Link>
      </Card>
    );
  }

  const item = detail.data;
  const definition = item.definition;
  const openTasks = item.tasks.filter((task) =>
    ['pending', 'claimed', 'waiting_info'].includes(task.status),
  );
  const closedTasks = item.tasks.filter((task) =>
    ['completed', 'cancelled'].includes(task.status),
  );
  const visibleEvents = showAllEvents ? item.events : item.events.slice(0, 6);
  const descriptionField = definition.settings?.descriptionField;
  const description =
    descriptionField && typeof item.data[descriptionField] === 'string'
      ? String(item.data[descriptionField])
      : null;

  const openEdit = () => {
    setEditTitle(item.title);
    setEditData({ ...item.data });
    setEditError('');
    setEditOpen(true);
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/cases"
          className="focus-ring inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
        >
          <ArrowRight size={13} />
          همه پرونده‌ها
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wide text-ink-400" dir="ltr">
              {item.reference}
            </span>
            <span className="text-ink-300">·</span>
            <span>{item.caseTypeName}</span>
          </span>
        }
        title={item.title}
        description={description ?? 'جزئیات، مدارک و سابقهٔ کامل این پرونده در یک صفحه.'}
        actions={
          <>
            <StatusBadge status={item.status} />
            {item.priority !== 'normal' ? <PriorityBadge priority={item.priority} /> : null}
            {item.canEdit ? (
              <Button variant="paper" size="sm" icon={<PencilSimple size={14} />} onClick={openEdit}>
                ویرایش
              </Button>
            ) : null}
            {item.canCancel ? (
              <Button
                variant="quiet"
                size="sm"
                icon={<Trash size={14} />}
                onClick={() => {
                  setCancelReason('');
                  setCancelOpen(true);
                }}
                className="text-stamp-600 hover:border-stamp-100 hover:bg-stamp-50 hover:text-stamp-600"
              >
                لغو
              </Button>
            ) : null}
          </>
        }
      />

      {item.status === 'completed' ? (
        <StatusBanner
          tone="green"
          icon={<CheckCircle size={19} weight="fill" />}
          title="این پرونده تکمیل شده است."
          text={item.completedAt ? `تاریخ تکمیل: ${formatDateTime(item.completedAt)}` : undefined}
        />
      ) : item.status === 'rejected' ? (
        <StatusBanner
          tone="red"
          icon={<XCircle size={19} weight="fill" />}
          title="این پرونده رد شده است."
          text="مسیر این پرونده بسته شده؛ سابقه و یادداشت‌ها برای بررسی باقی مانده است."
        />
      ) : item.status === 'cancelled' ? (
        <StatusBanner
          tone="neutral"
          icon={<XCircle size={19} weight="fill" />}
          title="این پرونده لغو شده است."
          text="کارهای باز این پرونده متوقف شده‌اند."
        />
      ) : null}

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-paper-100/45 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink-500">
              <CaseTypeIcon icon={item.caseTypeIcon} size={16} />
            </span>
            <div>
              <div className="text-[11px] font-semibold text-ink-800">{item.caseTypeName}</div>
              <div className="mt-0.5 text-[10px] text-ink-400">
                مرحله فعلی: <span className="font-medium text-ink-600">{item.stageName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {item.dueAt ? <DueChip value={item.dueAt} /> : null}
            <span className="text-[10px] text-ink-400">
              ثبت: {formatDate(item.createdAt)}
            </span>
          </div>
        </div>
        <div className="px-3 pb-2 pt-5 sm:px-5">
          <StageRail definition={definition} currentStageKey={item.stageKey} status={item.status} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.8fr)]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
                  <FileText size={15} />
                </span>
                <h2 className="text-sm font-semibold text-ink-900">اطلاعات پرونده</h2>
              </div>
              {item.canEdit ? (
                <button
                  type="button"
                  onClick={openEdit}
                  className="focus-ring rounded px-2 py-1 text-[10px] font-semibold text-copper-600 hover:bg-copper-50"
                >
                  ویرایش اطلاعات
                </button>
              ) : null}
            </div>
            <CaseDataView definition={definition} data={item.data} options={options.data} />
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
                  <SealCheck size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">کارها</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    {faNum(openTasks.length)} کار باز · {faNum(closedTasks.length)} کار بسته
                  </p>
                </div>
              </div>
            </div>
            {openTasks.length ? (
              <div className="divide-y divide-line/70">
                {openTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-medium text-ink-500">
                  در این لحظه کار بازی برای این پرونده وجود ندارد.
                </p>
              </div>
            )}
            {closedTasks.length ? (
              <details className="border-t border-line bg-paper-100/35">
                <summary className="cursor-pointer list-none px-4 py-2.5 text-[10px] font-semibold text-ink-500 hover:text-ink-800">
                  نمایش {faNum(closedTasks.length)} کار بسته‌شده
                </summary>
                <div className="divide-y divide-line/60 border-t border-line/70">
                  {closedTasks.map((task) => (
                    <TaskCard key={task.id} task={task} muted />
                  ))}
                </div>
              </details>
            ) : null}
          </Card>

          <DocumentsCard
            caseItem={item}
            canUpload={item.canUpload}
            onUpload={(file, documentKey) => uploadDocument.mutate({ file, documentKey })}
            uploading={uploadDocument.isPending}
            fileRef={generalFileRef}
          />

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
                  <ChatCircle size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">گفتگو</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    یادداشت‌ها برای همهٔ اعضای درگیر پرونده قابل مشاهده است.
                  </p>
                </div>
              </div>
              <span className="font-mono text-[10px] text-ink-400">
                {faNum(item.comments.length)}
              </span>
            </div>

            <div className="px-4 py-4">
              {item.comments.length ? (
                <div className="space-y-4">
                  {item.comments.map((entry) => (
                    <CommentRow key={entry.id} comment={entry} />
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
                if (!comment.trim()) {
                  setCommentError('متن یادداشت را بنویسید.');
                  return;
                }
                addComment.mutate(comment.trim());
              }}
              className="border-t border-line bg-paper-100/35 px-4 py-3"
            >
              <div className="flex items-start gap-2.5">
                <Avatar name={user?.name ?? ''} color={user?.avatarColor ?? '#172B39'} size="sm" />
                <div className="min-w-0 flex-1">
                  <Textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="یادداشت یا توضیحی برای تیم بنویسید…"
                    className="min-h-20 bg-white text-xs"
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
                      disabled={!comment.trim()}
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
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink-900">شناسنامه</h2>
            <div className="mt-3 divide-y divide-line/70">
              <MetaRow label="ثبت‌کننده" value={item.createdByName ?? '—'} icon={<User size={13} />} />
              <MetaRow
                label="مسئول فعلی"
                value={item.assigneeName ?? 'بدون مسئول'}
                icon={<User size={13} />}
              />
              <MetaRow
                label="مهلت"
                value={item.dueAt ? formatDateTime(item.dueAt) : 'تعیین نشده'}
                icon={<CalendarBlank size={13} />}
              />
              <MetaRow label="آخرین به‌روزرسانی" value={formatDateTime(item.updatedAt)} />
              <MetaRow
                label="نسخه فرآیند"
                value={`v${faNum(item.version)}`}
                mono
              />
              <MetaRow
                label="شناسه"
                value={item.id.slice(0, 8)}
                mono
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-900">سابقهٔ پرونده</h2>
              <span className="font-mono text-[10px] text-ink-400">{faNum(item.events.length)}</span>
            </div>
            {visibleEvents.length ? (
              <div className="px-4 py-2">
                {visibleEvents.map((event, index) => (
                  <div key={event.id} className="relative flex gap-3 pb-4 last:pb-1">
                    {index < visibleEvents.length - 1 ? (
                      <span className="absolute bottom-0 right-[7px] top-5 w-px bg-line" aria-hidden />
                    ) : null}
                    <span className="relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border border-line bg-paper-50">
                      <span className="absolute inset-[4px] rounded-full bg-ink-300" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium leading-5 text-ink-700">
                        {eventLabels[event.type] ?? event.type}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[9px] text-ink-400">
                        <span>{event.actorName ?? 'سیستم'}</span>
                        <span className="text-ink-300">·</span>
                        <span>{formatDateTime(event.createdAt)}</span>
                      </div>
                      <EventDetail event={event} />
                    </div>
                  </div>
                ))}
                {item.events.length > 6 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllEvents((current) => !current)}
                    className="focus-ring mb-2 w-full rounded-md border border-dashed border-line py-1.5 text-[10px] font-semibold text-ink-400 hover:border-ink-300 hover:text-ink-700"
                  >
                    {showAllEvents ? 'نمایش کمتر' : `نمایش همهٔ ${faNum(item.events.length)} رویداد`}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-[11px] text-ink-400">رویدادی ثبت نشده است.</p>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="ویرایش اطلاعات پرونده"
        description="تغییرات در سابقهٔ پرونده ثبت می‌شود."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="ink"
              loading={updateCase.isPending}
              onClick={() => updateCase.mutate({ title: editTitle.trim() || item.title, data: editData })}
            >
              ذخیره تغییرات
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="عنوان پرونده" required>
            <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
          </Field>
          <DynamicFields
            fields={definition.fields}
            values={editData}
            onChange={(key, value) =>
              setEditData((current) => ({ ...current, [key]: value }))
            }
            options={options.data}
            layout={definition.settings?.formLayout}
          />
          {editError ? (
            <div className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-[11px] leading-6 text-stamp-600">
              {editError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="لغو پرونده"
        description="پرونده و کارهای باز آن متوقف می‌شوند. این کار قابل بازگشت نیست."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              loading={cancelCase.isPending}
              onClick={() => cancelCase.mutate()}
            >
              لغو پرونده
            </Button>
          </>
        }
      >
        <Field label="دلیل لغو" hint="اختیاری؛ برای سابقه ثبت می‌شود.">
          <Textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="مثلاً درخواست تکراری است…"
          />
        </Field>
      </Modal>
    </div>
  );
}

function CaseDataView({
  definition,
  data,
  options,
}: {
  definition: CaseTypeDefinition;
  data: Record<string, unknown>;
  options?: Parameters<typeof fieldDisplayValue>[2];
}) {
  const visibleFields = definition.fields.filter(
    (field) => !field.visibleWhen || evaluateCondition(field.visibleWhen, definition.fields, data),
  );
  if (!visibleFields.length) {
    return (
      <p className="px-4 py-10 text-center text-[11px] text-ink-400">
        این نوع پرونده فیلد اختصاصی ندارد.
      </p>
    );
  }

  const groups: { section: string; fields: FieldDef[] }[] = [];
  for (const field of visibleFields) {
    const section = field.section?.trim() ?? '';
    const group = groups.find((candidate) => candidate.section === section);
    if (group) group.fields.push(field);
    else groups.push({ section, fields: [field] });
  }

  return (
    <div className="space-y-4 px-4 py-2">
      {groups.map((group) => (
        <div key={group.section || 'default'}>
          {group.section ? (
            <div className="border-b border-line pb-1.5 text-[10px] font-semibold text-ink-500">
              {group.section}
            </div>
          ) : null}
          <dl className="grid gap-x-6 gap-y-0 sm:grid-cols-6">
            {group.fields.map((field) => (
              <div
                key={field.key}
                className={cn(
                  'border-b border-line/60 py-3 last:border-b-0',
                  field.type === 'textarea' || field.width === 'full'
                    ? 'sm:col-span-6'
                    : field.width === 'third'
                      ? 'sm:col-span-2'
                      : 'sm:col-span-3',
                )}
              >
                <dt className="text-[10px] font-medium text-ink-400">{field.label}</dt>
                <dd
                  className={cn(
                    'mt-1 text-xs leading-6 text-ink-800',
                    field.type === 'currency' && 'font-mono tabular-nums',
                  )}
                >
                  {field.type === 'currency' && typeof data[field.key] !== 'undefined'
                    ? formatMoney(data[field.key] as number | string)
                    : fieldDisplayValue(field, data[field.key], options)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, muted = false }: { task: TaskDto; muted?: boolean }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className={cn(
        'focus-ring group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-100/75',
        muted && 'opacity-65 hover:opacity-100',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
          task.canAct
            ? 'border-copper-200 bg-copper-50 text-copper-600'
            : 'border-line bg-white text-ink-400',
        )}
      >
        <SealCheck size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-ink-800">{task.name}</span>
          <TaskKindBadge kind={task.kind} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-400">
          <span>{task.assigneeName ?? 'بدون مسئول'}</span>
          <span className="text-ink-300">·</span>
          <DueChip value={task.dueAt} />
          {task.canAct ? (
            <span className="font-semibold text-copper-600">منتظر اقدام شما</span>
          ) : null}
        </div>
      </div>
      <TaskStatusBadge status={task.status} />
      <CaretLeft
        size={14}
        className="hidden text-ink-300 group-hover:-translate-x-0.5 group-hover:text-copper-500 sm:block"
      />
    </Link>
  );
}

function DocumentsCard({
  caseItem,
  canUpload,
  onUpload,
  uploading,
  fileRef,
}: {
  caseItem: CaseDetail;
  canUpload: boolean;
  onUpload: (file: File, documentKey?: string) => void;
  uploading: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
}) {
  const definitionDocs = caseItem.definition.documents ?? [];
  const uploadedKeys = new Set(
    caseItem.documents.map((document) => document.documentKey).filter(Boolean),
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-paper-100 text-ink-500">
            <Paperclip size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">مدارک</h2>
            <p className="mt-0.5 text-[10px] text-ink-400">
              {faNum(caseItem.documents.length)} فایل پیوست
            </p>
          </div>
        </div>
        {canUpload ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="paper"
              loading={uploading}
              icon={<Plus size={14} />}
              onClick={() => fileRef.current?.click()}
            >
              افزودن
            </Button>
          </div>
        ) : null}
      </div>

      {definitionDocs.length ? (
        <div className="border-b border-line bg-paper-100/40 px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold text-ink-500">مدارک مورد انتظار</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {definitionDocs.map((document) => {
              const uploaded = uploadedKeys.has(document.key);
              return (
                <div
                  key={document.key}
                  className="flex items-center gap-2 rounded-lg border border-line bg-white/60 px-2.5 py-2"
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      uploaded
                        ? 'bg-verdigris-100 text-verdigris-700'
                        : 'bg-paper-200 text-ink-400',
                    )}
                  >
                    {uploaded ? <CheckCircle size={12} weight="fill" /> : <FileText size={11} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-ink-600">
                    {document.name}
                    {document.required ? <span className="text-copper-500"> *</span> : null}
                  </span>
                  {uploaded ? (
                    <span className="text-[9px] font-semibold text-verdigris-700">پیوست شد</span>
                  ) : canUpload ? (
                    <label className="focus-ring cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-semibold text-copper-600 hover:bg-copper-50">
                      بارگذاری
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onUpload(file, document.key);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {caseItem.documents.length ? (
        <div className="divide-y divide-line/70">
          {caseItem.documents.map((document) => (
            <div key={document.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-white text-ink-400">
                <FileText size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-ink-700">{document.name}</div>
                <div className="mt-0.5 text-[9px] text-ink-400">
                  {formatFileSize(document.size)} · {document.uploadedByName ?? 'سیستم'} ·{' '}
                  {formatDate(document.createdAt)}
                </div>
              </div>
              <a
                href={`/api/documents/${document.id}/download`}
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                aria-label="دانلود"
              >
                <DownloadSimple size={15} />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-7 text-center">
          <FileArrowUp size={22} className="mx-auto text-ink-300" />
          <p className="mt-2 text-[10px] text-ink-400">هنوز فایلی پیوست نشده است.</p>
        </div>
      )}
    </Card>
  );
}

function CommentRow({ comment }: { comment: CommentDto }) {
  const color = colorForName(comment.authorName);
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={comment.authorName} color={color} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[11px] font-semibold text-ink-800">{comment.authorName}</span>
          <span className="text-[9px] text-ink-400">{formatDateTime(comment.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-6 text-ink-600">{comment.body}</p>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  icon,
  mono = false,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[10px] text-ink-400">{label}</span>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-end text-[11px] font-medium text-ink-700',
          mono && 'font-mono text-[10px]',
        )}
      >
        {icon ? <span className="shrink-0 text-ink-300">{icon}</span> : null}
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

function StatusBanner({
  tone,
  icon,
  title,
  text,
}: {
  tone: 'green' | 'red' | 'neutral';
  icon: ReactNode;
  title: string;
  text?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex items-start gap-3 rounded-xl border px-4 py-3',
        tone === 'green' && 'border-verdigris-100 bg-verdigris-50/70',
        tone === 'red' && 'border-stamp-100 bg-stamp-50/70',
        tone === 'neutral' && 'border-line bg-paper-200/50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0',
          tone === 'green' && 'text-verdigris-600',
          tone === 'red' && 'text-stamp-600',
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
            tone === 'red' && 'text-stamp-700',
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

function EventDetail({ event }: { event: CaseDetail['events'][number] }) {
  const data = event.data ?? {};
  const detail =
    (typeof data.stageName === 'string' && data.stageName) ||
    (typeof data.name === 'string' && data.name) ||
    (typeof data.preview === 'string' && data.preview) ||
    (typeof data.comment === 'string' && data.comment) ||
    (typeof data.reason === 'string' && data.reason) ||
    (typeof data.to === 'string' && data.to) ||
    '';
  if (!detail) return null;
  return <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-ink-400">{detail}</p>;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${faNum(size)} بایت`;
  if (size < 1024 * 1024) return `${faNum(Math.round(size / 1024))} کیلوبایت`;
  return `${faNum(Math.round((size / (1024 * 1024)) * 10) / 10)} مگابایت`;
}

function colorForName(name: string): string {
  const palette = ['#315364', '#406B5D', '#A95F3D', '#9A6B22', '#9A4038', '#4B5D8A'];
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0]!;
}

function CaseDetailSkeleton() {
  return (
    <div>
      <div className="mb-5 space-y-3">
        <div className="h-2.5 w-24 animate-pulse rounded bg-paper-200" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-paper-200" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-paper-200" />
      </div>
      <div className="mb-6 h-36 animate-pulse rounded-xl bg-paper-200" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,0.8fr)]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-xl bg-paper-200" />
          ))}
        </div>
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-xl bg-paper-200" />
          <div className="h-64 animate-pulse rounded-xl bg-paper-200" />
        </div>
      </div>
    </div>
  );
}
