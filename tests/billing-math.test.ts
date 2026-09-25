import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  USAGE_METRICS,
  applyBillingBalances,
  buildRevenueReport,
  computeDiscountAmount,
  computeMetricUsage,
  computeRevenueSnapshot,
  computeTenantUsage,
  computeWalletMutation,
  monthKey,
  roundMoney,
  sumRevenueByPeriod,
  toMoneyNumber,
} from '../src/server/modules/admin/billingMath.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');

describe('BILLING MATH — money normalization', () => {
  test('reads Prisma Decimals, numeric strings and numbers alike', () => {
    assert.equal(toMoneyNumber(new Prisma.Decimal('1199.50')), 1199.5);
    assert.equal(toMoneyNumber('499'), 499);
    assert.equal(toMoneyNumber(0), 0);
  });

  test('missing or unparseable money is zero, never NaN', () => {
    assert.equal(toMoneyNumber(null), 0);
    assert.equal(toMoneyNumber(undefined), 0);
    assert.equal(toMoneyNumber('not-a-number'), 0);
    assert.equal(toMoneyNumber(Number.NaN), 0);
  });

  test('rounds to 2 fractional digits the Egyptian Pound standard', () => {
    assert.equal(roundMoney(1199.005), 1199.01);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(-5), -5);
    assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
  });
});

describe('BILLING MATH — owner discount', () => {
  test('a percentage discount is applied to the plan price', () => {
    assert.equal(computeDiscountAmount(1199, 'PERCENT', 10), 119.9);
    assert.equal(computeDiscountAmount(1199, 'PERCENT', 25), 299.75);
  });

  test('a percentage above 100 or below 0 is clamped instead of over-refunding', () => {
    assert.equal(computeDiscountAmount(1199, 'PERCENT', 150), 1199);
    assert.equal(computeDiscountAmount(1199, 'PERCENT', -20), 0);
    assert.equal(computeDiscountAmount(1199, 'PERCENT', Number.NaN), 0);
  });

  test('a fixed discount can never exceed the invoice total', () => {
    assert.equal(computeDiscountAmount(499, 'FIXED', 150), 150);
    assert.equal(computeDiscountAmount(499, 'FIXED', 5000), 499);
    assert.equal(computeDiscountAmount(499, 'FIXED', 0), 0);
  });

  test('the discount never turns an invoice into a negative amount', () => {
    const discount = computeDiscountAmount(499, 'FIXED', 100_000);
    assert.equal(discount, 499);
    assert.ok(499 - discount >= 0);
  });
});

describe('BILLING MATH — balance application (discount wallet then credit wallet)', () => {
  test('with empty wallets the due amount equals the plan price', () => {
    const result = applyBillingBalances(1199, 0, 0);
    assert.deepEqual(result, {
      baseAmount: 1199,
      discountApplied: 0,
      creditApplied: 0,
      amountDue: 1199,
      remainingDiscount: 0,
      remainingCredit: 0,
      fullyCovered: false,
    });
  });

  test('discount is spent before credit', () => {
    const result = applyBillingBalances(1199, 200, 300);
    assert.equal(result.discountApplied, 200);
    assert.equal(result.creditApplied, 300);
    assert.equal(result.amountDue, 699);
    assert.equal(result.remainingDiscount, 0);
    assert.equal(result.remainingCredit, 0);
  });

  test('a wallet larger than the invoice is only partially spent', () => {
    const result = applyBillingBalances(499, 1000, 1000);
    assert.equal(result.discountApplied, 499);
    assert.equal(result.creditApplied, 0);
    assert.equal(result.amountDue, 0);
    assert.equal(result.remainingDiscount, 501);
    assert.equal(result.remainingCredit, 1000);
    assert.equal(result.fullyCovered, true);
  });

  test('credit alone can cover the whole invoice without going negative', () => {
    const result = applyBillingBalances(499, 0, 750.25);
    assert.equal(result.creditApplied, 499);
    assert.equal(result.amountDue, 0);
    assert.equal(result.remainingCredit, 251.25);
  });

  test('negative wallet balances are treated as zero', () => {
    const result = applyBillingBalances(499, -50, -10);
    assert.equal(result.amountDue, 499);
    assert.equal(result.remainingDiscount, 0);
    assert.equal(result.remainingCredit, 0);
  });

  test('a zero-value invoice is never flagged as fully covered', () => {
    const result = applyBillingBalances(0, 100, 100);
    assert.equal(result.amountDue, 0);
    assert.equal(result.fullyCovered, false);
  });

  test('balances coming from Prisma Decimals behave identically', () => {
    const result = applyBillingBalances(new Prisma.Decimal('1199.00'), new Prisma.Decimal('199.99'), new Prisma.Decimal('1.01'));
    assert.equal(result.amountDue, 998);
    assert.equal(result.remainingDiscount, 0);
    assert.equal(result.remainingCredit, 0);
  });
});

