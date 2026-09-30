import { Prisma, CountMode, CountStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r2, r3 } from '../../lib/money';
import { applyMovement } from '../inventory/movement';

export interface CreateCountInput {
  warehouseId: string;
  scope: Record<string, any>;
  mode?: CountMode;
}

export async function createCountPlan(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateCountInput
) {
  const countNumber = await nextNumber(tx, 'CNT');

  const count = await tx.stockCount.create({
    data: {
      countNumber,
      warehouseId: input.warehouseId,
      scope: input.scope as Prisma.InputJsonValue,
      mode: input.mode ?? 'BLIND',
      status: 'DRAFT',
      createdBy: ctx.userId,
    },
  });

  await logAudit(tx, ctx, {
    action: 'COUNT_PLAN_CREATE',
    entityType: 'StockCount',
    entityId: count.id,
    newValue: count,
  });

  return count;
}

export async function startCount(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  countId: string
) {
  const count = await tx.stockCount.findUniqueOrThrow({ where: { id: countId } });
  if (count.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only DRAFT counts can be started', 409);
  }

  // Snapshot current system quantity for all items in warehouse
  const items = await tx.inventory.findMany({
    where: { warehouseId: count.warehouseId },
  });

  for (const inv of items) {
    await tx.stockCountLine.create({
      data: {
        countId: count.id,
        productId: inv.productId,
        systemQty: inv.quantity,
      },
    });
  }

  const updated = await tx.stockCount.update({
    where: { id: countId },
    data: {
      status: 'IN_PROGRESS',
      snapshotAt: new Date(),
    },
  });

  await logAudit(tx, ctx, {
    action: 'COUNT_START',
    entityType: 'StockCount',
    entityId: countId,
    newValue: { snapshotAt: updated.snapshotAt },
  });

  return updated;
}

export async function postCountVariances(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  countId: string
) {
  const count = await tx.stockCount.findUniqueOrThrow({
    where: { id: countId },
    include: { lines: true },
  });

  if (count.status !== 'REVIEW' && count.status !== 'IN_PROGRESS') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only count in REVIEW/IN_PROGRESS can be posted', 409);
  }

  for (const line of count.lines) {
    if (line.countedQty === null) continue;

    const counted = D(line.countedQty);
    const system = D(line.systemQty);
    const variance = counted.minus(system);

    if (variance.equals(0)) continue;

    const inv = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: line.productId,
          warehouseId: count.warehouseId,
        },
      },
    });
    const cost = inv ? inv.avgCost : D(0);

    const movementType = variance.gt(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
    const absDelta = variance.abs();

    // Call single authoritative stock movement engine
    await applyMovement(tx, {
      productId: line.productId,
      warehouseId: count.warehouseId,
      type: movementType,
      quantity: absDelta,
      unitCost: cost,
      refType: 'STOCK_COUNT',
      refId: count.id,
      reason: `Cycle Count Variance (${count.countNumber})`,
      performedBy: ctx.userId,
    });
  }

  const updated = await tx.stockCount.update({
    where: { id: countId },
    data: {
      status: 'POSTED',
      postedAt: new Date(),
    },
  });

  await logAudit(tx, ctx, {
    action: 'COUNT_POST',
    entityType: 'StockCount',
    entityId: countId,
    newValue: { status: 'POSTED' },
  });

  return updated;
}
