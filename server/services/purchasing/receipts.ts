import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r3, r4 } from '../../lib/money';
import { applyMovement } from '../inventory/movement';
import { allocateLandedCost } from './landed-cost';

export interface ReceiveGRNLineInput {
  purchaseItemId: string;
  quantityReceived: Prisma.Decimal.Value;
  quantityRejected?: Prisma.Decimal.Value;
  unitCost?: Prisma.Decimal.Value;
  batchNumber?: string;
  manufacturingDate?: Date;
  expiryDate?: Date;
  locationId?: string;
  serials?: string[];
}

export interface CreateGRNInput {
  purchaseOrderId: string;
  supplierInvoiceNo?: string;
  notes?: string;
  lines: ReceiveGRNLineInput[];
}

export async function receiveGoodsReceipt(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateGRNInput
) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId },
    include: { items: true, additions: true },
  });

  if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', `Cannot receive goods for PO in '${po.status}' state`, 409);
  }

  const org = await tx.organization.findFirst();
  const overReceiptPct = org ? org.overReceiptPct.toNumber() : 0;

  const grnNumber = await nextNumber(tx, 'GRN');

  // Prepare items for landed cost allocation
  const itemsForLandedCost = [];
  const linesToProcess = [];

  for (const lineInput of input.lines) {
    const poItem = po.items.find((i) => i.id === lineInput.purchaseItemId);
    if (!poItem) {
      throw new AppError('NOT_FOUND', `Purchase item '${lineInput.purchaseItemId}' not found in PO`, 404);
    }

    const qtyRec = r3(D(lineInput.quantityReceived));
    const qtyRej = r3(D(lineInput.quantityRejected ?? 0));
    const actualUnitCost = lineInput.unitCost ? r4(D(lineInput.unitCost)) : r4(poItem.unitCost);

    const remainingQty = poItem.orderedQuantity.minus(poItem.receivedQuantity);
    const maxAllowedQty = remainingQty.mul(1 + overReceiptPct / 100);

    if (qtyRec.plus(qtyRej).gt(maxAllowedQty)) {
      throw new AppError('OVER_RECEIPT', `Received quantity (${qtyRec.toString()}) exceeds allowed tolerance`, 422);
    }

    itemsForLandedCost.push({
      productId: poItem.productId,
      qty: qtyRec,
      unitCost: actualUnitCost,
    });

    linesToProcess.push({
      poItem,
      qtyRec,
      qtyRej,
      actualUnitCost,
      lineInput,
    });
  }

  // Calculate landed cost additions distribution
  const additions = po.additions.map((a) => ({
    amount: D(a.amount),
    method: a.method,
  }));
  const landedCostMap = allocateLandedCost(itemsForLandedCost, additions);

  const grn = await tx.goodsReceipt.create({
    data: {
      receiptNumber: grnNumber,
      purchaseOrderId: po.id,
      warehouseId: po.warehouseId,
      supplierInvoiceNo: input.supplierInvoiceNo,
      notes: input.notes,
      receivedBy: ctx.userId,
    },
  });

  // Sort lines by (warehouseId, productId) to prevent deadlocks
  linesToProcess.sort((a, b) => a.poItem.productId.localeCompare(b.poItem.productId));

  let allLinesFullyReceived = true;

  for (const item of linesToProcess) {
    const { poItem, qtyRec, qtyRej, actualUnitCost, lineInput } = item;

    const allocatedCost = landedCostMap.get(poItem.productId) || D(0);
    const extraPerUnit = qtyRec.gt(0) ? allocatedCost.div(qtyRec) : D(0);
    const landedUnitCost = r4(actualUnitCost.plus(extraPerUnit));

    // Handle batch creation/update
    let batchId: string | undefined;
    if (lineInput.batchNumber) {
      const batch = await tx.batch.upsert({
        where: {
          productId_warehouseId_batchNumber: {
            productId: poItem.productId,
            warehouseId: po.warehouseId,
            batchNumber: lineInput.batchNumber,
          },
        },
        update: {
          manufacturingDate: lineInput.manufacturingDate,
          expiryDate: lineInput.expiryDate,
        },
        create: {
          productId: poItem.productId,
          warehouseId: po.warehouseId,
          batchNumber: lineInput.batchNumber,
          manufacturingDate: lineInput.manufacturingDate,
          expiryDate: lineInput.expiryDate,
          quantity: D(0),
          unitCost: landedUnitCost,
          status: 'AVAILABLE',
        },
      });
      batchId = batch.id;
    }

    // Call single authoritative stock movement engine
    if (qtyRec.gt(0)) {
      await applyMovement(tx, {
        productId: poItem.productId,
        warehouseId: po.warehouseId,
        type: 'PURCHASE',
        quantity: qtyRec,
        unitCost: landedUnitCost,
        refType: 'GOODS_RECEIPT',
        refId: grn.id,
        batchId,
        locationId: lineInput.locationId,
        serialIds: lineInput.serials,
        performedBy: ctx.userId,
      });
    }

    // Create GoodsReceiptItem row
    await tx.goodsReceiptItem.create({
      data: {
        receiptId: grn.id,
        purchaseItemId: poItem.id,
        productId: poItem.productId,
        quantityReceived: qtyRec,
        quantityRejected: qtyRej,
        unitCost: actualUnitCost,
        landedUnitCost,
        batchNumber: lineInput.batchNumber,
        manufacturingDate: lineInput.manufacturingDate,
        expiryDate: lineInput.expiryDate,
        locationId: lineInput.locationId,
        serials: lineInput.serials ?? [],
      },
    });

    // Update PurchaseItem received quantity
    const newReceivedQty = poItem.receivedQuantity.plus(qtyRec);
    await tx.purchaseItem.update({
      where: { id: poItem.id },
      data: { receivedQuantity: newReceivedQty },
    });

    if (newReceivedQty.lt(poItem.orderedQuantity)) {
      allLinesFullyReceived = false;
    }
  }

  // Update PO status
  const nextPoStatus = allLinesFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  await tx.purchaseOrder.update({
    where: { id: po.id },
    data: { status: nextPoStatus },
  });

  await logAudit(tx, ctx, {
    action: 'GRN_RECEIVE',
    entityType: 'GoodsReceipt',
    entityId: grn.id,
    newValue: { grnNumber, poId: po.id, status: nextPoStatus },
  });

  return grn;
}
