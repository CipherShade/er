import { Prisma, PrismaClient } from '@prisma/client';
import type { Room, Session, ShiftRegister, Student, Teacher } from '@prisma/client';
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
import { getPlanConfig } from '../../shared/constants/plans.js';
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

function minutesAgo(min: number): Date {
  return new Date(Date.now() - min * 60 * 1000);
}

function minutesFromNow(min: number): Date {
  return new Date(Date.now() + min * 60 * 1000);
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
type SessionRow = Session;

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
      plan: TenantPlan.CONTROL,
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
        { plan: TenantPlan.ESSENTIAL, status: SubscriptionStatus.CANCELED, amount: 499, paymentMethod: PaymentMethod.CASH, paymentReference: 'CR-2026-07', periodStart: daysAgo(75), periodEnd: daysAgo(45) },
        { plan: TenantPlan.CONTROL, status: SubscriptionStatus.ACTIVE, amount: 1199, paymentMethod: PaymentMethod.INSTAPAY, paymentReference: 'SUB-CTL-2026', periodStart: daysAgo(45), periodEnd: plusDays(320) },
      ],
    },
    {
      slug: 'giza-heights',
      name: 'مركز الجيزة هايتس',
      owner: 'أ/ هالة فاروق',
      ownerPhone: '01122222222',
      plan: TenantPlan.CONTROL,
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
        { plan: TenantPlan.CONTROL, status: SubscriptionStatus.ACTIVE, amount: 1199, paymentMethod: PaymentMethod.VODAFONE_CASH, paymentReference: 'SUB-CTL-2026-08', periodStart: daysAgo(60), periodEnd: plusDays(305) },
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
        maxUsers: getPlanConfig(spec.plan).limits.maxUsers,
        visitLimit: getPlanConfig(spec.plan).limits.visitLimit,
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
      plan: TenantPlan.ESSENTIAL,
      isActive: true,
      maxDesks: 3,
      maxBranches: 1,
      maxUsers: getPlanConfig(TenantPlan.ESSENTIAL).limits.maxUsers,
      visitLimit: getPlanConfig(TenantPlan.ESSENTIAL).limits.visitLimit,
      trialEndsAt: plusDays(7),
    },
  });

  const adminHash = await hashPwd(passwords.adminPassword);
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

  const recepHash = await hashPwd(passwords.receptionistPassword);
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

  // One-time repair: a previous deploy wrote the seed data with mojibake
  // Arabic (double-encoded through a console codepage). Detect those rows
  // (their names literally contain the CP437 box-drawing character ┘) and
  // wipe the tenant's business data so the corrected seed rebuilds it below.
  // This runs at most once because the marker rows are deleted with them.
  const mojibakeMarker = await prisma.student.findFirst({
    where: { tenantId: tenant.id, fullName: { contains: '┘' } },
    select: { id: true },
  });
  if (mojibakeMarker) {
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

  const ctxSC: SeedCtx = {
    prisma,
    tenantId: tenant.id,
    adminId: admin.id,
    receptionistId: receptionist.id,
    rooms: [],
    teachers: [],
  };

  const subCount = await prisma.subscription.count({ where: { tenantId: tenant.id } });
  if (subCount === 0) {
    const previous = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: TenantPlan.ESSENTIAL,
        status: SubscriptionStatus.EXPIRED,
        amount: dec(499),
        currency: 'EGP',
        paymentMethod: PaymentMethod.CASH,
        paymentReference: 'REF-2026-08',
        periodStart: daysAgo(392),
        periodEnd: daysAgo(30),
      },
    });
    await auditEntry({
      ctx: ctxSC,
      actorId: admin.id,
      action: 'SUBSCRIPTION_CREATED',
      entityType: 'SUBSCRIPTION',
      entityId: previous.id,
      amount: 499,
      metadata: { plan: TenantPlan.ESSENTIAL, paymentMethod: PaymentMethod.CASH },
    });
    const active = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: TenantPlan.ESSENTIAL,
        status: SubscriptionStatus.ACTIVE,
        amount: dec(499),
        currency: 'EGP',
        paymentMethod: PaymentMethod.CASH,
        paymentReference: 'REF-DEMO-001',
        periodStart: daysAgo(30),
        periodEnd: plusDays(335),
      },
    });
    await auditEntry({
      ctx: ctxSC,
      actorId: admin.id,
      action: 'SUBSCRIPTION_RENEWED',
      entityType: 'SUBSCRIPTION',
      entityId: active.id,
      amount: 499,
      metadata: { plan: TenantPlan.ESSENTIAL, paymentMethod: PaymentMethod.CASH },
    });
  }

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

  const teachersRaw = [
    { fullName: 'أ/ محمد عبد الفتاح', phone: '01011111111', subject: 'فيزياء', fee: 20, asst: 'م/ وليد سامي', asstPhone: '01022222222' },
    { fullName: 'أ/ نادية إبراهيم', phone: '01033333333', subject: 'رياضيات', fee: 15, asst: null, asstPhone: null },
    { fullName: 'أ/ كريم السيد', phone: '01044444444', subject: 'كيمياء', fee: 25, asst: 'أ/ منى فاروق', asstPhone: '01055555555' },
    { fullName: 'أ/ هبة يوسف', phone: '01066666666', subject: 'لغة عربية', fee: 10, asst: null, asstPhone: null },
    { fullName: 'أ/ أحمد حمدي', phone: '01077777777', subject: 'أحياء', fee: 20, asst: null, asstPhone: null },
  ];
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

  const ctx: SeedCtx = {
    prisma,
    tenantId: tenant.id,
    adminId: admin.id,
    receptionistId: receptionist.id,
    rooms,
    teachers,
  };

  const studentCount = await prisma.student.count({ where: { tenantId: tenant.id } });
  if (studentCount === 0) {
    await seedStudents(prisma, tenant.id);
    const allStudents = await prisma.student.findMany({
      where: { tenantId: tenant.id },
      orderBy: { studentCode: 'asc' },
    });
    await seedHistorical(ctx, {
      grade3: allStudents.slice(0, 12),
      grade2: allStudents.slice(12, 22),
      grade1: allStudents.slice(22, 30),
      prep: allStudents.slice(30, 40),
    });
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    orderBy: { studentCode: 'asc' },
    take: 12,
  });
  ctx.students = students;

  await ensureLiveData(ctx);
  await reconcileClosedShiftDrawers(prisma);
}

