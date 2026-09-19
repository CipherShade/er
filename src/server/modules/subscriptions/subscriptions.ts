import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { PaymentMethod, Role, TenantPlan, SubscriptionStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordAuditEntry } from '../reports/audit.js';

const PLAN_PRICES: Record<string, number> = {
  GROWTH: 299,
  BUSINESS: 500,
  ENTERPRISE: 1200,
};

type UpgradeBody = {
  plan: 'GROWTH' | 'BUSINESS';
  paymentMethod: PaymentMethod;
  paymentReference?: string | null;
};

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
          createdAt: true,
        },
      }),
      prisma.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
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

    return reply.send({
      success: true,
      data: {
        tenant,
        trialDaysRemaining,
        isTrialActive: tenant.trialEndsAt ? tenant.trialEndsAt > now : false,
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
        required: ['plan', 'paymentMethod'],
        properties: {
          plan: { type: 'string', enum: ['GROWTH', 'BUSINESS'] },
          paymentMethod: { type: 'string', enum: Object.values(PaymentMethod) },
          paymentReference: { type: ['string', 'null'], maxLength: 100 },
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
    const amount = PLAN_PRICES[selectedPlan] || 299;
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days subscription

    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          tenantId,
          plan: selectedPlan === 'BUSINESS' ? TenantPlan.BUSINESS : TenantPlan.GROWTH,
          status: SubscriptionStatus.ACTIVE,
          amount: new Prisma.Decimal(amount),
          currency: 'EGP',
          paymentMethod: request.body.paymentMethod,
          paymentReference: request.body.paymentReference?.trim() || `PAY-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          periodStart,
          periodEnd,
        },
      });

      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          plan: selectedPlan === 'BUSINESS' ? TenantPlan.BUSINESS : TenantPlan.GROWTH,
          maxDesks: selectedPlan === 'BUSINESS' ? 10 : 1,
          maxBranches: selectedPlan === 'BUSINESS' ? 5 : 1,
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
