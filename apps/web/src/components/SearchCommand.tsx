import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { SearchResultsDto } from '@ravand/shared';
import {
  ArrowLeft,
  FileText,
  MagnifyingGlass,
  Package,
  Tray,
  UsersThree,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Modal, Spinner } from './ui';
import { CaseTypeIcon } from './domain';

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function SearchCommand({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term, 220);
  const navigate = useNavigate();
  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResultsDto>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const data = results.data;
  const hasResults =
    data &&
    (data.cases.length || data.tasks.length || data.parties.length || data.items.length);

  return (
    <Modal open={open} onClose={onClose} title="جستجو در روند" size="lg">
      <div className="relative">
        <MagnifyingGlass
          size={18}
          className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink-400"
        />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="شماره پرونده، عنوان کار، طرف حساب یا کالا…"
          className="focus-ring h-12 w-full rounded-xl border border-line bg-white px-3 ps-10 text-sm text-ink-900 placeholder:text-ink-400 focus:border-copper-400"
          autoFocus
        />
      </div>

      <div className="mt-4 min-h-56">
        {debounced.trim().length < 2 ? (
          <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink-700">چه چیزی را می‌خواهید پیدا کنید؟</p>
            <p className="mt-1 text-xs leading-6 text-ink-400">
              حداقل دو حرف بنویسید. میان پرونده‌ها، کارها، طرف‌حساب‌ها و کالاها جستجو می‌شود.
            </p>
          </div>
        ) : results.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : !hasResults ? (
          <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
            <p className="text-sm font-semibold text-ink-700">چیزی پیدا نشد.</p>
            <p className="mt-1 text-xs text-ink-400">شماره پرونده یا بخش کوتاه‌تری از عنوان را امتحان کنید.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.cases.length ? (
              <ResultGroup title="پرونده‌ها">
                {data.cases.map((item) => (
                  <ResultRow
                    key={item.id}
                    icon={<CaseTypeIcon icon={item.caseTypeIcon} size={17} />}
                    title={item.title}
                    meta={item.reference}
                    onClick={() => go(`/cases/${item.id}`)}
                  />
                ))}
              </ResultGroup>
            ) : null}
            {data.tasks.length ? (
              <ResultGroup title="کارها">
                {data.tasks.map((item) => (
                  <ResultRow
                    key={item.id}
                    icon={<Tray size={17} />}
                    title={item.name}
                    meta={`${item.caseReference} · ${item.stageName}`}
                    onClick={() => go(`/tasks/${item.id}`)}
                  />
                ))}
              </ResultGroup>
            ) : null}
            {data.parties.length ? (
              <ResultGroup title="طرف‌حساب‌ها">
                {data.parties.map((item) => (
                  <ResultRow
                    key={item.id}
                    icon={<UsersThree size={17} />}
                    title={item.name}
                    meta={`${item.code} · ${item.kind === 'supplier' ? 'تأمین‌کننده' : 'مشتری'}`}
                    onClick={() => go('/data?tab=parties')}
                  />
                ))}
              </ResultGroup>
            ) : null}
            {data.items.length ? (
              <ResultGroup title="کالاها">
                {data.items.map((item) => (
                  <ResultRow
                    key={item.id}
                    icon={<Package size={17} />}
                    title={item.name}
                    meta={`${item.sku} · موجودی ${(item.stock ?? 0).toLocaleString('fa-IR')} ${item.unit}`}
                    onClick={() => go('/data?tab=items')}
                  />
                ))}
              </ResultGroup>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[10px] text-ink-400">
        <span className="flex items-center gap-1">
          <FileText size={12} />
          نتایج با ثبت هر تغییر به‌روز می‌شوند
        </span>
        <span className="flex items-center gap-1">
          برای بستن
          <kbd className="rounded border border-line bg-paper-100 px-1.5 py-0.5 font-mono">Esc</kbd>
        </span>
      </div>
    </Modal>
  );
}

function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-1.5 px-1">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-line bg-white/55">{children}</div>
    </section>
  );
}

function ResultRow({
  icon,
  title,
  meta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring group flex w-full items-center gap-3 border-b border-line/70 px-3 py-2.5 text-start last:border-b-0 hover:bg-paper-100/80"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-paper-100 text-ink-500">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-ink-800">{title}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-400">{meta}</span>
      </span>
      <ArrowLeft
        size={15}
        className="shrink-0 text-ink-300 transition-transform group-hover:-translate-x-0.5 group-hover:text-copper-500"
      />
    </button>
  );
}