async function seedStudents(prisma: PrismaClient, tenantId: string) {
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

  for (let i = 0; i < studentsRaw.length; i++) {
    const s = studentsRaw[i];
    await prisma.student.create({
      data: {
        tenantId: tenantId,
        studentCode: stuCode(i + 1),
        fullName: s.n,
        searchName: norm(s.n),
        studentPhone: s.p,
        guardianPhone: s.g,
        academicStage: s.stage,
        schoolType: s.type,
      },
    });
  }
}

// ── 2. HISTORICAL DAYS (closed shifts + completed sessions) ─────────────────
type SessionPlan = {
  teacher: TeacherRow;
  room: RoomRow;
  title: string;
  stage: string;
  price: number;
  fee: number;
  startHour: number;
  durationH: number;
  attendees: StudentRow[];
  pmCycle: PaymentMethod[];
  partial?: number;
  overPay?: boolean;
  assistantOffset?: number;
  recoNotes?: string | null;
  payout: PaymentMethod;
};

type DayPlan = {
  day: number;
  desk: string;
  openHour: number;
  closeHour: number;
  opening: number;
  variance: number;
  closingNotes?: string | null;
  sessions: SessionPlan[];
  expenses: { cat: string; amt: number; desc: string; pm: PaymentMethod }[];
};

