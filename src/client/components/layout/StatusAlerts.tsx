import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type AlertKind = 'success' | 'warning' | 'info';

const alertStyles: Record<AlertKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' },
  warning: { icon: AlertTriangle, className: 'border-amber-500/25 bg-amber-500/10 text-amber-200' },
  info: { icon: Info, className: 'border-sky-500/25 bg-sky-500/10 text-sky-200' },
};

export function StatusAlerts() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const kind: AlertKind = 'success';
  const { icon: Icon, className } = alertStyles[kind];

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${className}`} role="status">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-bold">{t('alerts.title')}</p>
        <p className="mt-1 text-sm opacity-90">{t('alerts.message')}</p>
      </div>
      <button type="button" onClick={() => setVisible(false)} className="rounded-lg p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100" aria-label={t('actions.dismiss')}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
