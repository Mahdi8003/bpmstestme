import {
  CheckCircle,
  DeviceMobile,
  DownloadSimple,
  ShareNetwork,
} from '@phosphor-icons/react';
import { promptPwaInstall, usePwaInstall } from '@/lib/pwa';
import { useToast } from './ToastProvider';
import { Button, Card, cn } from './ui';

async function requestInstall() {
  return promptPwaInstall();
}

export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, isStandalone } = usePwaInstall();
  const toast = useToast();

  if (isStandalone || !canInstall) return null;

  const install = async () => {
    const outcome = await requestInstall();
    if (outcome === 'accepted') {
      toast.success('روند روی دستگاه شما نصب شد.');
    } else if (outcome === 'dismissed') {
      toast.info('نصب لغو شد. هر زمان خواستید دوباره تلاش کنید.');
    } else {
      toast.info(
        'نصب خودکار در دسترس نیست.',
        'از منوی مرورگر گزینهٔ «نصب برنامه» را انتخاب کنید.',
      );
    }
  };

  return (
    <button
      type="button"
      onClick={() => void install()}
      className={cn(
        'focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-copper-200 bg-copper-50 px-3 py-2 text-[12px] font-semibold text-copper-700 transition-colors hover:bg-copper-100',
        className,
      )}
    >
      <DownloadSimple size={16} />
      نصب اپلیکیشن
    </button>
  );
}

export function InstallAppCard() {
  const { canInstall, isStandalone, isIos, isAndroid } = usePwaInstall();
  const toast = useToast();

  const install = async () => {
    const outcome = await requestInstall();
    if (outcome === 'accepted') {
      toast.success('روند روی دستگاه شما نصب شد.');
    } else if (outcome === 'dismissed') {
      toast.info('نصب لغو شد. هر زمان خواستید دوباره تلاش کنید.');
    } else {
      toast.info(
        'نصب خودکار در دسترس نیست.',
        'از منوی مرورگر گزینهٔ «نصب برنامه» را انتخاب کنید.',
      );
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-copper-200 bg-copper-50 text-copper-600">
          <DeviceMobile size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-900">نصب روی دستگاه</div>
          <p className="mt-1 text-[11px] leading-6 text-ink-400">
            روند را مانند یک اپلیکیشن مستقل روی صفحهٔ اصلی گوشی یا رایانه نصب کنید؛
            بدون نوار آدرس و با دسترسی سریع.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {isStandalone ? (
          <div className="flex items-center gap-2 rounded-lg border border-verdigris-100 bg-verdigris-50 px-3 py-2.5 text-[12px] font-semibold text-verdigris-700">
            <CheckCircle size={16} weight="fill" />
            روند روی این دستگاه نصب شده است.
          </div>
        ) : canInstall ? (
          <Button
            variant="copper"
            icon={<DownloadSimple size={16} />}
            onClick={() => void install()}
          >
            نصب اپلیکیشن
          </Button>
        ) : isIos ? (
          <div className="rounded-lg border border-line bg-paper-100 px-3 py-2.5 text-[11px] leading-6 text-ink-600">
            <span className="flex items-center gap-1.5 font-semibold text-ink-800">
              <ShareNetwork size={15} /> در سافاری
            </span>
            دکمهٔ اشتراک‌گذاری را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید.
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-paper-100 px-3 py-2.5 text-[11px] leading-6 text-ink-600">
            <span className="font-semibold text-ink-800">
              {isAndroid ? 'در مرورگر اندروید' : 'در مرورگر'}
            </span>
            <br />
            از منوی مرورگر گزینهٔ «نصب برنامه» یا «افزودن به صفحهٔ اصلی» را انتخاب
            کنید.
          </div>
        )}
      </div>
    </Card>
  );
}
