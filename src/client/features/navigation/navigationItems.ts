import { BarChart3, BookOpen, Building2, Calendar, ClipboardCheck, Coins, GraduationCap, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavigationItem = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  { id: 'lobby', labelKey: 'navigation.lobby', icon: Users },
  { id: 'sessions', labelKey: 'navigation.sessions', icon: Calendar },
  { id: 'students', labelKey: 'navigation.students', icon: GraduationCap },
  { id: 'teachers', labelKey: 'navigation.teachers', icon: BookOpen },
  { id: 'rooms', labelKey: 'navigation.rooms', icon: Building2 },
  { id: 'shift', labelKey: 'navigation.shiftRegister', icon: Wallet },
  { id: 'reconciliation', labelKey: 'navigation.reconciliation', icon: ClipboardCheck },
  { id: 'settlement', labelKey: 'navigation.settlement', icon: Coins },
  { id: 'reports', labelKey: 'navigation.reports', icon: BarChart3 },
];
