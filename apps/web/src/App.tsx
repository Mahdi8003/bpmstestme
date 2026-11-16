import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import { AppShell } from '@/components/AppShell';

const LoginPage = lazy(() => import('@/pages/Login').then((m) => ({ default: m.LoginPage })));
const TodayPage = lazy(() => import('@/pages/Today').then((m) => ({ default: m.TodayPage })));
const InboxPage = lazy(() => import('@/pages/Inbox').then((m) => ({ default: m.InboxPage })));
const CasesPage = lazy(() => import('@/pages/Cases').then((m) => ({ default: m.CasesPage })));
const CaseDetailPage = lazy(() =>
  import('@/pages/CaseDetail').then((m) => ({ default: m.CaseDetailPage })),
);
const NewCasePage = lazy(() =>
  import('@/pages/NewCase').then((m) => ({ default: m.NewCasePage })),
);
const TaskDetailPage = lazy(() =>
  import('@/pages/TaskDetail').then((m) => ({ default: m.TaskDetailPage })),
);
const MasterDataPage = lazy(() =>
  import('@/pages/MasterData').then((m) => ({ default: m.MasterDataPage })),
);
const InsightsPage = lazy(() =>
  import('@/pages/Insights').then((m) => ({ default: m.InsightsPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/Notifications').then((m) => ({ default: m.NotificationsPage })),
);
const AdminPage = lazy(() => import('@/pages/Admin').then((m) => ({ default: m.AdminPage })));
const ProfilePage = lazy(() =>
  import('@/pages/Profile').then((m) => ({ default: m.ProfilePage })),
);
const BuilderListPage = lazy(() =>
  import('@/pages/BuilderList').then((m) => ({ default: m.BuilderListPage })),
);
const BuilderNewPage = lazy(() =>
  import('@/pages/BuilderNew').then((m) => ({ default: m.BuilderNewPage })),
);
const BuilderEditorPage = lazy(() =>
  import('@/pages/BuilderEditor').then((m) => ({ default: m.BuilderEditorPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })),
);

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size={24} />
    </div>
  );
}

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100">
        <Spinner size={26} />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <AppShell />;
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route index element={<TodayPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/cases" element={<CasesPage />} />
          <Route path="/cases/new" element={<NewCasePage />} />
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/builder" element={<BuilderListPage />} />
          <Route path="/builder/new" element={<BuilderNewPage />} />
          <Route path="/builder/:id" element={<BuilderEditorPage />} />
          <Route path="/data" element={<MasterDataPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
