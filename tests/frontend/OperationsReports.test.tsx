import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { OperationsPage } from '@client/features/operations/OperationsPage';
import { formatMoney } from '@client/lib/format';
import { jsonRes, stubFetch } from './testUtils';

describe('ReportsPage (OperationsPage mode="reports")', () => {
  it('loads and renders the daily report metrics', async () => {
    const user = userEvent.setup();
    const loadReport = vi.fn();
    stubFetch([
      { match: /\/api\/reports\/daily\?date=/, handle: (init) => {
        loadReport(String(init?.method ?? 'GET'));
        return jsonRes({ data: { totalAttendees: 7, centerNetRevenue: 305.5, teacherPayouts: 800, digitalCollections: 150 } });
      } },
    ]);
    render(<OperationsPage mode="reports" />);

    const dateInput = screen.getByLabelText(i18n.t('operations.reports.load')) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, '2026-09-06');

    await user.click(screen.getByRole('button', { name: i18n.t('operations.reports.load') }));

    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText(formatMoney(305.5, 'ar'))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(800, 'ar'))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(150, 'ar'))).toBeInTheDocument();
    await waitFor(() => expect(loadReport).toHaveBeenCalledWith('GET'));
  });

  it('shows a load error when the daily report endpoint fails', async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/reports\/daily\?date=/, handle: () => jsonRes({ error: { message: 'server error', messageEn: 'Server error' } }, 500) },
    ]);
    render(<OperationsPage mode="reports" />);

    await user.click(screen.getByRole('button', { name: i18n.t('operations.reports.load') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('operations.loadError'));
  });

  it('renders shift audit entries and money amounts', async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/reports\/shifts\/sh-1\/audit$/, handle: () => jsonRes({ data: { entries: [
        { id: 1, action: 'SHIFT_OPENED', createdAt: '2026-09-06 18:00', amount: null },
        { id: 2, action: 'ATTENDANCE_CHECKED_IN', createdAt: '2026-09-06 18:05', amount: 150 },
      ] } }) },
    ]);
    render(<OperationsPage mode="reports" />);

    expect(screen.getByRole('button', { name: i18n.t('operations.reports.loadAudit') })).toBeDisabled();

    await user.type(screen.getByLabelText(i18n.t('operations.reports.shiftId')), 'sh-1');
    await user.click(screen.getByRole('button', { name: i18n.t('operations.reports.loadAudit') }));

    expect(await screen.findByText('SHIFT_OPENED')).toBeInTheDocument();
    expect(screen.getByText('ATTENDANCE_CHECKED_IN')).toBeInTheDocument();
    expect(screen.getByText(formatMoney(150, 'ar'))).toBeInTheDocument();
  });

  it('shows the empty state when a shift has no audit entries', async () => {
    const user = userEvent.setup();
    stubFetch([
      { match: /\/api\/reports\/shifts\/sh-9\/audit$/, handle: () => jsonRes({ data: { entries: [] } }) },
    ]);
    render(<OperationsPage mode="reports" />);

    await user.type(screen.getByLabelText(i18n.t('operations.reports.shiftId')), 'sh-9');
    await user.click(screen.getByRole('button', { name: i18n.t('operations.reports.loadAudit') }));

    expect(await screen.findByText(i18n.t('operations.auditEmpty'))).toBeInTheDocument();
  });
});