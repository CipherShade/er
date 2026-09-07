import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, createTestApp, authHeaders, errorCode, validUUID } from './helpers.js';

const SESSION_ID = validUUID('11111111-0000-0000-0000-0000aaaa0001');
const STUDENT_ID = validUUID('22222222-0000-0000-0000-0000bbbb0001');

describe('CHECK-IN HTTP guards (no DB required)', () => {
  test('unknown payment method fails schema validation with 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(tk.receptionist),
      payload: { sessionId: SESSION_ID, studentId: STUDENT_ID, paymentMethod: 'PAYPAL' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('payment reference shorter than 3 characters fails schema validation', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(tk.receptionist),
      payload: { sessionId: SESSION_ID, studentId: STUDENT_ID, paymentMethod: 'INSTAPAY', paymentReference: 'ab' },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('digital settlement requires a payment reference (handler validation before DB)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(tk.receptionist),
      payload: { sessionId: SESSION_ID, studentId: STUDENT_ID, paymentMethod: 'VODAFONE_CASH' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'PAYMENT_REFERENCE_REQUIRED');
    await app.close();
  });

  test('amount paid with more than two decimals is rejected before any shift lookup', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(tk.receptionist),
      payload: { sessionId: SESSION_ID, studentId: STUDENT_ID, paymentMethod: 'CASH', amountPaid: 150.001 },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('each of the three payment methods passes the guard layer (no 401/403)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    for (const [method, reference] of [
      ['CASH', undefined],
      ['VODAFONE_CASH', '01111111111'],
      ['INSTAPAY', 'insta-ref-123'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/attendances/checkin',
        headers: authHeaders(tk.receptionist),
        payload: { sessionId: SESSION_ID, studentId: STUDENT_ID, paymentMethod: method, paymentReference: reference },
      });
      assert.notEqual(res.statusCode, 401, `${method} must not be unauthenticated`);
      assert.notEqual(res.statusCode, 403, `${method} must not be forbidden`);
    }
    await app.close();
  });
});

describe('RECONCILIATION HTTP guards (no DB required)', () => {
  test('invalid session UUID returns 400 for a receptionist (guard passes)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/not-a-uuid/reconcile',
      headers: authHeaders(tk.receptionist),
      payload: { assistantCount: 20, reconciledHeadcount: 20 },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('negative counts fail schema validation', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/reconcile`,
      headers: authHeaders(tk.receptionist),
      payload: { assistantCount: -1, reconciledHeadcount: 10 },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('missing reconciledHeadcount is rejected by the schema', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/reconcile`,
      headers: authHeaders(tk.receptionist),
      payload: { assistantCount: 20 },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe('SETTLEMENT HTTP guards (no DB required)', () => {
  test('invalid session UUID returns 400 for a receptionist (guard passes)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/bad!!/settle',
      headers: authHeaders(tk.receptionist),
      payload: { payoutMethod: 'CASH', recipientName: 'م. محمد' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('unknown payout method fails schema validation', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/settle`,
      headers: authHeaders(tk.receptionist),
      payload: { payoutMethod: 'BITCOIN', recipientName: 'م. محمد' },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('recipient name shorter than 3 characters fails schema validation', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${SESSION_ID}/settle`,
      headers: authHeaders(tk.receptionist),
      payload: { payoutMethod: 'VODAFONE_CASH', recipientName: 'م' },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('all three payout methods pass the guard layer (no 401/403)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    for (const method of ['CASH', 'VODAFONE_CASH', 'INSTAPAY']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/sessions/${SESSION_ID}/settle`,
        headers: authHeaders(tk.receptionist),
        payload: { payoutMethod: method, recipientName: 'م. محمد' },
      });
      assert.notEqual(res.statusCode, 401, `${method} payout must not be unauthenticated`);
      assert.notEqual(res.statusCode, 403, `${method} payout must not be forbidden`);
    }
    await app.close();
  });
});

describe('EXPENSE HTTP guards (no DB required)', () => {
  test('amount with more than two decimals is rejected by the money validator', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/expenses',
      headers: authHeaders(tk.receptionist),
      payload: { category: 'مستلزمات', amount: 25.001, paymentMethod: 'VODAFONE_CASH', description: 'ورق طباعة' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('unknown payment method fails schema validation', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/expenses',
      headers: authHeaders(tk.receptionist),
      payload: { category: 'مستلزمات', amount: 25, paymentMethod: 'CASHLESS', description: 'ورق طباعة' },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('description shorter than 3 characters fails schema validation', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/expenses',
      headers: authHeaders(tk.receptionist),
      payload: { category: 'مستلزمات', amount: 25, paymentMethod: 'CASH', description: 'ab' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });
});

describe('REPORT & AUDIT HTTP guards (no DB required)', () => {
  test('audit endpoint rejects an invalid shift UUID with 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/shifts/not-a-shift/audit',
      headers: authHeaders(tk.receptionist),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('receptionist passes the audit guard for a well-formed shift id (not 401/403)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/shifts/${validUUID('99999999-0000-0000-0000-000000000001')}/audit`,
      headers: authHeaders(tk.receptionist),
    });
    assert.notEqual(res.statusCode, 401);
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });

  test('daily report is reachable by both ADMIN and RECEPTIONIST (not 401/403)', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    for (const token of [tk.admin, tk.receptionist]) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/daily?date=2026-01-05',
        headers: authHeaders(token),
      });
      assert.notEqual(res.statusCode, 401);
      assert.notEqual(res.statusCode, 403);
    }
    await app.close();
  });

  test('daily report rejects a malformed date with 400', async () => {
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/daily?date=05-01-2026',
      headers: authHeaders(tk.admin),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'INVALID_REPORT_DATE');
    await app.close();
  });
});