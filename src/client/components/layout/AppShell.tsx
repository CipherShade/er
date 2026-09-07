import { useState, useEffect } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { DeskStationBadge } from './DeskStationBadge';
import { StatusAlerts } from './StatusAlerts';
import { ManagementPage } from '../../features/management/ManagementPage';
import { SchedulingPage } from '../../features/scheduling/SchedulingPage';
import { StudentsPage } from '../../features/students/StudentsPage';
import { OperationsPage } from '../../features/operations/OperationsPage';
import { useAuth } from '../../auth/AuthContext';
import { Role } from '../../../shared/constants/index';

const ADMIN_ONLY_VIEWS = ['teachers', 'rooms', 'reports'];

export function AppShell() {
  const [activeId, setActiveId] = useState('lobby');
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;

  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_VIEWS.includes(activeId)) {
      setActiveId('lobby');
    }
  }, [isAdmin, activeId]);

  const currentView = !isAdmin && ADMIN_ONLY_VIEWS.includes(activeId) ? 'lobby' : activeId;

  const content = currentView === 'teachers' ? <ManagementPage mode="teachers" /> : currentView === 'rooms' ? <ManagementPage mode="rooms" /> : currentView === 'sessions' ? <SchedulingPage /> : currentView === 'students' ? <StudentsPage /> : currentView === 'shift' ? <OperationsPage mode="shift" /> : currentView === 'reconciliation' ? <OperationsPage mode="reconciliation" /> : currentView === 'settlement' ? <OperationsPage mode="settlement" /> : currentView === 'reports' ? <OperationsPage mode="reports" /> : <><StatusAlerts /><OperationsPage mode="lobby" /></>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="mx-auto flex max-w-[1600px] lg:min-h-[calc(100vh-4rem)]">
        <Sidebar activeId={currentView} onSelect={setActiveId} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mb-4 xl:hidden"><DeskStationBadge /></div>
          <div className="space-y-6">{content}</div>
        </main>
      </div>
    </div>
  );
}

