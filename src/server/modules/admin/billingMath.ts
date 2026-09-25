/**
 * Pure billing/usage math for the super-admin console.
 *
 * Every formula that turns a plan price into a payable amount — or an
 * owner's discount/credit decision into a balance — lives here so it can be
 * unit-tested in isolation. Route modules and UI components must never
 * re-implement any of it (AGENTS.md: financial arithmetic isolation).
 */

import { Prisma } from '@prisma/client';
import { computeVisitUsage } from '../../../shared/constants/plans.js';
import type { PlanLimits, VisitUsage, VisitUsageLevel } from '../../../shared/constants/plans.js';

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/** Converts any Prisma/JSON money representation to a plain number. */
export function toMoneyNumber(value: MoneyInput): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Currency amounts are EGP with 2 fractional digits. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type DiscountKind = 'PERCENT' | 'FIXED';

/**
 * Owner-entered discount for a subscription invoice. A percentage is clamped
 * to 0..100, a fixed amount to 0..price — a discount can never turn an
 * invoice into a payout.
 */
export function computeDiscountAmount(price: MoneyInput, kind: DiscountKind, value: number): number {
  const base = Math.max(0, toMoneyNumber(price));
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (kind === 'PERCENT') {
    return roundMoney(base * (Math.min(100, value) / 100));
  }
  return roundMoney(Math.min(base, value));
}

export type BalanceApplication = {
  /** Plan price before any owner adjustment. */
  baseAmount: number;
  /** Portion of the tenant discount wallet consumed by this invoice. */
  discountApplied: number;
  /** Portion of the tenant credit wallet consumed by this invoice. */
  creditApplied: number;
  /** What the center must actually pay (never below 0). */
  amountDue: number;
  remainingDiscount: number;
  remainingCredit: number;
  /** True when the wallet fully covered the invoice (amountDue === 0). */
  fullyCovered: boolean;
};

/**
 * Spends the tenant's wallets against a new invoice: discount first (a
 * discount reduces what is owed), then credit (a credit pays the remainder).
 * The returned remainders are the new wallet balances.
 */
export function applyBillingBalances(
  price: MoneyInput,
  discountBalance: MoneyInput,
  creditBalance: MoneyInput,
): BalanceApplication {
  const baseAmount = roundMoney(Math.max(0, toMoneyNumber(price)));
  const availableDiscount = roundMoney(Math.max(0, toMoneyNumber(discountBalance)));
  const availableCredit = roundMoney(Math.max(0, toMoneyNumber(creditBalance)));

  const discountApplied = roundMoney(Math.min(baseAmount, availableDiscount));
  const afterDiscount = roundMoney(baseAmount - discountApplied);
  const creditApplied = roundMoney(Math.min(afterDiscount, availableCredit));
  const amountDue = roundMoney(afterDiscount - creditApplied);

  return {
    baseAmount,
    discountApplied,
    creditApplied,
    amountDue,
    remainingDiscount: roundMoney(availableDiscount - discountApplied),
    remainingCredit: roundMoney(availableCredit - creditApplied),
    fullyCovered: baseAmount > 0 && amountDue === 0,
  };
}

export type WalletAction = 'DISCOUNT' | 'CREDIT' | 'REFUND';

export type WalletMutation = {
  type: WalletAction;
  discountDelta: number;
  creditDelta: number;
};

/**
 * How one ledger entry changes the tenant wallets.
 *   DISCOUNT  — grant discount to spend on future invoices.
 *   CREDIT    — grant credit to spend on future invoices.
 *   REFUND    — hand money back: the refund is recorded for the ledger and
 *               the same amount is returned as spendable credit.
 */
export function computeWalletMutation(type: WalletAction, amount: MoneyInput): WalletMutation {
  const value = roundMoney(Math.max(0, toMoneyNumber(amount)));
  if (type === 'DISCOUNT') return { type, discountDelta: value, creditDelta: 0 };
  if (type === 'CREDIT') return { type, discountDelta: 0, creditDelta: value };
  return { type, discountDelta: 0, creditDelta: value };
}

// ─── Usage aggregation ───────────────────────────────────────────────────────

export const USAGE_METRICS = ['USERS', 'RECEPTIONISTS', 'STUDENTS', 'VISITS', 'BRANCHES'] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

/** Warning-only threshold shared with the center UI: 80% of the limit. */
export const USAGE_WARNING_PERCENT = 80;

export type UsageMetricState = {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  percent: number | null;
  remaining: number | null;
  level: VisitUsageLevel;
  overLimit: boolean;
  warning: boolean;
};

/**
 * Normalizes one metric into the same shape the client renders for visits, so
 * the console and the center can never disagree on "approaching the limit".
 * A null limit means unlimited (never a warning).
 */
export function computeMetricUsage(
  metric: UsageMetric,
  used: number,
  limit: number | null | undefined,
): UsageMetricState {
  const visitUsage: VisitUsage = computeVisitUsage(used, metric === 'VISITS' ? limit : normalizeHardLimit(limit));
  return {
    metric,
    used: visitUsage.used,
    limit: visitUsage.limit,
    percent: visitUsage.percent,
    remaining: visitUsage.remaining,
    level: visitUsage.level,
    overLimit: visitUsage.overLimit,
    warning: visitUsage.level === 'warning' || visitUsage.level === 'strong' || visitUsage.level === 'over',
  };
}

