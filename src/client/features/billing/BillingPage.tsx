import { useState, useEffect } from 'react';
import { Check, Sparkles, History } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { notify } from '../../components/ui/kit';
import { apiUrl } from '../../lib/config';

type SubscriptionItem = {
  id: string;
  plan: string;
  status: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  createdAt: string;
};

type TenantDetails = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trialEndsAt: string | null;
  isActive: boolean;
  maxDesks: number;
  maxBranches: number;
};

export function BillingPage() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(0);
  const [isTrialActive, setIsTrialActive] = useState<boolean>(false);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'GROWTH' | 'BUSINESS'>('BUSINESS');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'VODAFONE_CASH' | 'INSTAPAY' | 'CASH'>('VODAFONE_CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const fetchSubscriptionDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/subscriptions/current'), { credentials: 'include' });
      const json = (await res.json()) as {
        data?: {
          tenant: TenantDetails;
          trialDaysRemaining: number;
          isTrialActive: boolean;
          subscriptions: SubscriptionItem[];
        };
      };
      if (json.data) {
        setTenant(json.data.tenant);
        setTrialDaysRemaining(json.data.trialDaysRemaining);
        setIsTrialActive(json.data.isTrialActive);
        setSubscriptions(json.data.subscriptions);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptionDetails();
  }, []);

  const handleUpgradeSubmit = async () => {
    setIsUpgrading(true);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/upgrade'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: selectedPlan,
          paymentMethod: selectedPaymentMethod,
          paymentReference: paymentReference.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'فشلت عملية الترقية');
      notify('تمت ترقية الاشتراك بنجاح! ✓', 'success');
      setShowPaymentModal(false);
      void fetchSubscriptionDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الترقية';
      notify(msg, 'error');
    } finally {
      setIsUpgrading(false);
    }
  };

  const currentPlan = tenant?.plan || user?.tenant?.plan || 'FREE_TRIAL';

  if (loading) {
    return (
      <div className="page" dir="rtl" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>جاري تحميل بيانات الاشتراك والفوترة...</p>
      </div>
    );
  }

  return (
    <div className="page" dir="rtl">
      <div className="page-head">
        <div>
          <h1 className="page-title">إدارة الاشتراك والفوترة</h1>
          <p className="page-sub">تفاصيل باقة السنتر الحالية، ترقية الاشتراك، وسجل المدفوعات بالجنيه المصري.</p>
        </div>
      </div>

      {/* Trial Alert Banner */}
      {isTrialActive && (
        <div style={{ background: '#e8f5ef', border: '1px solid #c9e8db', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0e7c56', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <b style={{ fontSize: 16, color: '#043128' }}>أنت الآن في فترة التجربة المجانية (14 يوم)</b>
              <p style={{ fontSize: 13, color: '#0b6a4a', margin: '2px 0 0' }}>
                متبقي {trialDaysRemaining} يوم على انتهاء التجربة. جميع ميزات النظام متاحة لك ولطاقم العمل.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setSelectedPlan('BUSINESS');
              setShowPaymentModal(true);
            }}
          >
            تفعيل الاشتراك الدائم
          </button>
        </div>
      )}

      {/* Plans Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 32 }}>
        {/* Growth Plan Card */}
        <div
          style={{
            background: '#fff',
            border: currentPlan === 'GROWTH' ? '2px solid #0e7c56' : '1px solid #e2e0dc',
            borderRadius: 18,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800 }}>Growth</h3>
            {currentPlan === 'GROWTH' && (
              <span style={{ background: '#e8f5ef', color: '#0e7c56', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
                باقتك الحالية
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', minHeight: 40 }}>الخطة المثالية للسناتر ذات الفرع الواحد والمكتب الواحد.</p>
          <div style={{ fontSize: 32, fontWeight: 800, margin: '14px 0' }}>
            299 <span style={{ fontSize: 14, color: '#6b7280' }}>ج.م / شهرياً</span>
          </div>

          <ul style={{ display: 'grid', gap: 10, margin: '14px 0 24px', flex: 1, fontSize: 13 }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-700" /> مكتب استقبال واحد متصل
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-700" /> إدارة الطلاب، المدرسين، والحصص
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-700" /> خزينة الوردية وتصفية المدرسين
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-700" /> التقارير اليومية والمالية
            </li>
          </ul>

          <button
            type="button"
            className="btn btn--secondary"
            disabled={currentPlan === 'GROWTH'}
            onClick={() => {
              setSelectedPlan('GROWTH');
              setShowPaymentModal(true);
            }}
          >
            {currentPlan === 'GROWTH' ? 'باقتك الحالية' : 'الاشتراك في Growth'}
          </button>
        </div>

        {/* Business Plan Card */}
        <div
          style={{
            background: '#043128',
            color: '#fff',
            border: '2px solid #0e7c56',
            borderRadius: 18,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 32px -8px rgba(4, 49, 40, 0.4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Business</h3>
            <span style={{ background: '#f59e0b', color: '#3b2400', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99 }}>
              الأكثر طلباً للسناتر الكبيرة
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#a3d9c1', minHeight: 40 }}>تشغيل متزامن لعدة مكاتب استقبال وإدارة متعددة الفروع.</p>
          <div style={{ fontSize: 32, fontWeight: 800, margin: '14px 0', color: '#fff' }}>
            500 <span style={{ fontSize: 14, color: '#a3d9c1' }}>ج.م / شهرياً</span>
          </div>

          <ul style={{ display: 'grid', gap: 10, margin: '14px 0 24px', flex: 1, fontSize: 13 }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-400" /> كل ميزات باقة Growth
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-400" /> مكاتب استقبال غير محدودة تعمل معاً
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-400" /> دعم وإدارة حتى 5 فروع
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-400" /> تقارير متقدمة وتصدير ملفات Excel
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check className="h-4 w-4 text-emerald-400" /> أولوية في الدعم الفني وتدريب الموظفين
            </li>
          </ul>

          <button
            type="button"
            className="btn btn--primary"
            style={{ background: '#fff', color: '#043128', fontWeight: 800 }}
            disabled={currentPlan === 'BUSINESS' && !isTrialActive}
            onClick={() => {
              setSelectedPlan('BUSINESS');
              setShowPaymentModal(true);
            }}
          >
            {currentPlan === 'BUSINESS' && !isTrialActive ? 'باقتك الحالية' : 'ترقية إلى Business'}
          </button>
        </div>
      </div>

      {/* Subscription Invoices History */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History className="h-5 w-5 text-emerald-700" /> سجل مدفوعات الاشتراك
        </h3>

        {subscriptions.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>لا توجد مدفوعات سابقة حتى الآن (السنتر في فترة التجربة المجانية).</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>تاريخ الدفعة</th>
                  <th>الباقة</th>
                  <th>المبلغ</th>
                  <th>طريقة الدفع</th>
                  <th>المرجع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td>{new Date(sub.createdAt).toLocaleDateString('ar-EG')}</td>
                    <td><b>{sub.plan}</b></td>
                    <td>{sub.amount} ج.م</td>
                    <td>{sub.paymentMethod === 'VODAFONE_CASH' ? 'فودافون كاش' : sub.paymentMethod === 'INSTAPAY' ? 'إنستاباي' : 'كاش'}</td>
                    <td><code style={{ fontSize: 11 }}>{sub.paymentReference}</code></td>
                    <td><span className="badge badge--ok">مفعل</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div className="card" style={{ maxWidth: 460, width: '100%', padding: 24 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
              تأكيد ترقية الاشتراك إلى {selectedPlan}
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
              المبلغ المطلوب: <b>{selectedPlan === 'BUSINESS' ? '500' : '299'} ج.م / شهر</b>
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>طريقة الدفع (مصر):</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn ${selectedPaymentMethod === 'VODAFONE_CASH' ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ fontSize: 12, padding: 8 }}
                    onClick={() => setSelectedPaymentMethod('VODAFONE_CASH')}
                  >
                    فودافون كاش
                  </button>
                  <button
                    type="button"
                    className={`btn ${selectedPaymentMethod === 'INSTAPAY' ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ fontSize: 12, padding: 8 }}
                    onClick={() => setSelectedPaymentMethod('INSTAPAY')}
                  >
                    إنستاباي
                  </button>
                  <button
                    type="button"
                    className={`btn ${selectedPaymentMethod === 'CASH' ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ fontSize: 12, padding: 8 }}
                    onClick={() => setSelectedPaymentMethod('CASH')}
                  >
                    فيزا / كارت
                  </button>
                </div>
              </div>

              {selectedPaymentMethod === 'VODAFONE_CASH' && (
                <div style={{ background: '#f5f7f6', padding: 12, borderRadius: 10, fontSize: 12 }}>
                  <p>يرجى تحويل المبلغ لمحفظة فودافون كاش رقم: <b>01012345678</b></p>
                  <p style={{ color: '#6b7280', marginTop: 4 }}>ثم اكتب رقم المحفظة المحول منها بالأسفل:</p>
                </div>
              )}

              {selectedPaymentMethod === 'INSTAPAY' && (
                <div style={{ background: '#f5f7f6', padding: 12, borderRadius: 10, fontSize: 12 }}>
                  <p>يرجى التحويل على عنوان إنستاباي: <b>madar@instapay</b></p>
                  <p style={{ color: '#6b7280', marginTop: 4 }}>ثم اكتب اسم الحساب أو رقم المرجع بالأسفل:</p>
                </div>
              )}

              <label className="field">
                <span className="field-label">رقم المرجع / رقم التحويل (اختياري)</span>
                <input
                  className="input"
                  placeholder="مثال: TRX-998822"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isUpgrading}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 2 }}
                  onClick={handleUpgradeSubmit}
                  disabled={isUpgrading}
                >
                  {isUpgrading ? 'جاري التفعيل...' : 'تأكيد ودفع الاشتراك'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
