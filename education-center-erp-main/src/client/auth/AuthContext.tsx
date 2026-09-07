import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role } from '../../shared/constants/index.js';
import { apiUrl } from '../lib/config';

type AuthUser = { id: string; username: string; fullName: string; role: Role; preferredLanguage: string; phoneNumber: string | null };
type Credentials = { username: string; password: string };
type AuthContextValue = { user: AuthUser | null; loading: boolean; login: (credentials: Credentials) => Promise<void>; logout: () => Promise<void>; refreshUser: () => Promise<void>; hasRole: (...roles: Role[]) => boolean };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const api = (path: string, options?: RequestInit) => fetch(apiUrl(`/api${path}`), { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });

async function parseResponse(response: Response): Promise<{ user?: AuthUser; error?: { message?: string; messageEn?: string } }> {
  const body = await response.json() as { data?: { user?: AuthUser }; error?: { message?: string; messageEn?: string } };
  if (!response.ok) throw new Error(body.error?.messageEn || body.error?.message || 'Request failed');
  return { user: body.data?.user, error: body.error };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const result = await parseResponse(await api('/auth/me'));
      setUser(result.user ?? null);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => { void refreshUser().finally(() => setLoading(false)); }, []);

  const login = async (credentials: Credentials) => {
    const result = await parseResponse(await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }));
    setUser(result.user ?? null);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, hasRole: (...roles) => user !== null && roles.includes(user.role) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
