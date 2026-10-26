import { Link } from 'react-router-dom';
import type { CaseListItem } from '@ravand/shared';
import { CaretLeft, UserCircle } from '@phosphor-icons/react';
import { cn } from './ui';
import { CaseTypeIcon, DueChip, PriorityBadge, StatusBadge } from './domain';

export function CaseRow({
  item,
  className,
  compact = false,
}: {
  item: CaseListItem;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={`/cases/${item.id}`}
      className={cn(
        'focus-ring group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-100/80',
        className,
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-500',
          compact ? 'h-8 w-8' : 'h-10 w-10',
        )}
      >
        <CaseTypeIcon icon={item.caseTypeIcon} size={compact ? 16 : 18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('truncate font-semibold text-ink-900', compact ? 'text-xs' : 'text-[13px]')}>
            {item.title}
          </span>
          {item.priority === 'high' ? <PriorityBadge priority="high" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-400">
          <span className="font-mono" dir="ltr">
            {item.reference}
          </span>
          <span className="text-ink-300">·</span>
          <span>{item.caseTypeName}</span>
          <span className="text-ink-300">·</span>
          <span className="truncate">{item.stageName}</span>
          {item.assigneeName ? (
            <>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1">
                <UserCircle size={11} />
                {item.assigneeName}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <StatusBadge status={item.status} />
        <DueChip value={item.dueAt} />
      </div>
      <CaretLeft
        size={15}
        className="shrink-0 text-ink-300 transition-transform group-hover:-translate-x-0.5 group-hover:text-copper-500"
      />
    </Link>
  );
}
