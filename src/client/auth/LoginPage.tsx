import { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';

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

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"><div className="mb-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600"><LockKeyhole className="h-7 w-7" /></div><h1 className="text-2xl font-bold text-white">{t('auth.title')}</h1><p className="mt-2 text-sm text-slate-400">{t('auth.subtitle')}</p></div><label className="mb-4 block text-sm font-semibold text-slate-300">{t('auth.username')}<div className="relative mt-2"><UserRound className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 py-3 ps-10 pe-3 text-white outline-none focus:border-emerald-500" /></div></label><label className="mb-5 block text-sm font-semibold text-slate-300">{t('auth.password')}<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500" /></label>{error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}<button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-bold transition hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"><LogIn className="h-4 w-4" />{submitting ? t('auth.signingIn') : t('auth.signIn')}</button></form></main>;
}
