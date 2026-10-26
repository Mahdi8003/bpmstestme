import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeSlash, LockKey, SealCheck } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth';
import { BrandMark } from '@/components/BrandMark';
import { Button, Field, Input, Spinner } from '@/components/ui';

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@ravand.local');
  const [password, setPassword] = useState('Demo1234!');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100">
        <Spinner />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('ایمیل و رمز عبور را وارد کنید.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ورود ناموفق بود.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper-100 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
      <div className="relative flex min-h-screen flex-col px-6 py-7 sm:px-10 lg:px-16 xl:px-24">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} className="text-ink-900" />
            <span className="display text-xl font-bold text-ink-900">روند</span>
          </div>
          <span className="text-[10px] tracking-[0.12em] text-ink-400">دفتر جریان کار</span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <p className="eyebrow mb-4">ورود به فضای کار</p>
          <h1 className="display text-[34px] font-bold leading-[1.35] text-ink-950">
            ادامهٔ کار،
            <br />
            از همین‌جا.
          </h1>
          <p className="mt-4 text-sm leading-7 text-ink-500">
            پرونده‌ها، تأییدها و پیگیری‌ها در یک مسیر روشن. برای شروع وارد شوید.
          </p>

          <form onSubmit={submit} className="mt-9 space-y-4">
            <Field label="ایمیل سازمانی" required>
              <Input
                type="email"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.ir"
                autoComplete="username"
                className="text-start"
              />
            </Field>
            <Field label="رمز عبور" required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pe-10 text-start"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 end-2.5 my-auto flex h-7 w-7 items-center justify-center rounded text-ink-400 hover:text-ink-700"
                  aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {error ? (
              <div className="rounded-lg border border-stamp-100 bg-stamp-50 px-3 py-2 text-xs leading-6 text-stamp-600">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              variant="ink"
              size="lg"
              className="w-full"
              disabled={submitting}
              icon={submitting ? undefined : <ArrowLeft size={17} />}
            >
              {submitting ? 'در حال ورود…' : 'ورود به روند'}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-dashed border-line bg-paper-50/60 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
              <SealCheck size={14} className="text-verdigris-600" />
              حساب نمایشی
            </div>
            <div className="mt-1.5 grid gap-1 font-mono text-[11px] text-ink-500" dir="ltr">
              <span>admin@ravand.local</span>
              <span>Demo1234!</span>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-ink-400">
              ایمیل و رمز در فرم پیش‌فرض پر شده‌اند؛ کافی است وارد شوید.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-ink-400">
          <LockKey size={12} />
          نشست امن؛ اطلاعات ورود شما ذخیره نمی‌شود.
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div className="grid-paper absolute inset-0 opacity-[0.11]" />
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full border border-copper-400/10" />
        <div className="absolute -left-10 top-28 h-48 w-48 rounded-full border border-copper-400/10" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center justify-between text-paper-100/45">
            <span className="text-[10px] tracking-[0.18em]">R A V A N D</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px]">
              نسخهٔ نمایشی
            </span>
          </div>

          <div className="max-w-md">
            <p className="text-xs leading-7 text-paper-100/45">
              جریان کار، وقتی روشن است که هر کس بداند
              <br />
              قدم بعدی در کدام مرحله است.
            </p>
            <div className="display mt-8 text-[42px] font-bold leading-[1.4] text-paper-50 xl:text-[50px]">
              هر پرونده،
              <br />
              یک مسیر روشن.
            </div>
            <div className="mt-12 space-y-0">
              <FlowStep n="۰۱" title="ثبت درخواست" meta="فرم‌ها و پیوست‌های مرتبط" done />
              <FlowStep n="۰۲" title="بررسی و تأیید" meta="کارِ درست، برای نقش درست" current />
              <FlowStep n="۰۳" title="بایگانی و پیگیری" meta="سابقهٔ کامل و قابل جستجو" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-paper-100/35">
            <Check size={12} className="text-verdigris-400" />
            طراحی‌شده برای تیم‌های ایرانی
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  n,
  title,
  meta,
  done,
  current,
}: {
  n: string;
  title: string;
  meta: string;
  done?: boolean;
  current?: boolean;
}) {
  return (
    <div className="relative flex gap-4 pb-7 last:pb-0">
      <div className="relative flex w-7 shrink-0 justify-center">
        {!done ? (
          <span className="absolute bottom-0 top-7 w-px bg-white/10" aria-hidden />
        ) : null}
        <span
          className={
            done
              ? 'z-10 flex h-7 w-7 items-center justify-center rounded-full bg-paper-50 text-ink-950'
              : current
                ? 'current-stage-node z-10 flex h-7 w-7 items-center justify-center rounded-full border border-copper-400 bg-copper-500/15 font-mono text-[9px] text-copper-200'
                : 'z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 font-mono text-[9px] text-paper-100/35'
          }
        >
          {done ? <Check size={13} weight="bold" /> : n}
        </span>
      </div>
      <div className="pt-0.5">
        <div className={current ? 'text-xs font-semibold text-paper-50' : 'text-xs font-medium text-paper-100/60'}>
          {title}
        </div>
        <div className="mt-1 text-[10px] text-paper-100/30">{meta}</div>
      </div>
    </div>
  );
}
