import { useEffect, useState, type FormEvent } from 'react';
import { BarChart3, ClipboardCheck, Coins, Printer, Search, Wallet, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { io } from 'socket.io-client';
import { apiUrl, socketUrl } from '../../lib/config';
import { formatDate, formatMoney } from '../../lib/format';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/AsyncState';

type Mode = 'lobby' | 'shift' | 'reconciliation' | 'settlement' | 'reports';
type Session = { id: string; title: string; startTime: string; sessionPrice: number; centerFeePerStudent: number; currentLobbyCount: number; teacher: { fullName: string }; room: { name: string; capacity: number } };
type Student = { id: string; fullName: string; studentCode: string };
type Shift = { id: string; deskIdentifier?: string; status?: string; financials?: { expectedCashInDrawer: number; totalCashCollected: number; totalTeacherCashPayouts: number; totalCashExpenses: number } };
type AttendanceRecord = { id: string; studentName: string; sessionPrice: number; amountPaid: number; remainingDue: number; changeOwed: number; paymentMethod: string; status: string; checkInTime: string; deskIdentifier: string };
type Receipt = { studentName: string; sessionTitle: string; sessionPrice: number; amountPaid: number; changeOwed: number; remainingDue: number; paymentMethod: string; checkInTime: string };
type Voucher = { sessionTitle: string; recipientName: string; totalRevenue: number; centerShare: number; teacherPayout: number; payoutMethod: string; settledAt: string };
type ShiftHistoryRow = { id: string; deskIdentifier: string; openingCash: number; expectedCashInDrawer: number; actualCashCounted: number; cashVariance: number; openedAt: string; closedAt: string; receptionist: string };

export class ApiError extends Error {
  code?: string;
  messageEn?: string;
  constructor(message: string, code?: string, messageEn?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.messageEn = messageEn;
  }
}

export function mapApiErrorMessage(error: unknown, t: TFunction, fallback: string): string {
  if (error instanceof ApiError && error.code) {
    const localized = t(`errors.${error.code}`, { defaultValue: '' });
    if (localized) return localized;
    if (error.message && /[\u0600-\u06FF]/.test(error.message)) return error.message;
  }
  return fallback;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(`/api${path}`), {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; messageEn?: string };
    } | null;
    const code = errorBody?.error?.code;
    const msg = errorBody?.error?.message || 'REQUEST_FAILED';
    const msgEn = errorBody?.error?.messageEn;
    throw new ApiError(msg, code, msgEn);
  }
  return (await response.json() as { data: T }).data;
}

