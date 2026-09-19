import { PrismaClient, Prisma } from '@prisma/client';
import { Role, SchoolType } from '../../shared/constants/index.js';
import * as argon2 from 'argon2';

function norm(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0640]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stuCode(n: number) {
  return `STU-${String(n).padStart(5, '0')}`;
}

function daysAgo(days: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function hashPwd(pwd: string) {
  return argon2.hash(pwd, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345!';
  const receptionistPassword = process.env.SEED_RECEPTIONIST_PASSWORD || 'Desk@12345!';

  // 0. TENANT
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'main-center' },
    update: {},
    create: {
      name: 'سنتر الأوائل التعليمي',
      slug: 'main-center',
      ownerName: 'أ/ محمود الشريف',
      ownerPhone: '01000000000',
      plan: 'GROWTH',
      isActive: true,
      maxDesks: 3,
      maxBranches: 1,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Active subscription
  const subExists = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
  if (!subExists) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'GROWTH',
        status: 'ACTIVE',
        amount: new Prisma.Decimal('299.00'),
        currency: 'EGP',
        paymentMethod: 'CASH',
        paymentReference: 'REF-DEMO-001',
        periodStart: daysAgo(30),
        periodEnd: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 1. USERS (Always ensure credentials match)
  const adminHash = await hashPwd(adminPassword);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminHash, tenantId: tenant.id, isActive: true },
    create: {
      username: 'admin',
      email: 'admin@alawael.local',
      passwordHash: adminHash,
      fullName: 'أ/ محمود الشريف',
      role: Role.ADMIN,
      phoneNumber: '01000000000',
      preferredLanguage: 'ar',
      isActive: true,
      tenantId: tenant.id,
    },
  });

  const recepHash = await hashPwd(receptionistPassword);
  const receptionist = await prisma.user.upsert({
    where: { username: 'reception1' },
    update: { passwordHash: recepHash, tenantId: tenant.id, isActive: true },
    create: {
      username: 'reception1',
      email: 'reception1@alawael.local',
      passwordHash: recepHash,
      fullName: 'سارة عبد الرحمن',
      role: Role.RECEPTIONIST,
      phoneNumber: '01012345678',
      preferredLanguage: 'ar',
      isActive: true,
      tenantId: tenant.id,
    },
  });

  // 2. ROOMS
  const roomsRaw = [
    { name: 'قاعة ١ (الكبرى)', capacity: 120, floor: 'الطابق الأول' },
    { name: 'قاعة ٢ (المتوسطة)', capacity: 60, floor: 'الطابق الأول' },
    { name: 'قاعة ٣ (الصغيرة)', capacity: 30, floor: 'الطابق الثاني' },
  ];
  const rooms = await Promise.all(
    roomsRaw.map((r) =>
      prisma.room.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: r.name } },
        update: {},
        create: { ...r, tenantId: tenant.id, isActive: true },
      }),
    ),
  );
  const [roomBig, roomMid, roomSmall] = rooms;

  // 3. TEACHERS (5 subjects)
  const teachersRaw = [
    { fullName: 'أ/ محمد عبد الفتاح', phone: '01011111111', subject: 'فيزياء', fee: 20, asst: 'م/ وليد سامي', asstPhone: '01022222222' },
    { fullName: 'أ/ نادية إبراهيم', phone: '01033333333', subject: 'رياضيات', fee: 15, asst: null, asstPhone: null },
    { fullName: 'أ/ كريم السيد', phone: '01044444444', subject: 'كيمياء', fee: 25, asst: 'أ/ منى فاروق', asstPhone: '01055555555' },
    { fullName: 'أ/ هبة يوسف', phone: '01066666666', subject: 'لغة عربية', fee: 10, asst: null, asstPhone: null },
    { fullName: 'أ/ أحمد حمدي', phone: '01077777777', subject: 'أحياء', fee: 20, asst: null, asstPhone: null },
  ];
  type TeacherRow = Awaited<ReturnType<typeof prisma.teacher.create>>;
  const teachers: TeacherRow[] = [];
  for (const t of teachersRaw) {
    const existing = await prisma.teacher.findFirst({ where: { tenantId: tenant.id, phoneNumber: t.phone } });
    if (existing) {
      teachers.push(existing);
      continue;
    }
    teachers.push(
      await prisma.teacher.create({
        data: {
          tenantId: tenant.id,
          fullName: t.fullName,
          searchName: norm(t.fullName),
          phoneNumber: t.phone,
          subject: t.subject,
          defaultCenterFee: t.fee,
          assistantName: t.asst,
          assistantPhone: t.asstPhone,
          isActive: true,
        },
      }),
    );
  }
  const [tPhysics, tMath, tChem, tArabic, tBio] = teachers;

  // 4. CHECK IF STUDENTS ALREADY SEEDED
  const studentCount = await prisma.student.count({ where: { tenantId: tenant.id } });
  if (studentCount > 0) {
    // Already populated
    return;
  }

  // STUDENTS (40 students)
  const studentsRaw = [
    { n: 'أحمد محمود حسن', p: '01099991111', g: '01099992222', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
    { n: 'فاطمة علي إبراهيم', p: '01099993333', g: '01099994444', stage: 'الثالث الثانوي', type: SchoolType.LANGUAGES },
    { n: 'محمد عمر عبد الله', p: null, g: '01099995555', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
    { n: 'إسلام أحمد رضا', p: '01099996666', g: '01099997777', stage: 'الثالث الثانوي', type: SchoolType.AZHAR },
    { n: 'نور الهدى مصطفى', p: '01099998888', g: '01099999999', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
    { n: 'يوسف طارق عوض', p: '01011112222', g: '01011113333', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
    { n: 'ريم سامح الديب', p: '01011114444', g: '01011115555', stage: 'الثالث الثانوي', type: SchoolType.LANGUAGES },
    { n: 'عمر وائل حسين', p: '01011116666', g: '01011117777', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
    { n: 'سلمى خالد نصار', p: '01011118888', g: '01011119999', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
    { n: 'كريم ماهر عبد الحق', p: '01022221111', g: '01022222222', stage: 'الثالث الثانوي', type: SchoolType.LANGUAGES },
    { n: 'سارة جمال الدين', p: '01022223333', g: '01022224444', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'مصطفى عادل زيد', p: '01022225555', g: '01022226666', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'آية محمد فتحي', p: '01022227777', g: '01022228888', stage: 'الثاني الثانوي', type: SchoolType.LANGUAGES },
    { n: 'باسم علاء رشاد', p: '01022229999', g: '01033330000', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'دينا صلاح حمزة', p: '01033331111', g: '01033332222', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'زياد حسن بدر', p: '01033334444', g: '01033335555', stage: 'الثاني الثانوي', type: SchoolType.AZHAR },
    { n: 'هند رامي الشامي', p: '01033336666', g: '01033337777', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'وليد سمير السيد', p: '01033338888', g: '01033339999', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'ميار عصام نجيب', p: '01044440000', g: '01044441111', stage: 'الثاني الثانوي', type: SchoolType.LANGUAGES },
    { n: 'أنس فاروق زيدان', p: '01044442222', g: '01044443333', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
    { n: 'لمياء كمال طه', p: '01044444444', g: '01044445555', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
    { n: 'محمود جلال عيسى', p: '01044446666', g: '01044447777', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
    { n: 'رنا أحمد الصاوي', p: '01044448888', g: '01044449999', stage: 'الأول الثانوي', type: SchoolType.LANGUAGES },
    { n: 'نادر يسري فؤاد', p: '01055550000', g: '01055551111', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
    { n: 'غادة سعد الحلواني', p: '01055552222', g: '01055553333', stage: 'الأول الثانوي', type: SchoolType.AZHAR },
    { n: 'عبد الرحمن ناصر', p: '01055554444', g: '01055555555', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
    { n: 'شيماء طلعت مرسي', p: '01055556666', g: '01055557777', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
    { n: 'حسام الدين صبري', p: '01055558888', g: '01055559999', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
    { n: 'ياسمين عزيز خليل', p: '01066660000', g: '01066661111', stage: 'الثالث الإعدادي', type: SchoolType.GENERAL },
    { n: 'تامر ربيع السباعي', p: '01066662222', g: '01066663333', stage: 'الثالث الإعدادي', type: SchoolType.GENERAL },
    { n: 'مروة فريد منصور', p: '01066664444', g: '01066665555', stage: 'الثالث الإعدادي', type: SchoolType.LANGUAGES },
    { n: 'علي عبد المنعم', p: '01066666666', g: '01066667777', stage: 'الثاني الإعدادي', type: SchoolType.GENERAL },
    { n: 'نهال رضا القاضي', p: '01066668888', g: '01066669999', stage: 'الثاني الإعدادي', type: SchoolType.GENERAL },
    { n: 'حمزة سيد عثمان', p: '01077770000', g: '01077771111', stage: 'الثاني الإعدادي', type: SchoolType.AZHAR },
    { n: 'رحمة حمدي الزيات', p: '01077772222', g: '01077773333', stage: 'الأول الإعدادي', type: SchoolType.GENERAL },
    { n: 'عمرو إبراهيم حجازي', p: '01077774444', g: '01077775555', stage: 'الأول الإعدادي', type: SchoolType.GENERAL },
    { n: 'دعاء مصطفى لطفي', p: '01077776666', g: '01077777777', stage: 'الأول الإعدادي', type: SchoolType.LANGUAGES },
    { n: 'كيرلس جرجس ميخائيل', p: '01077778888', g: '01077779999', stage: 'الثالث الإعدادي', type: SchoolType.GENERAL },
    { n: 'فرح أسامة عبيد', p: '01088880000', g: '01088881111', stage: 'الثالث الإعدادي', type: SchoolType.GENERAL },
    { n: 'أيمن شريف شوقي', p: '01088882222', g: '01088883333', stage: 'الثالث الإعدادي', type: SchoolType.GENERAL },
  ];

  type StudentRow = Awaited<ReturnType<typeof prisma.student.create>>;
  const students: StudentRow[] = [];
  for (let i = 0; i < studentsRaw.length; i++) {
    const s = studentsRaw[i];
    const code = stuCode(i + 1);
    const existing = await prisma.student.findFirst({ where: { tenantId: tenant.id, studentCode: code } });
    if (existing) {
      students.push(existing);
      continue;
    }
    students.push(
      await prisma.student.create({
        data: {
          tenantId: tenant.id,
          studentCode: code,
          fullName: s.n,
          searchName: norm(s.n),
          studentPhone: s.p,
          guardianPhone: s.g,
          academicStage: s.stage,
          schoolType: s.type,
        },
      }),
    );
  }

  const grade3 = students.slice(0, 10);
  const grade2 = students.slice(10, 20);
  const grade1 = students.slice(20, 28);

  // 5. SHIFTS (6 closed shifts)
  type ShiftRow = Awaited<ReturnType<typeof prisma.shiftRegister.create>>;
  const shiftsSpec = [
    { desk: 'DESK-A', open: daysAgo(14, 8), close: daysAgo(14, 14), opening: 500, actual: 3200, expected: 3200, notes: 'يوم عادي' },
    { desk: 'DESK-A', open: daysAgo(13, 14), close: daysAgo(13, 20), opening: 300, actual: 4150, expected: 4200, notes: 'فرق بسيط — تمت المراجعة' },
    { desk: 'DESK-A', open: daysAgo(10, 8), close: daysAgo(10, 14), opening: 500, actual: 5500, expected: 5500, notes: null },
    { desk: 'DESK-B', open: daysAgo(7, 8), close: daysAgo(7, 15), opening: 1000, actual: 6800, expected: 6800, notes: null },
    { desk: 'DESK-A', open: daysAgo(4, 8), close: daysAgo(4, 14), opening: 500, actual: 4800, expected: 4750, notes: 'زيادة ٥٠ ج.م — قيد التدقيق' },
    { desk: 'DESK-A', open: daysAgo(1, 8), close: daysAgo(1, 14), opening: 500, actual: 5100, expected: 5100, notes: null },
  ];

  const shifts: ShiftRow[] = [];
  for (const sp of shiftsSpec) {
    shifts.push(
      await prisma.shiftRegister.create({
        data: {
          tenantId: tenant.id,
          receptionistId: receptionist.id,
          deskIdentifier: sp.desk,
          openedAt: sp.open,
          closedAt: sp.close,
          openingCash: new Prisma.Decimal(sp.opening),
          actualCashCounted: new Prisma.Decimal(sp.actual),
          expectedCash: new Prisma.Decimal(sp.expected),
          cashVariance: new Prisma.Decimal(sp.actual - sp.expected),
          status: 'CLOSED',
          closingNotes: sp.notes,
        },
      }),
    );
  }
  const [sh1, sh2, sh3, sh4, sh5, sh6] = shifts;

  // 6. SESSIONS + ATTENDANCES + RECONCILIATIONS + SETTLEMENTS
  type SessionRow = Awaited<ReturnType<typeof prisma.session.create>>;
  interface SessionSpec {
    teacher: TeacherRow;
    room: typeof roomBig;
    title: string;
    stage: string;
    price: number;
    fee: number;
    startAt: Date;
    endAt: Date;
    shift: ShiftRow;
    attendees: StudentRow[];
    pmCycle: ('CASH' | 'VODAFONE_CASH' | 'INSTAPAY')[];
    assistantCount?: number;
    recoNotes?: string;
  }

  async function makeSession(sp: SessionSpec): Promise<SessionRow> {
    const session = await prisma.session.create({
      data: {
        tenantId: tenant.id,
        teacherId: sp.teacher.id,
        roomId: sp.room.id,
        title: sp.title,
        academicStage: sp.stage,
        startTime: sp.startAt,
        endTime: sp.endAt,
        sessionPrice: new Prisma.Decimal(sp.price),
        centerFeePerStudent: new Prisma.Decimal(sp.fee),
        status: 'COMPLETED',
        createdById: admin.id,
      },
    });

    for (let i = 0; i < sp.attendees.length; i++) {
      const pm = sp.pmCycle[i % sp.pmCycle.length];
      await prisma.attendance.create({
        data: {
          tenantId: tenant.id,
          sessionId: session.id,
          studentId: sp.attendees[i].id,
          receptionistId: receptionist.id,
          shiftRegisterId: sp.shift.id,
          checkInTime: new Date(sp.startAt.getTime() - (30 - i * 2) * 60000),
          amountPaid: new Prisma.Decimal(sp.price),
          changeOwed: new Prisma.Decimal(0),
          paymentMethod: pm,
          status: 'PAID',
        },
      });
    }

    const lobbyCount = sp.attendees.length;
    const assistantCount = sp.assistantCount ?? lobbyCount;
    const discrepancy = assistantCount - lobbyCount;
    const reconciledHead = Math.min(lobbyCount, assistantCount);

    const recon = await prisma.sessionReconciliation.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        lobbyCount,
        assistantCount,
        discrepancy,
        reconciledHeadcount: reconciledHead,
        resolutionNotes: sp.recoNotes ?? null,
        reconciledById: admin.id,
        reconciledAt: sp.endAt,
      },
    });

    const totalRevenue = reconciledHead * sp.price;
    const centerRevenue = reconciledHead * sp.fee;
    const teacherPayout = totalRevenue - centerRevenue;

    await prisma.sessionSettlement.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        reconciliationId: recon.id,
        disbursedFromShiftId: sp.shift.id,
        reconciledHeadcount: reconciledHead,
        sessionPrice: new Prisma.Decimal(sp.price),
        centerFeePerStudent: new Prisma.Decimal(sp.fee),
        totalRevenue: new Prisma.Decimal(totalRevenue),
        centerRevenue: new Prisma.Decimal(centerRevenue),
        teacherPayout: new Prisma.Decimal(teacherPayout),
        payoutMethod: 'CASH',
        recipientName: sp.teacher.fullName,
        status: 'DISBURSED',
        createdById: admin.id,
        settledAt: sp.endAt,
      },
    });

    return session;
  }

  await makeSession({
    teacher: tPhysics,
    room: roomBig,
    title: 'الفيزياء — موجات وصوت (الثالث الثانوي)',
    stage: 'الثالث الثانوي',
    price: 150,
    fee: 20,
    startAt: daysAgo(14, 9),
    endAt: daysAgo(14, 11),
    shift: sh1,
    attendees: grade3.slice(0, 8),
    pmCycle: ['CASH', 'CASH', 'VODAFONE_CASH', 'CASH'],
    assistantCount: 8,
  });

  await makeSession({
    teacher: tMath,
    room: roomMid,
    title: 'الرياضيات — حساب التفاضل (الثالث الثانوي)',
    stage: 'الثالث الثانوي',
    price: 120,
    fee: 15,
    startAt: daysAgo(13, 15),
    endAt: daysAgo(13, 17),
    shift: sh2,
    attendees: grade3.slice(1, 10),
    pmCycle: ['CASH', 'INSTAPAY', 'CASH', 'VODAFONE_CASH'],
    assistantCount: 10,
    recoNotes: 'اعتُمد عدد الاستقبال',
  });

  await makeSession({
    teacher: tChem,
    room: roomBig,
    title: 'الكيمياء — الروابط الكيميائية (الثاني الثانوي)',
    stage: 'الثاني الثانوي',
    price: 130,
    fee: 25,
    startAt: daysAgo(10, 9),
    endAt: daysAgo(10, 11),
    shift: sh3,
    attendees: grade2.slice(0, 10),
    pmCycle: ['CASH', 'CASH', 'CASH', 'VODAFONE_CASH', 'INSTAPAY'],
  });

  await makeSession({
    teacher: tPhysics,
    room: roomBig,
    title: 'الفيزياء — الضوء والبصريات (الثالث الثانوي)',
    stage: 'الثالث الثانوي',
    price: 150,
    fee: 20,
    startAt: daysAgo(7, 9),
    endAt: daysAgo(7, 11),
    shift: sh4,
    attendees: grade3,
    pmCycle: ['CASH', 'CASH', 'VODAFONE_CASH', 'INSTAPAY', 'CASH'],
  });

  await makeSession({
    teacher: tArabic,
    room: roomSmall,
    title: 'اللغة العربية — النحو والصرف (الأول الثانوي)',
    stage: 'الأول الثانوي',
    price: 100,
    fee: 10,
    startAt: daysAgo(7, 12),
    endAt: daysAgo(7, 14),
    shift: sh4,
    attendees: grade1.slice(0, 8),
    pmCycle: ['CASH', 'CASH', 'CASH', 'VODAFONE_CASH'],
  });

  await makeSession({
    teacher: tBio,
    room: roomMid,
    title: 'الأحياء — الخلية ووظائفها (الثاني الثانوي)',
    stage: 'الثاني الثانوي',
    price: 140,
    fee: 20,
    startAt: daysAgo(4, 9),
    endAt: daysAgo(4, 11),
    shift: sh5,
    attendees: grade2.slice(2, 11),
    pmCycle: ['CASH', 'INSTAPAY', 'CASH'],
  });

  await makeSession({
    teacher: tMath,
    room: roomSmall,
    title: 'الرياضيات — المثلثات (الأول الثانوي)',
    stage: 'الأول الثانوي',
    price: 110,
    fee: 15,
    startAt: daysAgo(4, 11),
    endAt: daysAgo(4, 13),
    shift: sh5,
    attendees: grade1,
    pmCycle: ['CASH', 'VODAFONE_CASH', 'CASH'],
  });

  await makeSession({
    teacher: tChem,
    room: roomBig,
    title: 'الكيمياء — الكيمياء العضوية (الثالث الثانوي)',
    stage: 'الثالث الثانوي',
    price: 130,
    fee: 25,
    startAt: daysAgo(1, 9),
    endAt: daysAgo(1, 11),
    shift: sh6,
    attendees: grade3,
    pmCycle: ['CASH', 'CASH', 'INSTAPAY', 'VODAFONE_CASH'],
  });

  // 7. EXPENSES
  const expensesRaw = [
    { shift: sh1, cat: 'مستلزمات مكتبية', amt: 85, desc: 'ورق طباعة وأقلام', pm: 'CASH' as const },
    { shift: sh1, cat: 'مرافق', amt: 200, desc: 'فاتورة كهرباء جزئي', pm: 'CASH' as const },
    { shift: sh2, cat: 'نظافة', amt: 150, desc: 'مواد تنظيف وعامل النظافة', pm: 'CASH' as const },
    { shift: sh3, cat: 'مستلزمات مكتبية', amt: 60, desc: 'أحبار طابعة', pm: 'CASH' as const },
    { shift: sh3, cat: 'صيانة', amt: 300, desc: 'إصلاح مكيف قاعة ١', pm: 'CASH' as const },
    { shift: sh4, cat: 'مرافق', amt: 350, desc: 'جزء من فاتورة إنترنت', pm: 'INSTAPAY' as const },
    { shift: sh4, cat: 'أخرى', amt: 120, desc: 'مستلزمات ضيافة', pm: 'CASH' as const },
    { shift: sh5, cat: 'مستلزمات مكتبية', amt: 75, desc: 'تصوير وطباعة جداول', pm: 'CASH' as const },
    { shift: sh6, cat: 'نظافة', amt: 100, desc: 'غسيل الستائر', pm: 'CASH' as const },
    { shift: sh6, cat: 'صيانة', amt: 250, desc: 'فني تكييف — صيانة دورية', pm: 'CASH' as const },
  ];
  for (const e of expensesRaw) {
    await prisma.expense.create({
      data: {
        tenantId: tenant.id,
        shiftRegisterId: e.shift.id,
        category: e.cat,
        amount: new Prisma.Decimal(e.amt),
        paymentMethod: e.pm,
        description: e.desc,
        createdById: receptionist.id,
      },
    });
  }
}
