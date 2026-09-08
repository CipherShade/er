import { Monitor, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../../lib/config';

type CurrentShift = { deskIdentifier: string; status: string; openedAt: string } | null;

export function DeskStationBadge() {
  const { t } = useTranslation();
  const [shift, setShift] = useState<CurrentShift>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(apiUrl('/api/shifts/current'), { credentials: 'include' });
        if (cancelled) return;
        if (!response.ok) {
          setShift(null);
          setOnline(false);
          return;
        }
        const body = (await response.json()) as { data?: { shift?: CurrentShift } };
        setShift(body.data?.shift ?? null);
        setOnline(true);
      } catch {
        if (!cancelled) {
          setShift(null);
          setOnline(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const hasShift = shift !== null && shift !== undefined;

  return (
    <div className={`inline-flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${hasShift ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
      <span className="relative flex h-2.5 w-2.5">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${hasShift ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${hasShift ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      </span>
      <Monitor className={`h-4 w-4 ${hasShift ? 'text-emerald-400' : 'text-amber-400'}`} aria-hidden="true" />
      <span className={`font-semibold ${hasShift ? 'text-emerald-300' : 'text-amber-300'}`}>
        {hasShift ? shift?.deskIdentifier : t('desk.noActiveShift')}
      </span>
      <span className="hidden text-slate-400 lg:inline">{t('desk.location')}</span>
      {hasShift ? (
        <Wifi className="h-4 w-4 text-emerald-400" aria-label={t('desk.connected')} />
      ) : (
        <WifiOff className={`h-4 w-4 ${online ? 'hidden' : 'text-red-400'}`} aria-label={t('desk.connected')} />
      )}
    </div>
  );
}