function printWindow(title: string, html: string): void {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=380,height=660');
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>${title}</title><style>
    *{box-sizing:border-box} body{font-family:'Cairo',Tahoma,sans-serif;margin:0;padding:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 4px} .sub{font-size:12px;color:#64748b;margin-bottom:16px}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #cbd5e1;font-size:14px}
    .row strong{font-weight:700} .total{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;margin-top:8px}
    .total .row{border-bottom:none} .muted{color:#64748b;font-size:12px;text-align:center;margin-top:20px}
  </style></head><body>${html}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function OperationsPage({ mode }: { mode: Mode }) {
  if (mode === 'lobby') return <LobbyPage />;
  if (mode === 'shift') return <ShiftPage />;
  if (mode === 'reconciliation') return <SessionActionPage kind="reconciliation" />;
  if (mode === 'settlement') return <SessionActionPage kind="settlement" />;
  return <ReportsPage />;
}

function PageHeader({ icon: Icon, title, subtitle }: { icon: typeof Wallet; title: string; subtitle: string }) {
  return (
    <header>
      <div className="flex items-center gap-3 text-emerald-400">
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-semibold">{subtitle}</span>
      </div>
      <h2 className="mt-2 text-2xl font-bold text-white">{title}</h2>
    </header>
  );
}

function Notice({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && <ErrorState message={error} />}
      {success && (
        <p role="status" aria-live="polite" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {success}
        </p>
      )}
    </>
  );
}

function money(value: number | undefined, language: string): string {
  return formatMoney(Number(value || 0), language);
}

function LobbyPage() {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selected = sessions.find((item) => item.id === selectedSession);
  const sessionPrice = selected?.sessionPrice ?? 0;
  const receivedNumber = amountReceived !== '' ? Number(amountReceived) : sessionPrice;
  const changeOwed = receivedNumber >= sessionPrice ? Number((receivedNumber - sessionPrice).toFixed(2)) : 0;
  const remainingDue = receivedNumber < sessionPrice ? Number((sessionPrice - receivedNumber).toFixed(2)) : 0;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSessions((await request<{ sessions: Session[] }>('/attendances/sessions/active')).sessions);
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.loadError')));
    } finally {
      setLoading(false);
    }
  };

  const loadAttendances = async (sessionId: string) => {
    try {
      setAttendances((await request<{ attendances: AttendanceRecord[] }>(`/attendances/sessions/${sessionId}/attendances`)).attendances);
    } catch {
      setAttendances([]);
    }
  };

  useEffect(() => {
    void load();
    const socket = socketUrl ? io(socketUrl, { withCredentials: true }) : io({ withCredentials: true });
    socket.on('connect', () => socket.emit('join:lobby'));
    socket.on('attendance:checked_in', () => void load());
    socket.on('attendance:voided', () => void load());
    return () => {
      socket.emit('leave:lobby');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    setAttendances([]);
    if (selectedSession) void loadAttendances(selectedSession);
  }, [selectedSession]);

  useEffect(() => {
    if (!query.trim()) {
      setStudents([]);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      void request<{ students: Student[] }>(`/registry/students?search=${encodeURIComponent(query)}`)
        .then((data) => setStudents(data.students))
        .catch(() => setStudents([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function checkIn(student: Student) {
    if (!selectedSession) {
      setError(t('operations.chooseSession'));
      return;
    }
    if (paymentMethod !== 'CASH' && !reference.trim()) {
      setError(t('errors.PAYMENT_REFERENCE_REQUIRED'));
      return;
    }
    if (submittingId) return;
    setSubmittingId(student.id);
    setError('');
    setSuccess('');
    try {
      const payload: {
        sessionId: string;
        studentId: string;
        paymentMethod: string;
        paymentReference?: string;
        amountPaid?: number;
      } = {
        sessionId: selectedSession,
        studentId: student.id,
        paymentMethod,
      };
      if (paymentMethod !== 'CASH') {
        if (reference.trim()) payload.paymentReference = reference.trim();
      } else if (amountReceived !== '' && Number(amountReceived) !== sessionPrice) {
        payload.amountPaid = Number(amountReceived);
      }
      const result = await request<{ attendance?: AttendanceRecord }>('/attendances/checkin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const paid = result.attendance ?? {
        amountPaid: amountReceived !== '' ? Number(amountReceived) : sessionPrice,
        changeOwed,
        remainingDue,
        paymentMethod,
        checkInTime: new Date().toISOString(),
        sessionPrice,
      };
      setReceipt({
        studentName: student.fullName,
        sessionTitle: selected?.title ?? '',
        sessionPrice: paid.sessionPrice,
        amountPaid: paid.amountPaid,
        changeOwed: paid.changeOwed,
        remainingDue: paid.remainingDue,
        paymentMethod: paid.paymentMethod,
        checkInTime: paid.checkInTime,
      });
      setSuccess(t('operations.checkInSuccess'));
      setQuery('');
      setReference('');
      setAmountReceived('');
      await load();
      if (selectedSession) await loadAttendances(selectedSession);
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.checkInError')));
    } finally {
      setSubmittingId(null);
    }
  }

  async function voidAttendance(id: string) {
    if (typeof window === 'undefined' || !window.confirm(t('operations.lobby.voidConfirm'))) return;
    setError('');
    setSuccess('');
    try {
      await request(`/attendances/${id}/void`, { method: 'POST' });
      setSuccess(t('operations.lobby.voidAction'));
      await load();
      if (selectedSession) await loadAttendances(selectedSession);
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.checkInError')));
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader icon={Search} title={t('operations.lobby.title')} subtitle={t('operations.lobby.subtitle')} />
      <Notice error={error} success={success} />
      {receipt && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-emerald-300">{receipt.sessionTitle} — {t('operations.receipt.title')}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => printWindow(t('operations.receipt.title'), receiptHtml(t, receipt))} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold">
                <Printer className="h-4 w-4" />{t('operations.receipt.print')}
              </button>
              <button type="button" onClick={() => setReceipt(null)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs">
                <X className="h-4 w-4" />{t('operations.receipt.close')}
              </button>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <dt className="text-slate-400">{t('operations.receipt.student')}</dt><dd className="font-bold text-white">{receipt.studentName}</dd>
            <dt className="text-slate-400">{t('operations.receipt.session')}</dt><dd className="font-bold text-white">{receipt.sessionTitle}</dd>
            <dt className="text-slate-400">{t('operations.receipt.method')}</dt><dd className="font-bold text-white">{t(`paymentMethods.${receipt.paymentMethod.toLowerCase()}`, receipt.paymentMethod)}</dd>
            <dt className="text-slate-400">{t('operations.receipt.amount')}</dt><dd className="font-bold text-emerald-300">{money(receipt.amountPaid, i18n.language)}</dd>
            <dt className="text-slate-400">{t('operations.receipt.change')}</dt><dd className="font-bold text-white">{money(receipt.changeOwed, i18n.language)}</dd>
            <dt className="text-slate-400">{t('operations.receipt.remaining')}</dt><dd className="font-bold text-amber-300">{money(receipt.remainingDue, i18n.language)}</dd>
          </dl>
        </div>
      )}
      {loading ? (
        <LoadingState label={t('operations.loading')} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSession(session.id)}
                  aria-pressed={selectedSession === session.id}
                  className={`min-h-32 rounded-xl border p-4 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                    selectedSession === session.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-white">{session.title}</span>
                    <span className="text-xs text-emerald-300">
                      {session.currentLobbyCount}/{session.room.capacity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    {session.teacher.fullName} · {session.room.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(session.startTime).toLocaleTimeString()}</p>
                </button>
              ))}
            </div>
            {sessions.length === 0 && <EmptyState message={t('operations.lobby.empty')} />}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <label className="text-sm font-semibold text-slate-300">
                {t('operations.lobby.studentSearch')}
                <div className="relative mt-2">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-3 ps-10 pe-3 text-white outline-none focus:border-emerald-500"
                    placeholder={t('operations.lobby.searchPlaceholder')}
                  />
                </div>
              </label>
              <div className="mt-3 space-y-2" aria-live="polite">
                {searching && <LoadingState />}
                {!searching && query && students.length === 0 && <EmptyState message={t('ui.noResults')} />}
                {students.map((student) => (
                  <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-3">
                    <div>
                      <p className="font-semibold text-white">{student.fullName}</p>
                      <p className="text-xs text-slate-500">{student.studentCode}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!selectedSession || submittingId !== null}
                      onClick={() => void checkIn(student)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold disabled:cursor-wait disabled:opacity-60"
                    >
                      {submittingId === student.id ? t('ui.processing') : t('actions.checkIn')}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <select
                  aria-label={t('operations.lobby.paymentMethod')}
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white"
                >
                  <option value="CASH">{t('paymentMethods.cash')}</option>
                  <option value="VODAFONE_CASH">{t('paymentMethods.vodafoneCash')}</option>
                  <option value="INSTAPAY">{t('paymentMethods.instapay')}</option>
                </select>
                {paymentMethod === 'CASH' ? (
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{t('operations.settlement.price')}: {money(sessionPrice, i18n.language)}</span>
                      {remainingDue > 0 ? (
                        <span className="font-bold text-amber-400">{t('operations.lobby.partialNotice')}: {money(remainingDue, i18n.language)}</span>
                      ) : (
                        <span className="font-bold text-emerald-400">{t('operations.receipt.change')}: {money(changeOwed, i18n.language)}</span>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountReceived}
                      onChange={(event) => setAmountReceived(event.target.value)}
                      placeholder={sessionPrice ? `${t('operations.lobby.reference')} (${money(sessionPrice, i18n.language)})` : '0'}
                      className="mt-1.5 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                ) : (
                  <input
                    required
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder={t('operations.lobby.reference')}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
                  />
                )}
              </div>
            </div>
            {selected && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h3 className="text-sm font-bold text-slate-300">{t('operations.lobby.attendanceList')} — {selected.title} ({attendances.length})</h3>
                {attendances.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">{t('operations.lobby.attendanceEmpty')}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {attendances.map((attendance) => (
                      <li key={attendance.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3 text-sm">
                        <div>
                          <p className="font-semibold text-white">{attendance.studentName}</p>
                          <p className="text-xs text-slate-500">
                            {money(attendance.amountPaid, i18n.language)}
                            {attendance.remainingDue > 0 && <span className="text-amber-400"> · {t('operations.receipt.remaining')}: {money(attendance.remainingDue, i18n.language)}</span>}
                            {' · '}{t(`paymentMethods.${attendance.paymentMethod.toLowerCase()}`, attendance.paymentMethod)} · {formatDate(attendance.checkInTime, i18n.language)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${attendance.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-300' : attendance.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                            {t(`status.${attendance.status.toLowerCase()}`, attendance.status)}
                          </span>
                          {attendance.status !== 'VOID' && (
                            <button
                              type="button"
                              onClick={() => void voidAttendance(attendance.id)}
                              className="rounded-lg border border-red-500/30 px-2 py-1 text-xs font-bold text-red-300 hover:bg-red-500/10"
                            >
                              {t('operations.lobby.voidAction')}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function receiptHtml(t: TFunction, receipt: Receipt): string {
  const method = t(`paymentMethods.${receipt.paymentMethod.toLowerCase()}`, receipt.paymentMethod);
  const payValue = (value: number) => formatMoney(Number(value || 0), 'ar');
  return `
    <h1>${t('operations.receipt.title')}</h1>
    <p class="sub">${t('operations.receipt.subtitle')}</p>
    <div class="row"><strong>${t('operations.receipt.session')}</strong><span>${receipt.sessionTitle}</span></div>
    <div class="row"><strong>${t('operations.receipt.student')}</strong><span>${receipt.studentName}</span></div>
    <div class="row"><strong>${t('operations.receipt.method')}</strong><span>${method}</span></div>
    <div class="row"><strong>${t('operations.settlement.price')}</strong><span>${payValue(receipt.sessionPrice)}</span></div>
    <div class="row"><strong>${t('operations.receipt.amount')}</strong><span>${payValue(receipt.amountPaid)}</span></div>
    <div class="row"><strong>${t('operations.receipt.change')}</strong><span>${payValue(receipt.changeOwed)}</span></div>
    <div class="row"><strong>${t('operations.receipt.remaining')}</strong><span>${payValue(receipt.remainingDue)}</span></div>
    <div class="row"><strong>${t('operations.receipt.time')}</strong><span>${formatDate(receipt.checkInTime, 'ar')}</span></div>
    <div class="total"><div class="row"><strong>${receipt.remainingDue > 0 ? t('operations.lobby.partialNotice') : t('operations.receipt.paidFully')}</strong><span>${payValue(receipt.remainingDue)}</span></div></div>
    <p class="muted">سنتر سيستم — ${receipt.sessionTitle}</p>`;
}

function ShiftPage() {
  const { t, i18n } = useTranslation();
  const [shift, setShift] = useState<Shift | null>(null);
  const [desk, setDesk] = useState('Desk 1');
  const [opening, setOpening] = useState('0');
  const [actual, setActual] = useState('0');
  const [notes, setNotes] = useState('');
  const [expense, setExpense] = useState({ category: '', amount: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setShift((await request<{ shift: Shift | null }>('/shifts/current')).shift);
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.loadError')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function submit(path: string, body: object, message: string) {
    if (pending) return;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await request(path, { method: 'POST', body: JSON.stringify(body) });
      setSuccess(message);
      await load();
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.saveError')));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader icon={Wallet} title={t('operations.shift.title')} subtitle={t('operations.shift.subtitle')} />
      <Notice error={error} success={success} />
      {loading ? (
        <LoadingState />
      ) : !shift ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit('/shifts/open', { deskIdentifier: desk, openingCash: Number(opening) }, t('operations.shift.opened'));
          }}
          className="max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-5"
        >
          <Field label={t('operations.shift.desk')} value={desk} onChange={setDesk} />
          <Field label={t('operations.shift.openingCash')} value={opening} onChange={setOpening} type="number" />
          <button disabled={pending} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-bold disabled:opacity-60">
            {pending ? t('ui.processing') : t('actions.openShift')}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['expectedCashInDrawer', shift.financials?.expectedCashInDrawer],
              ['totalCashCollected', shift.financials?.totalCashCollected],
              ['totalTeacherCashPayouts', shift.financials?.totalTeacherCashPayouts],
              ['totalCashExpenses', shift.financials?.totalCashExpenses],
            ].map(([key, value]) => (
              <Metric key={key as string} label={t(`operations.shift.${key as string}`)} value={money(value as number, i18n.language)} />
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit(
                '/shifts/expenses',
                { ...expense, amount: Number(expense.amount), paymentMethod: 'CASH' },
                t('operations.shift.expenseSaved')
              );
            }}
            className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Field label={t('operations.shift.category')} value={expense.category} onChange={(value) => setExpense({ ...expense, category: value })} />
            <Field label={t('operations.shift.amount')} value={expense.amount} onChange={(value) => setExpense({ ...expense, amount: value })} type="number" />
            <Field label={t('operations.shift.description')} value={expense.description} onChange={(value) => setExpense({ ...expense, description: value })} />
            <button disabled={pending} className="self-end rounded-lg bg-amber-600 px-4 py-3 font-bold disabled:opacity-60">
              {pending ? t('ui.processing') : t('operations.shift.addExpense')}
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit('/shifts/close', { actualCashCounted: Number(actual), closingNotes: notes }, t('operations.shift.closed'));
            }}
            className="max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <Field label={t('operations.shift.actualCash')} value={actual} onChange={setActual} type="number" />
            <Field label={t('operations.shift.notes')} value={notes} onChange={setNotes} required={false} />
            <button disabled={pending} className="mt-4 rounded-lg bg-red-600 px-4 py-2 font-bold disabled:opacity-60">
              {pending ? t('ui.processing') : t('actions.closeShift')}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function SessionActionPage({ kind }: { kind: 'reconciliation' | 'settlement' }) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selected = sessions.find((item) => item.id === sessionId);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const path = kind === 'reconciliation' ? '/attendances/sessions/active' : '/scheduling/sessions';
      setSessions((await request<{ sessions: Session[] }>(path)).sessions);
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.loadError')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [kind]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || pending) return;
    if (!confirming) {
      setConfirming(true);
      setError('');
      return;
    }
    setConfirming(false);
    setPending(true);
    setError('');
    setSuccess('');
    try {
      const body =
        kind === 'reconciliation'
          ? { assistantCount: Number(first), reconciledHeadcount: Number(second), resolutionNotes: notes || undefined }
          : { payoutMethod: first, recipientName: second };
      const data = await request<{ settlement?: Voucher & { sessionId: string; id: string } }>(
        `/sessions/${sessionId}/${kind === 'reconciliation' ? 'reconcile' : 'settle'}`,
        { method: 'POST', body: JSON.stringify(body) }
      );
      if (kind === 'settlement' && data.settlement) {
        setVoucher({ ...data.settlement, sessionTitle: selected?.title ?? '' });
      }
      setSuccess(t(`operations.${kind}.saved`));
      setSessionId('');
      setFirst('');
      setSecond('');
      setNotes('');
      await load();
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.saveError')));
    } finally {
      setPending(false);
    }
  }

  const icon = kind === 'reconciliation' ? ClipboardCheck : Coins;
  return (
    <section className="space-y-6">
      <PageHeader icon={icon} title={t(`operations.${kind}.title`)} subtitle={t(`operations.${kind}.subtitle`)} />
      <Notice error={error} success={success} />
      {voucher && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-amber-300">{voucher.sessionTitle} — {t('operations.voucher.title')}</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => printWindow(t('operations.voucher.title'), voucherHtml(t, voucher))} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold">
                <Printer className="h-4 w-4" />{t('operations.voucher.print')}
              </button>
              <button type="button" onClick={() => setVoucher(null)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs">
                <X className="h-4 w-4" />{t('operations.voucher.close')}
              </button>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <dt className="text-slate-400">{t('operations.voucher.recipient')}</dt><dd className="font-bold text-white">{voucher.recipientName}</dd>
            <dt className="text-slate-400">{t('operations.voucher.totalRevenue')}</dt><dd className="font-bold text-white">{money(voucher.totalRevenue, i18n.language)}</dd>
            <dt className="text-slate-400">{t('operations.voucher.centerShare')}</dt><dd className="font-bold text-white">{money(voucher.centerShare, i18n.language)}</dd>
            <dt className="text-slate-400">{t('operations.voucher.teacherPayout')}</dt><dd className="font-bold text-emerald-300">{money(voucher.teacherPayout, i18n.language)}</dd>
            <dt className="text-slate-400">{t('operations.voucher.method')}</dt><dd className="font-bold text-white">{t(`paymentMethods.${voucher.payoutMethod.toLowerCase()}`, voucher.payoutMethod)}</dd>
            <dt className="text-slate-400">{t('operations.voucher.time')}</dt><dd className="font-bold text-white">{formatDate(voucher.settledAt, i18n.language)}</dd>
          </dl>
        </div>
      )}
      {loading ? (
        <LoadingState />
      ) : sessions.length === 0 ? (
        <EmptyState message={t('operations.lobby.empty')} />
      ) : (
        <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <Select
            label={t(`operations.${kind}.session`)}
            value={sessionId}
            onChange={(value) => { setSessionId(value); setConfirming(false); }}
            options={sessions.map((item) => ({
              value: item.id,
              label: kind === 'reconciliation' ? `${item.title} (${item.currentLobbyCount})` : item.title,
            }))}
          />
          {kind === 'reconciliation' ? (
            <>
              <p className="text-sm text-slate-400">
                {t('operations.reconciliation.lobbyCount')}: {selected?.currentLobbyCount ?? '-'}
              </p>
              <Field label={t('operations.reconciliation.assistantCount')} value={first} onChange={(v) => { setFirst(v); setConfirming(false); }} type="number" />
              <Field label={t('operations.reconciliation.headcount')} value={second} onChange={(v) => { setSecond(v); setConfirming(false); }} type="number" />
              <Field label={t('operations.reconciliation.notes')} value={notes} onChange={(v) => { setNotes(v); setConfirming(false); }} required={false} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Metric label={t('operations.settlement.price')} value={money(selected?.sessionPrice, i18n.language)} />
                <Metric label={t('operations.settlement.centerFee')} value={money(selected?.centerFeePerStudent, i18n.language)} />
              </div>
              <Select
                label={t('operations.settlement.payment')}
                value={first}
                onChange={(v) => { setFirst(v); setConfirming(false); }}
                options={[
                  { value: 'CASH', label: t('paymentMethods.cash') },
                  { value: 'VODAFONE_CASH', label: t('paymentMethods.vodafoneCash') },
                  { value: 'INSTAPAY', label: t('paymentMethods.instapay') },
                ]}
              />
              <Field label={t('operations.settlement.recipient')} value={second} onChange={(v) => { setSecond(v); setConfirming(false); }} />
            </>
          )}
          {confirming && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-200">{t(`operations.${kind}.confirmTitle`)}</p>
              <p className="mt-1 text-sm text-amber-100/80">{t(`operations.${kind}.confirmBody`)}</p>
              <div className="mt-3 flex gap-2">
                <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold">
                  {pending ? t('ui.processing') : t('actions.confirm')}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">
                  {t('actions.cancel')}
                </button>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={!sessionId || pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? t('ui.processing') : t(kind === 'reconciliation' ? 'actions.reconcile' : 'actions.settlePayout')}
          </button>
        </form>
      )}
    </section>
  );
}

function voucherHtml(t: TFunction, voucher: Voucher): string {
  const method = t(`paymentMethods.${voucher.payoutMethod.toLowerCase()}`, voucher.payoutMethod);
  const payValue = (value: number) => formatMoney(Number(value || 0), 'ar');
  return `
    <h1>${t('operations.voucher.title')}</h1>
    <p class="sub">${voucher.sessionTitle}</p>
    <div class="row"><strong>${t('operations.voucher.recipient')}</strong><span>${voucher.recipientName}</span></div>
    <div class="row"><strong>${t('operations.voucher.totalRevenue')}</strong><span>${payValue(voucher.totalRevenue)}</span></div>
    <div class="row"><strong>${t('operations.voucher.centerShare')}</strong><span>${payValue(voucher.centerShare)}</span></div>
    <div class="row"><strong>${t('operations.voucher.teacherPayout')}</strong><span>${payValue(voucher.teacherPayout)}</span></div>
    <div class="row"><strong>${t('operations.voucher.method')}</strong><span>${method}</span></div>
    <div class="total"><div class="row"><strong>${t('operations.voucher.teacherPayout')}</strong><span>${payValue(voucher.teacherPayout)}</span></div></div>
    <p class="muted">${formatDate(voucher.settledAt, 'ar')}</p>`;
}

function ReportsPage() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [shiftId, setShiftId] = useState('');
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [history, setHistory] = useState<ShiftHistoryRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadReport() {
    if (reportLoading) return;
    setReportLoading(true);
    setError('');
    try {
      setReport(await request<Record<string, unknown>>(`/reports/daily?date=${date}`));
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.loadError')));
    } finally {
      setReportLoading(false);
    }
  }

  async function loadAudit() {
    if (!shiftId || auditLoading) return;
    setAuditLoading(true);
    setError('');
    try {
      setEntries((await request<{ entries: Record<string, unknown>[] }>(`/reports/shifts/${shiftId}/audit`)).entries);
    } catch (err) {
      setError(mapApiErrorMessage(err, t, t('operations.loadError')));
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadHistory() {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      setHistory((await request<{ shifts: ShiftHistoryRow[] }>('/shifts/history')).shifts);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  const actionLabel = (action: string) => t(`audit.${action}`, { defaultValue: action });

  return (
    <section className="space-y-6">
      <PageHeader icon={BarChart3} title={t('operations.reports.title')} subtitle={t('operations.reports.subtitle')} />
      <Notice error={error} success="" />
      <div className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="report-date">
          {t('operations.reports.load')}
        </label>
        <input
          id="report-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
        />
        <button
          type="button"
          disabled={reportLoading}
          onClick={() => void loadReport()}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-bold disabled:opacity-60"
        >
          {reportLoading ? t('ui.processing') : t('operations.reports.load')}
        </button>
      </div>
      {report && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {['totalAttendees', 'centerNetRevenue', 'teacherPayouts', 'digitalCollections'].map((key) => (
            <Metric
              key={key}
              label={t(`operations.reports.${key}`)}
              value={key === 'totalAttendees' ? String(report[key] ?? 0) : money(report[key] as number, i18n.language)}
            />
          ))}
        </div>
      )}
      <div className="max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-5">
        <Field label={t('operations.reports.shiftId')} value={shiftId} onChange={(v) => { setShiftId(v); setEntries([]); }} />
        <button
          type="button"
          disabled={!shiftId || auditLoading}
          onClick={() => void loadAudit()}
          className="mt-3 rounded-lg border border-slate-700 px-4 py-2 font-bold disabled:opacity-60"
        >
          {auditLoading ? t('ui.processing') : t('operations.reports.loadAudit')}
        </button>
        {auditLoading ? (
          <div className="mt-4">
            <LoadingState />
          </div>
        ) : entries.length > 0 ? (
          <div className="mt-4 space-y-2">
            {entries.map((entry, index) => (
              <div key={`${String(entry.id || index)}`} className="rounded-lg border border-slate-800 p-3 text-sm">
                <span className="font-bold text-emerald-300">{actionLabel(String(entry.action))}</span>
                <code className="ms-2 text-[10px] text-slate-500">{String(entry.action)}</code>
                <span className="ms-3 text-slate-400">{formatDate(String(entry.createdAt), i18n.language)}</span>
                {entry.amount !== null && entry.amount !== undefined && <span className="ms-3 text-amber-300">{money(entry.amount as number, i18n.language)}</span>}
              </div>
            ))}
          </div>
        ) : (
          shiftId && (
            <div className="mt-4">
              <EmptyState message={t('operations.auditEmpty')} />
            </div>
          )
        )}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="font-bold text-slate-200">{t('operations.reports.shiftHistory')}</h3>
        {historyLoading ? (
          <div className="mt-4">
            <LoadingState />
          </div>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('operations.reports.historyEmpty')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start">{t('operations.reports.desk')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('operations.reports.openedAt')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('operations.reports.closedAt')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('operations.shift.totalCashCollected')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('operations.reports.actualCash')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('operations.reports.cashVariance')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((shift) => (
                  <tr key={shift.id} className="border-t border-slate-800 bg-slate-950">
                    <td className="px-3 py-3 font-bold text-white">{shift.deskIdentifier}</td>
                    <td className="px-3 py-3 text-slate-400">{formatDate(shift.openedAt, i18n.language)}</td>
                    <td className="px-3 py-3 text-slate-400">{formatDate(shift.closedAt, i18n.language)}</td>
                    <td className="px-3 py-3 text-slate-300">{money(shift.expectedCashInDrawer, i18n.language)}</td>
                    <td className="px-3 py-3 text-slate-300">{money(shift.actualCashCounted, i18n.language)}</td>
                    <td className={`px-3 py-3 font-bold ${shift.cashVariance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(shift.cashVariance, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <input
        required={required}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? '0.01' : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
    </div>
  );
}