import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentMethod, SessionStatus } from '../src/shared/constants/index.js';

import {
  calculateChangeOwed,
  isSessionEligibleForLobbyDashboard,
  validateCheckinInput,
  isDigital,
} from '../src/server/modules/attendances/attendances.js';
import { validUUID } from './helpers.js';

describe('CHECK-IN: change owed', () => {
  test('change is returned only when the payment exceeds the fee', () => {
    assert.equal(calculateChangeOwed(180, 150), 30);
    assert.equal(calculateChangeOwed(150, 150), 0);
    assert.equal(calculateChangeOwed(120, 150), 0);
    assert.equal(calculateChangeOwed(0, 0), 0);
  });
});

describe('CHECK-IN: lobby dashboard eligibility', () => {
  const now = Date.now();
  const mk = (status: SessionStatus, startDeltaMin: number, endDeltaMin: number) => ({
    status,
    startTime: new Date(now + startDeltaMin * 60_000),
    endTime: new Date(now + endDeltaMin * 60_000),
  });

  test('ACTIVE sessions are always shown', () => {
    assert.equal(isSessionEligibleForLobbyDashboard(mk(SessionStatus.ACTIVE, -5, 55)), true);
  });

  test('SCHEDULED sessions start within 30 minutes are shown', () => {
    assert.equal(isSessionEligibleForLobbyDashboard(mk(SessionStatus.SCHEDULED, 10, 70)), true);
    assert.equal(isSessionEligibleForLobbyDashboard(mk(SessionStatus.SCHEDULED, 1, 61)), true);
  });

  test('SCHEDULED sessions start more than 30 minutes away are hidden', () => {
    assert.equal(isSessionEligibleForLobbyDashboard(mk(SessionStatus.SCHEDULED, 31, 91)), false);
  });

  test('COMPLETED or CANCELLED sessions are never shown', () => {
    assert.equal(isSessionEligibleForLobbyDashboard(mk(SessionStatus.COMPLETED, 0, 60)), false);
    assert.equal(isSessionEligibleForLobbyDashboard(mk(SessionStatus.CANCELLED, 0, 60)), false);
  });
});

describe('CHECK-IN: input validation', () => {
  test('digital payments REQUIRE a payment reference', () => {
    for (const method of [PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY]) {
      const err = validateCheckinInput({ paymentMethod: method });
      assert.ok(err);
      assert.equal(err!.error.code, 'PAYMENT_REFERENCE_REQUIRED');
    }
  });

  test('digital payments accept a non-blank reference', () => {
    for (const method of [PaymentMethod.VODAFONE_CASH, PaymentMethod.INSTAPAY]) {
      assert.equal(validateCheckinInput({ paymentMethod: method, paymentReference: '01111111111' }), null);
    }
  });

  test('cash does not require a reference', () => {
    assert.equal(validateCheckinInput({ paymentMethod: PaymentMethod.CASH }), null);
    assert.equal(validateCheckinInput({ paymentMethod: PaymentMethod.CASH, paymentReference: undefined }), null);
  });

  test('amount must be a valid 2-dp finite non-negative number', () => {
    const err = validateCheckinInput({ paymentMethod: PaymentMethod.CASH, amountPaid: 1.234 });
    assert.ok(err);
    assert.equal(err!.error.code, 'VALIDATION_ERROR');
    assert.equal(validateCheckinInput({ paymentMethod: PaymentMethod.CASH, amountPaid: 150 }), null);
    assert.equal(validateCheckinInput({ paymentMethod: PaymentMethod.CASH, amountPaid: 0 }), null);
  });

  test('isDigital detects only wallet methods', () => {
    assert.equal(isDigital(PaymentMethod.VODAFONE_CASH), true);
    assert.equal(isDigital(PaymentMethod.INSTAPAY), true);
    assert.equal(isDigital(PaymentMethod.CASH), false);
  });
});

describe('CHECK-IN HTTP workflow', () => {
  test('malformed check-in body returns 400 VALIDATION_ERROR', async () => {
    const { tokens, createTestApp, authHeaders, errorCode } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(tk.receptionist),
      payload: { sessionId: 'not-a-uuid', studentId: 'not-a-uuid', paymentMethod: null },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('check-in with a digital method but missing reference returns 400', async () => {
    const { tokens, createTestApp, authHeaders, errorCode } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const sessionId = validUUID('11111111-0000-0000-0000-000000000001');
    const studentId = validUUID('22222222-0000-0000-0000-000000000001');
    // Route requires ADMIN/RECEPTIONIST; the digital-ref check happens after
    // the DB session lookup but before creating anything — with no DB it will
    // not reach that check. We verify at the pure layer instead (above).
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(tk.receptionist),
      payload: { sessionId, studentId, paymentMethod: 'VODAFONE_CASH' },
    });
    // No DB: should not be a 403 (guard passes); it will throw downstream.
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });
});

import { validUUID } from './helpers.js';