async function makeSession(ctx: SeedCtx, sp: Required<Pick<SessionPlan, 'teacher' | 'room' | 'title' | 'stage' | 'price' | 'fee' | 'startHour' | 'durationH' | 'attendees' | 'pmCycle' | 'payout'>> & Partial<SessionPlan> & { shift: ShiftRow; day: number }) {
  const { prisma, tenantId, adminId, receptionistId } = ctx;
  const startAt = daysAgo(sp.day, sp.startHour);
  const session = await prisma.session.create({
    data: {
      tenantId,
      teacherId: sp.teacher.id,
      roomId: sp.room.id,
      title: sp.title,
      academicStage: sp.stage,
      startTime: startAt,
      endTime: new Date(startAt.getTime() + Math.floor(sp.durationH * 60) * 60000),
      sessionPrice: dec(sp.price),
      centerFeePerStudent: dec(sp.fee),
      status: SessionStatus.COMPLETED,
      createdById: adminId,
    },
  });

  for (let i = 0; i < sp.attendees.length; i++) {
    const pm = sp.pmCycle[i % sp.pmCycle.length];
    let amountPaid = sp.price;
    let changeOwed = 0;
    let status: AttendanceStatus = AttendanceStatus.PAID;
    if (sp.overPay && i === 0) {
      amountPaid = sp.price + 50;
      changeOwed = 50;
    } else if (i < (sp.partial ?? 0)) {
      amountPaid = sp.price - 30;
      status = AttendanceStatus.PARTIAL;
    }
    const paid = round2(amountPaid);
    const attendance = await prisma.attendance.create({
      data: {
        tenantId,
        sessionId: session.id,
        studentId: sp.attendees[i].id,
        receptionistId,
        shiftRegisterId: sp.shift.id,
        checkInTime: new Date(startAt.getTime() - (30 - i * 2) * 60000),
        amountPaid: dec(paid),
        changeOwed: dec(changeOwed),
        paymentMethod: pm,
        paymentReference: pm === PaymentMethod.CASH ? null : `${pm === PaymentMethod.VODAFONE_CASH ? 'VC' : 'IP'}-${1000 + i}`,
        status,
      },
    });
    if (i < 2) {
      await auditEntry({
        ctx,
        actorId: receptionistId,
        shiftRegisterId: sp.shift.id,
        action: 'ATTENDANCE_CHECKED_IN',
        entityType: 'ATTENDANCE',
        entityId: attendance.id,
        amount: paid,
        metadata: { sessionId: session.id, studentId: sp.attendees[i].id, paymentMethod: pm, status },
      });
    }
  }

  const lobbyCount = sp.attendees.length;
  const assistantCount = lobbyCount + (sp.assistantOffset ?? 0);
  const reconciledHead = Math.min(lobbyCount, assistantCount);
  const recon = await prisma.sessionReconciliation.create({
    data: {
      tenantId,
      sessionId: session.id,
      lobbyCount,
      assistantCount,
      discrepancy: assistantCount - lobbyCount,
      reconciledHeadcount: reconciledHead,
      resolutionNotes: sp.recoNotes ?? null,
      reconciledById: adminId,
      reconciledAt: session.endTime,
    },
  });
  await auditEntry({
    ctx,
    actorId: adminId,
    action: 'SESSION_RECONCILED',
    entityType: 'SESSION_RECONCILIATION',
    entityId: recon.id,
    amount: round2(reconciledHead * sp.price),
  });

  const teacherPayout = round2(reconciledHead * (sp.price - sp.fee));
  const settlement = await prisma.sessionSettlement.create({
    data: {
      tenantId,
      sessionId: session.id,
      reconciliationId: recon.id,
      disbursedFromShiftId: sp.shift.id,
      reconciledHeadcount: reconciledHead,
      sessionPrice: dec(sp.price),
      centerFeePerStudent: dec(sp.fee),
      totalRevenue: dec(round2(reconciledHead * sp.price)),
      centerRevenue: dec(round2(reconciledHead * sp.fee)),
      teacherPayout: dec(teacherPayout),
      payoutMethod: sp.payout,
      recipientName: sp.teacher.fullName,
      status: SettlementStatus.DISBURSED,
      createdById: adminId,
      settledAt: session.endTime,
    },
  });
  await auditEntry({
    ctx,
    actorId: adminId,
    shiftRegisterId: sp.shift.id,
    action: 'TEACHER_PAYOUT',
    entityType: 'SESSION_SETTLEMENT',
    entityId: settlement.id,
    amount: teacherPayout,
    metadata: { sessionId: session.id, recipientName: settlement.recipientName, payoutMethod: settlement.payoutMethod },
  });
  return session as SessionRow;
}

