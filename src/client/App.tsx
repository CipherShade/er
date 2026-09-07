import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './auth/LoginPage';
import { useAuth } from './auth/AuthContext';
import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">{t('auth.loading')}</div>;
  return user ? <AppShell /> : <LoginPage />;
}
