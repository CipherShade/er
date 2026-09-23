import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { AttendanceStatus, PaymentMethod, Role, SubscriptionStatus, TenantPlan } from '../../../shared/constants/index.js';
import {
  PURCHASABLE_PLAN_IDS,
  computeVisitUsage,
  getPlanConfig,
} from '../../../shared/constants/plans.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordAuditEntry } from '../reports/audit.js';

type UpgradeBody = {
  plan: 'ESSENTIAL' | 'CONTROL';
  /** Upgrades are Instapay-only, matching the signup payment flow. */
  paymentMethod: PaymentMethod;
  /** The payer's Instapay account name (e.g. name@instapay), used as payment proof. */
  paymentReference: string;
};

const SUBSCRIPTION_PERIOD_DAYS = 30;
const SUBSCRIPTION_HISTORY_LIMIT = 10;

/**
 * The usage window is the current active subscription period, falling back to
 * the tenant's creation date when no paid period is running (trial / lapsed).
 * Exported for unit testing.
 */
export function resolveUsagePeriodStart(
  createdAt: Date,
  subscriptions: Array<{ status: string; periodStart: Date | string; periodEnd: Date | string }>,
  now: Date,
): Date {
  for (const sub of subscriptions) {
    if (sub.status === SubscriptionStatus.ACTIVE && new Date(sub.periodEnd).getTime() > now.getTime()) {
      return new Date(sub.periodStart);
    }
  }
  return createdAt;
}

/**
 * Where-clause for usage visit counting. One student check-in to one center
 * session = one visit. VOID attendances are never counted (they never count as
 * real visits) and only attendances recorded on or after the usage-period start
 * belong to the current billing window. Exported for unit testing so the
 * VOID-exclusion guarantee cannot drift.
 */
export function buildVisitCountWhere(periodStart: Date, tenantId: string) {
  return {
    checkInTime: { gte: periodStart },
    status: { not: AttendanceStatus.VOID },
    session: { tenantId },
  } as const;
}

const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/current', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.SUPER_ADMIN)] }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'TENANT_REQUIRED', message: 'الحساب غير مرتبط بمركز تعليمي.', messageEn: 'Account has no tenant assigned.' },
      });
    }

    const [tenant, subscriptions] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          trialEndsAt: true,
          isActive: true,
          maxDesks: true,
          maxBranches: true,
          maxUsers: true,
          visitLimit: true,
          createdAt: true,
        },
      }),
      prisma.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: SUBSCRIPTION_HISTORY_LIMIT,
      }),
    ]);

    if (!tenant) {
      return reply.code(404).send({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'المركز التعليمي غير موجود.', messageEn: 'Tenant not found.' },
      });
    }

    const now = new Date();
    const trialDaysRemaining = tenant.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    const periodStart = resolveUsagePeriodStart(tenant.createdAt, subscriptions, now);
    const usedVisits = await prisma.attendance.count({
      where: buildVisitCountWhere(periodStart, tenantId),
    });

    return reply.send({
      success: true,
      data: {
        tenant,
        trialDaysRemaining,
        isTrialActive: tenant.trialEndsAt ? tenant.trialEndsAt > now : false,
        usage: {
          periodStart,
          visits: computeVisitUsage(usedVisits, tenant.visitLimit),
        },
        subscriptions: subscriptions.map((sub) => ({
          ...sub,
          amount: sub.amount.toString(),
        })),
      },
    });
  });

  app.post<{ Body: UpgradeBody }>('/upgrade', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.SUPER_ADMIN)],
    schema: {
      body: {
        type: 'object',
        required: ['plan', 'paymentMethod', 'paymentReference'],
        properties: {
          plan: { type: 'string', enum: PURCHASABLE_PLAN_IDS as string[] },
          paymentMethod: { type: 'string', enum: [PaymentMethod.INSTAPAY] },
          paymentReference: { type: 'string', pattern: '^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$', minLength: 3, maxLength: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'TENANT_REQUIRED', message: 'الحساب غير مرتبط بمركز تعليمي.', messageEn: 'Account has no tenant assigned.' },
      });
    }

    const selectedPlan = request.body.plan;
    if (!PURCHASABLE_PLAN_IDS.includes(selectedPlan)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_PLAN', message: 'الباقة المختارة غير متاحة للترقية.', messageEn: 'The selected plan is not available for upgrade.' },
      });
    }

    const planConfig = getPlanConfig(selectedPlan);
    const amount = planConfig.priceEgp ?? 0;
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          tenantId,
          plan: selectedPlan as TenantPlan,
          status: SubscriptionStatus.ACTIVE,
          amount: new Prisma.Decimal(amount),
          currency: 'EGP',
          paymentMethod: request.body.paymentMethod,
          paymentReference: request.body.paymentReference.trim(),
          periodStart,
          periodEnd,
        },
      });

      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          plan: selectedPlan as TenantPlan,
          maxDesks: planConfig.limits.maxDesks,
          maxBranches: planConfig.limits.maxBranches,
          maxUsers: planConfig.limits.maxUsers,
          visitLimit: planConfig.limits.visitLimit,
        },
      });

      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: null,
        action: 'SUBSCRIPTION_UPGRADED',
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        amount,
        metadata: { plan: selectedPlan, paymentMethod: request.body.paymentMethod },
      }, tx);

      return { subscription, tenant: updatedTenant };
    });

    return reply.send({
      success: true,
      data: {
        subscription: {
          ...result.subscription,
          amount: result.subscription.amount.toString(),
        },
        tenant: result.tenant,
      },
    });
  });
};

export default subscriptionRoutes;