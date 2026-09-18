import type { FormEvent } from 'react';
import { useState } from 'react';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { Banner } from '../components/ui/kit';

const CENTER_NAME = import.meta.env.VITE_CENTER_NAME || '';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try { await login({ username, password }); } catch { setError(t('auth.invalidCredentials')); } finally { setSubmitting(false); }
  }

  return (
    <main className="login-bg">
      <form onSubmit={submit} className="login-card">
        <div className="login-logo">م</div>
        <p className="login-brand-sub">{t('auth.welcome')} {t('appName')}</p>
        <h1 className="login-title">{CENTER_NAME || t('center')}</h1>
        <p className="login-sub">{t('auth.subtitle')}</p>
        <Banner text={error} tone="error" />
        <div className="form-stack">
          <label className="field">
            <span className="field-label">{t('auth.username')}</span>
            <div className="searchbar">
              <UserRound className="h-4 w-4" aria-hidden="true" />
              <input className="input" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
          </label>
          <label className="field">
            <span className="field-label">{t('auth.password')}</span>
            <div className="searchbar">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </label>
          <button className="btn btn--primary" style={{ width: '100%', paddingBlock: 11 }} disabled={submitting}>
            <LogIn className="h-4 w-4" aria-hidden="true" />{submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </div>
      </form>
    </main>
  );
}