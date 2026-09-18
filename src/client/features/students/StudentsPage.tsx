import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Search, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { Avatar, Banner, EmptyState, PageHeader, Pill, notify } from '../../components/ui/kit';

type Student = { id: string; studentCode: string; fullName: string; studentPhone: string | null; guardianPhone: string; academicStage: string; schoolType: string; notes: string | null };
type StudentForm = Omit<Student, 'id' | 'studentCode' | 'notes'> & { notes: string };
const emptyForm: StudentForm = { fullName: '', studentPhone: '', guardianPhone: '', academicStage: '', schoolType: 'GENERAL', notes: '' };

const SCHOOL_TONE: Record<string, 'primary' | 'accent' | 'muted'> = { GENERAL: 'primary', LANGUAGES: 'accent', AZHAR: 'muted' };

export function StudentsPage() {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<StudentForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async (value = search) => {
    try { setStudents((await api<{ students: Student[] }>(`/registry/students?search=${encodeURIComponent(value)}`)).students); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('students.loadError')); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [search]);

  const startEdit = (student: Student) => {
    setEditingId(student.id);
    setForm({ fullName: student.fullName, studentPhone: student.studentPhone || '', guardianPhone: student.guardianPhone, academicStage: student.academicStage, schoolType: student.schoolType, notes: student.notes || '' });
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('students.confirmDelete'))) return;
    try { await api(`/registry/students/${id}`, { method: 'DELETE' }); notify(t('management.delete')); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('students.deleteError')); }
  };

  return (
    <section>
      <PageHeader
        kicker={t('navigation.groups.registries')}
        title={t('students.title')}
        subtitle={t('students.sectionLabel')}
        actions={hasRole('ADMIN', 'RECEPTIONIST') && (
          <button type="button" className="btn btn--primary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
            <Plus className="h-4 w-4" />{t('students.quickAdd')}
          </button>
        )}
      />
      <Banner text={error} tone="error" />
      <div className="searchbar" style={{ marginBottom: 16 }}>
        <Search className="h-4 w-4" />
        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('students.search')} />
      </div>

      {form && <StudentForm form={form} id={editingId} onChange={setForm} onDone={() => { setForm(null); void load(); }} onCancel={() => setForm(null)} />}

      {students.length === 0 ? (
        <EmptyState text={t('students.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {['code', 'name', 'phone', 'stage', 'school', 'actions'].map((key) => <th key={key}>{t(`students.table.${key}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td><span className="cell-mono">{student.studentCode}</span></td>
                  <td>
                    <div className="flex-gap">
                      <Avatar name={student.fullName} size={30} />
                      <span style={{ fontWeight: 700 }}>{student.fullName}</span>
                    </div>
                  </td>
                  <td className="cell-muted">{student.guardianPhone || '—'}</td>
                  <td>{student.academicStage || '—'}</td>
                  <td><Pill tone={SCHOOL_TONE[student.schoolType] ?? 'muted'}>{t(`students.school.${(student.schoolType || 'GENERAL').toLowerCase()}`)}</Pill></td>
                  <td>
                    <div className="flex-gap">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEdit(student)}><Pencil className="h-3.5 w-3.5" />{t('management.edit')}</button>
                      <button type="button" className="btn btn--danger-soft btn--sm" onClick={() => void remove(student.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StudentForm({ form, id, onChange, onDone, onCancel }: { form: StudentForm; id: string | null; onChange: (form: StudentForm) => void; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const set = (key: keyof StudentForm, value: string) => onChange({ ...form, [key]: value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/registry/students${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      notify(id ? t('management.save') : t('students.quickAdd'));
      onDone();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('students.saveError')); }
  }

  return (
    <form onSubmit={submit} className="card card-pad" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))' }}>
      <div className="flex-between" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ margin: 0 }}>{id ? t('students.edit') : t('students.quickAdd')}</h3>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label={t('actions.close')}><X className="h-4 w-4" /></button>
      </div>
      {error && <Banner text={error} tone="error" />}
      <div className="form-grid">
        <Field label={t('students.form.name')} value={form.fullName} onChange={(value) => set('fullName', value)} required />
        <Field label={t('students.form.studentPhone')} value={form.studentPhone || ''} onChange={(value) => set('studentPhone', value)} />
        <Field label={t('students.form.guardianPhone')} value={form.guardianPhone} onChange={(value) => set('guardianPhone', value)} required />
        <Field label={t('students.form.stage')} value={form.academicStage} onChange={(value) => set('academicStage', value)} required />
        <label className="field">
          <span className="field-label">{t('students.form.school')}</span>
          <select className="select" value={form.schoolType} onChange={(event) => set('schoolType', event.target.value)}>
            <option value="GENERAL">{t('students.school.general')}</option>
            <option value="LANGUAGES">{t('students.school.languages')}</option>
            <option value="AZHAR">{t('students.school.azhar')}</option>
          </select>
        </label>
        <Field label={t('students.notes')} value={form.notes} onChange={(value) => set('notes', value)} />
      </div>
      <button className="btn btn--primary mt-4"><Save className="h-4 w-4" />{t('students.save')}</button>
    </form>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="input" required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}