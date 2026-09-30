import { Prisma } from '@prisma/client';
import { Ctx } from '../../lib/route';

export interface AuditParams {
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function logAudit(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  params: AuditParams
) {
  return tx.auditLog.create({
    data: {
      userId: ctx.userId === 'system' ? null : ctx.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValue: params.oldValue ? (params.oldValue as Prisma.InputJsonValue) : Prisma.JsonNull,
      newValue: params.newValue ? (params.newValue as Prisma.InputJsonValue) : Prisma.JsonNull,
      ipAddress: ctx.ip ?? null,
      requestId: ctx.requestId,
    },
  });
}
