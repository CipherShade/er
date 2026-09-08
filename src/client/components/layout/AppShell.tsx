import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { DeskStationBadge } from './DeskStationBadge';
import { StatusAlerts } from './StatusAlerts';
import { ManagementPage } from '../../features/management/ManagementPage';
import { UsersPage } from '../../features/management/UsersPage';
import { SchedulingPage } from '../../features/scheduling/SchedulingPage';
import { StudentsPage } from '../../features/students/StudentsPage';
import { OperationsPage } from '../../features/operations/OperationsPage';
import { ChangePasswordPage } from '../../auth/ChangePasswordPage';
import { useAuth } from '../../auth/AuthContext';
import { Role } from '../../../shared/constants/index';

const ADMIN_ONLY_VIEWS = ['teachers', 'rooms', 'reports', 'users'];

export function AppShell() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const location = useLocation();
  const currentId = location.pathname.replace(/^\//, '').split('/')[0] || 'lobby';

  if (!isAdmin && ADMIN_ONLY_VIEWS.includes(currentId)) {
    return <Navigate to="/lobby" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="mx-auto flex max-w-[1600px] lg:min-h-[calc(100vh-4rem)]">
        <Sidebar />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mb-4 xl:hidden"><DeskStationBadge /></div>
          <div className="space-y-6">
            <Routes>
              <Route path="/" element={<Navigate to="/lobby" replace />} />
              <Route path="/lobby" element={<><StatusAlerts /><OperationsPage mode="lobby" /></>} />
              <Route path="/shift" element={<OperationsPage mode="shift" />} />
              <Route path="/reconciliation" element={<OperationsPage mode="reconciliation" />} />
              <Route path="/settlement" element={<OperationsPage mode="settlement" />} />
              <Route path="/reports" element={<OperationsPage mode="reports" />} />
              <Route path="/teachers" element={<ManagementPage mode="teachers" />} />
              <Route path="/rooms" element={<ManagementPage mode="rooms" />} />
              <Route path="/sessions" element={<SchedulingPage />} />
              <Route path="/students" element={<StudentsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="*" element={<Navigate to="/lobby" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}