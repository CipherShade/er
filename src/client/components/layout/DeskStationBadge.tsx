import { Monitor, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function DeskStationBadge() {
  const { t } = useTranslation();

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <Monitor className="h-4 w-4 text-emerald-400" aria-hidden="true" />
      <span className="font-semibold text-emerald-300">{t('desk.station', { number: 1 })}</span>
      <span className="text-slate-400">{t('desk.location')}</span>
      <Wifi className="h-4 w-4 text-emerald-400" aria-label={t('desk.connected')} />
    </div>
  );
}
