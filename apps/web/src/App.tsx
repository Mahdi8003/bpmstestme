import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/Login';
import { TodayPage } from '@/pages/Today';
import { InboxPage } from '@/pages/Inbox';
import { CasesPage } from '@/pages/Cases';
import { CaseDetailPage } from '@/pages/CaseDetail';
import { NewCasePage } from '@/pages/NewCase';
import { TaskDetailPage } from '@/pages/TaskDetail';
import { MasterDataPage } from '@/pages/MasterData';
import { InsightsPage } from '@/pages/Insights';
import { NotificationsPage } from '@/pages/Notifications';
import { AdminPage } from '@/pages/Admin';
import { BuilderListPage } from '@/pages/BuilderList';
import { BuilderNewPage } from '@/pages/BuilderNew';
import { BuilderEditorPage } from '@/pages/BuilderEditor';
import { NotFoundPage } from '@/pages/NotFound';

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
