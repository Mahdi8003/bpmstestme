import type { CasePriority, CaseStatus, RoleKey, TaskStatus } from '@ravand/shared';
import {
  CASE_STATUS_LABELS,
  ROLE_LABELS,
  TASK_STATUS_LABELS,
} from '@ravand/shared';

const numberFormat = new Intl.NumberFormat('fa-IR');
const dateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const longDateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const shortDateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  month: 'short',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit',
  minute: '2-digit',
});
const relativeFormat = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });

export function faNum(value: number | string): string {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return String(value);
  return numberFormat.format(parsed);
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return '—';
  return `${numberFormat.format(parsed)} ریال`;
}

export function formatMoneyCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return '—';
  if (Math.abs(parsed) >= 1_000_000_000) {
    return `${numberFormat.format(Math.round(parsed / 100_000_000) / 10)} میلیارد ریال`;
  }
  if (Math.abs(parsed) >= 1_000_000) {
    return `${numberFormat.format(Math.round(parsed / 100_000) / 10)} میلیون ریال`;
  }
  return formatMoney(parsed);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormat.format(date);
}

export function formatShortDate(value: string | Date): string {
  const date =
    value instanceof Date
      ? value
      : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormat.format(date);
}

export function formatLongDate(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return longDateFormat.format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${dateFormat.format(date)}، ${timeFormat.format(date)}`;
}

export function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return timeFormat.format(date);
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relativeFormat.format(days, 'day');
  const months = Math.round(days / 30);
  return relativeFormat.format(months, 'month');
}

export interface DueInfo {
  label: string;
  tone: 'calm' | 'soon' | 'late' | 'none';
}

export function dueInfo(value: string | Date | null | undefined): DueInfo {
  if (!value) return { label: 'بدون مهلت', tone: 'none' };
  const date = value instanceof Date ? value : new Date(value);
  const diff = date.getTime() - Date.now();
  const hours = diff / 3_600_000;
  if (diff < 0) return { label: `${relativeTime(date)}`, tone: 'late' };
  if (hours <= 24) return { label: `${relativeTime(date)}`, tone: 'soon' };
  return { label: `${relativeTime(date)}`, tone: 'calm' };
}

export function statusLabel(status: CaseStatus): string {
  return CASE_STATUS_LABELS[status];
}

export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function roleLabel(role: RoleKey | string): string {
  return ROLE_LABELS[role as RoleKey] ?? role;
}

export function priorityLabel(priority: CasePriority): string {
  return { low: 'کم', normal: 'معمولی', high: 'فوری' }[priority];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return '؟';
  if (parts.length === 1) return parts[0]!.slice(0, 2);
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`;
}

export function titleForPath(pathname: string): string {
  if (pathname === '/') return 'امروز';
  if (pathname.startsWith('/inbox')) return 'صندوق کار';
  if (pathname.startsWith('/cases/new')) return 'پرونده جدید';
  if (pathname.startsWith('/cases/')) return 'پرونده';
  if (pathname.startsWith('/cases')) return 'پرونده‌ها';
  if (pathname.startsWith('/tasks/')) return 'کار';
  if (pathname.startsWith('/builder')) return 'سازنده فرآیند';
  if (pathname.startsWith('/data')) return 'داده‌های پایه';
  if (pathname.startsWith('/insights')) return 'گزارش‌ها';
  if (pathname.startsWith('/notifications')) return 'اعلان‌ها';
  if (pathname.startsWith('/admin')) return 'مدیریت';
  return 'روند';
}

export function todayLabel(): string {
  return formatLongDate(new Date());
}
