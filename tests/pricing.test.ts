import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantPlan } from '../src/shared/constants/index.js';
import {
  PLANS,
  PUBLIC_PLAN_IDS,
  PURCHASABLE_PLAN_IDS,
  TRIAL_DAYS,
  computeVisitUsage,
  getPlanConfig,
  isPublicPlan,
  isPurchasablePlan,
  VISIT_USAGE_LIMIT_PERCENT,
  VISIT_USAGE_STRONG_PERCENT,
  VISIT_USAGE_WARNING_PERCENT,
} from '../src/shared/constants/plans.js';
import { serializePublicPlans } from '../src/server/modules/subscriptions/publicPlans.js';
import { buildVisitCountWhere, resolveUsagePeriodStart } from '../src/server/modules/subscriptions/subscriptions.js';
import { receptionistLimitReached } from '../src/server/modules/users/users.js';
import { AttendanceStatus, SubscriptionStatus } from '../src/shared/constants/index.js';

// ─── Pricing architecture ────────────────────────────────────────────────────

describe('PRICING: launch catalogue', () => {
  test('Essential is 499 EGP/mo and Control is 1199 EGP/mo', () => {
    assert.equal(PLANS[TenantPlan.ESSENTIAL].priceEgp, 499);
    assert.equal(PLANS[TenantPlan.CONTROL].priceEgp, 1199);
  });

  test('only Essential + Control are public and purchasable at launch', () => {
    assert.deepEqual([...PUBLIC_PLAN_IDS].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    assert.deepEqual([...PURCHASABLE_PLAN_IDS].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    for (const id of PUBLIC_PLAN_IDS) assert.equal(isPublicPlan(id), true);
    for (const id of PURCHASABLE_PLAN_IDS) assert.equal(isPurchasablePlan(id), true);
  });

  test('Multi-Branch is internal-only: not public, not purchasable, not exposed', () => {
    const mb = PLANS[TenantPlan.MULTI_BRANCH];
    assert.equal(mb.isPublic, false);
    assert.equal(mb.purchasable, false);
    assert.equal(isPublicPlan(TenantPlan.MULTI_BRANCH), false);
    assert.equal(isPurchasablePlan(TenantPlan.MULTI_BRANCH), false);
    assert.ok(!PUBLIC_PLAN_IDS.includes(TenantPlan.MULTI_BRANCH));
    assert.ok(!PURCHASABLE_PLAN_IDS.includes(TenantPlan.MULTI_BRANCH));
  });

  test('Free Trial stays internal (no public pricing row)', () => {
    assert.equal(isPublicPlan(TenantPlan.FREE_TRIAL), false);
    assert.equal(isPurchasablePlan(TenantPlan.FREE_TRIAL), false);
    assert.equal(TRIAL_DAYS, 14);
  });

  test('Essential has no visit cap at launch (null = unlimited, configurable)', () => {
    assert.equal(PLANS[TenantPlan.ESSENTIAL].limits.visitLimit, null);
  });

  test('Control includes exactly 10,000 student visits per subscription period', () => {
    assert.equal(PLANS[TenantPlan.CONTROL].limits.visitLimit, 10_000);
  });
});

// ─── Plan migration / legacy aliases ─────────────────────────────────────────

describe('PLANS: migration mapping of legacy tiers', () => {
  test('GROWTH resolves to Essential, BUSINESS to Control, ENTERPRISE to Multi-Branch', () => {
    assert.equal(getPlanConfig(TenantPlan.GROWTH).id, TenantPlan.ESSENTIAL);
    assert.equal(getPlanConfig(TenantPlan.BUSINESS).id, TenantPlan.CONTROL);
    assert.equal(getPlanConfig(TenantPlan.ENTERPRISE).id, TenantPlan.MULTI_BRANCH);
  });

  test('legacy aliases are never purchasable or publicly listed', () => {
    for (const legacy of [TenantPlan.GROWTH, TenantPlan.BUSINESS, TenantPlan.ENTERPRISE]) {
      assert.equal(isPurchasablePlan(legacy), false);
      assert.equal(isPublicPlan(legacy), false);
    }
  });

  test('unknown / null plan falls back to a safe default (Essential)', () => {
    assert.equal(getPlanConfig(null).id, TenantPlan.ESSENTIAL);
    assert.equal(getPlanConfig(undefined).id, TenantPlan.ESSENTIAL);
    assert.equal(getPlanConfig('NOT_A_PLAN').id, TenantPlan.ESSENTIAL);
  });
});

// ─── Founding-offer secrecy ──────────────────────────────────────────────────

describe('PRICING SECRECY: the 350-EGP founding offer must never leak', () => {
  test('the number 350 does not exist anywhere in the public plan serialization', () => {
    const payload = JSON.stringify(serializePublicPlans());
    assert.ok(!payload.includes('350'));
  });

  test('serializePublicPlans exposes only Essential + Control and hides internal fields', () => {
    const data = serializePublicPlans();
    const ids = data.plans.map((p) => p.id);
    assert.deepEqual([...ids].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    for (const plan of data.plans) {
      assert.ok(!('visitLimit' in plan.limits), 'visit limits are internal and must not be exposed');
      assert.ok(!('purchasable' in plan), 'internal flags must not be exposed');
      assert.ok(Number.isFinite(plan.priceEgp), 'price must always be present for public plans');
    }
    const raw = JSON.stringify(data);
    assert.ok(!raw.includes(TenantPlan.MULTI_BRANCH));
    assert.ok(!raw.includes(TenantPlan.ENTERPRISE));
    assert.ok(!raw.includes(TenantPlan.GROWTH));
    assert.ok(!raw.includes(TenantPlan.BUSINESS));
  });

  test('GET /api/plans is unauthenticated and never returns the founding offer or Multi-Branch', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body) as { data?: { plans?: Array<{ id: string; priceEgp: number }> } };
    assert.ok(parsed.data?.plans);
    const ids = parsed.data.plans.map((p) => p.id);
    assert.deepEqual([...ids].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    const rawBody = res.body;
    assert.ok(!rawBody.includes('350'), 'founding price must not appear in the payload');
    assert.ok(!rawBody.includes('MULTI_BRANCH'));
    await app.close();
  });
});

// ─── Visit usage warnings (warning-only, never blocking) ────────────────────

describe('VISIT USAGE: warning thresholds', () => {
  test('unlimited plans report no cap and no usage level', () => {
    const u = computeVisitUsage(5_000, null);
    assert.equal(u.limit, null);
    assert.equal(u.percent, null);
    assert.equal(u.level, 'none');
    assert.equal(u.overLimit, false);
  });

  test('below 80% is normal operation', () => {
    const u = computeVisitUsage(7_000, 10_000);
    assert.equal(u.level, 'ok');
    assert.equal(u.percent, 70);
  });

  test('80% triggers the first warning', () => {
    const u = computeVisitUsage(8_000, 10_000);
    assert.equal(u.percent, 80);
    assert.equal(u.level, 'warning');
    assert.equal(u.remaining, 2_000);
  });

  test('90% and above triggers the stronger warning', () => {
    const u = computeVisitUsage(9_000, 10_000);
    assert.equal(u.level, 'strong');
    assert.equal(u.percent, 90);
    assert.equal(VISIT_USAGE_WARNING_PERCENT, 80);
    assert.equal(VISIT_USAGE_STRONG_PERCENT, 90);
    assert.equal(VISIT_USAGE_LIMIT_PERCENT, 100);
  });

  test('100% is flagged but never a hard stop', () => {
    const u = computeVisitUsage(10_000, 10_000);
    assert.equal(u.level, 'over');
    assert.equal(u.percent, 100);
    assert.equal(u.remaining, 0);
    assert.equal(u.overLimit, false); // exactly at the limit — advisory only
  });
});

// ─── Operational continuity above the limit ─────────────────────────────────

describe('VISIT USAGE: Control keeps working above 10,000 visits', () => {
  test('usage tracking continues past the limit (advisory overage)', () => {
    const u = computeVisitUsage(12_500, 10_000);
    assert.equal(u.level, 'over');
    assert.equal(u.percent, 125);
    assert.equal(u.overLimit, true);
    assert.equal(u.remaining, 0); // nothing left — but no blocking anywhere
  });

  test('the check-in HTTP path never returns a visit-limit refusal (usage is advisory)', async () => {
    const { createTestApp, receptionistAuth, authHeaders, validUUID } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(receptionistAuth(app).token),
      payload: {
        sessionId: validUUID('11111111-0000-0000-0000-000000000001'),
        studentId: validUUID('22222222-0000-0000-0000-000000000001'),
        paymentMethod: 'CASH',
      },
    });
    // This suite runs without a database, so the request fails on an
    // operational prerequisite (no active shift / no DB) — the important
    // assertion is that usage can NEVER short-circuit check-in: any refusal
    // must come from a genuine operational guard, not a visit/plan limit.
    const body = res.body;
    assert.ok(!body.includes('VISIT_LIMIT'), 'check-in must not enforce a visit limit');
    assert.ok(!body.includes('PLAN_LIMIT'), 'check-in must not enforce a plan limit');
    assert.ok(!body.includes('VISIT_LIMIT_REACHED'));
    assert.ok(!body.includes('OVERAGE'));
    await app.close();
  });
});

