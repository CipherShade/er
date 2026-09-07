import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { DeskStationBadge } from './DeskStationBadge';
import { StatusAlerts } from './StatusAlerts';
import { ManagementPage } from '../../features/management/ManagementPage';
import { SchedulingPage } from '../../features/scheduling/SchedulingPage';
import { StudentsPage } from '../../features/students/StudentsPage';
import { OperationsPage } from '../../features/operations/OperationsPage';

export function AppShell() {
  const [activeId, setActiveId] = useState('lobby');

  const content = activeId === 'teachers' ? <ManagementPage mode="teachers" /> : activeId === 'rooms' ? <ManagementPage mode="rooms" /> : activeId === 'sessions' ? <SchedulingPage /> : activeId === 'students' ? <StudentsPage /> : activeId === 'shift' ? <OperationsPage mode="shift" /> : activeId === 'reconciliation' ? <OperationsPage mode="reconciliation" /> : activeId === 'settlement' ? <OperationsPage mode="settlement" /> : activeId === 'reports' ? <OperationsPage mode="reports" /> : <><StatusAlerts /><OperationsPage mode="lobby" /></>;
  return <div className="min-h-screen bg-slate-950 text-slate-100"><Header /><div className="mx-auto flex max-w-[1600px] lg:min-h-[calc(100vh-4rem)]"><Sidebar activeId={activeId} onSelect={setActiveId} /><main className="min-w-0 flex-1 p-4 sm:p-6"><div className="mb-4 xl:hidden"><DeskStationBadge /></div><div className="space-y-6">{content}</div></main></div></div>;
}
