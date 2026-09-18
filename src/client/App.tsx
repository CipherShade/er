import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './auth/LoginPage';
import { useAuth } from './auth/AuthContext';
import { useTranslation } from 'react-i18next';

export function App() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="app" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <span className="brand-logo" style={{ width: 54, height: 54, fontSize: 26, margin: '0 auto 14px' }}>م</span>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{t('appName')}</div>
          <div className="page-sub">{t('auth.loading')}</div>
        </div>
      </div>
    );
  }
  return user ? <AppShell /> : <LoginPage />;
}