describe('BILLING MATH — wallet ledger mutations', () => {
  test('a discount grant increases only the discount wallet', () => {
    assert.deepEqual(computeWalletMutation('DISCOUNT', 250), { type: 'DISCOUNT', discountDelta: 250, creditDelta: 0 });
  });

  test('a credit grant increases only the credit wallet', () => {
    assert.deepEqual(computeWalletMutation('CREDIT', 100), { type: 'CREDIT', discountDelta: 0, creditDelta: 100 });
  });

  test('a refund returns the same amount as spendable credit', () => {
    assert.deepEqual(computeWalletMutation('REFUND', '499.50'), { type: 'REFUND', discountDelta: 0, creditDelta: 499.5 });
  });

  test('negative or unparseable amounts are normalized to zero', () => {
    assert.equal(computeWalletMutation('CREDIT', -100).creditDelta, 0);
    assert.equal(computeWalletMutation('CREDIT', 'abc').creditDelta, 0);
  });
});

describe('BILLING MATH — usage metrics', () => {
  test('a metric under 80% is not a warning', () => {
    const state = computeMetricUsage('USERS', 3, 10);
    assert.equal(state.percent, 30);
    assert.equal(state.level, 'ok');
    assert.equal(state.warning, false);
  });

  test('80% and above is a warning, 90% and above is strong', () => {
    assert.equal(computeMetricUsage('USERS', 8, 10).level, 'warning');
    assert.equal(computeMetricUsage('USERS', 9, 10).level, 'strong');
    assert.equal(computeMetricUsage('VISITS', 10, 10).level, 'over');
  });

  test('an unlimited metric never warns', () => {
    const state = computeMetricUsage('STUDENTS', 9_999, null);
    assert.equal(state.percent, null);
    assert.equal(state.remaining, null);
    assert.equal(state.level, 'none');
    assert.equal(state.warning, false);
  });

  test('a zero cap is treated as no known cap rather than blocking the center', () => {
    const state = computeMetricUsage('USERS', 5, 0);
    assert.equal(state.limit, null);
    assert.equal(state.level, 'none');
  });

  test('a center at its user cap is reported as over-limit', () => {
    const summary = computeTenantUsage({
      userCount: 3,
      receptionistCount: 1,
      studentCount: 120,
      visitCount: 9_500,
      limits: { maxDesks: 8, maxBranches: 1, maxUsers: 3, visitLimit: 10_000 },
      activeOverrideExtra: {},
    });
    const users = summary.metrics.find((metric) => metric.metric === 'USERS')!;
    assert.equal(users.level, 'over');
    assert.equal(summary.overCount, 1);
    assert.equal(summary.highestLevel, 'over');
  });

  test('visits near the cap are the highest warning level when nothing is over', () => {
    const summary = computeTenantUsage({
      userCount: 2,
      receptionistCount: 1,
      studentCount: 40,
      visitCount: 8_200,
      limits: { maxDesks: 8, maxBranches: 1, maxUsers: 3, visitLimit: 10_000 },
      activeOverrideExtra: {},
    });
    assert.equal(summary.highestLevel, 'warning');
    assert.ok(summary.warningCount >= 1);
    assert.equal(summary.overCount, 0);
  });

  test('an active usage override raises the effective limit', () => {
    const summary = computeTenantUsage({
      userCount: 9,
      receptionistCount: 2,
      studentCount: 0,
      visitCount: 0,
      limits: { maxDesks: 8, maxBranches: 1, maxUsers: 10, visitLimit: null },
      activeOverrideExtra: { USERS: 5 },
    });
    const users = summary.metrics.find((metric) => metric.metric === 'USERS')!;
    assert.equal(users.limit, 15);
    assert.equal(users.level, 'ok');
  });

  test('branch usage is reported as a limit with zero used (no Branch model exists)', () => {
    const summary = computeTenantUsage({
      userCount: 1,
      receptionistCount: 1,
      studentCount: 0,
      visitCount: 0,
      limits: { maxDesks: 8, maxBranches: 1, maxUsers: 3, visitLimit: null },
      activeOverrideExtra: {},
    });
    const branches = summary.metrics.find((metric) => metric.metric === 'BRANCHES')!;
    assert.equal(branches.limit, 1);
    assert.equal(branches.used, 0);
  });

  test('every documented metric is always present in the summary', () => {
    const summary = computeTenantUsage({
      userCount: 0,
      receptionistCount: 0,
      studentCount: 0,
      visitCount: 0,
      limits: { maxDesks: 1, maxBranches: 1, maxUsers: 3, visitLimit: null },
      activeOverrideExtra: {},
    });
    assert.deepEqual(summary.metrics.map((metric) => metric.metric), [...USAGE_METRICS]);
  });
});

