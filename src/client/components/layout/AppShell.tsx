import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ToastHost, notify } from '../ui/kit';
import { navigationGroups } from '../../features/navigation/navigationItems';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { ManagementPage } from '../../features/management/ManagementPage';
import { SchedulingPage } from '../../features/scheduling/SchedulingPage';
import { StudentsPage } from '../../features/students/StudentsPage';
import { OperationsPage } from '../../features/operations/OperationsPage';

export function AppShell() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const [activeId, setActiveId] = useState('dashboard');
  const [sessionId, setSessionId] = useState('');

  const role = user?.role ?? 'ADMIN';

  const allowedItems = useMemo(
    () => navigationGroups.flatMap((group) => group.items).filter((item) => hasRole(...item.roles)),
    [hasRole],
  );
  const currentId = allowedItems.some((item) => item.id === activeId) ? activeId : allowedItems[0]?.id ?? 'dashboard';
  const currentLabel = allowedItems.find((item) => item.id === currentId)?.labelKey ?? 'navigation.dashboard';

  const navigate = (id: string) => {
    if (!allowedItems.some((item) => item.id === id)) {
      notify(t('session.denied', 'لا تملك صلاحية الوصول لهذا القسم'), 'error');
      return;
    }
    setActiveId(id);
  };

  const openLobbyForSession = (id: string) => {
    setSessionId(id);
    setActiveId('lobby');
  };

  const content = (() => {
    switch (currentId) {
      case 'teachers': return <ManagementPage mode="teachers" />;
      case 'rooms': return <ManagementPage mode="rooms" />;
      case 'sessions': return <SchedulingPage onCheckIn={openLobbyForSession} />;
      case 'students': return <StudentsPage />;
      case 'shift': return <OperationsPage mode="shift" />;
      case 'reconciliation': return <OperationsPage mode="reconciliation" />;
      case 'settlement': return <OperationsPage mode="settlement" />;
      case 'reports': return <OperationsPage mode="reports" />;
      case 'lobby': return <OperationsPage mode="lobby" selectedSessionId={sessionId} onSessionChange={setSessionId} />;
      default: return <DashboardPage onNavigate={navigate} />;
    }
  })();

  return (
    <div className="app">
      <Header activeLabel={t(currentLabel)} />
      <div className="app-body">
        <Sidebar activeId={currentId} onSelect={navigate} role={role} />
        <main className="app-main" id="main">
          {content}
        </main>
      </div>
      <ToastHost />
    </div>
  );
}