import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCashVariance,
  computeShiftFinancialSummary,
  roundAmount,
  ShiftFinancialSummary,
} from '../src/server/modules/shifts/shifts.js';

describe('SHIFTS: cash arithmetic', () => {
  test('expected cash = opening + cash in - teacher cash payouts - cash expenses', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 500,
      cashCollected: 4800,
      vodafoneCashCollected: 600,
      instapayCollected: 1200,
      teacherCashPayouts: 3800,
      cashExpenses: 150,
    });
    assert.equal(s.expectedCashInDrawer, 500 + 4800 - 3800 - 150);
    assert.equal(s.totalGrossRevenue, 4800 + 600 + 1200);
  });

  test('digital collections are revenue but not physical drawer cash', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 0,
      cashCollected: 1000,
      vodafoneCashCollected: 2000,
      instapayCollected: 3000,
      teacherCashPayouts: 0,
      cashExpenses: 0,
    });
    assert.equal(s.totalGrossRevenue, 6000);
    assert.equal(s.expectedCashInDrawer, 1000);
  });

  test('teacher payouts drawn as cash reduce expected drawer', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 1000,
      cashCollected: 5000,
      vodafoneCashCollected: 0,
      instapayCollected: 0,
      teacherCashPayouts: 4200,
      cashExpenses: 0,
    });
    assert.equal(s.expectedCashInDrawer, 1800);
  });

  test('expenses reduce drawer balance', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 1000,
      cashCollected: 5000,
      vodafoneCashCollected: 0,
      instapayCollected: 0,
      teacherCashPayouts: 0,
      cashExpenses: 800,
    });
    assert.equal(s.expectedCashInDrawer, 5200);
  });

  test('rounding keeps two decimal places', () => {
    assert.equal(roundAmount(0.1 + 0.2), 0.3);
    assert.equal(roundAmount(1.005), 1.01);
    assert.equal(roundAmount(10), 10);
  });

  test('floating point expected-cash edge cases', () => {
    const s: ShiftFinancialSummary = computeShiftFinancialSummary({
      openingCash: 0.1,
      cashCollected: 0.2,
      vodafoneCashCollected: 0,
      instapayCollected: 0,
      teacherCashPayouts: 0.05,
      cashExpenses: 0.01,
    });
    assert.equal(s.expectedCashInDrawer, 0.24);
  });

  test('digital-only collections never enter the physical drawer', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 300,
      cashCollected: 0,
      vodafoneCashCollected: 1500,
      instapayCollected: 800,
      teacherCashPayouts: 0,
      cashExpenses: 0,
    });
    assert.equal(s.totalGrossRevenue, 2300);
    assert.equal(s.expectedCashInDrawer, 300);
  });

  test('an untouched drawer equals its opening cash', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 1000,
      cashCollected: 0,
      vodafoneCashCollected: 0,
      instapayCollected: 0,
      teacherCashPayouts: 0,
      cashExpenses: 0,
    });
    assert.equal(s.expectedCashInDrawer, 1000);
    assert.equal(s.totalGrossRevenue, 0);
  });

  test('full lifecycle drawer balance stays consistent', () => {
    const s = computeShiftFinancialSummary({
      openingCash: 500,
      cashCollected: 4800,
      vodafoneCashCollected: 600,
      instapayCollected: 1200,
      teacherCashPayouts: 3800,
      cashExpenses: 150,
    });
    assert.equal(s.totalGrossRevenue, 6600);
    assert.equal(s.totalCashCollected, 4800);
    assert.equal(s.totalVodafoneCashCollected, 600);
    assert.equal(s.totalInstapayCollected, 1200);
    assert.equal(s.totalTeacherCashPayouts, 3800);
    assert.equal(s.totalCashExpenses, 150);
    assert.equal(s.expectedCashInDrawer, 500 + 4800 - 3800 - 150);
  });
});

describe('SHIFTS: variance', () => {
  test('variance = actual - expected', () => {
    assert.equal(calculateCashVariance(1500, 1350), 150); // overage
    assert.equal(calculateCashVariance(1200, 1350), -150); // shortage
    assert.equal(calculateCashVariance(1350, 1350), 0);
  });

  test('variance is rounded to the cent', () => {
    assert.equal(calculateCashVariance(100.009, 100), 0.01);
    assert.equal(calculateCashVariance(100.01, 100), 0.01);
    assert.equal(calculateCashVariance(100.004, 100), 0);
  });
});

describe('SHIFTS HTTP guards', () => {
  test('POST /shifts/open is permitted for receptionists (not forbidden)', async () => {
    const { tokens, createTestApp, authHeaders } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/open',
      headers: authHeaders(tk.receptionist),
      payload: { deskIdentifier: 'Desk 1', openingCash: 500 },
    });
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });

  test('POST /shifts/open requires a valid money openingCash', async () => {
    const { tokens, createTestApp, authHeaders, errorCode } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/open',
      headers: authHeaders(tk.admin),
      payload: { deskIdentifier: 'Desk 1', openingCash: 1.234 },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('POST /shifts/close rejects a missing actualCashCounted with 400', async () => {
    const { tokens, createTestApp, authHeaders } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/close',
      headers: authHeaders(tk.receptionist),
      payload: { closingNotes: 'end of night' },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test('POST /shifts/close passes the guard layer even with a 3-dp cash value', async () => {
    const { tokens, createTestApp, authHeaders } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/close',
      headers: authHeaders(tk.receptionist),
      payload: { actualCashCounted: 1350.001 },
    });
    assert.notEqual(res.statusCode, 401);
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });

  test('POST /shifts/close is permitted for receptionists (not forbidden)', async () => {
    const { tokens, createTestApp, authHeaders } = await import('./helpers.js');
    const app = await createTestApp();
    const tk = tokens(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/shifts/close',
      headers: authHeaders(tk.receptionist),
      payload: { actualCashCounted: 1350 },
    });
    assert.notEqual(res.statusCode, 403);
    await app.close();
  });
});