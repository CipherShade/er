import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateCashVariance } from '../src/server/modules/shifts/shifts.js';

test('calculateCashVariance reports overage and shortage correctly', () => {
  assert.equal(calculateCashVariance(1500, 1350), 150);
  assert.equal(calculateCashVariance(1200, 1350), -150);
  assert.equal(calculateCashVariance(1350, 1350), 0);
});
