import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from '@phosphor-icons/react';
import { Card } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg px-6 py-12 text-center sm:px-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-100 text-ink-500">
          <Compass size={24} />
        </span>
        <div className="mt-5 font-mono text-[10px] tracking-[0.2em] text-ink-300">۴۰۴</div>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">این صفحه پیدا نشد.</h1>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-ink-500">
          ممکن است نشانی تغییر کرده باشد یا این بخش هنوز در دسترس نباشد. از دفتر امروز ادامه دهید.
        </p>
        <Link
          to="/"
          className="focus-ring mt-6 inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50 hover:bg-ink-800"
        >
          <ArrowRight size={14} />
          بازگشت به امروز
        </Link>
      </Card>
    </div>
  );
}
