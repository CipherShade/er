import { AlertCircle, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return <div className="flex min-h-32 items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300" role="status" aria-live="polite"><LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />{label || t('ui.loading')}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400"><RefreshCw className="mx-auto mb-3 h-5 w-5" />{message}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert"><span className="inline-flex items-center gap-2"><AlertCircle className="h-5 w-5 shrink-0" />{message}</span>{onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold hover:bg-red-500/10">{t('ui.retry')}</button>}</div>;
}

export function PermissionState() {
  const { t } = useTranslation();
  return <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100" role="status"><span className="inline-flex items-center gap-2"><ShieldAlert className="h-5 w-5 shrink-0" />{t('ui.adminOnly')}</span></div>;
}
