import { lazy, Suspense, useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { useTranslation } from 'react-i18next';
import { AppShell } from './components/layout/AppShell';

// ── Lazy-loaded guest routes (code splitting) ─────────────────────────────────
const LandingPage = lazy(() => import('./features/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./auth/SignupPage').then((m) => ({ default: m.SignupPage })));

function GuestFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-base, #0f172a)' }}>
      <div style={{ textAlign: 'center' }}>
        <span className="brand-logo" style={{ width: 54, height: 54, fontSize: 26, margin: '0 auto 14px' }}>م</span>
        <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 14 }}>جاري التحميل...</div>
      </div>
    </div>
  );
}

export function App() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'landing' | 'login' | 'signup'>(() => {
    const hash = window.location.hash;
    if (hash.includes('login')) return 'login';
    if (hash.includes('signup')) return 'signup';
    return 'landing';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('login')) setCurrentView('login');
      else if (hash.includes('signup')) setCurrentView('signup');
      else if (hash.includes('landing')) setCurrentView('landing');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  // If authenticated, always show main application shell
  if (user) {
    return <AppShell />;
  }

  // Guest routing — lazy-loaded for smaller initial bundle
  return (
    <Suspense fallback={<GuestFallback />}>
      {currentView === 'login' && (
        <LoginPage
          onNavigateLanding={() => { window.location.hash = '#landing'; setCurrentView('landing'); }}
          onNavigateSignup={() => { window.location.hash = '#signup'; setCurrentView('signup'); }}
        />
      )}
      {currentView === 'signup' && (
        <SignupPage
          onNavigateLanding={() => { window.location.hash = '#landing'; setCurrentView('landing'); }}
          onNavigateLogin={() => { window.location.hash = '#login'; setCurrentView('login'); }}
        />
      )}
      {currentView === 'landing' && (
        <LandingPage
          onNavigateLogin={() => { window.location.hash = '#login'; setCurrentView('login'); }}
          onNavigateSignup={() => { window.location.hash = '#signup'; setCurrentView('signup'); }}
        />
      )}
    </Suspense>
  );
}