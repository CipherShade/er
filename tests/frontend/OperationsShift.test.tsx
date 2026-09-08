import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { OperationsPage } from '@client/features/operations/OperationsPage';
import { formatMoney } from '@client/lib/format';
import { jsonRes, parseBody, stubFetch } from './testUtils';

const shiftOpen = { id: 'sh-1', financials: { expectedCashInDrawer: 100, totalCashCollected: 0, totalTeacherCashPayouts: 0, totalCashExpenses: 0 } };

describe('ShiftPage (OperationsPage mode="shift")', () => {
  it('opens a new shift when none is running', async () => {
    const user = userEvent.setup();
    const env = { shift: null as typeof shiftOpen | null };
    const openBody = vi.fn();
    stubFetch([
      { match: /\/api\/shifts\/current$/, handle: () => jsonRes({ data: { shift: env.shift } }) },
      { match: /\/api\/shifts\/open$/, handle: (init) => {
        openBody(parseBody(init));
        env.shift = shiftOpen;
        return jsonRes({ data: { shift: shiftOpen } });
      } },
    ]);
    render(<OperationsPage mode="shift" />);

    expect(await screen.findByLabelText(i18n.t('operations.shift.desk'))).toHaveValue('Desk 1');
    await user.type(screen.getByLabelText(i18n.t('operations.shift.openingCash')), '100');
    await user.click(screen.getByRole('button', { name: i18n.t('actions.openShift') }));

    await waitFor(() => {
      expect(openBody).toHaveBeenCalledWith({ deskIdentifier: 'Desk 1', openingCash: 100 });
    });
    expect(await screen.findByText(i18n.t('operations.shift.opened'))).toBeInTheDocument();
  });

  it('shows financial metrics and records a cash expense on an open shift', async () => {
    const user = userEvent.setup();
    const env = { shift: shiftOpen };
    const expenseBody = vi.fn();
    stubFetch([
      { match: /\/api\/shifts\/current$/, handle: () => jsonRes({ data: { shift: env.shift } }) },
      { match: /\/api\/shifts\/expenses$/, handle: (init) => {
        expenseBody(parseBody(init));
        return jsonRes({ data: { success: true } });
      } },
    ]);
    render(<OperationsPage mode="shift" />);

    expect(await screen.findByText(formatMoney(100, 'ar'))).toBeInTheDocument();
    expect(screen.getAllByText(formatMoney(0, 'ar')).length).toBe(3);

    await user.type(screen.getByLabelText(i18n.t('operations.shift.category')), 'أدوات مكتبية');
    await user.type(screen.getByLabelText(i18n.t('operations.shift.amount')), '30.5');
    await user.type(screen.getByLabelText(i18n.t('operations.shift.description')), 'أقلام ودفاتر');
    await user.click(screen.getByRole('button', { name: i18n.t('operations.shift.addExpense') }));

    await waitFor(() => {
      expect(expenseBody).toHaveBeenCalledWith({ category: 'أدوات مكتبية', amount: 30.5, paymentMethod: 'CASH', description: 'أقلام ودفاتر' });
    });
    expect(await screen.findByText(i18n.t('operations.shift.expenseSaved'))).toBeInTheDocument();
  });

  it('closes a running shift with the counted cash and closing notes', async () => {
    const user = userEvent.setup();
    const env = { shift: shiftOpen as typeof shiftOpen | null };
    const closeBody = vi.fn();
    stubFetch([
      { match: /\/api\/shifts\/current$/, handle: () => jsonRes({ data: { shift: env.shift } }) },
      { match: /\/api\/shifts\/close$/, handle: (init) => {
        closeBody(parseBody(init));
        env.shift = null;
        return jsonRes({ data: { success: true } });
      } },
    ]);
    render(<OperationsPage mode="shift" />);

    await user.type(await screen.findByLabelText(i18n.t('operations.shift.actualCash')), '120');
    await user.type(screen.getByLabelText(i18n.t('operations.shift.notes')), 'لا فائت');
    await user.click(screen.getByRole('button', { name: i18n.t('actions.closeShift') }));

    await waitFor(() => {
      expect(closeBody).toHaveBeenCalledWith({ actualCashCounted: 120, closingNotes: 'لا فائت' });
    });
    expect(await screen.findByText(i18n.t('operations.shift.closed'))).toBeInTheDocument();
    await screen.findByLabelText(i18n.t('operations.shift.desk'));
  });
});