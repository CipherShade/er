import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, History, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { apiUrl } from '../../lib/config';
import { EGYPTIAN_MOBILE, formatDate, formatMoney } from '../../lib/format';
import { ACADEMIC_STAGES } from '../../../shared/constants/index';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/AsyncState';

type Student = { id: string; studentCode: string; fullName: string; studentPhone: string | null; guardianPhone: string; academicStage: string; schoolType: string; notes: string | null };
type StudentForm = Omit<Student, 'id' | 'studentCode' | 'notes'> & { notes: string };
type Pagination = { page: number; limit: number; total: number; pages: number };
type HistoryEntry = { id: string; sessionTitle: string; teacherName: string; startTime: string; amountPaid: number; sessionPrice: number; remainingDue: number; paymentMethod: string; status: string; deskIdentifier: string };
type HistoryPayload = { student: { id: string; fullName: string }; attendances: HistoryEntry[]; summary: { totalPaid: number; totalOwed: number; sessions: number } };

const emptyForm: StudentForm = { fullName: '', studentPhone: '', guardianPhone: '', academicStage: ACADEMIC_STAGES[0].id, schoolType: 'GENERAL', notes: '' };
const PAGE_SIZE = 25;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(`/api/registry${path}`), { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) throw new Error('REQUEST_FAILED');
  return (await response.json() as { data: T }).data;
}

