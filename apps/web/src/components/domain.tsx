import type { ReactNode } from 'react';
import type {
  CasePriority,
  CaseStatus,
  CaseTypeDefinition,
  TaskKind,
  TaskStatus,
} from '@ravand/shared';
import {
  Check,
  Clock,
  ClipboardText,
  Factory,
  FileText,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  UsersThree,
  Wallet,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { dueInfo, faNum, priorityLabel, statusLabel, taskStatusLabel } from '@/lib/format';
import { cn } from './ui';

const statusTones: Record<
  CaseStatus,
  { tone: 'copper' | 'amber' | 'green' | 'red' | 'neutral'; dot: string }
> = {
  in_progress: { tone: 'copper', dot: 'bg-copper-500' },
  on_hold: { tone: 'amber', dot: 'bg-ochre-500' },
  completed: { tone: 'green', dot: 'bg-verdigris-500' },
  rejected: { tone: 'red', dot: 'bg-stamp-500' },
  cancelled: { tone: 'neutral', dot: 'bg-ink-400' },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const meta = statusTones[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-semibold leading-4',
        meta.tone === 'copper' && 'border-copper-200 bg-copper-50 text-copper-700',
        meta.tone === 'amber' && 'border-ochre-100 bg-ochre-50 text-ochre-600',
        meta.tone === 'green' && 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
        meta.tone === 'red' && 'border-stamp-100 bg-stamp-50 text-stamp-600',
        meta.tone === 'neutral' && 'border-line bg-paper-100 text-ink-500',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {statusLabel(status)}
    </span>
  );
}

const taskTones: Record<
  TaskStatus,
  { className: string; dot: string }
> = {
  pending: { className: 'border-line bg-paper-100 text-ink-600', dot: 'bg-ink-400' },
  claimed: { className: 'border-ink-300 bg-paper-50 text-ink-800', dot: 'bg-ink-700' },
  waiting_info: {
    className: 'border-ochre-100 bg-ochre-50 text-ochre-600',
    dot: 'bg-ochre-500',
  },
  completed: {
    className: 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
    dot: 'bg-verdigris-500',
  },
  cancelled: { className: 'border-line bg-paper-200 text-ink-500', dot: 'bg-ink-300' },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = taskTones[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-semibold leading-4',
        meta.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {taskStatusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold leading-4',
        priority === 'high' && 'border-stamp-100 bg-stamp-50 text-stamp-600',
        priority === 'normal' && 'border-line bg-paper-100 text-ink-600',
        priority === 'low' && 'border-line bg-transparent text-ink-400',
      )}
    >
      {priorityLabel(priority)}
    </span>
  );
}

export function DueChip({ value }: { value: string | null | undefined }) {
  const info = dueInfo(value);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
        info.tone === 'late' && 'bg-stamp-50 text-stamp-600',
        info.tone === 'soon' && 'bg-ochre-50 text-ochre-600',
        info.tone === 'calm' && 'bg-paper-100 text-ink-500',
        info.tone === 'none' && 'text-ink-400',
      )}
    >
      <Clock size={11} />
      {info.label}
    </span>
  );
}

const caseIcons: Record<string, Icon> = {
  cart: ShoppingCart,
  wallet: Wallet,
  users: UsersThree,
  factory: Factory,
  package: Package,
  file: FileText,
  receipt: Receipt,
  truck: Truck,
  clipboard: ClipboardText,
};

export function CaseTypeIcon({
  icon,
  size = 18,
  weight = 'regular',
  className,
}: {
  icon: string;
  size?: number;
  weight?: 'regular' | 'duotone' | 'bold';
  className?: string;
}) {
  const Component = caseIcons[icon] ?? FileText;
  return <Component size={size} weight={weight} className={className} />;
}

const taskKindLabels: Record<TaskKind, string> = {
  approval: 'تأیید',
  action: 'اقدام',
  info: 'اطلاعات تکمیلی',
  selection: 'انتخاب',
};

