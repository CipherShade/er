import { Prisma, PrismaClient } from '@prisma/client';
import type { Room, ShiftRegister, Student, Teacher } from '@prisma/client';
import {
  AttendanceStatus,
  PaymentMethod,
  Role,
  SchoolType,
  SessionStatus,
  SettlementStatus,
  ShiftStatus,
  SubscriptionStatus,
  TenantPlan,
} from '../../shared/constants/index.js';
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

function plusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dec = (n: number) => new Prisma.Decimal(round2(n));

function toNum(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

async function hashPwd(pwd: string) {
  return argon2.hash(pwd, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

type RoomRow = Room;
type TeacherRow = Teacher;
type StudentRow = Student;
type ShiftRow = ShiftRegister;

type SeedCtx = {
  prisma: PrismaClient;
  tenantId: string;
  adminId: string;
  receptionistId: string;
  rooms: RoomRow[];
  teachers: TeacherRow[];
  students?: StudentRow[];
};

type AuditInput = {
  ctx: SeedCtx;
  actorId: string;
  shiftRegisterId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  amount?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
};

function auditEntry({ ctx, actorId, shiftRegisterId, action, entityType, entityId, amount, metadata }: AuditInput) {
  return ctx.prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      shiftRegisterId: shiftRegisterId ?? null,
      actorId,
      action,
      entityType,
      entityId: entityId ?? null,
      amount: amount === undefined || amount === null ? null : dec(amount),
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// Drawer invariant (must mirror loadShiftFinancials in shifts.ts):
// expectedCash = openingCash + cashCollected(CASH) - teacherCashPayouts(CASH) - cashExpenses(CASH)
async function computeShiftCashFinancials(prisma: PrismaClient, shiftId: string): Promise<number> {
  const [cashCollected, teacherCashPayouts, cashExpenses, shiftRow] = await Promise.all([
    prisma.attendance.aggregate({
      _sum: { amountPaid: true },
      where: { shiftRegisterId: shiftId, paymentMethod: PaymentMethod.CASH },
    }),
    prisma.sessionSettlement.aggregate({
      _sum: { teacherPayout: true },
      where: { disbursedFromShiftId: shiftId, payoutMethod: PaymentMethod.CASH },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { shiftRegisterId: shiftId, paymentMethod: PaymentMethod.CASH },
    }),
    prisma.shiftRegister.findUnique({ where: { id: shiftId }, select: { openingCash: true } }),
  ]);

  const opening = toNum(shiftRow?.openingCash ?? 0);
  return round2(
    opening +
      toNum(cashCollected._sum.amountPaid) -
      toNum(teacherCashPayouts._sum.teacherPayout) -
      toNum(cashExpenses._sum.amount),
  );
}

async function finalizeShift(ctx: SeedCtx, shift: ShiftRow, varianceOffset: number, closingNotes: string | null) {
  const expected = await computeShiftCashFinancials(ctx.prisma, shift.id);
  const actual = round2(expected + varianceOffset);
  await ctx.prisma.shiftRegister.update({
    where: { id: shift.id },
    data: {
      expectedCash: dec(expected),
      actualCashCounted: dec(actual),
      cashVariance: dec(round2(actual - expected)),
      closingNotes,
    },
  });
  await auditEntry({
    ctx,
    actorId: ctx.receptionistId,
    shiftRegisterId: shift.id,
    action: 'SHIFT_CLOSED',
    entityType: 'SHIFT_REGISTER',
    entityId: shift.id,
    amount: actual,
    metadata: { expectedCash: expected, cashVariance: round2(actual - expected), closingNotes: closingNotes ?? '' },
  });
}

// Heals stored drawer values on every boot: expected recomputed from real rows,
// actual preserved (so seeded variance intents survive) unless it was never set.
async function reconcileClosedShiftDrawers(prisma: PrismaClient) {
  const shifts = await prisma.shiftRegister.findMany({
    where: { status: ShiftStatus.CLOSED },
    select: { id: true, actualCashCounted: true },
  });
  for (const sh of shifts) {
    const expected = await computeShiftCashFinancials(prisma, sh.id);
    const actual = sh.actualCashCounted === null || sh.actualCashCounted === undefined ? expected : toNum(sh.actualCashCounted);
    await prisma.shiftRegister.update({
      where: { id: sh.id },
      data: {
        expectedCash: dec(expected),
        actualCashCounted: dec(actual),
        cashVariance: dec(round2(actual - expected)),
      },
    });
  }
}

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD || 'Platform@12345!';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345!';
  const receptionistPassword = process.env.SEED_RECEPTIONIST_PASSWORD || 'Desk@12345!';

  await seedPlatformTenants(prisma, superAdminPassword);
  await seedMainCenter(prisma, { adminPassword, receptionistPassword });
}

// ── 0. PLATFORM (SaaS) LAYER: superadmin + extra tenants ───────────────────
async function seedPlatformTenants(prisma: PrismaClient, superAdminPassword: string) {
  const superadminExists = await prisma.user.findUnique({ where: { username: 'superadmin' } });
  const saHash = superadminExists ? undefined : await hashPwd(superAdminPassword);
  await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: { passwordHash: saHash ?? superadminExists?.passwordHash, role: Role.SUPER_ADMIN, isActive: true, tenantId: null },
    create: {
      username: 'superadmin',
      email: 'platform@madar.local',
      passwordHash: saHash ?? '',
      fullName: 'فريق منصة مدار',
      role: Role.SUPER_ADMIN,
      phoneNumber: '01000000001',
      preferredLanguage: 'ar',
      isActive: true,
      tenantId: null,
    },
  });

  type PlatformTenantSpec = {
    slug: string;
    name: string;
    owner: string;
    ownerPhone: string;
    plan: TenantPlan;
    maxDesks: number;
    isActive: boolean;
    trialEndsAt?: Date | null;
    managerUsername: string;
    students: { n: string; p: string; g: string; stage: string; type: SchoolType }[];
    teacher: { fullName: string; phone: string; subject: string; fee: number };
    subscriptions?: { plan: TenantPlan; status: SubscriptionStatus; amount: number; paymentMethod: PaymentMethod; paymentReference: string | null; periodStart: Date; periodEnd: Date }[];
    suspendedAudit?: boolean;
  };

  const specs: PlatformTenantSpec[] = [
    {
      slug: 'elnil-creative',
      name: 'سنتر النيل للإبداع',
      owner: 'أ/ محمد عادل',
      ownerPhone: '01111111111',
      plan: TenantPlan.BUSINESS,
      maxDesks: 4,
      trialEndsAt: null,
      isActive: true,
      managerUsername: 'mgr_elnil',
      students: [
        { n: 'أسماء سيد درويش', p: '01199991111', g: '01199992222', stage: 'الثالث الثانوي', type: SchoolType.GENERAL },
        { n: 'يوسف حامد قنديل', p: '01199993333', g: '01199994444', stage: 'الثاني الثانوي', type: SchoolType.LANGUAGES },
        { n: 'ملك عمرو حسان', p: '01199995555', g: '01199996666', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
      ],
      teacher: { fullName: 'أ/ شيماء حسن البرنس', phone: '01155550001', subject: 'فيزياء', fee: 15 },
      subscriptions: [
        { plan: TenantPlan.GROWTH, status: SubscriptionStatus.CANCELED, amount: 299, paymentMethod: PaymentMethod.CASH, paymentReference: 'CR-2026-07', periodStart: daysAgo(75), periodEnd: daysAgo(45) },
        { plan: TenantPlan.BUSINESS, status: SubscriptionStatus.ACTIVE, amount: 500, paymentMethod: PaymentMethod.INSTAPAY, paymentReference: 'SUB-BIZ-2026', periodStart: daysAgo(45), periodEnd: plusDays(320) },
      ],
    },
    {
      slug: 'giza-heights',
      name: 'مركز الجيزة هايتس',
      owner: 'أ/ هالة فاروق',
      ownerPhone: '01122222222',
      plan: TenantPlan.ENTERPRISE,
      maxDesks: 8,
      trialEndsAt: null,
      isActive: true,
      managerUsername: 'mgr_giza',
      students: [
        { n: 'عمران وليد الشاذلي', p: '01188884444', g: '01188885555', stage: 'الثاني الثانوي', type: SchoolType.GENERAL },
        { n: 'جودي مصطفى الربيع', p: '01188886666', g: '01188887777', stage: 'الأول الثانوي', type: SchoolType.LANGUAGES },
      ],
      teacher: { fullName: 'أ/ حسن عرفة سلامة', phone: '01155550002', subject: 'رياضيات', fee: 20 },
      subscriptions: [
        { plan: TenantPlan.ENTERPRISE, status: SubscriptionStatus.ACTIVE, amount: 1200, paymentMethod: PaymentMethod.VODAFONE_CASH, paymentReference: 'SUB-ENT-2026-08', periodStart: daysAgo(60), periodEnd: plusDays(305) },
      ],
    },
    {
      slug: 'delta-smart',
      name: 'أكاديمية الدلتا سمارت',
      owner: 'أ/ سامي رمضان',
      ownerPhone: '01133333333',
      plan: TenantPlan.FREE_TRIAL,
      maxDesks: 1,
      trialEndsAt: plusDays(4),
      isActive: true,
      managerUsername: 'mgr_delta',
      students: [
        { n: 'نادين طارق السمري', p: '01177770001', g: '01177770002', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
        { n: 'آدم خالد زينو', p: '01177770003', g: '01177770004', stage: 'الأول الثانوي', type: SchoolType.GENERAL },
      ],
      teacher: { fullName: 'أ/ هدير سعد الدين', phone: '01155550003', subject: 'لغة إنجليزية', fee: 12 },
    },
    {
      slug: 'upper-egypt-edu',
      name: 'مركز الصعيد التعليمي',
      owner: 'أ/ عصام بدر',
      ownerPhone: '01144444444',
      plan: TenantPlan.FREE_TRIAL,
      maxDesks: 1,
      trialEndsAt: daysAgo(6),
      isActive: false,
      managerUsername: 'mgr_upper',
      students: [],
      teacher: { fullName: 'أ/ عصام بدر', phone: '01155550004', subject: 'لغة عربية', fee: 10 },
      subscriptions: [
        { plan: TenantPlan.FREE_TRIAL, status: SubscriptionStatus.EXPIRED, amount: 0, paymentMethod: PaymentMethod.CASH, paymentReference: null, periodStart: daysAgo(36), periodEnd: daysAgo(6) },
      ],
      suspendedAudit: true,
    },
  ];

  for (const spec of specs) {
    const updatePatch = spec.trialEndsAt ? { trialEndsAt: spec.trialEndsAt } : {};
    const tenant = await prisma.tenant.upsert({
      where: { slug: spec.slug },
      update: updatePatch,
      create: {
        name: spec.name,
        slug: spec.slug,
        ownerName: spec.owner,
        ownerPhone: spec.ownerPhone,
        plan: spec.plan,
        isActive: spec.isActive,
        maxDesks: spec.maxDesks,
        maxBranches: 1,
        trialEndsAt: spec.trialEndsAt,
      },
    });

    const managerPassword = 'Center@2026!';
    const manager = await prisma.user.findFirst({ where: { username: spec.managerUsername } });
    if (!manager) {
      const managerHash = await hashPwd(managerPassword);
      await prisma.user.create({
        data: {
          username: spec.managerUsername,
          email: `${spec.managerUsername}@${spec.slug}.local`,
          passwordHash: managerHash,
          fullName: spec.owner,
          role: Role.ADMIN,
          phoneNumber: spec.ownerPhone,
          preferredLanguage: 'ar',
          isActive: true,
          tenantId: tenant.id,
        },
      });
    }
    const managerUser = await prisma.user.findUniqueOrThrow({ where: { username: spec.managerUsername } });
    const ctx: SeedCtx = {
      prisma,
      tenantId: tenant.id,
      adminId: managerUser.id,
      receptionistId: managerUser.id,
      rooms: [],
      teachers: [],
    };

    const subCount = await prisma.subscription.count({ where: { tenantId: tenant.id } });
    if (subCount === 0) {
      for (const sub of spec.subscriptions ?? []) {
        const createdSub = await prisma.subscription.create({
          data: {
            tenantId: tenant.id,
            plan: sub.plan,
            status: sub.status,
            amount: dec(sub.amount),
            currency: 'EGP',
            paymentMethod: sub.paymentMethod,
            paymentReference: sub.paymentReference,
            periodStart: sub.periodStart,
            periodEnd: sub.periodEnd,
          },
        });
        await auditEntry({
          ctx,
          actorId: managerUser.id,
          action: sub.status === SubscriptionStatus.ACTIVE ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_CREATED',
          entityType: 'SUBSCRIPTION',
          entityId: createdSub.id,
          amount: sub.amount,
          metadata: { plan: sub.plan, paymentMethod: sub.paymentMethod },
        });
      }
    }

    if (spec.suspendedAudit) {
      const existingSub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
      if (existingSub) {
        const expiredAudits = await prisma.auditLog.count({ where: { actorId: managerUser.id, action: 'SUBSCRIPTION_EXPIRED' } });
        if (expiredAudits === 0) {
          await auditEntry({
            ctx,
            actorId: managerUser.id,
            action: 'SUBSCRIPTION_EXPIRED',
            entityType: 'SUBSCRIPTION',
            entityId: existingSub.id,
            amount: 0,
            metadata: { plan: existingSub.plan },
          });
        }
      }
      continue;
    }

    if (spec.students.length === 0) continue;
    const studentCount = await prisma.student.count({ where: { tenantId: tenant.id } });
    if (studentCount > 0) continue;

    const teacher = await prisma.teacher.create({
      data: {
        tenantId: tenant.id,
        fullName: spec.teacher.fullName,
        searchName: norm(spec.teacher.fullName),
        phoneNumber: spec.teacher.phone,
        subject: spec.teacher.subject,
        defaultCenterFee: spec.teacher.fee,
        assistantName: null,
        assistantPhone: null,
        isActive: true,
      },
    });
    const room = await prisma.room.create({
      data: {
        tenantId: tenant.id,
        name: `قاعة ${spec.name.split(' ').pop() ?? ''}`,
        capacity: 40,
        floor: 'الطابق الأرضي',
        isActive: true,
      },
    });

    const students: StudentRow[] = [];
    for (let i = 0; i < spec.students.length; i++) {
      const s = spec.students[i];
      students.push(
        await prisma.student.create({
          data: {
            tenantId: tenant.id,
            studentCode: stuCode(i + 1),
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
    ctx.rooms = [room];
    ctx.teachers = [teacher];
    ctx.students = students;

    const shift = await ctx.prisma.shiftRegister.create({
      data: {
        tenantId: tenant.id,
        receptionistId: managerUser.id,
        deskIdentifier: 'DESK-A',
        openedAt: daysAgo(2, 8),
        closedAt: daysAgo(2, 12),
        openingCash: dec(200),
        status: ShiftStatus.CLOSED,
      },
    });
    await auditEntry({
      ctx,
      actorId: managerUser.id,
      shiftRegisterId: shift.id,
      action: 'SHIFT_OPENED',
      entityType: 'SHIFT_REGISTER',
      entityId: shift.id,
      amount: 200,
      metadata: { deskIdentifier: 'DESK-A' },
    });

    const session = await ctx.prisma.session.create({
      data: {
        tenantId: tenant.id,
        teacherId: teacher.id,
        roomId: room.id,
        title: `${teacher.subject} — درس تجريبي`,
        academicStage: students[0].academicStage,
        startTime: daysAgo(2, 9),
        endTime: daysAgo(2, 11),
        sessionPrice: dec(120),
        centerFeePerStudent: dec(spec.teacher.fee),
        status: SessionStatus.COMPLETED,
        createdById: managerUser.id,
      },
    });
    for (let i = 0; i < students.length; i++) {
      const pm = i % 2 === 0 ? PaymentMethod.CASH : PaymentMethod.INSTAPAY;
      await ctx.prisma.attendance.create({
        data: {
          tenantId: tenant.id,
          sessionId: session.id,
          studentId: students[i].id,
          receptionistId: managerUser.id,
          shiftRegisterId: shift.id,
          checkInTime: daysAgo(2, 8, 40 + i * 7),
          amountPaid: dec(120),
          changeOwed: dec(0),
          paymentMethod: pm,
          paymentReference: pm === PaymentMethod.CASH ? null : `IP-900${i + 1}`,
          status: AttendanceStatus.PAID,
        },
      });
    }
    const recon = await ctx.prisma.sessionReconciliation.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        lobbyCount: students.length,
        assistantCount: students.length,
        discrepancy: 0,
        reconciledHeadcount: students.length,
        resolutionNotes: null,
        reconciledById: managerUser.id,
        reconciledAt: daysAgo(2, 11),
      },
    });
    await auditEntry({
      ctx,
      actorId: managerUser.id,
      entityType: 'SESSION_RECONCILIATION',
      entityId: recon.id,
      action: 'SESSION_RECONCILED',
      amount: students.length * 120,
    });
    const payout = round2(students.length * (120 - spec.teacher.fee));
    const settlement = await ctx.prisma.sessionSettlement.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        reconciliationId: recon.id,
        disbursedFromShiftId: shift.id,
        reconciledHeadcount: students.length,
        sessionPrice: dec(120),
        centerFeePerStudent: dec(spec.teacher.fee),
        totalRevenue: dec(students.length * 120),
        centerRevenue: dec(students.length * spec.teacher.fee),
        teacherPayout: dec(payout),
        payoutMethod: PaymentMethod.INSTAPAY,
        recipientName: spec.teacher.fullName,
        status: SettlementStatus.DISBURSED,
        createdById: managerUser.id,
        settledAt: daysAgo(2, 11),
      },
    });
    await auditEntry({
      ctx,
      actorId: managerUser.id,
      shiftRegisterId: shift.id,
      entityType: 'SESSION_SETTLEMENT',
      entityId: settlement.id,
      action: 'TEACHER_PAYOUT',
      amount: payout,
      metadata: { sessionId: session.id, recipientName: settlement.recipientName, payoutMethod: settlement.payoutMethod },
    });
    await ctx.prisma.expense.create({
      data: {
        tenantId: tenant.id,
        shiftRegisterId: shift.id,
        category: 'مستلزمات مكتبية',
        amount: dec(80),
        paymentMethod: PaymentMethod.CASH,
        description: 'ورق طباعة وقرطاسية',
        createdById: managerUser.id,
      },
    });
    await finalizeShift(ctx, shift, 0, null);
  }
}

// ── 1. MAIN CENTER (live demo tenant) ──────────────────────────────────────
async function seedMainCenter(
  prisma: PrismaClient,
  passwords: { adminPassword: string; receptionistPassword: string },
) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'main-center' },
    update: {},
    create: {
      name: 'سنتر الأوائل التعليمي',
      slug: 'main-center',
      ownerName: 'أ/ محمود الشريف',
      ownerPhone: '01000000000',
      plan: TenantPlan.GROWTH,
      isActive: true,
      maxDesks: 3,
      maxBranches: 1,
      trialEndsAt: plusDays(7),
    },
  });

  const adminHash = await hashPwd(passwords.adminPassword);
  await prisma.user.upsert({
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

  const recepHash = await hashPwd(passwords.receptionistPassword);
  await prisma.user.upsert({
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

  // Fresh start: accounts only -- the center logs in with no rooms, teachers,
  // students, sessions or history. If an older seed left demo business data
  // behind (keyed on its REF-DEMO-001 subscription), wipe it exactly once so
  // existing deployments start clean; real data is never touched.
  const legacyMarker = await prisma.subscription.findFirst({
    where: { tenantId: tenant.id, paymentReference: 'REF-DEMO-001' },
    select: { id: true },
  });
  if (legacyMarker) {
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.attendance.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.sessionSettlement.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.sessionReconciliation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.session.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.expense.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.shiftRegister.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.student.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.teacher.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.room.deleteMany({ where: { tenantId: tenant.id } });
  }

  await reconcileClosedShiftDrawers(prisma);
}
