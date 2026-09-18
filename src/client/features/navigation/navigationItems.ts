import { BarChart3, BookOpen, Building2, CalendarDays, ClipboardCheck, Coins, GraduationCap, LayoutDashboard, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@prisma/client';

export type NavigationItem = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  roles: Role[];
};

export type NavigationGroup = {
  labelKey: string;
  items: NavigationItem[];
};

export const ALL_ROLES: Role[] = ['ADMIN', 'RECEPTIONIST'];
export const ADMIN_ONLY: Role[] = ['ADMIN'];

export const navigationGroups: NavigationGroup[] = [
  {
    labelKey: 'navigation.groups.operation',
    items: [
      { id: 'dashboard', labelKey: 'navigation.dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
      { id: 'lobby', labelKey: 'navigation.lobby', icon: Users, roles: ALL_ROLES },
      { id: 'sessions', labelKey: 'navigation.sessions', icon: CalendarDays, roles: ALL_ROLES },
    ],
  },
  {
    labelKey: 'navigation.groups.registries',
    items: [
      { id: 'students', labelKey: 'navigation.students', icon: GraduationCap, roles: ALL_ROLES },
      { id: 'teachers', labelKey: 'navigation.teachers', icon: BookOpen, roles: ALL_ROLES },
      { id: 'rooms', labelKey: 'navigation.rooms', icon: Building2, roles: ALL_ROLES },
    ],
  },
  {
    labelKey: 'navigation.groups.finance',
    items: [
      { id: 'shift', labelKey: 'navigation.shiftRegister', icon: Wallet, roles: ADMIN_ONLY },
      { id: 'reconciliation', labelKey: 'navigation.reconciliation', icon: ClipboardCheck, roles: ADMIN_ONLY },
      { id: 'settlement', labelKey: 'navigation.settlement', icon: Coins, roles: ADMIN_ONLY },
      { id: 'reports', labelKey: 'navigation.reports', icon: BarChart3, roles: ADMIN_ONLY },
    ],
  },
];