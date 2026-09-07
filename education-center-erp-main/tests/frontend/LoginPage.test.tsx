import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { AuthProvider } from '@client/auth/AuthContext';
import { LoginPage } from '@client/auth/LoginPage';
import { jsonRes, parseBody, stubFetch } from './testUtils';
import type { Role } from '@prisma/client';

function renderLogin() {
  return render(<AuthProvider><LoginPage /></AuthProvider>);
}

describe('LoginPage', () => {
  it('renders the login form and submits the entered credentials', async () => {
    const user = userEvent.setup();
    const mockFetch = stubFetch([
      { match: /\/api\/auth\/me$/, handle: () => jsonRes({ data: { user: null } }) },
      { match: /\/api\/auth\/login$/, handle: (init) => {
        expect(parseBody(init)).toEqual({ username: 'recep', password: 'p@ss' });
        return jsonRes({ data: { user: { id: 'u-2', username: 'recep', fullName: 'محمود', role: 'RECEPTIONIST' as Role, preferredLanguage: 'ar', phoneNumber: null } } });
      } },
      { match: /\/api\/auth\/logout$/, handle: () => jsonRes({ data: { ok: true } }) },
    ]);
    renderLogin();

    expect(await screen.findByRole('heading', { name: i18n.t('auth.title') })).toBeInTheDocument();
    await user.type(screen.getByLabelText(i18n.t('auth.username')), 'recep');
    await user.type(screen.getByLabelText(i18n.t('auth.password')), 'p@ss');
    await user.click(screen.getByRole('button', { name: i18n.t('auth.signIn') }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the invalid-credentials error when login fails', async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/auth\/me$/, handle: () => jsonRes({ data: { user: null } }) },
      { match: /\/api\/auth\/login$/, handle: () => jsonRes({ error: { message: 'بيانات خاطئة', messageEn: 'Bad credentials' } }, 401) },
    ]);
    renderLogin();

    await user.type(await screen.findByLabelText(i18n.t('auth.username')), 'admin');
    await user.type(screen.getByLabelText(i18n.t('auth.password')), 'wrong');
    await user.click(screen.getByRole('button', { name: i18n.t('auth.signIn') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('auth.invalidCredentials'));
  });
});