async function seedHistorical(ctx: SeedCtx, slices: { grade3: StudentRow[]; grade2: StudentRow[]; grade1: StudentRow[]; prep: StudentRow[] }) {
  const { prisma, tenantId, receptionistId, rooms, teachers } = ctx;
  const [roomBig, roomMid, roomSmall] = rooms;
  const [tPhysics, tMath, tChem, tArabic, tBio] = teachers;
  const { grade3, grade2, grade1, prep } = slices;

  const days: DayPlan[] = [
    // day 21: physics review (third secondary)
    {
      day: 21, desk: 'DESK-A', openHour: 8, closeHour: 14, opening: 500, variance: 0,
      sessions: [
        { teacher: tPhysics, room: roomBig, title: 'الفيزياء — مراجعة نهائية (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 150, fee: 20, startHour: 9, durationH: 2, attendees: grade3.slice(0, 8), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.CASH], payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'مستلزمات مكتبية', amt: 85, desc: 'ورق طباعة وأقلام', pm: PaymentMethod.CASH },
        { cat: 'مرافق', amt: 220, desc: 'فاتورة كهرباء جزئية', pm: PaymentMethod.CASH },
      ],
    },
    // day 17: organic chem + arabic grammar
    {
      day: 17, desk: 'DESK-B', openHour: 15, closeHour: 20, opening: 300, variance: 50, closingNotes: 'زيادة ٥٠ ج.م — مبالغ زائدة من الطلاب',
      sessions: [
        { teacher: tChem, room: roomMid, title: 'الكيمياء — الكيمياء العضوية (الثاني الثانوي)', stage: 'الثاني الثانوي', price: 130, fee: 25, startHour: 16, durationH: 2, attendees: grade2.slice(0, 9), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], payout: PaymentMethod.VODAFONE_CASH },
        { teacher: tArabic, room: roomSmall, title: 'اللغة العربية — النحو والصرف (الأول الثانوي)', stage: 'الأول الثانوي', price: 100, fee: 10, startHour: 18, durationH: 1.5, attendees: grade1.slice(0, 6), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], partial: 1, payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'نظافة', amt: 120, desc: 'مواد تنظيف وعامل النظافة', pm: PaymentMethod.CASH },
      ],
    },
    // day 14: physics waves + trigonometry
    {
      day: 14, desk: 'DESK-A', openHour: 8, closeHour: 14, opening: 500, variance: 0,
      sessions: [
        { teacher: tPhysics, room: roomBig, title: 'الفيزياء — الموجات والصوت (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 150, fee: 20, startHour: 9, durationH: 2, attendees: grade3.slice(0, 10), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], overPay: true, payout: PaymentMethod.INSTAPAY },
        { teacher: tMath, room: roomMid, title: 'الرياضيات — المثلثات (الأول الثانوي)', stage: 'الأول الثانوي', price: 110, fee: 15, startHour: 11.5, durationH: 1.5, attendees: grade1.slice(0, 5), pmCycle: [PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.CASH], payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'مرافق', amt: 200, desc: 'فاتورة مياه جزئية', pm: PaymentMethod.CASH },
      ],
    },
    // day 13: calculus + cell biology (evening)
    {
      day: 13, desk: 'DESK-A', openHour: 14, closeHour: 20, opening: 300, variance: 0,
      sessions: [
        { teacher: tMath, room: roomMid, title: 'الرياضيات — حساب التفاضل (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 120, fee: 15, startHour: 15, durationH: 2, attendees: grade3.slice(1, 10), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], partial: 1, assistantOffset: 1, recoNotes: 'اعتُمد عدد الاستقبال', payout: PaymentMethod.VODAFONE_CASH },
        { teacher: tBio, room: roomSmall, title: 'الأحياء — الخلية ووظائفها (الثاني الثانوي)', stage: 'الثاني الثانوي', price: 140, fee: 20, startHour: 17.5, durationH: 1.5, attendees: grade2.slice(2, 6), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'صيانة', amt: 300, desc: 'إصلاح مكيف قاعة ١', pm: PaymentMethod.CASH },
      ],
    },
    // day 12: balagha + prep geometry
    {
      day: 12, desk: 'DESK-C', openHour: 8, closeHour: 13, opening: 200, variance: -20, closingNotes: 'فرق ٢٠ ج.م — نقود نقدية بتاريخ سابق للعميل',
      sessions: [
        { teacher: tArabic, room: roomSmall, title: 'اللغة العربية — البلاغة (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 100, fee: 10, startHour: 9, durationH: 2, attendees: grade3.slice(2, 9), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.INSTAPAY], payout: PaymentMethod.INSTAPAY },
        { teacher: tMath, room: roomMid, title: 'الرياضيات — الهندسة (الإعدادي)', stage: 'الثالث الإعدادي', price: 110, fee: 15, startHour: 11, durationH: 1.5, attendees: prep.slice(0, 6), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], partial: 1, payout: PaymentMethod.VODAFONE_CASH },
      ],
      expenses: [
        { cat: 'مستلزمات مكتبية', amt: 60, desc: 'أحبار طابعة', pm: PaymentMethod.CASH },
      ],
    },
    // day 10: chemical bonds
    {
      day: 10, desk: 'DESK-A', openHour: 8, closeHour: 14, opening: 500, variance: 0,
      sessions: [
        { teacher: tChem, room: roomBig, title: 'الكيمياء — الروابط الكيميائية (الثاني الثانوي)', stage: 'الثاني الثانوي', price: 130, fee: 25, startHour: 9, durationH: 2, attendees: grade2.slice(0, 10), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY], payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'مستلزمات مكتبية', amt: 60, desc: 'أحبار طابعة', pm: PaymentMethod.CASH },
        { cat: 'صيانة', amt: 300, desc: 'فني تكييف — صيانة دورية', pm: PaymentMethod.CASH },
      ],
    },
    // day 9: physics quantities + prep algebra
    {
      day: 9, desk: 'DESK-B', openHour: 14, closeHour: 19, opening: 300, variance: 0,
      sessions: [
        { teacher: tPhysics, room: roomSmall, title: 'الفيزياء — الكميات الفيزيائية (الأول الثانوي)', stage: 'الأول الثانوي', price: 100, fee: 10, startHour: 15, durationH: 2, attendees: grade1.slice(0, 8), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], payout: PaymentMethod.VODAFONE_CASH },
        { teacher: tMath, room: roomMid, title: 'الرياضيات — الجبر (الإعدادي)', stage: 'الثاني الإعدادي', price: 110, fee: 15, startHour: 17.5, durationH: 1.5, attendees: prep.slice(1, 7), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], partial: 1, overPay: true, payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'نظافة', amt: 100, desc: 'غسيل الستائر', pm: PaymentMethod.CASH },
      ],
    },
    // day 7: light & optics + morphology (morning)
    {
      day: 7, desk: 'DESK-A', openHour: 8, closeHour: 15, opening: 1000, variance: 0,
      sessions: [
        { teacher: tPhysics, room: roomBig, title: 'الفيزياء — الضوء والبصريات (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 150, fee: 20, startHour: 9, durationH: 2, attendees: grade3.slice(0, 12), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], partial: 1, payout: PaymentMethod.INSTAPAY },
        { teacher: tArabic, room: roomSmall, title: 'اللغة العربية — الصرف (الأول الثانوي)', stage: 'الأول الثانوي', price: 100, fee: 10, startHour: 12, durationH: 2, attendees: grade1.slice(1, 9), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], payout: PaymentMethod.VODAFONE_CASH },
      ],
      expenses: [
        { cat: 'مرافق', amt: 350, desc: 'اشتراك إنترنت — تحويل بنكي', pm: PaymentMethod.VODAFONE_CASH },
        { cat: 'أخرى', amt: 120, desc: 'مستلزمات ضيافة', pm: PaymentMethod.CASH },
      ],
    },
    // day 6: biology per prep
    {
      day: 6, desk: 'DESK-C', openHour: 8, closeHour: 12, opening: 200, variance: 0,
      sessions: [
        { teacher: tBio, room: roomMid, title: 'الأحياء — الكائنات الحية (الإعدادي)', stage: 'الثالث الإعدادي', price: 120, fee: 20, startHour: 8.5, durationH: 2, attendees: prep.slice(2, 9), pmCycle: [PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY], payout: PaymentMethod.VODAFONE_CASH },
      ],
      expenses: [
        { cat: 'نظافة', amt: 100, desc: 'مواد نظافة شاملة', pm: PaymentMethod.CASH },
      ],
    },
    // day 4: genetics + polynomials (with hall discrepancy)
    {
      day: 4, desk: 'DESK-A', openHour: 8, closeHour: 14, opening: 500, variance: 0,
      sessions: [
        { teacher: tBio, room: roomMid, title: 'الأحياء — الوراثة (الثاني الثانوي)', stage: 'الثاني الثانوي', price: 140, fee: 20, startHour: 9, durationH: 2, attendees: grade2.slice(1, 10), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], partial: 1, payout: PaymentMethod.INSTAPAY },
        { teacher: tMath, room: roomSmall, title: 'الرياضيات — كثيرات الحدود (الأول الثانوي)', stage: 'الأول الثانوي', price: 110, fee: 15, startHour: 11.5, durationH: 1.5, attendees: grade1.slice(0, 8), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], assistantOffset: -1, recoNotes: 'الحضور الفعلي في القاعة أقل من الاستقبال بشخص', payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'مستلزمات مكتبية', amt: 75, desc: 'تصوير وطباعة جداول', pm: PaymentMethod.CASH },
      ],
    },
    // day 3: literature + prep physics
    {
      day: 3, desk: 'DESK-B', openHour: 14, closeHour: 20, opening: 300, variance: 0,
      sessions: [
        { teacher: tArabic, room: roomSmall, title: 'اللغة العربية — أدب ونصوص (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 100, fee: 10, startHour: 15, durationH: 2, attendees: grade3.slice(3, 11), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.INSTAPAY], payout: PaymentMethod.INSTAPAY },
        { teacher: tPhysics, room: roomBig, title: 'الفيزياء — مراجعة (الإعدادي)', stage: 'الثالث الإعدادي', price: 120, fee: 20, startHour: 17.5, durationH: 2, attendees: prep.slice(4, 10), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.VODAFONE_CASH], partial: 1, payout: PaymentMethod.VODAFONE_CASH },
      ],
      expenses: [
        { cat: 'مستلزمات مكتبية', amt: 90, desc: 'قرطاسية وأقلام تحديد', pm: PaymentMethod.CASH },
      ],
    },
    // day 1 (yesterday): organic compounds + calculus II
    {
      day: 1, desk: 'DESK-A', openHour: 8, closeHour: 14, opening: 500, variance: 0,
      sessions: [
        { teacher: tChem, room: roomBig, title: 'الكيمياء — المركبات العضوية (الثالث الثانوي)', stage: 'الثالث الثانوي', price: 130, fee: 25, startHour: 9, durationH: 2, attendees: grade3.slice(0, 12), pmCycle: [PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.VODAFONE_CASH], partial: 1, payout: PaymentMethod.VODAFONE_CASH },
        { teacher: tMath, room: roomMid, title: 'الرياضيات — التفاضل (الثاني الثانوي)', stage: 'الثاني الثانوي', price: 120, fee: 15, startHour: 11.5, durationH: 1.5, attendees: grade2.slice(0, 6), pmCycle: [PaymentMethod.CASH, PaymentMethod.INSTAPAY, PaymentMethod.CASH], payout: PaymentMethod.INSTAPAY },
      ],
      expenses: [
        { cat: 'صيانة', amt: 250, desc: 'فني تكييف — صيانة دورية', pm: PaymentMethod.CASH },
      ],
    },
  ];

  for (const dayPlan of days) {
    const openedAt = daysAgo(dayPlan.day, dayPlan.openHour);
    const closedAt = daysAgo(dayPlan.day, dayPlan.closeHour, 15);
    const shift = await prisma.shiftRegister.create({
      data: {
        tenantId,
        receptionistId,
        deskIdentifier: dayPlan.desk,
        openedAt,
        closedAt,
        openingCash: dec(dayPlan.opening),
        status: ShiftStatus.CLOSED,
      },
    });
    await auditEntry({
      ctx,
      actorId: receptionistId,
      shiftRegisterId: shift.id,
      action: 'SHIFT_OPENED',
      entityType: 'SHIFT_REGISTER',
      entityId: shift.id,
      amount: dayPlan.opening,
      metadata: { deskIdentifier: dayPlan.desk },
    });

    for (const sp of dayPlan.sessions) {
      await makeSession(ctx, Object.assign({ shift }, sp, { day: dayPlan.day }));
    }

    for (const e of dayPlan.expenses) {
      const expense = await prisma.expense.create({
        data: {
          tenantId,
          shiftRegisterId: shift.id,
          category: e.cat,
          amount: dec(e.amt),
          paymentMethod: e.pm,
          description: e.desc,
          createdById: receptionistId,
        },
      });
      await auditEntry({
        ctx,
        actorId: receptionistId,
        shiftRegisterId: shift.id,
        action: 'EXPENSE_RECORDED',
        entityType: 'EXPENSE',
        entityId: expense.id,
        amount: e.amt,
        metadata: { category: e.cat, paymentMethod: e.pm },
      });
    }

    await finalizeShift(ctx, shift, dayPlan.variance, dayPlan.closingNotes ?? null);
  }
}