export function StudentsPage() {
  const { t, i18n } = useTranslation();
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'RECEPTIONIST');
  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<StudentForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async (value = search, page = pagination.page) => {
    setLoading(true);
    try {
      const data = await request<{ students: Student[]; pagination: Pagination }>(`/students?search=${encodeURIComponent(value)}&page=${page}&pageSize=${PAGE_SIZE}`);
      setStudents(data.students);
      setPagination(data.pagination);
      setError('');
    } catch {
      setError(t('students.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEditingId(null);
      void load(search, 1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const startEdit = (student: Student) => {
    setEditingId(student.id);
    setForm({ fullName: student.fullName, studentPhone: student.studentPhone || '', guardianPhone: student.guardianPhone, academicStage: student.academicStage, schoolType: student.schoolType, notes: student.notes || '' });
  };

  async function remove(id: string) {
    if (typeof window === 'undefined' || !window.confirm(t('students.confirmDelete')) || deleting) return;
    setDeleting(id);
    try {
      await request(`/students/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      setError(t('students.deleteError'));
    } finally {
      setDeleting(null);
    }
  }

  async function showHistory(id: string, fullName: string) {
    setHistoryLoading(true);
    setHistory(null);
    setError('');
    try {
      const data = await request<HistoryPayload>(`/students/${id}/attendances`);
      setHistory({ ...data, student: { id, fullName } });
    } catch {
      setError(t('students.loadError'));
    } finally {
      setHistoryLoading(false);
    }
  }

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.pages) return;
    void load(search, page);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{t('students.sectionLabel')}</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{t('students.title')}</h2>
        </div>
        {canEdit && (
          <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold">
            <Plus className="h-4 w-4" />{t('students.quickAdd')}
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('students.search')} className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 ps-10 pe-3 text-white outline-none focus:border-emerald-500" />
      </div>
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {form && <StudentEditor form={form} id={editingId} onDone={() => { setForm(null); void load(); }} onChange={setForm} onCancel={() => setForm(null)} />}
      {loading ? (
        <LoadingState />
      ) : students.length === 0 ? (
        <EmptyState message={t('students.empty')} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[760px] text-start text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  {['code', 'name', 'phone', 'stage', 'school'].map((key) => (
                    <th key={key} scope="col" className="px-4 py-3 text-start">{t(`students.table.${key}`)}</th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-start">{t('students.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-t border-slate-800 bg-slate-950">
                    <td className="px-4 py-4 font-mono text-xs text-emerald-400">{student.studentCode}</td>
                    <td className="px-4 py-4 font-bold text-white">{student.fullName}</td>
                    <td className="px-4 py-4 text-slate-400" dir="ltr">{student.studentPhone || '—'}</td>
                    <td className="px-4 py-4 text-slate-400">{student.academicStage}</td>
                    <td className="px-4 py-4 text-slate-400">{t(`students.school.${student.schoolType.toLowerCase()}`, student.schoolType)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" onClick={() => void showHistory(student.id, student.fullName)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/10">
                          <History className="h-3.5 w-3.5" />{t('students.table.history')}
                        </button>
                        {canEdit && (
                          <>
                            <button type="button" onClick={() => startEdit(student)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800">
                              <Pencil className="h-3.5 w-3.5" />{t('students.edit')}
                            </button>
                            {!student.studentPhone && (
                              <button type="button" disabled={deleting === student.id} onClick={() => void remove(student.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                                <Trash2 className="h-3.5 w-3.5" />{deleting === student.id ? t('ui.processing') : t('management.delete')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">{t('students.pagination', { page: pagination.page, total: pagination.pages })}</p>
            <div className="flex gap-2">
              <button type="button" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-40">
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />{t('pagination.prev')}
              </button>
              <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => goToPage(pagination.page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-40">
                {t('pagination.next')}<ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </>
      )}
      {(historyLoading || history) && (
        <div className="rounded-xl border border-sky-500/25 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-bold text-white">
              <History className="h-5 w-5 text-sky-400" />{t('students.history')} — {history?.student.fullName ?? ''}
            </h3>
            <button type="button" onClick={() => { setHistory(null); setHistoryLoading(false); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800" aria-label={t('actions.close')}>
              <X className="h-5 w-5" />
            </button>
          </div>
          {historyLoading ? (
            <div className="mt-4"><LoadingState /></div>
          ) : history ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.45fr]">
              <div className="space-y-2">
                {history.attendances.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('students.historyEmpty')}</p>
                ) : (
                  history.attendances.map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                      <div>
                        <p className="font-bold text-white">{entry.sessionTitle} — <span className="text-xs font-normal text-slate-400">{entry.teacherName}</span></p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(entry.startTime, i18n.language)} · {entry.deskIdentifier} · {t(`paymentMethods.${entry.paymentMethod.toLowerCase()}`, entry.paymentMethod)}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-bold text-emerald-300">{formatMoney(entry.amountPaid, i18n.language)}</p>
                        {entry.remainingDue > 0 && <p className="text-xs text-amber-300">{t('operations.receipt.remaining')}: {formatMoney(entry.remainingDue, i18n.language)}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="h-fit rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs font-bold text-slate-400">{t('students.summaryTitle')}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-400">{t('students.sessionsCount')}</dt><dd className="font-bold text-white">{history.summary.sessions}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">{t('students.totalPaid')}</dt><dd className="font-bold text-emerald-300">{formatMoney(history.summary.totalPaid, i18n.language)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">{t('students.totalOwed')}</dt><dd className={`font-bold ${history.summary.totalOwed > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{formatMoney(history.summary.totalOwed, i18n.language)}</dd></div>
                </dl>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function StudentEditor({ form, id, onChange, onDone, onCancel }: { form: StudentForm; id: string | null; onChange: (form: StudentForm) => void; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof StudentForm, value: string) => onChange({ ...form, [key]: value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (form.studentPhone && !EGYPTIAN_MOBILE.test(form.studentPhone)) {
      setError(t('students.phoneError'));
      return;
    }
    if (!EGYPTIAN_MOBILE.test(form.guardianPhone)) {
      setError(t('students.phoneError'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await request(`/students${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message.includes('INVALID_PHONE') ? t('errors.INVALID_PHONE', { defaultValue: t('students.phoneError') }) : t('students.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-emerald-500/20 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold">{id ? t('students.edit') : t('students.quickAdd')}</h3>
        <button type="button" onClick={onCancel} aria-label={t('actions.close')}><X className="h-5 w-5" /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('students.form.name')} value={form.fullName} onChange={(value) => set('fullName', value)} required />
        <Field label={t('students.form.studentPhone')} value={form.studentPhone || ''} onChange={(value) => set('studentPhone', value)} type="tel" required={false} />
        <Field label={t('students.form.guardianPhone')} value={form.guardianPhone} onChange={(value) => set('guardianPhone', value)} type="tel" required />
        <label className="text-sm font-semibold text-slate-300">
          {t('students.form.stage')}
          <select required value={form.academicStage} onChange={(event) => set('academicStage', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white">
            {ACADEMIC_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.labelAr}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-300">
          {t('students.form.school')}
          <select value={form.schoolType} onChange={(event) => set('schoolType', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white">
            <option value="GENERAL">{t('students.school.general')}</option>
            <option value="LANGUAGES">{t('students.school.languages')}</option>
            <option value="AZHAR">{t('students.school.azhar')}</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-300 sm:col-span-2">
          {t('students.form.notes')}
          <textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500" />
        </label>
      </div>
      {error && <ErrorState message={error} />}
      <div className="mt-5 flex flex-wrap gap-2">
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold disabled:opacity-60">
          <Save className="h-4 w-4" />{saving ? t('students.saving') : t('students.save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">{t('actions.cancel')}</button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, required, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return (
    <label className="text-sm font-semibold text-slate-300">
      {label}
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500" />
    </label>
  );
}