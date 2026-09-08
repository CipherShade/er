import { KeyRound, Languages, Layers, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { DeskStationBadge } from './DeskStationBadge';

export function Header() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isArabic = i18n.language === 'ar';
  const initial = (user?.fullName ?? '؟').trim().charAt(0) || '؟';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600"><Layers className="h-6 w-6" /></div>
          <div>
            <h1 className="font-bold text-white">{t('appName')}</h1>
            <p className="hidden text-xs text-slate-400 sm:block">{t('appSubtitle')}</p>
          </div>
        </div>
        <div className="hidden xl:block"><DeskStationBadge /></div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => i18n.changeLanguage(isArabic ? 'en' : 'ar')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
            aria-label={t('actions.switchLanguage')}
          >
            <Languages className="h-4 w-4" />
            {isArabic ? 'English' : 'عربي'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/change-password')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
            aria-label={t('changePassword.title')}
            title={t('changePassword.title')}
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden md:inline">{t('changePassword.title')}</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-start sm:block">
              <span className="block text-xs text-slate-400">{t(`users.roles.${user?.role}`, '')}</span>
              <span className="block max-w-36 truncate text-sm font-bold text-white">{user?.fullName}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 font-bold text-emerald-400">{initial}</span>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
            aria-label={t('actions.logout')}
            title={t('actions.logout')}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">{t('actions.logout')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}