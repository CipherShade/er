import { useState, type FormEvent } from 'react';
import { Building2, UserRound, Phone, KeyRound, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Banner } from '../components/ui/kit';
import { EGYPTIAN_MOBILE_REGEX } from '../../shared/constants/index';
import { PURCHASABLE_PLAN_IDS, PLANS } from '../../shared/constants/plans';
import type { TenantPlan } from '../../shared/constants/index';

interface SignupPageProps {
  onNavigateLogin?: () => void;
  onNavigateLanding?: () => void;
}

export function SignupPage({ onNavigateLogin, onNavigateLanding }: SignupPageProps) {
  const { registerCenter } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [centerName, setCenterName] = useState('');
  const [plan, setPlan] = useState<'ESSENTIAL' | 'CONTROL'>(PURCHASABLE_PLAN_IDS[0] as 'ESSENTIAL' | 'CONTROL');

  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validateStep1 = () => {
    setError('');
    if (!centerName.trim() || centerName.trim().length < 2) {
      setError('يرجى إدخال اسم السنتر (حرفين على الأقل).');
      return false;
    }
    return true;
  };

  const handleNextStep = (e: FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleFinalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ownerName.trim() || ownerName.trim().length < 2) {
      setError('يرجى إدخال اسم مدير أو مالك السنتر.');
      return;
    }

    if (!EGYPTIAN_MOBILE_REGEX.test(ownerPhone.trim())) {
      setError('يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ (010, 011, 012, 015).');
      return;
    }

    if (!username.trim() || username.trim().length < 3) {
      setError('اسم المستخدم يجب أن يكون 3 أحرف على الأقل بالإنجليزية أو أرقام.');
      return;
    }

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 خانات على الأقل.');
      return;
    }

    setSubmitting(true);
    try {
      await registerCenter({
        centerName: centerName.trim(),
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        username: username.trim().toLowerCase(),
        password,
        plan,
      });
      // AuthProvider automatically sets user and redirects to AppShell
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إنشاء السنتر، يرجى المحاولة مرة أخرى.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-bg">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="login-logo" style={{ cursor: 'pointer', margin: 0 }} onClick={onNavigateLanding}>
            م
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8f5ef', color: '#0e7c56', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            <Sparkles className="h-3.5 w-3.5" /> يُفعَّل الاشتراك فورًا
          </span>
        </div>

        <h1 className="login-title" style={{ fontSize: 22, marginTop: 4 }}>
          {step === 1 ? 'إنشاء حساب سنتر تعليمي جديد' : 'بيانات مدير السنتر والحساب'}
        </h1>
        <p className="login-sub">
          {step === 1
            ? 'خطوة 1 من 2: أدخل اسم سنترك واختر باقتك'
            : 'خطوة 2 من 2: أنشئ حساب الدخول الرئيسي لإدارة السنتر'}
        </p>

        {/* Step Progress Bar */}
        <div style={{ display: 'flex', gap: 6, margin: '14px 0 20px' }}>
          <div style={{ height: 4, flex: 1, borderRadius: 99, background: '#0e7c56' }} />
          <div style={{ height: 4, flex: 1, borderRadius: 99, background: step === 2 ? '#0e7c56' : '#e2e0dc' }} />
        </div>

        <Banner text={error} tone="error" />

        {step === 1 ? (
          <form onSubmit={handleNextStep} className="form-stack">
            <label className="field">
              <span className="field-label">اسم السنتر / المركز التعليمي *</span>
              <div className="searchbar">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  placeholder="مثال: سنتر الأوائل التعليمي"
                  required
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                />
              </div>
            </label>

            <div style={{ marginTop: 8 }}>
              <span className="field-label" style={{ display: 'block', marginBottom: 8 }}>
                اختر باقتك — سيُفعَّل اشتراكك فور إنشاء الحساب
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
                {PURCHASABLE_PLAN_IDS.map((planId) => {
                  const planConfig = PLANS[planId as TenantPlan];
                  const isSelected = plan === planId;
                  return (
                    <div
                      key={planId}
                      onClick={() => setPlan(planId as 'ESSENTIAL' | 'CONTROL')}
                      style={{
                        border: `2px solid ${isSelected ? '#0e7c56' : '#e2e0dc'}`,
                        background: isSelected ? '#f0faf5' : '#fff',
                        borderRadius: 12,
                        padding: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b style={{ fontSize: 15 }}>{planConfig.nameAr}</b>
                        {isSelected && <Check className="h-4 w-4 text-emerald-700" />}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0e7c56', margin: '4px 0' }}>
                        {planConfig.priceEgp} ج.م/شهر
                      </div>
                      <small style={{ fontSize: 10, color: '#6b7280' }}>{planConfig.taglineAr}</small>
                    </div>
                  );
                })}
              </div>
            </div>

            <button type="submit" className="btn btn--primary" style={{ width: '100%', paddingBlock: 12, marginTop: 12 }}>
              المتابعة لبيانات الحساب <ArrowLeft className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleFinalSubmit} className="form-stack">
            <label className="field">
              <span className="field-label">اسم المدير / المالك *</span>
              <div className="searchbar">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  placeholder="مثال: أ/ محمود الشريف"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">رقم الهاتف (موبايل مصري) *</span>
              <div className="searchbar">
                <Phone className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  type="tel"
                  placeholder="01012345678"
                  required
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">اسم المستخدم للدخول (إنجليزي) *</span>
              <div className="searchbar">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  placeholder="admin_center"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">كلمة المرور (8 خانات على الأقل) *</span>
              <div className="searchbar">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn--secondary"
                style={{ flex: 1, paddingBlock: 12 }}
                disabled={submitting}
              >
                <ArrowRight className="h-4 w-4" /> السابق
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                style={{ flex: 2, paddingBlock: 12 }}
                disabled={submitting}
              >
                {submitting ? 'جاري إنشاء السنتر...' : 'إنشاء السنتر وتفعيل الاشتراك'}
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8, flexWrap: 'wrap' }}>
          {onNavigateLanding && (
            <button type="button" onClick={onNavigateLanding} className="btn-link" style={{ color: 'var(--text-secondary)' }}>
              ← العودة للرئيسية
            </button>
          )}
          {onNavigateLogin && (
            <button type="button" onClick={onNavigateLogin} className="btn-link" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              لديك حساب بالفعل؟ تسجيل الدخول
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
