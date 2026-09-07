import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export type AuditEntryInput = {
  shiftRegisterId?: string | null;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown>;
};

export function recordAuditEntry(input: AuditEntryInput, client: PrismaClient | Prisma.TransactionClient = prisma) {
  return client.auditLog.create({
    data: {
      shiftRegisterId: input.shiftRegisterId ?? null,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      amount: input.amount === undefined || input.amount === null ? null : new Prisma.Decimal(input.amount),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}