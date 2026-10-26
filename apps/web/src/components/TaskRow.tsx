import { Link } from 'react-router-dom';
import type { TaskDto } from '@ravand/shared';
import { CaretLeft, UserCircle } from '@phosphor-icons/react';
import { dueInfo, roleLabel } from '@/lib/format';
import { cn } from './ui';
import { DueChip, TaskKindBadge, TaskStatusBadge } from './domain';

export function TaskRow({
  task,
  showCase = true,
  className,
}: {
  task: TaskDto;
  showCase?: boolean;
  className?: string;
}) {
  const late = dueInfo(task.dueAt).tone === 'late';
  return (
    <Link
      to={`/tasks/${task.id}`}
      className={cn(
        'focus-ring group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-100/80',
        late && 'bg-stamp-50/35',
        className,
      )}
    >
      {late ? <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-stamp-500" /> : null}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-white text-ink-500">
        <UserCircle size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-ink-900">{task.name}</span>
          <TaskKindBadge kind={task.kind} />
          {late ? (
            <span className="rounded bg-stamp-100 px-1.5 py-0.5 text-[9px] font-bold text-stamp-600">
              گذشته از مهلت
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-400">
          {showCase ? (
            <>
              <span className="truncate font-medium text-ink-500">{task.caseTitle}</span>
              <span className="text-ink-300">·</span>
              <span className="font-mono" dir="ltr">
                {task.caseReference}
              </span>
              <span className="text-ink-300">·</span>
            </>
          ) : null}
          <span className="truncate">{task.stageName}</span>
          {task.assigneeName ? (
            <>
              <span className="text-ink-300">·</span>
              <span>{task.assigneeName}</span>
            </>
          ) : task.candidateRole ? (
            <>
              <span className="text-ink-300">·</span>
              <span>برای {roleLabel(task.candidateRole)}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <TaskStatusBadge status={task.status} />
        <DueChip value={task.dueAt} />
      </div>
      <CaretLeft
        size={15}
        className="shrink-0 text-ink-300 transition-transform group-hover:-translate-x-0.5 group-hover:text-copper-500"
      />
    </Link>
  );
}
