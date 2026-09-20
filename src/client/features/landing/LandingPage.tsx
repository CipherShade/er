import { useState, useEffect } from 'react';
import {
  Check,
  ChevronDown,
  Play,
  Search,
  Users,
  Wallet,
  Coins,
  BarChart3,
  BookOpen,
  Key,
  Building2,
  Clock,
  Scale,
  Receipt,
  Menu,
  X,
} from 'lucide-react';
import './landing.css';

interface LandingPageProps {
  onNavigateLogin?: () => void;
  onNavigateSignup?: () => void;
}

export function LandingPage({ onNavigateLogin, onNavigateSignup }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<'reception' | 'payments' | 'teachers' | 'reports' | 'staff' | 'desks'>('reception');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isPlayingVsl, setIsPlayingVsl] = useState(false);

  // Calculator State
  const [calcStudents, setCalcStudents] = useState<number>(150);
  const [calcNow, setCalcNow] = useState<number>(1.5);
  const [calcWith, setCalcWith] = useState<number>(0.5);

  const hoursSavedPerDay = Math.max(0, (calcStudents * Math.max(calcNow - calcWith, 0)) / 60);
  const hoursSavedPerMonth = hoursSavedPerDay * 26;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCta = () => {
    if (onNavigateSignup) {
      onNavigateSignup();
    } else {
      window.location.hash = '#/signup';
    }
  };

  const handleLogin = () => {
    if (onNavigateLogin) {
      onNavigateLogin();
    } else {
      window.location.hash = '#/login';
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="madar-landing" dir="rtl">
      {/* ================= NAVBAR ================= */}
      <header className={`lp-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="lp-wrap">
          <div className={`lp-nav-pill${mobileMenuOpen ? ' lp-nav-open' : ''}`}>
            <a href="#top" className="lp-brand">
              <span className="lp-logo-sq">م</span>
              <span className="lp-brand-name">مدار</span>
            </a>

            <nav className="lp-nav-links">
              <a href="#features" onClick={() => setMobileMenuOpen(false)}>المميزات</a>
              <a href="#how" onClick={() => setMobileMenuOpen(false)}>كيف يعمل</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>الأسعار</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)}>الأسئلة الشائعة</a>
            </nav>

            <div className="lp-nav-actions">
              <button type="button" onClick={handleLogin} className="lp-nav-login">
                تسجيل الدخول
              </button>
              <button type="button" onClick={handleCta} className="lp-btn lp-btn-primary lp-btn-sm">
                ابدأ تجربتك المجانية
              </button>
            </div>

            <button
              type="button"
              className="lp-nav-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="القائمة"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="lp-hero" id="top">
        <svg className="lp-hero-rings" viewBox="0 0 800 800" aria-hidden="true">
          <circle cx="400" cy="400" r="150" />
          <circle cx="400" cy="400" r="260" />
          <circle cx="400" cy="400" r="370" />
        </svg>

        <div className="lp-wrap lp-hero-grid">
          <div>
            <span className="lp-hero-kicker">مدار — نظام تشغيل وإدارة السنتر بالكامل</span>
            <h1>
              إدارة السنتر بالكامل.
              <br />
              من مكان واحد.
            </h1>
            <p className="lp-hero-lead">
              مدار يساعدك تدير الاستقبال، الحضور، المدفوعات، المدرسين والتقارير — بدون فوضى الدفاتر وجداول الـ Excel.
            </p>

            <div className="lp-hero-actions">
              <button type="button" onClick={handleCta} className="lp-btn lp-btn-primary lp-btn-lg">
                ابدأ تجربتك المجانية لمدة 14 يوم
              </button>
              <a href="#how" className="lp-btn lp-btn-ghost lp-btn-lg">
                شوف مدار بيشتغل إزاي
              </a>
            </div>

            <p className="lp-hero-assure">
              <Check className="h-5 w-5 text-emerald-600" />
              14 يوم مجانًا — بدون التزام وبدون بطاقة بنكية
            </p>
          </div>

          <div>
            {/* Live Product Dashboard Mockup */}
            <div className="lp-win" role="img" aria-label="لوحة تحكم مدار">
              <div className="lp-win-bar">
                <div className="lp-win-dots">
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
                <span className="lp-win-title">مدار · لوحة التحكم الحية</span>
                <span className="lp-win-note">بيانات حقيقية</span>
              </div>

              <div style={{ padding: 18, background: '#f6f5f2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h4 style={{ fontSize: 15, fontWeight: 800 }}>لوحة التحكم</h4>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>نظرة شاملة على عمليات السنتر الآن</p>
                  </div>
                  <span style={{ fontSize: 11, background: '#e8f5ef', color: '#0b6a4a', padding: '3px 10px', borderRadius: 99, fontWeight: 700 }}>
                    مكتب 1 · متصل
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                  <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #e2e0dc' }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>حصص نشطة</span>
                    <b style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>2</b>
                  </div>
                  <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #e2e0dc' }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>طلاب اليوم</span>
                    <b style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>186</b>
                  </div>
                  <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #e2e0dc' }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>مقاعد متاحة</span>
                    <b style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>38</b>
                  </div>
                  <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #e2e0dc' }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>كاش الوردية</span>
                    <b style={{ display: 'block', fontSize: 17, fontWeight: 800, color: '#0e7c56' }}>3,110 ج.م</b>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e0dc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                    <b>رياضيات · ثالثة ثانوي (قاعة 2)</b>
                    <span style={{ color: '#0e7c56', fontWeight: 700 }}>نشطة الآن</span>
                  </div>
                  <div style={{ height: 6, background: '#eeede9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: '78%', height: '100%', background: '#0e7c56', borderRadius: 99 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#6b7280' }}>
                    <span>62 من 80 طالب حاضر</span>
                    <span>78% إشغال</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Trust Chips */}
            <div className="lp-floats">
              <div className="lp-float">
                <span className="lp-float-ico">
                  <Users className="h-4 w-4" />
                </span>
                <span>
                  <b>+12 طالب</b>
                  <small>تم تسجيل حضورهم الآن</small>
                </span>
              </div>
              <div className="lp-float">
                <span className="lp-float-ico lp-float-ico--amber">
                  <Coins className="h-4 w-4" />
                </span>
                <span>
                  <b>24,500 ج.م</b>
                  <small>إجمالي تحصيل اليوم</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 3: THE PROBLEM ================= */}
      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <h2>السنتر مش محتاج شغل أكتر. محتاج نظام أفضل.</h2>
            <p>الزحمة، الكاش، حسابات المدرسين، وتقارير آخر اليوم — كلها بتاخد وقتك وتشتتك عن تطوير سنترك.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            <article className="lp-card">
              <span className="lp-ico"><Users className="h-5 w-5" /></span>
              <h3 style={{ marginTop: 16 }}>الاستقبال والزحمة</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>تسجيل الطلاب والبحث عنهم بالاسم أو الهاتف في ثوانٍ معدودة وسط ضغط الحصص.</p>
            </article>

            <article className="lp-card">
              <span className="lp-ico"><Wallet className="h-5 w-5" /></span>
              <h3 style={{ marginTop: 16 }}>خزينة الوردية والكاش</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>متابعة الكاش، المدفوعات الرقمية (فودافون كاش وإنستاباي) والمصروفات بدون فوارق.</p>
            </article>

            <article className="lp-card">
              <span className="lp-ico"><Coins className="h-5 w-5" /></span>
              <h3 style={{ marginTop: 16 }}>تسويات المدرسين</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>حساب مستحقات المدرسين ونسبة السنتر تلقائيًا بناءً على الحضور الفعلي في القاعة.</p>
            </article>

            <article className="lp-card">
              <span className="lp-ico"><BarChart3 className="h-5 w-5" /></span>
              <h3 style={{ marginTop: 16 }}>التقارير اليومية</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>ملخص شامل بضغطة زر يوضح إجمالي الإيراد، الأرباح، وصافي كاش الدرج.</p>
            </article>

            <article className="lp-card">
              <span className="lp-ico"><Key className="h-5 w-5" /></span>
              <h3 style={{ marginTop: 16 }}>صلاحيات الموظفين</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>كل موظف استقبال له ورِديته وسجل عملياته الخاص لمنع التلاعب وتحديد المسؤوليات.</p>
            </article>

            <article className="lp-card">
              <span className="lp-ico"><Building2 className="h-5 w-5" /></span>
              <h3 style={{ marginTop: 16 }}>مكاتب استقبال متزامنة</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>عدة مكاتب تعمل معاً في نفس الوقت بمنع تكرار التسجيل ومتابعة كل خزينة على حدة.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ================= SECTION 5: VSL / HOW IT WORKS ================= */}
      <section className="lp-section lp-section--tint" id="how">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center">
            <h2>شوف مدار بيشتغل إزاي في أقل من 10 دقايق</h2>
            <p>رحلة تشغيل السنتر العملية: من فتح الوردية وتسجيل الحضور إلى تصفية المدرس والتقارير.</p>
          </div>

          <div style={{ maxWidth: 900, margin: '0 auto', background: '#043128', borderRadius: 24, padding: 24, color: '#fff', textAlign: 'center' }}>
            <div style={{ aspectRatio: '16/9', background: '#064334', borderRadius: 16, display: 'grid', placeItems: 'center', position: 'relative' }}>
              {!isPlayingVsl ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsPlayingVsl(true)}
                    style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', color: '#0e7c56', display: 'grid', placeItems: 'center', margin: '0 auto 14px', border: 0, cursor: 'pointer' }}
                  >
                    <Play className="h-7 w-7 fill-current" />
                  </button>
                  <p style={{ fontWeight: 800, fontSize: 18 }}>فيديو جولة تشغيل مدار</p>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>شاهد دورة العمل الكاملة</span>
                </div>
              ) : (
                <div style={{ padding: 20 }}>
                  <p>جاري تشغيل الفيديو التوضيحي...</p>
                  <button type="button" onClick={() => setIsPlayingVsl(false)} className="lp-btn lp-btn-light lp-btn-sm" style={{ marginTop: 12 }}>
                    إغلاق الفيديو
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 6: FEATURES TABS ================= */}
      <section className="lp-section" id="features">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <h2>كل الأدوات اللي محتاجها عشان تدير السنتر بكفاءة</h2>
            <p>مقسّمة على شغل السنتر الفعلي — اختار القسم اللي حابب تتعرف عليه:</p>
          </div>

          <div className="lp-features">
            <div className="lp-tablist" role="tablist">
              <button
                type="button"
                className={`lp-tab ${activeTab === 'reception' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('reception')}
              >
                <Users className="h-4 w-4" /> الاستقبال السريع
              </button>
              <button
                type="button"
                className={`lp-tab ${activeTab === 'payments' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('payments')}
              >
                <Wallet className="h-4 w-4" /> الخزينة والمدفوعات
              </button>
              <button
                type="button"
                className={`lp-tab ${activeTab === 'teachers' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('teachers')}
              >
                <BookOpen className="h-4 w-4" /> تسويات المدرسين
              </button>
              <button
                type="button"
                className={`lp-tab ${activeTab === 'reports' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('reports')}
              >
                <BarChart3 className="h-4 w-4" /> التقارير والحسابات
              </button>
              <button
                type="button"
                className={`lp-tab ${activeTab === 'desks' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('desks')}
              >
                <Building2 className="h-4 w-4" /> مكاتب متزامنة <span className="lp-tag">Control</span>
              </button>
            </div>

            <div className="lp-tabpanels">
              {activeTab === 'reception' && (
                <div className="lp-tabpanel">
                  <div>
                    <h3 style={{ fontSize: 24, marginBottom: 16 }}>الطلاب داخلين بالعشرات. الاستقبال مش لازم يتلخبط.</h3>
                    <ul className="lp-checks">
                      <li>تسجيل الحضور والدفع في خطوة واحدة بأقل من ثانيتين.</li>
                      <li>بحث ذكي يتسامح مع الهمزات واختلافات الكتابة العربية.</li>
                      <li>تزامن فوري لمنع تكرار تسجيل الطالب في نفس الحصة عبر المكاتب.</li>
                      <li>عداد حضور لحظي (Live Headcount) موصول مباشرة بالقاعات.</li>
                    </ul>
                  </div>
                  <div className="lp-win" style={{ padding: 18, background: '#fff' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: 10, background: '#f5f7f6', borderRadius: 10 }}>
                      <Search className="h-4 w-4 text-emerald-700" />
                      <b>أحمد محمود السيد</b>
                      <span style={{ fontSize: 11, color: '#6b7280', marginInlineStart: 'auto' }}>كود 1042 · ثالثة ثانوي</span>
                      <span style={{ background: '#0e7c56', color: '#fff', fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
                        تسجيل حضور ودفع
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'payments' && (
                <div className="lp-tabpanel">
                  <div>
                    <h3 style={{ fontSize: 24, marginBottom: 16 }}>كل جنيه داخل وخارج الدرج معروف مكانه.</h3>
                    <ul className="lp-checks">
                      <li>دعم تحصيل الكاش، محافظ فودافون كاش، وإنستاباي.</li>
                      <li>حساب آلي للكاش المتوقع في الدرج لحظة بلحظة.</li>
                      <li>مطابقة رصيد تقفيل الوردية وكشف أي زيادة أو عجز فورًا.</li>
                      <li>تسجيل مصروفات النثريات مع إرفاق ملاحظات التدقيق.</li>
                    </ul>
                  </div>
                  <div className="lp-win" style={{ padding: 18, background: '#fff' }}>
                    <div style={{ border: '1px solid #e2e0dc', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                        <span>الرصيد الافتتاحي:</span> <b>500 ج.م</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#0e7c56' }}>
                        <span>الكاش المقبوض:</span> <b>+ 6,200 ج.م</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: '#b45309' }}>
                        <span>مستحقات المدرسين والمصروفات:</span> <b>- 3,590 ج.م</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e0dc', fontSize: 15, fontWeight: 800 }}>
                        <span>الكاش المتوقع بالدرج:</span> <span style={{ color: '#0e7c56' }}>3,110 ج.م</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'teachers' && (
                <div className="lp-tabpanel">
                  <div>
                    <h3 style={{ fontSize: 24, marginBottom: 16 }}>تصفية حساب كل مدرس بدون آلة حاسبة.</h3>
                    <ul className="lp-checks">
                      <li>حساب نسبة السنتر ومستحق المدرس تلقائيًا فور انتهاء الحصة.</li>
                      <li>مطابقة عدد كشف الاستقبال مع حصر مساعد المدرس داخل القاعة.</li>
                      <li>تسوية مالية وإقفال نهائي للحصة يمنع التلاعب بعد الصرف.</li>
                    </ul>
                  </div>
                  <div className="lp-win" style={{ padding: 18, background: '#fff' }}>
                    <div style={{ background: '#f8faf9', padding: 14, borderRadius: 12, border: '1px solid #e0e6e2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <b>رياضيات · ثالثة ثانوي</b>
                        <span style={{ background: '#0e7c56', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 99 }}>تم الصرف</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#6b7280' }}>62 طالب حاضر × 80 ج.م = 4,960 ج.م إيراد الحصة</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#0e7c56', marginTop: 8 }}>صافي مستحق المدرس: 3,410 ج.م (رسوم السنتر: 1,550 ج.م)</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'reports' && (
                <div className="lp-tabpanel">
                  <div>
                    <h3 style={{ fontSize: 24, marginBottom: 16 }}>الصورة الكاملة لليوم قدامك.</h3>
                    <ul className="lp-checks">
                      <li>تقارير إيرادات السنتر اليومية والشهرية.</li>
                      <li>إحصائيات تفصيلية لحضور كل مادة ومرحلة دراسية.</li>
                      <li>سجل تدقيق كامل (Audit Trail) لجميع العمليات المالية.</li>
                    </ul>
                  </div>
                  <div className="lp-win" style={{ padding: 18, background: '#fff' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      <div style={{ background: '#e8f5ef', padding: 12, borderRadius: 10 }}>
                        <span style={{ fontSize: 11, color: '#064334' }}>صافي إيراد السنتر</span>
                        <b style={{ display: 'block', fontSize: 18, color: '#0b6a4a' }}>4,650 ج.م</b>
                      </div>
                      <div style={{ background: '#fef3cd', padding: 12, borderRadius: 10 }}>
                        <span style={{ fontSize: 11, color: '#7a3d06' }}>التحصيل الرقمي</span>
                        <b style={{ display: 'block', fontSize: 18, color: '#b45309' }}>4,000 ج.م</b>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'desks' && (
                <div className="lp-tabpanel">
                  <div>
                    <h3 style={{ fontSize: 24, marginBottom: 16 }}>مكاتب استقبال شغالة بالتوازي بدون تصادم.</h3>
                    <ul className="lp-checks">
                      <li>فتح عدة ورديات على مكاتب مختلفة في نفس الوقت.</li>
                      <li>منع تكرار تسجيل الطالب في نفس الحصة عبر أي مكتب.</li>
                      <li>متابعة خزائن المكاتب والتحصيل كل مكتب على حدة.</li>
                    </ul>
                  </div>
                  <div className="lp-win" style={{ padding: 18, background: '#fff' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: '#f5f7f6', borderRadius: 8 }}>
                        <b>مكتب الاستقبال 1</b>
                        <span style={{ color: '#0e7c56', fontWeight: 700 }}>98 طالب اليوم</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10, background: '#f5f7f6', borderRadius: 8 }}>
                        <b>مكتب الاستقبال 2</b>
                        <span style={{ color: '#0e7c56', fontWeight: 700 }}>88 طالب اليوم</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 7: 3 STEPS ================= */}
      <section className="lp-section lp-section--tint">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center">
            <h2>ابدأ في 3 خطوات بسيطة</h2>
          </div>

          <div className="lp-steps">
            <div className="lp-card">
              <span className="lp-step-n">01</span>
              <h3>أنشئ حساب السنتر</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>سجل بيانات سنترك وابدأ تجربتك المجانية لمدة 14 يوم فورًا بدون تعقيدات.</p>
            </div>
            <div className="lp-card">
              <span className="lp-step-n">02</span>
              <h3>أضف القاعات والمدرسين</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>سجل أسماء القاعات، المدرسين، وسعر الحصص مع نسبة السنتر المحددة.</p>
            </div>
            <div className="lp-card">
              <span className="lp-step-n">03</span>
              <h3>ابدأ التشغيل اليومي</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 8 }}>افتح الوردية واستقبل الطلاب بكل سلاسة وسرعة وبدون أخطاء كاش.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 9: PRICING ================= */}
      <section className="lp-section" id="pricing">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center">
            <h2>ابدأ مجانًا. وكبّر مدار مع سنترك.</h2>
            <p>جرّب مدار لمدة 14 يوم مجانًا، وبعدها اختار الخطة المناسبة لاحتياجاتك بالجنيه المصري.</p>
          </div>

          {/* 14-Day Free Trial Banner */}
          <div className="lp-trial">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div className="lp-trial-days">
                <b>14</b>
                <small>يوم</small>
              </div>
              <div>
                <h3 style={{ fontSize: 22 }}>14 يوم تجربة مجانية بالكامل</h3>
                <p style={{ color: 'var(--lp-ink-2)' }}>جرّب جميع ميزات مدار العملية مع فريقك بدون أي دفع مسبق.</p>
              </div>
            </div>
            <button type="button" onClick={handleCta} className="lp-btn lp-btn-primary lp-btn-lg">
              ابدأ تجربتك المجانية الآن
            </button>
          </div>

          <div className="lp-plans">
            {/* Essential Tier */}
            <article className="lp-plan">
              <h3 style={{ fontSize: 24 }}>الأساس</h3>
              <p style={{ color: 'var(--lp-ink-2)', marginTop: 6, minHeight: 48 }}>
                كل الأساسيات اللي محتاجها لإدارة سنترك اليومية بكفاءة عالية.
              </p>
              <div className="lp-price">
                <b>499</b>
                <span style={{ fontSize: 16 }}>جنيه / شهرياً</span>
              </div>
              <ul className="lp-checks" style={{ marginBottom: 24 }}>
                <li>النظام التشغيلي الكامل</li>
                <li>حتى مكتبين للاستقبال يعملان معاً</li>
                <li>إدارة الطلاب والمدرسين والحصص</li>
                <li>خزينة الوردية وتسويات المدرسين</li>
                <li>التقارير اليومية والمالية</li>
              </ul>
              <button type="button" onClick={handleCta} className="lp-btn lp-btn-ghost lp-btn-block lp-btn-lg">
                ابدأ تجربتك المجانية
              </button>
            </article>

            {/* Control Tier */}
            <article className="lp-plan lp-plan--featured">
              <span className="lp-plan-flag">الأكثر طلباً للسناتر الكبيرة</span>
              <h3 style={{ fontSize: 24 }}>السيطرة</h3>
              <p style={{ opacity: 0.85, marginTop: 6, minHeight: 48 }}>
                للسناتر متعددة المكاتب التي تحتاج سيطرة كاملة على التشغيل والمالية.
              </p>
              <div className="lp-price">
                <b>1199</b>
                <span style={{ fontSize: 16, opacity: 0.85 }}>جنيه / شهرياً</span>
              </div>
              <ul className="lp-checks" style={{ marginBottom: 24 }}>
                <li style={{ color: '#fff' }}>كل ميزات باقة الأساس</li>
                <li style={{ color: '#fff' }}>مكاتب استقبال متزامنة حتى 8 مكاتب</li>
                <li style={{ color: '#fff' }}>10 آلاف زيارة طالب محسوبة داخل الباقة</li>
                <li style={{ color: '#fff' }}>تقارير متقدمة وتصدير البيانات</li>
                <li style={{ color: '#fff' }}>دعم فني أولوية وتدريب الموظفين</li>
              </ul>
              <button type="button" onClick={handleCta} className="lp-btn lp-btn-light lp-btn-block lp-btn-lg">
                ابدأ تجربتك المجانية
              </button>
            </article>
          </div>
        </div>
      </section>

      {/* ================= SECTION 10: INTERACTIVE ROI CALCULATOR ================= */}
      <section className="lp-section lp-section--tint">
        <div className="lp-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 36, alignItems: 'center' }}>
          <div>
            <h2>تكلفة النظام أقل من تكلفة الفوضى التشغيلية.</h2>
            <p style={{ marginTop: 14, color: 'var(--lp-ink-2)' }}>
              القيمة الحقيقية لمدار هي الساعات اللي فريقك بيوفرها يومياً، والأخطاء المالية اللي بتختفي تماماً.
            </p>
            <ul style={{ display: 'grid', gap: 10, marginTop: 22 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 10 }}>
                <Clock className="h-5 w-5 text-emerald-700" /> وقت أقل 3 أضعاف في طابور الاستقبال
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 10 }}>
                <Scale className="h-5 w-5 text-emerald-700" /> صفر أخطاء في حسابات نسب المدرسين
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 10 }}>
                <Receipt className="h-5 w-5 text-emerald-700" /> مطابقة الكاش والدرج لحظة بلحظة
              </li>
            </ul>
          </div>

          <div className="lp-calc">
            <h3>احسب الوقت اللي ممكن توفره مع مدار:</h3>
            <p className="lp-calc-tag">حاسبة تقديرية بناءً على سرعة الاستقبال اليومي</p>

            <div className="lp-calc-fields">
              <label>
                <span style={{ fontSize: 13, fontWeight: 700 }}>عدد الطلاب يومياً في السنتر:</span>
                <input
                  type="number"
                  min="1"
                  value={calcStudents}
                  onChange={(e) => setCalcStudents(Number(e.target.value) || 0)}
                />
              </label>

              <label>
                <span style={{ fontSize: 13, fontWeight: 700 }}>وقت تسجيل الطالب بالطريقة الحالية (بالدقائق):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={calcNow}
                  onChange={(e) => setCalcNow(Number(e.target.value) || 0)}
                />
              </label>

              <label>
                <span style={{ fontSize: 13, fontWeight: 700 }}>وقت تسجيل الطالب مع مدار السريع (بالدقائق):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={calcWith}
                  onChange={(e) => setCalcWith(Number(e.target.value) || 0)}
                />
              </label>
            </div>

            <div className="lp-calc-out">
              <div>
                <small style={{ display: 'block', color: 'var(--lp-brand-700)', fontWeight: 700 }}>الوقت الموفر يومياً:</small>
                <b>{hoursSavedPerDay.toFixed(1)} ساعة</b>
              </div>
              <div>
                <small style={{ display: 'block', color: 'var(--lp-brand-700)', fontWeight: 700 }}>الوقت الموفر شهرياً (26 يوم):</small>
                <b>{hoursSavedPerMonth.toFixed(1)} ساعة</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= SECTION 12: FAQ ================= */}
      <section className="lp-section" id="faq">
        <div className="lp-wrap">
          <div className="lp-sec-head lp-sec-head--center">
            <h2>أسئلة بتتسأل كتير</h2>
          </div>

          <div className="lp-faq">
            {[
              {
                q: 'هل مدار مناسب لحجم السنتر بتاعي؟',
                a: 'نعم، مدار مصمم لخدمة السناتر الصغيرة التي تبدأ بمكتب واحد وقاعة وحتى السناتر الكبيرة متعددة المكاتب والقاعات.',
              },
              {
                q: 'هل يحتاج مدار إلى أجهزة كمبيوتر بمواصفات معينة؟',
                a: 'لا، مدار نظام سحابي بالكامل (Cloud SaaS) يعمل من أي متصفح ويب على الكمبيوتر أو التابلت أو الهاتف دون الحاجة لتثبيت برامج معقدة.',
              },
              {
                q: 'هل بيانات السنتر وأرقام الطلاب والمدرسين في أمان؟',
                a: 'بيانات سنترك مشفرة بالكامل ومعزولة في قاعدة بيانات مستقلة، مع نسخ احتياطي يومي وسجل تدقيق يحفظ كل حركة داخل النظام.',
              },
              {
                q: 'كيف أبدأ التجربة المجانية؟',
                a: 'اضغط على "ابدأ تجربتك المجانية" واملأ بيانات سنترك وستحصل فوراً على 14 يوم تجربة مجانية كاملة الميزات بدون أي دفع.',
              },
            ].map((item, index) => (
              <div key={index} className="lp-faq-item">
                <button
                  type="button"
                  className="lp-faq-q"
                  onClick={() => toggleFaq(index)}
                  aria-expanded={openFaq === index}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 text-emerald-800 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <div className="lp-faq-a">
                    <p>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= SECTION 13: FINAL CTA ================= */}
      <section className="lp-final">
        <div className="lp-wrap" style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ color: '#fff', fontSize: 36 }}>جاهز تدير سنترك بطريقة أذكى؟</h2>
          <p style={{ maxWidth: 500, margin: '16px auto 32px', opacity: 0.9 }}>
            ابدأ تجربتك المجانية لمدة 14 يوم واكتشف كيف يغير مدار كفاءة الاستقبال والحسابات.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleCta} className="lp-btn lp-btn-light lp-btn-lg">
              ابدأ تجربتك المجانية
            </button>
            <button type="button" onClick={handleLogin} className="lp-btn lp-btn-outline-light lp-btn-lg">
              تسجيل الدخول إلى حسابك
            </button>
          </div>
          <p style={{ marginTop: 24, fontSize: 13, opacity: 0.8 }}>14 يوم مجانًا — بدون التزام</p>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div>
            <a href="#top" className="lp-brand">
              <span className="lp-logo-sq">م</span>
              <span className="lp-brand-name">مدار</span>
            </a>
            <p style={{ marginTop: 12, color: 'var(--lp-ink-2)', fontSize: 14 }}>
              نظام تشغيل وإدارة السناتر والمراكز التعليمية في مصر.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <b>روابط سريعة</b>
            <a href="#features" style={{ color: 'var(--lp-ink-2)' }}>المميزات</a>
            <a href="#pricing" style={{ color: 'var(--lp-ink-2)' }}>الأسعار</a>
            <a href="#faq" style={{ color: 'var(--lp-ink-2)' }}>الأسئلة الشائعة</a>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <b>الحساب</b>
            <button type="button" onClick={handleLogin} style={{ textAlign: 'start', color: 'var(--lp-ink-2)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
              تسجيل الدخول
            </button>
            <button type="button" onClick={handleCta} style={{ textAlign: 'start', color: 'var(--lp-brand-600)', fontWeight: 700, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
              ابدأ تجربتك المجانية
            </button>
          </div>
        </div>

        <div className="lp-wrap" style={{ borderTop: '1px solid var(--lp-line)', marginTop: 32, paddingBlock: 20, textAlign: 'center', fontSize: 13, color: 'var(--lp-ink-3)' }}>
          © 2026 مَدار — جميع الحقوق محفوظة.
        </div>
      </footer>
    </div>
  );
}
