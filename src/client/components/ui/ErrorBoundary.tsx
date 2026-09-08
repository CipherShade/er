import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = { children: ReactNode };
type State = { hasError: boolean };

function Fallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-slate-100">
      <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden="true" />
      <h1 className="text-xl font-bold text-white">{t('ui.fatal')}</h1>
      <p className="text-sm text-slate-400">{t('ui.fatalDetail')}</p>
      <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold">
        {t('ui.retry')}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) return <Fallback />;
    return this.props.children;
  }
}