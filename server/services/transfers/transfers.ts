import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r3 } from '../../lib/money';
import { applyMovement } from '../inventory/movement';

export interface TransferLineInput {
  productId: string;
  quantity: Prisma.Decimal.Value;
  batchId?: string;
  serialIds?: string[];
}

export async function createTransfer(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    notes?: string;
    items: TransferLineInput[];
  }
) {
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new AppError('VALIDATION_ERROR', 'Source and destination warehouses cannot be the same', 400);
  }

  const transferNumber = await nextNumber(tx, 'TRF');

  const transfer = await tx.warehouseTransfer.create({
    data: {
      transferNumber,
      sourceWarehouseId: input.sourceWarehouseId,
      destinationWarehouseId: input.destinationWarehouseId,
      status: 'DRAFT',
      notes: input.notes,
      createdBy: ctx.userId,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          quantity: r3(D(item.quantity)),
          batchId: item.batchId,
          serialIds: item.serialIds ?? [],
        })),
      },
    },
    include: { items: true },
  });

  await logAudit(tx, ctx, {
    action: 'TRANSFER_CREATE',
    entityType: 'WarehouseTransfer',
    entityId: transfer.id,
    newValue: transfer,
  });

  return transfer;
}

export async function dispatchTransfer(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  transferId: string
) {
  const transfer = await tx.warehouseTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { items: true },
  });

  if (transfer.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only DRAFT transfers can be dispatched', 409);
  }

  const sortedItems = [...transfer.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of sortedItems) {
    const inv = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: item.productId,
          warehouseId: transfer.sourceWarehouseId,
        },
      },
    });

    const sourceCost = inv ? inv.avgCost : D(0);

    // Call single authoritative stock movement engine for TRANSFER_OUT
    const res = await applyMovement(tx, {
      productId: item.productId,
      warehouseId: transfer.sourceWarehouseId,
      type: 'TRANSFER_OUT',
      quantity: item.quantity,
      batchId: item.batchId ?? undefined,
      serialIds: item.serialIds,
      refType: 'TRANSFER',
      refId: transfer.id,
      performedBy: ctx.userId,
    });

    await tx.transferItem.update({
      where: { id: item.id },
      data: {
        quantitySent: item.quantity,
        unitCost: res.unitCost,
      },
    });
  }

  const updated = await tx.warehouseTransfer.update({
    where: { id: transferId },
    data: {
      status: 'IN_TRANSIT',
      dispatchedBy: ctx.userId,
      dispatchedAt: new Date(),
    },
  });

  await logAudit(tx, ctx, {
    action: 'TRANSFER_DISPATCH',
    entityType: 'WarehouseTransfer',
    entityId: transferId,
    newValue: { status: 'IN_TRANSIT' },
  });

  return updated;
}

export async function receiveTransfer(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  transferId: string,
  lines: Array<{
    transferItemId: string;
    quantityReceived: Prisma.Decimal.Value;
    quantityDamaged?: Prisma.Decimal.Value;
    discrepancyNote?: string;
  }>
) {
  const transfer = await tx.warehouseTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { items: true },
  });

  if (transfer.status !== 'IN_TRANSIT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only IN_TRANSIT transfers can be received', 409);
  }

  for (const lineInput of lines) {
    const item = transfer.items.find((i) => i.id === lineInput.transferItemId);
    if (!item) throw new AppError('NOT_FOUND', 'Transfer item not found', 404);

    const qtyRec = r3(D(lineInput.quantityReceived));
    const qtyDamaged = r3(D(lineInput.quantityDamaged ?? 0));
    const acceptedQty = qtyRec.minus(qtyDamaged);

    // Call single authoritative stock movement engine for TRANSFER_IN
    if (acceptedQty.gt(0)) {
      await applyMovement(tx, {
        productId: item.productId,
        warehouseId: transfer.destinationWarehouseId,
        type: 'TRANSFER_IN',
        quantity: acceptedQty,
        unitCost: item.unitCost ?? D(0), // Preserve source unit cost
        refType: 'TRANSFER',
        refId: transfer.id,
        batchId: item.batchId ?? undefined,
        serialIds: item.serialIds,
        performedBy: ctx.userId,
      });
    }

    // Handle damaged items (TRANSFER_IN then DAMAGE)
    if (qtyDamaged.gt(0)) {
      await applyMovement(tx, {
        productId: item.productId,
        warehouseId: transfer.destinationWarehouseId,
        type: 'TRANSFER_IN',
        quantity: qtyDamaged,
        unitCost: item.unitCost ?? D(0),
        refType: 'TRANSFER',
        refId: transfer.id,
        performedBy: ctx.userId,
      });

      await applyMovement(tx, {
        productId: item.productId,
        warehouseId: transfer.destinationWarehouseId,
        type: 'DAMAGE',
        quantity: qtyDamaged,
        refType: 'TRANSFER',
        refId: transfer.id,
        reason: 'Damaged in transit',
        performedBy: ctx.userId,
      });
    }

    await tx.transferItem.update({
      where: { id: item.id },
      data: {
        quantityReceived: qtyRec,
        quantityDamaged: qtyDamaged,
        discrepancyNote: lineInput.discrepancyNote,
      },
    });
  }

  const updated = await tx.warehouseTransfer.update({
    where: { id: transferId },
    data: {
      status: 'RECEIVED',
      receivedBy: ctx.userId,
      completedAt: new Date(),
    },
  });

  await logAudit(tx, ctx, {
    action: 'TRANSFER_RECEIVE',
    entityType: 'WarehouseTransfer',
    entityId: transferId,
    newValue: { status: 'RECEIVED' },
  });

  return updated;
}