// ── 3. LIVE DATA (today): open shift + in-progress + upcoming sessions ─────
// Idempotent per day: on each boot reuses today's open shift & sessions if present,
// and rolls leftover "LIVE" sessions from earlier days into CANCELLED.
async function ensureLiveData(ctx: SeedCtx) {
  const { prisma, tenantId, receptionistId, adminId, rooms, teachers, students } = ctx;
  const [roomBig, roomMid] = rooms;
  const [tPhysics, tMath] = teachers;
  const livePool = students ?? [];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let liveShift = await prisma.shiftRegister.findFirst({
    where: { tenantId, receptionistId, status: ShiftStatus.OPEN, openedAt: { gte: startOfToday } },
  });
  if (!liveShift) {
    const stale = await prisma.shiftRegister.findMany({ where: { tenantId, status: ShiftStatus.OPEN } });
    for (const s of stale) {
      const expected = await computeShiftCashFinancials(prisma, s.id);
      await prisma.shiftRegister.update({
        where: { id: s.id },
        data: {
          status: ShiftStatus.CLOSED,
          closedAt: s.openedAt,
          expectedCash: dec(expected),
          actualCashCounted: dec(expected),
          cashVariance: dec(0),
        },
      });
    }
    liveShift = await prisma.shiftRegister.create({
      data: {
        tenantId,
        receptionistId,
        deskIdentifier: 'DESK-A',
        openedAt: minutesAgo(70),
        openingCash: dec(500),
        status: ShiftStatus.OPEN,
      },
    });
    await auditEntry({
      ctx,
      actorId: receptionistId,
      shiftRegisterId: liveShift.id,
      action: 'SHIFT_OPENED',
      entityType: 'SHIFT_REGISTER',
      entityId: liveShift.id,
      amount: 500,
      metadata: { deskIdentifier: 'DESK-A' },
    });
  }

  const todaySessionCount = await prisma.session.count({ where: { tenantId, startTime: { gte: startOfToday } } });
  if (todaySessionCount > 0 || livePool.length === 0) return;

  // roll leftover demo-live sessions from previous days into CANCELLED
  await prisma.session.updateMany({
    where: {
      tenantId,
      OR: [{ title: { startsWith: 'LIVE: ' } }, { title: { startsWith: 'LIVE-UPCOMING: ' } }],
      status: { not: SessionStatus.CANCELLED },
    },
    data: { status: SessionStatus.CANCELLED },
  });

  const activeStart = minutesAgo(40);
  const activeSession = await prisma.session.create({
    data: {
      tenantId,
      teacherId: tPhysics.id,
      roomId: roomBig.id,
      title: 'LIVE: الفيزياء — مراجعة شاملة (الثالث الثانوي)',
      academicStage: 'الثالث الثانوي',
      startTime: activeStart,
      endTime: new Date(activeStart.getTime() + 2 * 60 * 60 * 1000),
      sessionPrice: dec(150),
      centerFeePerStudent: dec(20),
      status: SessionStatus.ACTIVE,
      createdById: adminId,
    },
  });

  const checkInCycle: PaymentMethod[] = [
    PaymentMethod.CASH,
    PaymentMethod.CASH,
    PaymentMethod.VODAFONE_CASH,
    PaymentMethod.INSTAPAY,
    PaymentMethod.CASH,
    PaymentMethod.CASH,
    PaymentMethod.CASH,
    PaymentMethod.VODAFONE_CASH,
  ];
  const checkInCount = Math.min(8, livePool.length);
  for (let i = 0; i < checkInCount; i++) {
    const pm = checkInCycle[i];
    let amountPaid = 150;
    let changeOwed = 0;
    let status: AttendanceStatus = AttendanceStatus.PAID;
    if (i === 0) {
      amountPaid = 120;
      status = AttendanceStatus.PARTIAL;
    } else if (i === 4) {
      amountPaid = 200;
      changeOwed = 50;
    }
    const attendance = await prisma.attendance.create({
      data: {
        tenantId,
        sessionId: activeSession.id,
        studentId: livePool[i].id,
        receptionistId,
        shiftRegisterId: liveShift.id,
        checkInTime: minutesAgo(60 - i * 3),
        amountPaid: dec(amountPaid),
        changeOwed: dec(changeOwed),
        paymentMethod: pm,
        paymentReference: pm === PaymentMethod.CASH ? null : `${pm === PaymentMethod.VODAFONE_CASH ? 'VC' : 'IP'}-LIVE${i + 1}`,
        status,
      },
    });
    await auditEntry({
      ctx,
      actorId: receptionistId,
      shiftRegisterId: liveShift.id,
      action: 'ATTENDANCE_CHECKED_IN',
      entityType: 'ATTENDANCE',
      entityId: attendance.id,
      amount: amountPaid,
      metadata: { sessionId: activeSession.id, studentId: livePool[i].id, paymentMethod: pm, status },
    });
  }

  const upcomingStart = minutesFromNow(20);
  await prisma.session.create({
    data: {
      tenantId,
      teacherId: tMath.id,
      roomId: roomMid.id,
      title: 'LIVE-UPCOMING: الرياضيات — تفاضل وتكامل (الثالث الثانوي)',
      academicStage: 'الثالث الثانوي',
      startTime: upcomingStart,
      endTime: new Date(upcomingStart.getTime() + 90 * 60 * 1000),
      sessionPrice: dec(120),
      centerFeePerStudent: dec(15),
      status: SessionStatus.SCHEDULED,
      createdById: adminId,
    },
  });

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      shiftRegisterId: liveShift.id,
      category: 'مستلزمات مكتبية',
      amount: dec(120),
      paymentMethod: PaymentMethod.CASH,
      description: 'شرائط لاصقة وأقلام تحديد',
      createdById: receptionistId,
    },
  });
  await auditEntry({
    ctx,
    actorId: receptionistId,
    shiftRegisterId: liveShift.id,
    action: 'EXPENSE_RECORDED',
    entityType: 'EXPENSE',
    entityId: expense.id,
    amount: 120,
    metadata: { category: 'مستلزمات مكتبية', paymentMethod: PaymentMethod.CASH },
  });
}