import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@client/auth/AuthContext';
import { jsonRes, parseBody, stubFetch } from './testUtils';
import type { Role } from '@prisma/client';

const adminUser = { id: 'u-1', username: 'admin', fullName: 'أحمد علي', role: 'ADMIN' as Role, preferredLanguage: 'ar', phoneNumber: null };

function Probe() {
  const { user, login, logout, hasRole } = useAuth();
  return (
    <div>
      {user ? <p data-testid="user">{`${user.fullName} | ${user.role}`}</p> : <p data-testid="guest">guest</p>}
      {hasRole('ADMIN') && <p data-testid="isAdmin">admin-ok</p>}
      <button type="button" onClick={() => void login({ username: 'admin', password: 'secret' }).catch(() => undefined)}>login</button>
      <button type="button" onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderProbe() {
  return render(<AuthProvider><Probe /></AuthProvider>);
}

describe('AuthContext', () => {
  it('starts in guest state and hydrates the user on successful login', async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/auth\/me$/, handle: () => jsonRes({ data: { user: null } }) },
      { match: /\/api\/auth\/login$/, handle: (init) => {
        expect(parseBody(init)).toEqual({ username: 'admin', password: 'secret' });
        return jsonRes({ data: { user: adminUser } });
      } },
      { match: /\/api\/auth\/logout$/, handle: () => jsonRes({ data: { ok: true } }) },
    ]);
    renderProbe();
    expect(await screen.findByTestId('guest')).toBeInTheDocument();
    expect(screen.queryByTestId('isAdmin')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByTestId('user')).toHaveTextContent('أحمد علي | ADMIN');
    expect(screen.getByTestId('isAdmin')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'logout' }));
    expect(await screen.findByTestId('guest')).toBeInTheDocument();
    expect(screen.queryByTestId('user')).not.toBeInTheDocument();
  });

  it('clears the user to guest when the session endpoint fails', async () => {
    stubFetch([
      { match: /\/api\/auth\/me$/, handle: () => jsonRes({ data: { user: adminUser } }) },
    ]);
    const mockFetch = vi.fn();
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', mockFetch);
    renderProbe();
    expect(await screen.findByTestId('guest')).toBeInTheDocument();
    expect(screen.queryByTestId('user')).not.toBeInTheDocument();
  });

  it('ignores a failed login and stays a guest', async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/auth\/me$/, handle: () => jsonRes({ data: { user: null } }) },
      { match: /\/api\/auth\/login$/, handle: () => jsonRes({ error: { message: 'بيانات غير صحيحة', messageEn: 'Invalid credentials' } }, 401) },
      { match: /\/api\/auth\/logout$/, handle: () => jsonRes({ data: { ok: true } }) },
    ]);
    renderProbe();
    await user.click(await screen.findByRole('button', { name: 'login' }));
    expect(await screen.findByTestId('guest')).toBeInTheDocument();
    expect(screen.queryByTestId('user')).not.toBeInTheDocument();
  });
});