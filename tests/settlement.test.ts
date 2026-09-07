import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateSessionSettlement } from '../src/server/modules/settlements/settlements.js';

test('calculateSessionSettlement computes center share and teacher payout', () => {
  const settlement = calculateSessionSettlement({
    reconciledHeadcount: 70,
    sessionPrice: 120,
    centerFeePerStudent: 25,
  });

  assert.equal(settlement.totalRevenue, 8400);
  assert.equal(settlement.centerShare, 1750);
  assert.equal(settlement.teacherPayout, 6650);
});

test('zero headcount produces zero revenue, zero share, zero payout', () => {
  const settlement = calculateSessionSettlement({
    reconciledHeadcount: 0,
    sessionPrice: 120,
    centerFeePerStudent: 25,
  });

  assert.equal(settlement.totalRevenue, 0);
  assert.equal(settlement.centerShare, 0);
  assert.equal(settlement.teacherPayout, 0);
});

test('teacher payout is exactly the remainder after the center share', () => {
  const settlement = calculateSessionSettlement({
    reconciledHeadcount: 3,
    sessionPrice: 33.33,
    centerFeePerStudent: 10,
  });

  assert.equal(settlement.totalRevenue, 99.99);
  assert.equal(settlement.centerShare, 30);
  assert.equal(settlement.teacherPayout, 69.99);
  assert.equal(settlement.teacherPayout, Number((settlement.totalRevenue - settlement.centerShare).toFixed(2)));
});
