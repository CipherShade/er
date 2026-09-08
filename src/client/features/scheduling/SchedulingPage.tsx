import { useEffect, useState, type FormEvent } from 'react';
import { CalendarPlus, Clock3, MapPin, Pencil, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { apiUrl } from '../../lib/config';
import { formatMoney, toDateTimeLocal } from '../../lib/format';

type Session = { id: string; title: string; academicStage: string; startTime: string; endTime: string; sessionPrice: string; centerFeePerStudent: string; status: string; teacher: { id: string; fullName: string; subject: string }; room: { id: string; name: string } };
type Option = { id: string; name?: string; fullName?: string; subject?: string };
const request = async <T,>(path: string, options?: RequestInit): Promise<T> => { const response = await fetch(apiUrl(`/api${path}`), { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } }); const body = await response.json() as { data: T; error?: { message?: string; messageEn?: string } }; if (!response.ok) throw new Error(body.error?.message || body.error?.messageEn || 'Request failed'); return body.data; };

export function SchedulingPage() {
  const { t, i18n } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [teachers, setTeachers] = useState<Option[]>([]);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [editor, setEditor] = useState<{ session: Session | null } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const [sessionData, teacherData, roomData] = await Promise.all([request<{ sessions: Session[] }>('/scheduling/sessions'), request<{ teachers: Option[] }>('/management/teachers'), request<{ rooms: Option[] }>('/management/rooms')]);
      setSessions(sessionData.sessions);
      setTeachers(teacherData.teachers);
      setRooms(roomData.rooms);
    } catch {
      setError(t('scheduling.loadError'));
    }
  };
  useEffect(() => { void load(); }, []);

  async function cancelSession(session: Session) {
    if (session.status === 'COMPLETED' || typeof window === 'undefined' || !window.confirm(t('scheduling.cancelConfirm'))) return;
    setError('');
    setSuccess('');
    try {
      await request(`/scheduling/sessions/${session.id}`, { method: 'DELETE' });
      setSuccess(t('scheduling.cancelled'));
      await load();
    } catch {
      setError(t('scheduling.saveError'));
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{t('scheduling.sectionLabel')}</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{t('scheduling.title')}</h2>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setEditor((value) => (value ? null : { session: null }))} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500">
            <CalendarPlus className="h-4 w-4" />{t('scheduling.add')}
          </button>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {success && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{success}</p>}
      {editor && (
        <SessionForm
          key={editor.session?.id ?? 'new'}
          session={editor.session}
          teachers={teachers}
          rooms={rooms}
          onDone={() => {
            setEditor(null);
            setSuccess(t('scheduling.saved', { defaultValue: t('scheduling.save') }));
            void load();
          }}
          onCancel={() => setEditor(null)}
        />
      )}
      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-400">{t('scheduling.empty')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const locked = session.status === 'COMPLETED';
            return (
              <article key={session.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-emerald-400">{session.teacher.subject}</p>
                    <h3 className="mt-1 font-bold text-white">{session.title}</h3>
                    <p className="text-sm text-slate-400">{session.teacher.fullName} · {session.academicStage}</p>
                  </div>
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-300">{t(`status.${session.status.toLowerCase()}`, session.status)}</span>
                </div>
                <div className="mt-5 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-300">
                  <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" />{new Date(session.startTime).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'ar-EG')} - {new Date(session.endTime).toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'ar-EG')}</p>
                  <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-500" />{session.room.name}</p>
                  <p className="font-semibold text-amber-300">{formatMoney(Number(session.sessionPrice || 0), i18n.language)}</p>
                </div>
                {isAdmin && (
                  <div className="mt-4 flex gap-2 border-t border-slate-800 pt-4">
                    <button type="button" disabled={locked} onClick={() => setEditor({ session })} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                      <Pencil className="h-3.5 w-3.5" />{t('scheduling.edit')}
                    </button>
                    <button type="button" disabled={locked} onClick={() => void cancelSession(session)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">
                      <X className="h-3.5 w-3.5" />{t('scheduling.cancel')}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SessionForm({ session, teachers, rooms, onDone, onCancel }: { session: Session | null; teachers: Option[]; rooms: Option[]; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => (session
    ? {
        teacherId: session.teacher.id || teachers[0]?.id || '',
        roomId: session.room.id || rooms[0]?.id || '',
        title: session.title,
        academicStage: session.academicStage,
        startTime: toDateTimeLocal(new Date(session.startTime)),
        endTime: toDateTimeLocal(new Date(session.endTime)),
        sessionPrice: session.sessionPrice,
        centerFeePerStudent: session.centerFeePerStudent,
      }
    : { teacherId: teachers[0]?.id || '', roomId: rooms[0]?.id || '', title: '', academicStage: '', startTime: '', endTime: '', sessionPrice: '100', centerFeePerStudent: '20' }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await request(session ? `/scheduling/sessions/${session.id}` : '/scheduling/sessions', {
        method: session ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, sessionPrice: Number(form.sessionPrice), centerFeePerStudent: Number(form.centerFeePerStudent), startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString() }),
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('scheduling.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const fields = [['title', t('scheduling.form.title')], ['academicStage', t('scheduling.form.stage')], ['startTime', t('scheduling.form.start')], ['endTime', t('scheduling.form.end')], ['sessionPrice', t('scheduling.form.price')], ['centerFeePerStudent', t('scheduling.form.fee')]];

  return (
    <form onSubmit={submit} className="rounded-xl border border-emerald-500/20 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold">{session ? t('scheduling.edit') : t('scheduling.add')}</h3>
        <button type="button" onClick={onCancel} aria-label={t('actions.close')}><X className="h-5 w-5" /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-300">{t('scheduling.form.teacher')}
          <select value={form.teacherId} onChange={(event) => set('teacherId', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{teachers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>
        </label>
        <label className="text-sm font-semibold text-slate-300">{t('scheduling.form.room')}
          <select value={form.roomId} onChange={(event) => set('roomId', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </label>
        {fields.map(([key, label]) => (
          <label key={key} className="text-sm font-semibold text-slate-300">{label}
            <input required type={key.includes('Time') ? 'datetime-local' : key === 'sessionPrice' || key === 'centerFeePerStudent' ? 'number' : 'text'} min={key === 'sessionPrice' || key === 'centerFeePerStudent' ? 0 : undefined} step={key === 'sessionPrice' || key === 'centerFeePerStudent' ? '0.01' : undefined} value={form[key as keyof typeof form]} onChange={(event) => set(key, event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-emerald-500" />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-500 disabled:opacity-60">
          <Save className="h-4 w-4" />{saving ? t('ui.processing') : t('scheduling.save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">{t('actions.cancel')}</button>
      </div>
    </form>
  );
}