describe('BILLING MATH — revenue', () => {
  test('MRR counts only subscriptions whose period has not lapsed', () => {
    const snapshot = computeRevenueSnapshot(
      [
        { amount: 499, periodEnd: '2026-10-25T00:00:00.000Z', plan: 'ESSENTIAL' },
        { amount: 1199, periodEnd: '2026-10-01T00:00:00.000Z', plan: 'CONTROL' },
        { amount: 499, periodEnd: '2026-09-01T00:00:00.000Z', plan: 'ESSENTIAL' },
        { amount: 0, periodEnd: '2026-12-01T00:00:00.000Z', plan: 'FREE_TRIAL' },
      ],
      NOW,
    );
    assert.equal(snapshot.mrr, 1698);
    assert.equal(snapshot.atRisk, 499);
    assert.equal(snapshot.byPlan.ESSENTIAL, 998);
    assert.equal(snapshot.byPlan.CONTROL, 1199);
  });

  test('revenue history is zero-filled and chronological', () => {
    const points = sumRevenueByPeriod([{ amount: 499, periodStart: '2026-09-02T00:00:00.000Z' }], 3, NOW);
    assert.deepEqual(points.map((point) => point.key), ['2026-07', '2026-08', '2026-09']);
    assert.equal(points[0].amount, 0);
    assert.equal(points[2].amount, 499);
    assert.equal(points[2].count, 1);
  });

  test('revenue history ignores months outside the requested window', () => {
    const points = sumRevenueByPeriod([{ amount: 100, periodStart: '2025-01-05T00:00:00.000Z' }], 6, NOW);
    assert.equal(points.reduce((sum, point) => sum + point.amount, 0), 0);
  });

  test('the month count is clamped to a sane range', () => {
    assert.equal(sumRevenueByPeriod([], 0, NOW).length, 1);
    assert.equal(sumRevenueByPeriod([], 99, NOW).length, 24);
  });

  test('the report totals match the sum of its history points', () => {
    const report = buildRevenueReport(
      [
        { amount: 499, periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z', plan: 'ESSENTIAL' },
        { amount: 1199, periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z', plan: 'CONTROL' },
      ],
      6,
      NOW,
    );
    assert.equal(report.mrr, 1698);
    assert.equal(report.historyTotal, report.history.reduce((sum, point) => sum + point.amount, 0));
    assert.equal(monthKey(NOW), '2026-09');
  });
});
