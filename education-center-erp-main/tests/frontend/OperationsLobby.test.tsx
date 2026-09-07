import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { OperationsPage } from '@client/features/operations/OperationsPage';
import { jsonRes, parseBody, stubFetch } from './testUtils';

const { mockSocket } = vi.hoisted(() => ({
  mockSocket: { on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() },
}));
vi.mock('socket.io-client', () => ({ io: () => mockSocket }));

const session = {
  id: 'ses-1',
  title: 'جيولوجيا ٣ث',
  startTime: '2026-09-06T18:00:00+02:00',
  sessionPrice: 150,
  centerFeePerStudent: 20,
  currentLobbyCount: 2,
  teacher: { fullName: 'أ. خالد' },
  room: { name: 'قاعة ٢', capacity: 40 },
};
const student = { id: 'stu-1', fullName: 'محمد سعيد', studentCode: 'STU-00001' };

function stubLobby({ checkIn }: { checkIn?: (body: unknown) => void } = {}) {
  const sessionsActive = vi.fn(() => jsonRes({ data: { sessions: [session] } }));
  const registrySearch = vi.fn(() => jsonRes({ data: { students: [student] } }));
  const checkin = vi.fn((init?: RequestInit) => {
    if (checkIn) checkIn(parseBody(init));
    return jsonRes({ data: { success: true } });
  });
  const mock = stubFetch([
    { match: /\/api\/attendances\/sessions\/active$/, handle: () => sessionsActive() },
    { match: /\/api\/registry\/students\?search=/, handle: () => registrySearch() },
    { match: /\/api\/attendances\/checkin$/, handle: checkin },
  ]);
  return { mock, sessionsActive, registrySearch, checkin };
}

beforeEach(() => {
  mockSocket.on.mockClear();
  mockSocket.emit.mockClear();
  mockSocket.disconnect.mockClear();
  vi.useRealTimers();
});

describe('LobbyPage (OperationsPage mode="lobby")', () => {
  it('renders active sessions with lobby/capacity counts and updates selection', async () => {
    const user = userEvent.setup();
    stubLobby();
    render(<OperationsPage mode="lobby" />);

    const sessionButton = await screen.findByRole('button', { name: /جيولوجيا ٣ث/ });
    expect(sessionButton).toBeInTheDocument();
    expect(within(sessionButton).getByText('2/40')).toBeInTheDocument();
    expect(within(sessionButton).getByText(/أ\. خالد/)).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('operations.lobby.empty'))).not.toBeInTheDocument();

    expect(sessionButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(sessionButton);
    expect(await screen.findByRole('button', { name: /جيولوجيا ٣ث/ })).toHaveAttribute('aria-pressed', 'true');

    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('attendance:checked_in', expect.any(Function));
  });

  it('joins the lobby room and reloads sessions on socket broadcasts', async () => {
    stubLobby();
    render(<OperationsPage mode="lobby" />);
    await screen.findByText(/جيولوجيا ٣ث/);

    const connectHandler = mockSocket.on.mock.calls.find(([event]) => event === 'connect')?.[1];
    expect(connectHandler).toBeDefined();
    connectHandler?.();
    expect(mockSocket.emit).toHaveBeenCalledWith('join:lobby');

    const checkedInHandler = mockSocket.on.mock.calls.find(([event]) => event === 'attendance:checked_in')?.[1];
    checkedInHandler?.();
    await waitFor(() => expect(mockSocket.disconnect).not.toHaveBeenCalled());
  });

  it('checks a student in with CASH after searching and selecting a session', async () => {
    const user = userEvent.setup();
    const { checkin } = stubLobby();
    render(<OperationsPage mode="lobby" />);

    await user.click(await screen.findByRole('button', { name: /جيولوجيا ٣ث/ }));
    await user.type(screen.getByPlaceholderText(i18n.t('operations.lobby.searchPlaceholder')), 'محمد');

    const studentName = await screen.findByText('محمد سعيد');
    const studentRow = studentName.closest('div')?.parentElement as HTMLElement;
    await user.click(within(studentRow).getByRole('button', { name: i18n.t('actions.checkIn') }));

    await waitFor(() => {
      expect(checkin).toHaveBeenCalledTimes(1);
      expect(checkin.mock.calls[0][0]).toEqual({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'ses-1', studentId: student.id, paymentMethod: 'CASH' }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    });
    expect(await screen.findByText(i18n.t('operations.checkInSuccess'))).toBeInTheDocument();
    await waitFor(() => expect(studentRow).not.toBeInTheDocument());
  });

  it('sends the selected payment method and transfer reference on check-in', async () => {
    const user = userEvent.setup();
    const { checkin } = stubLobby();
    render(<OperationsPage mode="lobby" />);

    await user.click(await screen.findByRole('button', { name: /جيولوجيا ٣ث/ }));
    await user.selectOptions(screen.getByLabelText(i18n.t('operations.lobby.paymentMethod')), 'INSTAPAY');
    await user.type(screen.getByPlaceholderText(i18n.t('operations.lobby.reference')), 'INST-9382');
    await user.type(screen.getByPlaceholderText(i18n.t('operations.lobby.searchPlaceholder')), 'محمد');
    const studentName = await screen.findByText('محمد سعيد');
    const studentRow = studentName.closest('div')?.parentElement as HTMLElement;
    await user.click(within(studentRow).getByRole('button', { name: i18n.t('actions.checkIn') }));

    await waitFor(() => {
      const body = JSON.parse(checkin.mock.calls[0][0].body as string) as Record<string, unknown>;
      expect(body).toEqual({ sessionId: 'ses-1', studentId: student.id, paymentMethod: 'INSTAPAY', paymentReference: 'INST-9382' });
    });
  });
});