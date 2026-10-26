import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { CheckCircle, CircleNotch, Info, WarningCircle, X } from '@phosphor-icons/react';
import { initials } from '@/lib/format';

export function cn(...values: Parameters<typeof clsx>): string {
  return clsx(...values);
}

const buttonVariants = {
  primary:
    'bg-ink-900 text-paper-50 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] hover:bg-ink-800 active:bg-ink-950',
  ink: 'bg-ink-900 text-paper-50 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] hover:bg-ink-800 active:bg-ink-950',
  copper: 'bg-copper-500 text-white hover:bg-copper-600 active:bg-copper-700',
  paper: 'border border-line bg-white/55 text-ink-700 hover:border-ink-300 hover:bg-white',
  secondary:
    'border border-line bg-paper-50 text-ink-800 hover:border-ink-300 hover:bg-white active:bg-paper-100',
  ghost: 'text-ink-600 hover:bg-paper-200/80 active:bg-paper-300/60',
  danger: 'bg-stamp-600 text-white hover:bg-stamp-500 active:bg-stamp-600',
  quiet: 'border border-transparent text-ink-500 hover:border-line hover:text-ink-800',
} as const;

const buttonSizes = {
  sm: 'h-8 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-10 gap-2 rounded-lg px-3.5 text-sm',
  lg: 'h-11 gap-2 rounded-lg px-5 text-sm',
  icon: 'h-9 w-9 rounded-lg',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <CircleNotch size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

const badgeTones = {
  neutral: 'border-line bg-paper-100 text-ink-600',
  ink: 'border-ink-800/20 bg-ink-900 text-paper-50',
  copper: 'border-copper-200 bg-copper-50 text-copper-700',
  green: 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
  red: 'border-stamp-100 bg-stamp-50 text-stamp-600',
  amber: 'border-ochre-100 bg-ochre-50 text-ochre-600',
  outline: 'border-line bg-transparent text-ink-500',
} as const;

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-paper-50 shadow-folio',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5',
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}

const inputClass =
  'focus-ring h-10 w-full rounded-lg border border-line bg-white/75 px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-copper-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-paper-200/60 disabled:text-ink-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(inputClass, 'h-auto min-h-24 resize-y py-2.5 leading-7', className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(inputClass, 'cursor-pointer pe-8', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
        {label}
        {required ? <span className="text-copper-500">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="flex items-center gap-1 text-[11px] text-stamp-600">
          <WarningCircle size={13} />
          {error}
        </span>
      ) : hint ? (
        <span className="block text-[11px] leading-5 text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function Avatar({
  name,
  color = '#1E3A5F',
  size = 'md',
  className,
}: {
  name: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'h-6 w-6 text-[9px]',
    sm: 'h-8 w-8 text-[10px]',
    md: 'h-9 w-9 text-[11px]',
    lg: 'h-12 w-12 text-sm',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: `${color}16`, color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <CircleNotch size={size} className="animate-spin text-copper-500" />;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-paper-200/80', className)}
      aria-hidden
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-100 text-ink-500">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs leading-6 text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      );
      const fallback = panel.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      (preferred ?? fallback)?.focus();
    }, 30);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'پنجره'}
        className={cn(
          'animate-rise flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-paper-50 shadow-lift sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-6 text-ink-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring -me-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-paper-200 hover:text-ink-900"
            aria-label="بستن"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper-100/70 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'تأیید',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'copper';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            انصراف
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'copper'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-7 text-ink-600">{description}</p>
    </Modal>
  );
}

const toastTones = {
  success: {
    icon: <CheckCircle size={18} weight="fill" />,
    className: 'border-verdigris-100 bg-verdigris-50 text-verdigris-700',
  },
  error: {
    icon: <WarningCircle size={18} weight="fill" />,
    className: 'border-stamp-100 bg-stamp-50 text-stamp-600',
  },
  info: {
    icon: <Info size={18} weight="fill" />,
    className: 'border-copper-200 bg-copper-50 text-copper-700',
  },
} as const;

export function ToastCard({
  tone,
  title,
  message,
  onClose,
}: {
  tone: keyof typeof toastTones;
  title: string;
  message?: string;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        'animate-toast-in flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lift',
        toastTones[tone].className,
      )}
      role="status"
    >
      <span className="mt-0.5 shrink-0">{toastTones[tone].icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">{title}</p>
        {message ? <p className="mt-1 text-[11px] leading-5 opacity-80">{message}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="focus-ring -me-1 rounded p-0.5 opacity-60 hover:opacity-100"
        aria-label="بستن اعلان"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1 border-b border-line', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            'focus-ring relative -mb-px flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors',
            value === item.value
              ? 'border-b-2 border-copper-500 text-ink-900'
              : 'border-b-2 border-transparent text-ink-500 hover:text-ink-800',
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px]',
                value === item.value
                  ? 'bg-copper-100 text-copper-700'
                  : 'bg-paper-200 text-ink-500',
              )}
            >
              {item.count.toLocaleString('fa-IR')}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
