import { Languages, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeskStationBadge } from './DeskStationBadge';

export function Header() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600"><Layers className="h-6 w-6" /></div><div><h1 className="font-bold text-white">{t('appName')}</h1><p className="hidden text-xs text-slate-400 sm:block">{t('appSubtitle')}</p></div></div>
        <div className="hidden xl:block"><DeskStationBadge /></div>
        <div className="flex items-center gap-3"><button type="button" onClick={() => i18n.changeLanguage(isArabic ? 'en' : 'ar')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800" aria-label={t('actions.switchLanguage')}><Languages className="h-4 w-4" />{isArabic ? 'English' : 'عربي'}</button><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 font-bold text-emerald-400">{t('user.initial')}</span></div>
      </div>
    </header>
  );
}
