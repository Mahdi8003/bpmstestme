import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  X,
} from '@phosphor-icons/react';
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  JALALI_WEEKDAYS_SHORT,
  formatJalaliLong,
  isoFromJalaali,
  jalaaliMonthLength,
  parseJalaliIso,
  toJalaali,
  toPersianDigits,
  weekdayIndex,
} from '@/lib/jalali';
import { cn } from './ui';

const POPOVER_WIDTH = 312;
const POPOVER_HEIGHT = 378;
const MIN_YEAR = 1200;
const MAX_YEAR = 1600;
const YEARS_PER_PAGE = 12;

type Panel = 'days' | 'months' | 'years';

function clampYear(year: number): number {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, year));
}

function startOfYearPage(year: number): number {
  return Math.floor((year - MIN_YEAR) / YEARS_PER_PAGE) * YEARS_PER_PAGE + MIN_YEAR;
}

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  disabled = false,
  className,
  clearable = true,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
}) {
  const id = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('days');
  const [position, setPosition] = useState({ top: 0, left: 0, width: POPOVER_WIDTH });
  const selected = parseJalaliIso(value);
  const today = toJalaali();
  const [view, setView] = useState(() => ({
    jy: selected?.jy ?? today.jy,
    jm: selected?.jm ?? today.jm,
  }));
  const [yearStart, setYearStart] = useState(() => startOfYearPage(view.jy));

  useEffect(() => {
    if (!open) return;
    const current = parseJalaliIso(value) ?? toJalaali();
    setView({ jy: current.jy, jm: current.jm });
    setYearStart(startOfYearPage(current.jy));
    setPanel('days');
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 8,
      );
      let top = rect.bottom + 6;
      if (top + POPOVER_HEIGHT > window.innerHeight - 8) {
        top = Math.max(8, rect.top - POPOVER_HEIGHT - 6);
      }
      setPosition({ top, left, width });
    };
    update();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const firstWeekday = weekdayIndex(view.jy, view.jm, 1);
  const monthLength = jalaaliMonthLength(view.jy, view.jm);
  const days: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthLength }, (_, index) => index + 1),
  ];
  while (days.length % 7 !== 0) days.push(null);

  const shiftMonth = (delta: number) => {
    setView((current) => {
      const next = current.jm + delta;
      if (next < 1) return { jy: clampYear(current.jy - 1), jm: 12 };
      if (next > 12) return { jy: clampYear(current.jy + 1), jm: 1 };
      return { ...current, jm: next };
    });
  };

  const shiftYear = (delta: number) => {
    setView((current) => ({ ...current, jy: clampYear(current.jy + delta) }));
  };

  const openYears = () => {
    setYearStart(startOfYearPage(view.jy));
    setPanel('years');
  };

  const chooseMonth = (month: number) => {
    setView((current) => ({ ...current, jm: month }));
    setPanel('days');
  };

  const chooseYear = (year: number) => {
    setView((current) => ({ ...current, jy: year }));
    setPanel('months');
  };

  const choose = (day: number) => {
    onChange(isoFromJalaali({ jy: view.jy, jm: view.jm, jd: day }));
    setOpen(false);
  };

  const prevLabel =
    panel === 'years' ? 'سال‌های قبل' : panel === 'months' ? 'سال قبل' : 'ماه قبل';
  const nextLabel =
    panel === 'years' ? 'سال‌های بعد' : panel === 'months' ? 'سال بعد' : 'ماه بعد';

  return (
    <div className={cn('relative', className)}>
      <button
        ref={anchorRef}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'focus-ring flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-paper-50/80 px-3 text-start text-sm transition-colors hover:border-ink-300 focus:border-copper-400 disabled:cursor-not-allowed disabled:bg-paper-200/60 disabled:text-ink-500',
          value ? 'text-ink-900' : 'text-ink-400',
          clearable && value ? 'pe-9' : '',
        )}
      >
        <CalendarBlank size={16} className="shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 truncate">
          {value ? formatJalaliLong(value) : placeholder}
        </span>
      </button>
      {clearable && value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={disabled}
          className="focus-ring absolute inset-y-0 end-1.5 my-auto flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-paper-100 hover:text-ink-700 disabled:pointer-events-none"
          aria-label="پاک کردن تاریخ"
        >
          <X size={13} />
        </button>
      ) : null}

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="انتخاب تاریخ شمسی"
              dir="rtl"
              className="animate-rise fixed z-[80] rounded-xl border border-line bg-paper-50 p-3 shadow-lift"
              style={{ top: position.top, left: position.left, width: position.width }}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (panel === 'years') {
                      setYearStart((current) =>
                        Math.max(MIN_YEAR, current - YEARS_PER_PAGE),
                      );
                    } else if (panel === 'months') {
                      shiftYear(-1);
                    } else {
                      shiftMonth(-1);
                    }
                  }}
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-ink-500 hover:border-ink-300 hover:bg-paper-100"
                  aria-label={prevLabel}
                >
                  <CaretRight size={14} />
                </button>

                <div className="flex min-w-0 flex-1 flex-col items-center">
                  {panel === 'days' ? (
                    <div className="flex items-baseline gap-0.5">
                      <button
                        type="button"
                        onClick={() => setPanel('months')}
                        className="focus-ring rounded-md px-1.5 py-0.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-paper-100"
                        title="انتخاب ماه"
                      >
                        {JALALI_MONTHS[view.jm - 1]}
                      </button>
                      <button
                        type="button"
                        onClick={openYears}
                        className="focus-ring rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums text-ink-900 transition-colors hover:bg-paper-100"
                        title="انتخاب سال"
                      >
                        {toPersianDigits(String(view.jy))}
                      </button>
                    </div>
                  ) : panel === 'months' ? (
                    <button
                      type="button"
                      onClick={openYears}
                      className="focus-ring rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums text-ink-900 transition-colors hover:bg-paper-100"
                      title="انتخاب سال"
                    >
                      {toPersianDigits(String(view.jy))}
                    </button>
                  ) : (
                    <span className="px-1 text-sm font-semibold tabular-nums text-ink-900">
                      {toPersianDigits(String(yearStart))} – {toPersianDigits(String(yearStart + YEARS_PER_PAGE - 1))}
                    </span>
                  )}
                  <div className="mt-0.5 text-[9px] text-ink-400">
                    {panel === 'days'
                      ? 'تقویم هجری شمسی'
                      : panel === 'months'
                        ? 'انتخاب ماه'
                        : 'انتخاب سال'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (panel === 'years') {
                      setYearStart((current) =>
                        Math.min(MAX_YEAR - YEARS_PER_PAGE + 1, current + YEARS_PER_PAGE),
                      );
                    } else if (panel === 'months') {
                      shiftYear(1);
                    } else {
                      shiftMonth(1);
                    }
                  }}
                  className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-ink-500 hover:border-ink-300 hover:bg-paper-100"
                  aria-label={nextLabel}
                >
                  <CaretLeft size={14} />
                </button>
              </div>

              {panel === 'days' ? (
                <>
                  <div className="grid grid-cols-7 border-y border-line bg-paper-100/60 py-1.5 text-center">
                    {JALALI_WEEKDAYS_SHORT.map((day, index) => (
                      <span
                        key={day}
                        title={JALALI_WEEKDAYS[index]}
                        className="text-[10px] font-semibold text-ink-400"
                      >
                        {day}
                      </span>
                    ))}
                  </div>

                  <div className="mt-1 grid grid-cols-7 gap-0.5">
                    {days.map((day, index) => {
                      if (!day) return <span key={`empty-${index}`} className="h-9" />;
                      const isSelected =
                        selected?.jy === view.jy &&
                        selected.jm === view.jm &&
                        selected.jd === day;
                      const isToday =
                        today.jy === view.jy && today.jm === view.jm && today.jd === day;
                      const isFriday = (firstWeekday + day - 1) % 7 === 6;
                      return (
                        <button
                          key={`${view.jy}-${view.jm}-${day}`}
                          type="button"
                          onClick={() => choose(day)}
                          aria-label={`${toPersianDigits(String(day))} ${
                            JALALI_MONTHS[view.jm - 1]
                          } ${toPersianDigits(String(view.jy))}`}
                          aria-pressed={isSelected}
                          className={cn(
                            'focus-ring relative flex h-9 items-center justify-center rounded-md font-mono text-[12px] transition-colors',
                            isSelected
                              ? 'bg-copper-600 text-on-accent'
                              : isToday
                                ? 'border border-copper-300 bg-copper-50 font-semibold text-copper-700'
                                : isFriday
                                  ? 'text-stamp-500 hover:bg-stamp-50'
                                  : 'text-ink-700 hover:bg-paper-100',
                          )}
                        >
                          {toPersianDigits(String(day))}
                          {isToday && !isSelected ? (
                            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-copper-500" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : panel === 'months' ? (
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {JALALI_MONTHS.map((month, index) => {
                    const monthNumber = index + 1;
                    const isCurrent = view.jm === monthNumber;
                    const isThisMonth =
                      today.jy === view.jy && today.jm === monthNumber;
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => chooseMonth(monthNumber)}
                        aria-pressed={isCurrent}
                        className={cn(
                          'focus-ring flex h-11 items-center justify-center rounded-md text-[12px] font-medium transition-colors',
                          isCurrent
                            ? 'bg-copper-600 font-semibold text-on-accent'
                            : isThisMonth
                              ? 'border border-copper-300 bg-copper-50 font-semibold text-copper-700'
                              : 'text-ink-700 hover:bg-paper-100',
                        )}
                      >
                        {month}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearStart + index).map(
                    (year) => {
                      const isCurrent = view.jy === year;
                      const isThisYear = today.jy === year;
                      return (
                        <button
                          key={year}
                          type="button"
                          onClick={() => chooseYear(year)}
                          aria-pressed={isCurrent}
                          className={cn(
                            'focus-ring flex h-11 items-center justify-center rounded-md text-[12px] font-medium tabular-nums transition-colors',
                            isCurrent
                              ? 'bg-copper-600 font-semibold text-on-accent'
                              : isThisYear
                                ? 'border border-copper-300 bg-copper-50 font-semibold text-copper-700'
                                : 'text-ink-700 hover:bg-paper-100',
                          )}
                        >
                          {toPersianDigits(String(year))}
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange(isoFromJalaali(today));
                    setOpen(false);
                  }}
                  className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-copper-700 hover:bg-copper-50"
                >
                  <Check size={13} />
                  امروز
                </button>
                {value && clearable ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="focus-ring inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-ink-400 hover:bg-paper-100 hover:text-ink-700"
                  >
                    <X size={12} />
                    پاک کردن
                  </button>
                ) : (
                  <span className="text-[9px] text-ink-300">با Esc ببندید</span>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
