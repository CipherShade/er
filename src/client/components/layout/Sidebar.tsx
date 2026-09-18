import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@prisma/client';
import { navigationGroups, type NavigationGroup } from '../../features/navigation/navigationItems';

type SidebarProps = { activeId: string; onSelect: (id: string) => void; role: Role };

function groupForRoleGroup(group: NavigationGroup, role: Role) {
  return { ...group, items: group.items.filter((item) => item.roles.includes(role)) };
}

export function Sidebar({ activeId, onSelect, role }: SidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cos_sidebar') === 'collapsed');
  const [open, setOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('cos_sidebar', next ? 'collapsed' : 'expanded');
  };

  const groups = navigationGroups.map((group) => groupForRoleGroup(group, role)).filter((group) => group.items.length > 0);

  return (
    <>
      <button type="button" className="btn btn--ghost sidebar-toggle" onClick={() => setOpen(true)} aria-label={t('navigation.menu')}>
        <PanelLeftOpen className="h-4 w-4" />
      </button>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${!open ? 'sidebar--hidden' : ''}`} aria-label={t('navigation.ariaLabel')}>
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-logo">م</span>
            <div className="brand-name">{t('appName')}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={t('actions.close')}><X className="h-4 w-4" /></button>
        </div>
        <nav className="stack" style={{ gap: 18 }}>
          {groups.map((group) => (
            <div className="nav-group" key={group.labelKey}>
              <div className="nav-group-title">{t(group.labelKey)}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${activeId === item.id ? 'nav-item--active' : ''}`}
                  onClick={() => { onSelect(item.id); setOpen(false); }}
                  aria-current={activeId === item.id ? 'page' : undefined}
                >
                  <item.icon className="nav-icon" aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="nav-item" onClick={toggleCollapsed} aria-label="toggle sidebar">
            {collapsed ? <PanelLeftOpen className="nav-icon" aria-hidden="true" /> : <PanelLeftClose className="nav-icon" aria-hidden="true" />}
            <span>{collapsed ? '' : t('actions.close')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}