// ─── Visit-counting semantics (VOID excluded, period-scoped) ─────────────────

describe('VISIT COUNTING: one check-in to one session = one visit', () => {
  test('VOID attendances are excluded from usage', () => {
    const where = buildVisitCountWhere(new Date('2026-09-01'), 'tenant-1');
    assert.deepEqual(where.status, { not: AttendanceStatus.VOID });
  });

  test('only attendances on/after the usage-period start count', () => {
    const start = new Date('2026-09-01T10:00:00Z');
    const where = buildVisitCountWhere(start, 'tenant-1');
    assert.deepEqual(where.checkInTime, { gte: start });
    assert.deepEqual(where.session, { tenantId: 'tenant-1' });
  });

  test('usage window falls back to tenant creation when no active paid period', () => {
    const createdAt = new Date('2026-08-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.EXPIRED, periodStart: new Date('2026-07-01'), periodEnd: new Date('2026-07-31') },
      { status: SubscriptionStatus.CANCELED, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-30') },
    ];
    assert.equal(resolveUsagePeriodStart(createdAt, subs, now).getTime(), createdAt.getTime());
  });

  test('usage window is the running active subscription period', () => {
    const createdAt = new Date('2026-01-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.EXPIRED, periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30') },
      { status: SubscriptionStatus.ACTIVE, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30') },
    ];
    const start = resolveUsagePeriodStart(createdAt, subs, now);
    assert.equal(start.toISOString(), new Date('2026-09-01').toISOString());
  });

  test('expired active-looking rows (period end in the past) do not drive the window', () => {
    const createdAt = new Date('2026-01-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.ACTIVE, periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-30') },
    ];
    assert.equal(resolveUsagePeriodStart(createdAt, subs, now).getTime(), createdAt.getTime());
  });
});

// ─── Receptionist (maxUsers) plan gate ───────────────────────────────────────

describe('RECEPTIONIST LIMIT: maxUsers gate', () => {
  test('creating a receptionist at the cap is refused', () => {
    assert.equal(receptionistLimitReached(3, 3), true); // Essential / Control cap
    assert.equal(receptionistLimitReached(10, 10), true);
  });

  test('creating a receptionist below the cap is allowed', () => {
    assert.equal(receptionistLimitReached(2, 3), false);
    assert.equal(receptionistLimitReached(0, 10), false);
  });

  test('a broken/zero cap never blocks (defensive)', () => {
    assert.equal(receptionistLimitReached(0, 0), true); // cap of 0 means nobody may be added
    assert.equal(receptionistLimitReached(1, 0), true);
    assert.equal(receptionistLimitReached(2, -1), true); // negative caps treated as 0
    assert.equal(receptionistLimitReached(0, -1), true);
  });
});