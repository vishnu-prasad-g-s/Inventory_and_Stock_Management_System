import { Prisma, AdjustmentKind, AdjustmentStatus, InvTxType } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r3 } from '../../lib/money';
import { applyMovement } from '../inventory/movement';

export interface AdjustmentLineInput {
  productId: string;
  quantityDelta: Prisma.Decimal.Value;
  batchId?: string;
  serialNumberId?: string;
}

export async function createAdjustment(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    warehouseId: string;
    kind: AdjustmentKind;
    reason: string;
    description?: string;
    items: AdjustmentLineInput[];
  }
) {
  const adjustmentNumber = await nextNumber(tx, 'ADJ');

  const adj = await tx.stockAdjustment.create({
    data: {
      adjustmentNumber,
      warehouseId: input.warehouseId,
      kind: input.kind,
      status: 'DRAFT',
      reason: input.reason,
      description: input.description,
      createdBy: ctx.userId,
      items: {
        create: input.items.map((i) => ({
          productId: i.productId,
          quantityDelta: r3(D(i.quantityDelta)),
          batchId: i.batchId,
          serialNumberId: i.serialNumberId,
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, ctx, {
    action: 'ADJUSTMENT_CREATE',
    entityType: 'StockAdjustment',
    entityId: adj.id,
    newValue: adj,
  });

  return adj;
}

export async function postAdjustment(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  adjustmentId: string
) {
  const adj = await tx.stockAdjustment.findUniqueOrThrow({
    where: { id: adjustmentId },
    include: { items: true },
  });

  if (adj.status !== 'APPROVED' && adj.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only DRAFT or APPROVED adjustments can be posted', 409);
  }

  // Sort items by productId to avoid deadlocks
  const sortedItems = [...adj.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of sortedItems) {
    const delta = D(item.quantityDelta);
    if (delta.equals(0)) continue;

    let movementType: InvTxType;

    if (delta.gt(0)) {
      movementType = 'ADJUSTMENT_IN';
    } else {
      switch (adj.kind) {
        case 'DAMAGE':
          movementType = 'DAMAGE';
          break;
        case 'EXPIRY':
          movementType = 'EXPIRY';
          break;
        case 'LOSS':
        case 'THEFT_INCIDENT':
          movementType = 'LOSS';
          break;
        default:
          movementType = 'ADJUSTMENT_OUT';
          break;
      }
    }

    const inv = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: item.productId,
          warehouseId: adj.warehouseId,
        },
      },
    });

    const cost = inv ? inv.avgCost : D(0);

    // Call single authoritative stock movement engine
    await applyMovement(tx, {
      productId: item.productId,
      warehouseId: adj.warehouseId,
      type: movementType,
      quantity: delta.abs(),
      unitCost: cost,
      refType: 'ADJUSTMENT',
      refId: adj.id,
      batchId: item.batchId ?? undefined,
      serialIds: item.serialNumberId ? [item.serialNumberId] : undefined,
      reason: `${adj.kind}: ${adj.reason}`,
      performedBy: ctx.userId,
    });
  }

  const updated = await tx.stockAdjustment.update({
    where: { id: adjustmentId },
    data: {
      status: 'POSTED',
      postedAt: new Date(),
    },
  });

  await logAudit(tx, ctx, {
    action: 'ADJUSTMENT_POST',
    entityType: 'StockAdjustment',
    entityId: adjustmentId,
    newValue: { status: 'POSTED' },
  });

  return updated;
}
