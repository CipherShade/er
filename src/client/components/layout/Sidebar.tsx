import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { navigationItems } from '../../features/navigation/navigationItems';
import { useAuth } from '../../auth/AuthContext';
import { Role } from '../../../shared/constants/index';

type SidebarProps = { activeId: string; onSelect: (id: string) => void };

export function Sidebar({ activeId, onSelect }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const visibleItems = navigationItems.filter(
    (item) => !item.adminOnly || user?.role === Role.ADMIN
  );

  return (
    <>
      <button type="button" className="m-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm lg:hidden" onClick={() => setOpen(true)}>
        <Menu className="h-4 w-4" /> {t('navigation.menu')}
      </button>
      {open && <button type="button" className="fixed inset-0 z-30 bg-slate-950/70 lg:hidden" aria-label={t('actions.close')} onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 start-0 z-40 w-72 border-e border-slate-800 bg-slate-900 p-4 transition-transform lg:static lg:block lg:w-64 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 flex items-center justify-between lg:hidden"><span className="font-bold">{t('navigation.menu')}</span><button type="button" onClick={() => setOpen(false)} aria-label={t('actions.close')}><X className="h-5 w-5" /></button></div>
        <nav aria-label={t('navigation.ariaLabel')} className="space-y-1">
          {visibleItems.map(({ id, labelKey, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { onSelect(id); setOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-semibold transition ${activeId === id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> <span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
