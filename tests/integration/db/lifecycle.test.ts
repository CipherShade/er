import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

// This suite exercises the real PostgreSQL database through the Fastify app.
// It is skipped unless TEST_DATABASE_URL points at a disposable test database
// that has the Prisma schema applied (`npm run db:migrate:deploy`).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

type FastifyLike = {
  ready(): Promise<void>;
  close(): Promise<void>;
  log: { level: string };
  jwt: { sign(payload: Record<string, unknown>, opts?: { expiresIn?: string }): string };
  inject(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }): Promise<{ statusCode: number; body: string }>;
};

type PrismaLike = Record<string, unknown>;

const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

function json(body: string): any {
  return JSON.parse(body);
}

describe(
  'DB-backed integration lifecycle',
  { skip: !TEST_DATABASE_URL },
  () => {
    let app: FastifyLike;
    let prisma: any;
    let adminToken: string;
    let receptionistToken: string;
    let otherReceptionistToken: string;
    let receptionistId: string;
    let otherReceptionistId: string;
    let adminId: string;

    const students: Record<string, string> = {};
    const sessions: Record<string, string> = {};
    const openShiftIds: string[] = [];
    const settledSessions: string[] = [];

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    async function seed(): Promise<void> {
      const argon2 = await import('argon2');

      const admin = await prisma.user.create({
        data: {
          username: 'int_admin',
          fullName: 'مدير الاختبارات',
          passwordHash: await argon2.hash('IntAdmin@123'),
          role: 'ADMIN',
          phoneNumber: '01000000000',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      adminId = admin.id;

      const reception1 = await prisma.user.create({
        data: {
          username: 'int_recep1',
          fullName: 'استقبال واحد',
          passwordHash: await argon2.hash('IntDesk@123'),
          role: 'RECEPTIONIST',
          phoneNumber: '01011111111',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      receptionistId = reception1.id;

      const reception2 = await prisma.user.create({
        data: {
          username: 'int_recep2',
          fullName: 'استقبال اثنان',
          passwordHash: await argon2.hash('IntDesk@123'),
          role: 'RECEPTIONIST',
          phoneNumber: '01022222222',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      otherReceptionistId = reception2.id;

      const room = await prisma.room.create({ data: { name: 'قاعة الاختبار التكاملية', capacity: 50, isActive: true } });
      const teacher = await prisma.teacher.create({
        data: {
          fullName: 'م/ اختبار التكامل',
          searchName: 'م/ اختبار التكامل',
          phoneNumber: '01033333333',
          subject: 'فيزياء',
          defaultCenterFee: 20,
          isActive: true,
        },
      });

      for (let i = 1; i <= 5; i += 1) {
        const s = await prisma.student.create({
          data: {
            studentCode: `INT-${String(i).padStart(5, '0')}`,
            fullName: `طالب اختبار ${i}`,
            searchName: `طالب اختبار ${i}`,
            guardianPhone: `011111${String(10000 + i)}`,
            academicStage: 'الثالث الثانوي',
            schoolType: 'GENERAL',
          },
        });
        students[`S${i}`] = s.id;
      }

      const stage = 'الثالث الثانوي';
      const makeSession = async (title: string, startOffsetMin: number) => {
        const s = await prisma.session.create({
          data: {
            teacherId: teacher.id,
            roomId: room.id,
            title,
            academicStage: stage,
            startTime: new Date(now.getTime() + startOffsetMin * 60_000),
            endTime: new Date(now.getTime() + (startOffsetMin + 60) * 60_000),
            sessionPrice: 150,
            centerFeePerStudent: 20,
            status: 'SCHEDULED',
            createdById: adminId,
          },
        });
        return s.id;
      };

      sessions.A = await makeSession('حصة الدفع الثلاثي', 5);
      sessions.B = await makeSession('حصة التوافق', 65);
      sessions.C = await makeSession('حصة التصفية النقدية', 125);
      sessions.D = await makeSession('حصة تحويل فودافون', 185);
      sessions.E = await makeSession('حصة إنستاباي', 245);
    }

    async function clean(): Promise<void> {
      await prisma.auditLog.deleteMany({});
      await prisma.expense.deleteMany({});
      await prisma.sessionSettlement.deleteMany({});
      await prisma.sessionReconciliation.deleteMany({});
      await prisma.attendance.deleteMany({});
      await prisma.shiftRegister.deleteMany({});
      await prisma.session.deleteMany({});
      await prisma.student.deleteMany({});
      await prisma.teacher.deleteMany({});
      await prisma.room.deleteMany({});
      await prisma.user.deleteMany({});
    }

    async function openShift(token: string, desk = 'Desk 1', openingCash = 500): Promise<string> {
      const res = await app.inject({
        method: 'POST',
        url: '/api/shifts/open',
        headers: authHeaders(token),
        payload: { deskIdentifier: desk, openingCash },
      });
      assert.equal(res.statusCode, 201, `open shift failed: ${res.body}`);
      const shift = json(res.body).data.shift;
      openShiftIds.push(shift.id);
      return shift.id;
    }

    async function checkin(token: string, sessionId: string, studentId: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/attendances/checkin',
        headers: authHeaders(token),
        payload: { sessionId, studentId, ...payload },
      });
    }

    before(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      const { buildApp } = await import('../../../src/server/app.js');
      app = buildApp() as unknown as FastifyLike;
      await app.ready();
      app.log.level = 'silent';
      await clean();
      await seed();

      adminToken = app.jwt.sign({ sub: adminId, username: 'int_admin', role: 'ADMIN' }, { expiresIn: '1h' });
      receptionistToken = app.jwt.sign({ sub: receptionistId, username: 'int_recep1', role: 'RECEPTIONIST' }, { expiresIn: '1h' });
      otherReceptionistToken = app.jwt.sign({ sub: otherReceptionistId, username: 'int_recep2', role: 'RECEPTIONIST' }, { expiresIn: '1h' });
    });

    after(async () => {
      await app.close();
      await prisma.$disconnect();
    });

    test('AUTH: real login succeeds and wrong credentials are rejected', async () => {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'int_recep1', password: 'IntDesk@123' },
      });
      assert.equal(ok.statusCode, 200);
      assert.equal(json(ok.body).data.user.role, 'RECEPTIONIST');

      const bad = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'int_recep1', password: 'wrong-password' },
      });
      assert.equal(bad.statusCode, 401);
      assert.equal(json(bad.body).error.code, 'INVALID_CREDENTIALS');
    });

    test('CHECKIN: all three payment methods record one attendance each', async () => {
      await openShift(receptionistToken, 'Desk 1', 500);

      const cash = await checkin(receptionistToken, sessions.A, students.S1, { paymentMethod: 'CASH' });
      assert.equal(cash.statusCode, 201, cash.body);
      assert.equal(json(cash.body).data.attendance.paymentMethod, 'CASH');
      assert.equal(json(cash.body).data.attendance.changeOwed, 0);

      const vf = await checkin(receptionistToken, sessions.A, students.S2, {
        paymentMethod: 'VODAFONE_CASH',
        paymentReference: '01111111111',
      });
      assert.equal(vf.statusCode, 201, vf.body);
      assert.equal(json(vf.body).data.attendance.paymentMethod, 'VODAFONE_CASH');

      const insta = await checkin(receptionistToken, sessions.A, students.S3, {
        paymentMethod: 'INSTAPAY',
        paymentReference: 'insta-0001',
        amountPaid: 200,
      });
      assert.equal(insta.statusCode, 201, insta.body);
      assert.equal(json(insta.body).data.attendance.changeOwed, 50);

      const list = await app.inject({
        method: 'GET',
        url: `/api/attendances/sessions/${sessions.A}/attendances`,
        headers: authHeaders(receptionistToken),
      });
      assert.equal(list.statusCode, 200);
      assert.equal(json(list.body).data.attendances.length, 3);
    });

    test('CHECKIN: a sequential duplicate check-in is rejected with 409', async () => {
      const dup = await checkin(receptionistToken, sessions.A, students.S1, { paymentMethod: 'CASH' });
      assert.equal(dup.statusCode, 409);
      assert.equal(json(dup.body).error.code, 'DUPLICATE_CHECK_IN');
    });

    test('CONCURRENCY: simultaneous duplicate check-ins yield exactly one success and one 409', async () => {
      const first = checkin(receptionistToken, sessions.B, students.S1, { paymentMethod: 'CASH' });
      const second = checkin(receptionistToken, sessions.B, students.S1, { paymentMethod: 'CASH' });
      const [a, b] = await Promise.allSettled([first, second]);
      const results = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.statusCode : -1)).sort();
      assert.deepEqual(results, [201, 409]);

      const count = await prisma.attendance.count({ where: { sessionId: sessions.B, studentId: students.S1 } });
      assert.equal(count, 1);
    });

    test('RECONCILIATION: mismatched counts require resolution notes', async () => {
      const openId = await openShift(receptionistToken, 'Desk 2', 500);
      await checkin(receptionistToken, sessions.C, students.S2, { paymentMethod: 'CASH' });
      await checkin(receptionistToken, sessions.C, students.S3, { paymentMethod: 'CASH' });

      const noNotes = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/reconcile`,
        headers: authHeaders(receptionistToken),
        payload: { assistantCount: 3, reconciledHeadcount: 2 },
      });
      assert.equal(noNotes.statusCode, 400);
      assert.equal(json(noNotes.body).error.code, 'RECONCILIATION_REQUIRED');

      const withNotes = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/reconcile`,
        headers: authHeaders(receptionistToken),
        payload: { assistantCount: 3, reconciledHeadcount: 2, resolutionNotes: 'قدم طالب متأخراً' },
      });
      assert.equal(withNotes.statusCode, 200, withNotes.body);
      assert.equal(json(withNotes.body).data.reconciliation.discrepancy, 1);

      openShiftIds.push(openId);
    });

    test('SETTLEMENT: cash payout computes server-side amounts and locks the session', async () => {
      const openId = await openShift(receptionistToken, 'Desk 1', 500);
      const settle = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/settle`,
        headers: authHeaders(receptionistToken),
        payload: { payoutMethod: 'CASH', recipientName: 'م/ اختبار التكامل' },
      });
      assert.equal(settle.statusCode, 201, settle.body);
      const s = json(settle.body).data.settlement;
      assert.equal(s.totalRevenue, 300);
      assert.equal(s.centerShare, 40);
      assert.equal(s.teacherPayout, 260);
      assert.equal(s.payoutMethod, 'CASH');
      settledSessions.push(sessions.C);

      const lock = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/settle`,
        headers: authHeaders(receptionistToken),
        payload: { payoutMethod: 'CASH', recipientName: 'م/ آخر' },
      });
      assert.equal(lock.statusCode, 409);
      assert.equal(json(lock.body).error.code, 'SESSION_LOCKED');

      const reconLock = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/reconcile`,
        headers: authHeaders(receptionistToken),
        payload: { assistantCount: 2, reconciledHeadcount: 2 },
      });
      assert.equal(reconLock.statusCode, 409);
      assert.equal(json(reconLock.body).error.code, 'SESSION_LOCKED');

      openShiftIds.push(openId);
    });

    test('SETTLEMENT: Vodafone Cash and InstaPay payout paths record disbursed settlements', async () => {
      for (const [key, method, studentKey, reference] of [
        ['D', 'VODAFONE_CASH', 'S1', '01012345678'],
        ['E', 'INSTAPAY', 'S2', 'insta-9999'],
      ] as const) {
        const openId = await openShift(receptionistToken, key === 'D' ? 'Desk 1' : 'Desk 2', 500);
        await checkin(receptionistToken, sessions[key], students[studentKey], { paymentMethod: method, paymentReference: reference });
        const recon = await app.inject({
          method: 'POST',
          url: `/api/sessions/${sessions[key]}/reconcile`,
          headers: authHeaders(receptionistToken),
          payload: { assistantCount: 1, reconciledHeadcount: 1 },
        });
        assert.equal(recon.statusCode, 200, recon.body);
        const settle = await app.inject({
          method: 'POST',
          url: `/api/sessions/${sessions[key]}/settle`,
          headers: authHeaders(receptionistToken),
          payload: { payoutMethod: method, recipientName: 'م/ اختبار التكامل' },
        });
        assert.equal(settle.statusCode, 201, settle.body);
        const s = json(settle.body).data.settlement;
        assert.equal(s.payoutMethod, method);
        assert.equal(s.teacherPayout, 130);
        settledSessions.push(sessions[key]);
        openShiftIds.push(openId);
      }
    });

    test('SHIFT CLOSE: exact count, overage, and shortage variances are persisted', async () => {
      const exact = await app.inject({
        method: 'POST',
        url: '/api/shifts/close',
        headers: authHeaders(receptionistToken),
        payload: { actualCashCounted: 500 },
      });
      assert.equal(exact.statusCode, 200, exact.body);
      assert.equal(json(exact.body).data.shift.cashVariance, 0);

      await openShift(receptionistToken, 'Desk 1', 1000);
      const shortage = await app.inject({
        method: 'POST',
        url: '/api/shifts/close',
        headers: authHeaders(receptionistToken),
        payload: { actualCashCounted: 950 },
      });
      assert.equal(shortage.statusCode, 200);
      assert.equal(json(shortage.body).data.shift.cashVariance, -50);

      await openShift(receptionistToken, 'Desk 1', 1000);
      const overage = await app.inject({
        method: 'POST',
        url: '/api/shifts/close',
        headers: authHeaders(receptionistToken),
        payload: { actualCashCounted: 1050 },
      });
      assert.equal(overage.statusCode, 200);
      assert.equal(json(overage.body).data.shift.cashVariance, 50);
    });

    test('REPORT: daily summary captures attendees, settlements, and digital collections', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/reports/daily?date=${today}`,
        headers: authHeaders(adminToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      const data = json(res.body).data;
      assert.equal(data.totalAttendees, 8);
      assert.equal(data.centerNetRevenue, 40 + 20 + 20);
      assert.equal(data.teacherPayouts, 260 + 130 + 130);
      assert.ok(data.digitalCollections > 0);
      assert.ok(data.digitalCollectionsByMethod.vodafoneCash > 0);
      assert.ok(data.digitalCollectionsByMethod.instapay > 0);
      assert.equal(settledSessions.length, 3);
    });

    test('REPORT: voided attendance records are excluded from the totals', async () => {
      const voided = await prisma.attendance.findFirst({ where: { sessionId: sessions.B } });
      assert.ok(voided);
      await prisma.attendance.update({ where: { id: voided.id }, data: { status: 'VOID' } });

      const res = await app.inject({
        method: 'GET',
        url: `/api/reports/daily?date=${today}`,
        headers: authHeaders(adminToken),
      });
      assert.equal(res.statusCode, 200);
      assert.equal(json(res.body).data.totalAttendees, 7);
    });

    test('REPORT: a day without data reports zero totals', async () => {
      const farPast = '2000-01-01';
      const res = await app.inject({
        method: 'GET',
        url: `/api/reports/daily?date=${farPast}`,
        headers: authHeaders(adminToken),
      });
      assert.equal(res.statusCode, 200);
      const data = json(res.body).data;
      assert.equal(data.totalAttendees, 0);
      assert.equal(data.centerNetRevenue, 0);
      assert.equal(data.teacherPayouts, 0);
    });

    test('AUDIT: entries are ordered, actor-attributed, and scoped by shift ownership', async () => {
      const shiftId = openShiftIds[0];
      assert.ok(shiftId);

      const asAdmin = await app.inject({
        method: 'GET',
        url: `/api/reports/shifts/${shiftId}/audit`,
        headers: authHeaders(adminToken),
      });
      assert.equal(asAdmin.statusCode, 200, asAdmin.body);
      const data = json(asAdmin.body).data;
      assert.ok(data.entries.length >= 2);
      const actions = data.entries.map((e: any) => e.action);
      assert.ok(actions.includes('SHIFT_OPENED'));
      assert.ok(actions.includes('ATTENDANCE_CHECKED_IN'));

      const times = data.entries.map((e: any) => new Date(e.createdAt).getTime());
      assert.deepEqual(times, [...times].sort((x: number, y: number) => x - y));

      const checkinEntry = data.entries.find((e: any) => e.action === 'ATTENDANCE_CHECKED_IN');
      assert.ok(checkinEntry);
      assert.equal(checkinEntry.actor.role, 'RECEPTIONIST');
      assert.equal(checkinEntry.actor.id, receptionistId);

      const asOwner = await app.inject({
        method: 'GET',
        url: `/api/reports/shifts/${shiftId}/audit`,
        headers: authHeaders(receptionistToken),
      });
      assert.equal(asOwner.statusCode, 200);

      const asOther = await app.inject({
        method: 'GET',
        url: `/api/reports/shifts/${shiftId}/audit`,
        headers: authHeaders(otherReceptionistToken),
      });
      assert.equal(asOther.statusCode, 403);
      assert.equal(json(asOther.body).error.code, 'AUDIT_ACCESS_DENIED');
    });
  },
);