/** maxUsers/maxDesks/maxBranches are hard caps; 0 would disable the center, so treat it as "no cap known". */
function normalizeHardLimit(limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined) return null;
  return limit > 0 ? Math.floor(limit) : null;
}

export type TenantUsageInput = {
  userCount: number;
  receptionistCount: number;
  studentCount: number;
  visitCount: number;
  limits: PlanLimits & { maxUsers: number; maxDesks: number; maxBranches: number; visitLimit: number | null };
  activeOverrideExtra: Partial<Record<UsageMetric, number>>;
};

export type TenantUsageSummary = {
  metrics: UsageMetricState[];
  warningCount: number;
  overCount: number;
  highestLevel: VisitUsageLevel;
};

const LEVEL_ORDER: Record<VisitUsageLevel, number> = { none: 0, ok: 1, warning: 2, strong: 3, over: 4 };

/**
 * Builds every metric row for one center: used count, the effective limit
 * (plan/tenant limit plus any active usage override) and the warning state.
 */
export function computeTenantUsage(input: TenantUsageInput): TenantUsageSummary {
  const { limits, activeOverrideExtra } = input;
  const withExtra = (metric: UsageMetric, limit: number | null): number | null => {
    const extra = activeOverrideExtra[metric] ?? 0;
    if (limit === null) return null;
    return limit + Math.max(0, extra);
  };

  const metrics: UsageMetricState[] = [
    computeMetricUsage('USERS', input.userCount, withExtra('USERS', limits.maxUsers)),
    computeMetricUsage('RECEPTIONISTS', input.receptionistCount, withExtra('RECEPTIONISTS', limits.maxUsers)),
    // No student cap is configured anywhere in the system, so students are
    // reported as an informational metric only — never a warning.
    computeMetricUsage('STUDENTS', input.studentCount, withExtra('STUDENTS', null)),
    computeMetricUsage('VISITS', input.visitCount, withExtra('VISITS', limits.visitLimit)),
    // No Branch model exists yet, so branch usage is unmeasurable — report the
    // limit with used = 0 rather than inventing a number.
    computeMetricUsage('BRANCHES', 0, withExtra('BRANCHES', limits.maxBranches)),
  ];

  const highestLevel = metrics.reduce<VisitUsageLevel>(
    (highest, metric) => (LEVEL_ORDER[metric.level] > LEVEL_ORDER[highest] ? metric.level : highest),
    'none',
  );

  return {
    metrics,
    warningCount: metrics.filter((metric) => metric.warning).length,
    overCount: metrics.filter((metric) => metric.level === 'over').length,
    highestLevel,
  };
}

// ─── Revenue math ────────────────────────────────────────────────────────────

export type RevenueSeriesPoint = {
  /** Calendar month key, YYYY-MM. */
  key: string;
  /** Paid revenue recognized in that month. */
  amount: number;
  /** Number of subscriptions recognized in that month. */
  count: number;
};

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Revenue history for the last `months` calendar months, zero-filled so the
 * chart never has holes. Only ACTIVE subscriptions count as recognized
 * revenue, and only for the month their period started in.
 */
export function sumRevenueByPeriod(
  rows: Array<{ amount: MoneyInput; periodStart: Date | string }>,
  months: number,
  now: Date,
): RevenueSeriesPoint[] {
  const safeMonths = Math.max(1, Math.min(24, Math.floor(months)));
  const keys: string[] = [];
  for (let offset = safeMonths - 1; offset >= 0; offset -= 1) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))));
  }

  const points = new Map<string, RevenueSeriesPoint>(
    keys.map((key) => [key, { key, amount: 0, count: 0 }]),
  );

  for (const row of rows) {
    const point = points.get(monthKey(new Date(row.periodStart)));
    if (!point) continue;
    point.amount = roundMoney(point.amount + Math.max(0, toMoneyNumber(row.amount)));
    point.count += 1;
  }

  return keys.map((key) => points.get(key)!);
}

/**
 * Recognized monthly recurring revenue: the active subscription that covers
 * "now" for every paying center. Centers whose current period has lapsed are
 * not MRR — they are reported separately as at-risk revenue.
 */
export function computeRevenueSnapshot(rows: Array<{ amount: MoneyInput; periodEnd: Date | string; plan: string }>, now: Date) {
  let mrr = 0;
  let atRisk = 0;
  const byPlan = new Map<string, number>();

  for (const row of rows) {
    const amount = roundMoney(Math.max(0, toMoneyNumber(row.amount)));
    if (amount <= 0) continue;
    byPlan.set(row.plan, roundMoney((byPlan.get(row.plan) ?? 0) + amount));
    if (new Date(row.periodEnd).getTime() > now.getTime()) mrr = roundMoney(mrr + amount);
    else atRisk = roundMoney(atRisk + amount);
  }

  return { mrr, atRisk, byPlan: Object.fromEntries(byPlan) };
}

export type RevenueRow = { amount: MoneyInput; periodStart: Date | string; periodEnd: Date | string; plan: string };

/** Convenience wrapper: snapshot + history from one query result. */
export function buildRevenueReport(rows: RevenueRow[], months: number, now: Date) {
  const snapshot = computeRevenueSnapshot(rows, now);
  const history = sumRevenueByPeriod(
    rows.filter((row) => new Date(row.periodEnd).getTime() > now.getTime()),
    months,
    now,
  );
  return { ...snapshot, history, historyTotal: roundMoney(history.reduce((sum, point) => sum + point.amount, 0)) };
}
