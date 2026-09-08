import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { OperationsPage } from '@client/features/operations/OperationsPage';
import { formatMoney } from '@client/lib/format';
import { jsonRes, parseBody, stubFetch } from './testUtils';

describe('SessionActionPage reconciliation (mode="reconciliation")', () => {
  it('reconciles a selected session with assistant count, headcount, and notes', async () => {
    const user = userEvent.setup();
    const reconcileBody = vi.fn();
    stubFetch([
      { match: /\/api\/attendances\/sessions\/active$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-1', title: 'فيزياء', currentLobbyCount: 3, sessionPrice: 120, centerFeePerStudent: 15, startTime: '2026-09-06T18:00:00+02:00', teacher: { fullName: 'أ. هشام' }, room: { name: 'قاعة ٣', capacity: 30 } }] } }) },
      { match: /\/api\/sessions\/ses-1\/reconcile$/, handle: (init) => {
        reconcileBody(parseBody(init));
        return jsonRes({ data: { success: true } });
      } },
    ]);
    render(<OperationsPage mode="reconciliation" />);

    expect(await screen.findByText(i18n.t('operations.reconciliation.title'))).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(i18n.t('operations.reconciliation.session')), 'ses-1');
    expect(screen.getByText(`${i18n.t('operations.reconciliation.lobbyCount')}: 3`)).toBeInTheDocument();

    await user.type(screen.getByLabelText(i18n.t('operations.reconciliation.assistantCount')), '2');
    await user.type(screen.getByLabelText(i18n.t('operations.reconciliation.headcount')), '3');
    await user.type(screen.getByLabelText(i18n.t('operations.reconciliation.notes')), 'الفرق معتمد');
    await user.click(screen.getByRole('button', { name: i18n.t('actions.reconcile') }));
    expect(await screen.findByText(i18n.t('operations.reconciliation.confirmTitle'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: i18n.t('actions.confirm') }));

    await waitFor(() => {
      expect(reconcileBody).toHaveBeenCalledWith({ assistantCount: 2, reconciledHeadcount: 3, resolutionNotes: 'الفرق معتمد' });
    });
    expect(await screen.findByText(i18n.t('operations.reconciliation.saved'))).toBeInTheDocument();
  });

  it('keeps the submit button disabled until a session is selected', async () => {
    stubFetch([
      { match: /\/api\/attendances\/sessions\/active$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-1', title: 'فيزياء', currentLobbyCount: 3 }] } }) },
    ]);
    render(<OperationsPage mode="reconciliation" />);
    await screen.findByText('فيزياء (3)');
    expect(screen.getByRole('button', { name: i18n.t('actions.reconcile') })).toBeDisabled();
  });
});

describe('SessionActionPage settlement (mode="settlement")', () => {
  it('settles a selected session with payout method and recipient', async () => {
    const user = userEvent.setup();
    const settleBody = vi.fn();
    stubFetch([
      { match: /\/api\/scheduling\/sessions$/, handle: () => jsonRes({ data: { sessions: [{ id: 'ses-2', title: 'كيمياء ٣ث', currentLobbyCount: 4, sessionPrice: 150, centerFeePerStudent: 20, startTime: '2026-09-06T19:00:00+02:00', teacher: { fullName: 'أ. سامي' }, room: { name: 'قاعة ٤', capacity: 35 } }] } }) },
      { match: /\/api\/sessions\/ses-2\/settle$/, handle: (init) => {
        settleBody(parseBody(init));
        return jsonRes({ data: { success: true } });
      } },
    ]);
    render(<OperationsPage mode="settlement" />);

    await user.selectOptions(await screen.findByLabelText(i18n.t('operations.settlement.session')), 'ses-2');
    expect(screen.getByText(formatMoney(150, 'ar'))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(20, 'ar'))).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(i18n.t('operations.settlement.payment')), 'VODAFONE_CASH');
    await user.type(screen.getByLabelText(i18n.t('operations.settlement.recipient')), 'محمود عبد الرحمن');
    await user.click(screen.getByRole('button', { name: i18n.t('actions.settlePayout') }));
    expect(await screen.findByText(i18n.t('operations.settlement.confirmTitle'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: i18n.t('actions.confirm') }));

    await waitFor(() => {
      expect(settleBody).toHaveBeenCalledWith({ payoutMethod: 'VODAFONE_CASH', recipientName: 'محمود عبد الرحمن' });
    });
    expect(await screen.findByText(i18n.t('operations.settlement.saved'))).toBeInTheDocument();
  });
});