export function TaskKindBadge({ kind }: { kind: TaskKind }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
        kind === 'approval' && 'bg-ink-900 text-paper-50',
        kind === 'action' && 'bg-paper-200 text-ink-700',
        kind === 'info' && 'bg-ochre-100 text-ochre-600',
        kind === 'selection' && 'bg-copper-100 text-copper-700',
      )}
    >
      {taskKindLabels[kind]}
    </span>
  );
}

export function StageRail({
  definition,
  currentStageKey,
  status,
  compact = false,
}: {
  definition: CaseTypeDefinition;
  currentStageKey: string;
  status: CaseStatus;
  compact?: boolean;
}) {
  const stages = definition.stages ?? [];
  if (!stages.length) return null;
  const index = Math.max(
    0,
    stages.findIndex((stage) => stage.key === currentStageKey),
  );
  const isClosed = status === 'completed' || status === 'rejected' || status === 'cancelled';
  const progress = status === 'completed' ? 100 : (index / Math.max(1, stages.length - 1)) * 100;
  const position = isClosed
    ? status === 'completed'
      ? 'تکمیل‌شده'
      : status === 'rejected'
        ? 'ردشده'
        : 'لغوشده'
    : `مرحله ${faNum(index + 1)} از ${faNum(stages.length)}`;

  return (
    <div className={cn('w-full', compact ? 'pb-1' : 'pb-2')} aria-label="مراحل پرونده">
      {!compact ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold text-ink-500">گردش کار</span>
          <span className="font-mono text-[10px] text-ink-400">{position}</span>
        </div>
      ) : null}
      <div className="w-full overflow-x-auto scroll-thin">
        <div className={cn('relative min-w-[520px]', compact ? 'px-1' : 'px-0')}>
          <div className="absolute top-[12px] right-3 left-3 h-px bg-paper-300" />
          {progress > 0 ? (
            <div
              className="absolute top-[12px] right-3 h-px bg-copper-500 transition-all"
              style={{ width: `calc((100% - 1.5rem) * ${progress / 100})` }}
            />
          ) : null}
          <div
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
          >
            {stages.map((stage, stageIndex) => {
              const previousDone = status === 'completed' || stageIndex < index;
              const isCurrent = stageIndex === index && !isClosed;
              const isRejected = stageIndex === index && status === 'rejected';
              const isCancelled = stageIndex === index && status === 'cancelled';
              return (
                <div
                  key={stage.key}
                  className="flex flex-col items-center px-1 text-center"
                  title={stage.description || stage.name}
                >
                  <span
                    className={cn(
                      'relative z-10 flex h-6 w-6 items-center justify-center rounded border bg-paper-50 font-mono text-[10px] font-semibold',
                      previousDone && 'border-ink-900 bg-ink-900 text-paper-50',
                      isCurrent && 'border-copper-500 bg-copper-50 text-copper-700',
                      isRejected && 'border-stamp-500 bg-stamp-50 text-stamp-600',
                      isCancelled && 'border-ink-300 bg-paper-100 text-ink-400',
                      !previousDone &&
                        !isCurrent &&
                        !isRejected &&
                        !isCancelled &&
                        'border-line text-ink-400',
                    )}
                  >
                    {previousDone ? (
                      <Check size={12} weight="bold" />
                    ) : isRejected ? (
                      <X size={12} weight="bold" />
                    ) : isCurrent && status === 'on_hold' ? (
                      <Clock size={12} />
                    ) : (
                      faNum(stageIndex + 1)
                    )}
                  </span>
                  <span
                    className={cn(
                      'mt-2 max-w-[130px] text-[10px] leading-5',
                      isCurrent || previousDone ? 'font-semibold text-ink-800' : 'text-ink-400',
                    )}
                  >
                    {stage.name}
                  </span>
                  {!compact && stage.description ? (
                    <span className="mt-0.5 line-clamp-2 max-w-[140px] text-[9px] leading-4 text-ink-400">
                      {stage.description}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetaLine({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2.5', className)}>
      <span className="shrink-0 text-[11px] text-ink-400">{label}</span>
      <span className="min-w-0 text-end text-xs font-medium text-ink-800">{children}</span>
    </div>
  );
}

