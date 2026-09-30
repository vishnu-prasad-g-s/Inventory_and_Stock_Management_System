import { Prisma, ApprovalEntity, ApprovalStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';

export interface RuleCondition {
  field: string;
  op: '>' | '>=' | '<' | '<=' | '==' | 'in';
  value: any;
}

export function evaluateCondition(conditionJson: any, data: Record<string, any>): boolean {
  if (!conditionJson || !conditionJson.all) return true;

  const rules: RuleCondition[] = conditionJson.all;

  for (const r of rules) {
    const val = data[r.field];
    if (val === undefined) return false;

    switch (r.op) {
      case '>':
        if (!(val > r.value)) return false;
        break;
      case '>=':
        if (!(val >= r.value)) return false;
        break;
      case '<':
        if (!(val < r.value)) return false;
        break;
      case '<=':
        if (!(val <= r.value)) return false;
        break;
      case '==':
        if (val !== r.value) return false;
        break;
      case 'in':
        if (!Array.isArray(r.value) || !r.value.includes(val)) return false;
        break;
      default:
        return false;
    }
  }

  return true;
}

export async function evaluateAndRequestApproval(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  entityType: ApprovalEntity,
  entityId: string,
  data: Record<string, any>
): Promise<{ requiresApproval: boolean; approvalId?: string }> {
  // Fetch active approval rules for entity type, ordered by priority DESC
  const rules = await tx.approvalRule.findMany({
    where: { entityType, isActive: true },
    orderBy: { priority: 'desc' },
  });

  for (const rule of rules) {
    if (evaluateCondition(rule.condition, data)) {
      const approval = await tx.approval.create({
        data: {
          entityType,
          entityId,
          requestedBy: ctx.userId,
          approverRoleId: rule.approverRoleId,
          status: 'PENDING',
        },
      });

      await logAudit(tx, ctx, {
        action: 'APPROVAL_REQUESTED',
        entityType,
        entityId,
        newValue: { approvalId: approval.id, ruleId: rule.id },
      });

      return { requiresApproval: true, approvalId: approval.id };
    }
  }

  return { requiresApproval: false };
}

export async function decideApproval(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string
) {
  const approval = await tx.approval.findUniqueOrThrow({ where: { id: approvalId } });

  if (approval.status !== 'PENDING') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Approval request is no longer pending', 409);
  }

  // Segregation of duties: requester cannot approve own request
  if (approval.requestedBy === ctx.userId) {
    throw new AppError('SELF_APPROVAL_FORBIDDEN', 'Requesters cannot approve their own requests', 403);
  }

  const updated = await tx.approval.update({
    where: { id: approvalId },
    data: {
      status: decision,
      decidedBy: ctx.userId,
      decidedAt: new Date(),
      comment,
    },
  });

  await logAudit(tx, ctx, {
    action: `APPROVAL_${decision}`,
    entityType: approval.entityType,
    entityId: approval.entityId,
    newValue: { decision, comment, decidedBy: ctx.userId },
  });

  return updated;
}
