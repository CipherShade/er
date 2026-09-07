import test from 'node:test';
import assert from 'node:assert/strict';

import { computeShiftFinancialSummary } from '../src/server/modules/shifts/shifts.js';

test('computeShiftFinancialSummary calculates expected cash in drawer', () => {
  const summary = computeShiftFinancialSummary({
    openingCash: 500,
    cashCollected: 4800,
    vodafoneCashCollected: 600,
    instapayCollected: 1200,
    teacherCashPayouts: 3800,
    cashExpenses: 150,
  });

  assert.equal(summary.totalGrossRevenue, 6600);
  assert.equal(summary.expectedCashInDrawer, 1350);
});

test('computeShiftFinancialSummary handles zero cash movements', () => {
  const summary = computeShiftFinancialSummary({
    openingCash: 0,
    cashCollected: 0,
    vodafoneCashCollected: 0,
    instapayCollected: 0,
    teacherCashPayouts: 0,
    cashExpenses: 0,
  });

  assert.equal(summary.expectedCashInDrawer, 0);
  assert.equal(summary.totalGrossRevenue, 0);
});
