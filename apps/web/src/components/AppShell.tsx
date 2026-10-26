import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { NotificationsDto } from '@ravand/shared';
import {
  Bell,
  ChartLineUp,
  Database,
  FolderSimple,
  GearSix,
  House,
  List,
  MagnifyingGlass,
  Plus,
  SignOut,
  SquaresFour,
  Tray,
  X,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { roleLabel, titleForPath } from '@/lib/format';
import { Avatar, Button, cn } from './ui';
import { BrandMark } from './BrandMark';
import { SearchCommand } from './SearchCommand';

const primaryNav = [
  { to: '/', label: 'امروز', icon: House, end: true },
  { to: '/inbox', label: 'صندوق کار', icon: Tray },
  { to: '/cases', label: 'پرونده‌ها', icon: FolderSimple },
];

const insightNav = [
  { to: '/insights', label: 'گزارش‌ها', icon: ChartLineUp },
  { to: '/builder', label: 'سازنده فرآیند', icon: SquaresFour, buildOnly: true },
];

const orgNav = [
  { to: '/data', label: 'داده‌های پایه', icon: Database },
  { to: '/admin', label: 'مدیریت', icon: GearSix, adminOnly: true },
];

export function AppShell() {
  const { user, tenant, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const notifications = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<NotificationsDto>('/notifications?unread=true&limit=1'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unread = notifications.data?.unread ?? 0;

  const canBuild = user?.role && ['admin', 'builder', 'manager'].includes(user.role);

  const sidebar = (
    <SidebarContent
      userName={user?.name ?? ''}
      userRole={user?.role ?? 'member'}
      avatarColor={user?.avatarColor ?? '#1E3A5F'}
      tenantName={tenant?.name ?? ''}
      canBuild={Boolean(canBuild)}
      isAdmin={user?.role === 'admin'}
      onLogout={async () => {
        await logout();
        navigate('/login', { replace: true });
      }}
    />
  );

  return (
    <div className="min-h-screen bg-paper-100 lg:grid lg:grid-cols-[268px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col overflow-hidden bg-ink-950 text-paper-50 lg:flex">
        {sidebar}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-paper-100/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-3 px-4 md:px-7 lg:px-9">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper-50 text-ink-600 lg:hidden"
              aria-label="باز کردن منو"
            >
              <List size={19} />
            </button>
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <BrandMark size={28} className="text-ink-900" />
              <span className="display text-lg font-bold text-ink-900">روند</span>
            </div>
            <div className="hidden min-w-0 items-baseline gap-2.5 lg:flex">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-400">روند /</span>
              <span className="truncate text-sm font-semibold text-ink-800">
                {titleForPath(location.pathname)}
              </span>
            </div>

            <div className="ms-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="focus-ring hidden h-9 items-center gap-2 rounded-lg border border-line bg-paper-50 px-3 text-xs text-ink-400 transition hover:border-ink-300 hover:text-ink-700 sm:flex"
              >
                <MagnifyingGlass size={15} />
                جستجو
                <kbd className="rounded border border-line bg-paper-100 px-1.5 py-0.5 font-mono text-[9px] text-ink-400">
                  Ctrl K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-paper-200 sm:hidden"
                aria-label="جستجو"
              >
                <MagnifyingGlass size={18} />
              </button>

              <NavLink
                to="/notifications"
                className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-paper-200"
                aria-label="اعلان‌ها"
              >
                <Bell size={18} />
                {unread > 0 ? (
                  <span className="absolute end-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-copper-500 px-0.5 font-mono text-[8px] font-bold text-white">
                    {unread > 9 ? '۹+' : unread.toLocaleString('fa-IR')}
                  </span>
                ) : null}
              </NavLink>

              <Button
                variant="copper"
                size="sm"
                icon={<Plus size={15} weight="bold" />}
                onClick={() => navigate('/cases/new')}
                className="ms-1"
              >
                <span className="hidden sm:inline">پرونده جدید</span>
                <span className="sm:hidden">جدید</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 pb-24 md:px-7 lg:px-9 lg:py-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="بستن منو"
          />
          <div className="animate-rail-in absolute inset-y-0 right-0 flex w-[82vw] max-w-[310px] flex-col bg-ink-950 text-paper-50 shadow-lift">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute end-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-md text-paper-100/60 hover:bg-white/10"
              aria-label="بستن منو"
            >
              <X size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper-50/95 backdrop-blur-md lg:hidden">
        <div className="grid grid-cols-4">
          <MobileNavLink to="/" label="امروز" icon={<House size={20} />} end />
          <MobileNavLink to="/inbox" label="صندوق" icon={<Tray size={20} />} />
          <MobileNavLink to="/cases" label="پرونده‌ها" icon={<FolderSimple size={20} />} />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="focus-ring flex flex-col items-center gap-1 px-2 py-2.5 text-[10px] text-ink-500"
          >
            <List size={20} />
            بیشتر
          </button>
        </div>
      </nav>

      <SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function SidebarContent({
  userName,
  userRole,
  avatarColor,
  tenantName,
  canBuild,
  isAdmin,
  onLogout,
}: {
  userName: string;
  userRole: string;
  avatarColor: string;
  tenantName: string;
  canBuild: boolean;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <BrandMark size={38} className="text-copper-300" />
        <div>
          <div className="display text-[22px] font-bold leading-none text-paper-50">روند</div>
          <div className="mt-1.5 text-[10px] tracking-[0.14em] text-paper-100/35">دفتر جریان کار</div>
        </div>
      </div>

      <div className="mx-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5">
        <div className="text-[9px] font-semibold tracking-[0.12em] text-paper-100/35">فضای کار</div>
        <div className="mt-1 truncate text-xs font-semibold text-paper-50/90">{tenantName}</div>
      </div>

      <div className="scroll-thin mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        <NavSection title="کار روزانه">
          {primaryNav.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </NavSection>
        <NavSection title="تحلیل و ساخت">
          {insightNav
            .filter((item) => !item.buildOnly || canBuild)
            .map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
        </NavSection>
        <NavSection title="سازمان">
          {orgNav
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
        </NavSection>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={userName} color={avatarColor} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-paper-50/90">{userName}</div>
            <div className="mt-0.5 truncate text-[10px] text-paper-100/35">{roleLabel(userRole)}</div>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-paper-100/35 transition hover:bg-white/10 hover:text-paper-50"
            aria-label="خروج"
          >
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2 text-[9px] font-semibold tracking-[0.14em] text-paper-100/28">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone' }>;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'focus-ring group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] font-medium transition-colors',
          isActive
            ? 'bg-white/[0.075] text-paper-50'
            : 'text-paper-100/55 hover:bg-white/[0.045] hover:text-paper-50/90',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute inset-y-1.5 right-0 w-0.5 rounded-full transition-opacity',
              isActive ? 'bg-copper-400 opacity-100' : 'opacity-0',
            )}
          />
          <Icon size={17} weight={isActive ? 'fill' : 'regular'} />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function MobileNavLink({
  to,
  label,
  icon,
  end,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'focus-ring flex flex-col items-center gap-1 px-2 py-2.5 text-[10px]',
          isActive ? 'text-copper-600' : 'text-ink-500',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
