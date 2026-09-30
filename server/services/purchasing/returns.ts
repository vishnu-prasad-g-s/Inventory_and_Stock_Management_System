import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r2, r3 } from '../../lib/money';
import { applyMovement } from '../inventory/movement';

export interface ReturnItemInput {
  purchaseItemId: string;
  quantity: Prisma.Decimal.Value;
  reason: string;
  batchId?: string;
  serialNumberId?: string;
}

export async function processPurchaseReturn(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    purchaseOrderId: string;
    reason: string;
    items: ReturnItemInput[];
  }
) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId },
    include: { items: true, supplier: true },
  });

  const returnNumber = await nextNumber(tx, 'RET');
  const dnNumber = await nextNumber(tx, 'DN');

  let totalRefund = D(0);
  let totalTaxable = D(0);
  let totalTax = D(0);

  const returnDoc = await tx.returnDoc.create({
    data: {
      returnNumber,
      type: 'PURCHASE',
      referenceOrderId: po.id,
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      status: 'PROCESSED',
      reason: input.reason,
      createdBy: ctx.userId,
      processedAt: new Date(),
    },
  });

  for (const itemInput of input.lines || input.items) {
    const poItem = po.items.find((i) => i.id === itemInput.purchaseItemId);
    if (!poItem) throw new AppError('NOT_FOUND', 'PO item not found', 404);

    const qty = r3(D(itemInput.quantity));
    const eligibleQty = poItem.receivedQuantity.minus(poItem.returnedQuantity);

    if (qty.gt(eligibleQty)) {
      throw new AppError('OVER_RETURN', `Cannot return more than eligible received quantity (${eligibleQty.toString()})`, 422);
    }

    // Call single authoritative stock movement engine for PURCHASE_RETURN
    await applyMovement(tx, {
      productId: poItem.productId,
      warehouseId: po.warehouseId,
      type: 'PURCHASE_RETURN',
      quantity: qty,
      unitCost: poItem.unitCost,
      refType: 'RETURN',
      refId: returnDoc.id,
      batchId: itemInput.batchId,
      performedBy: ctx.userId,
    });

    // Update purchase item returned quantity
    await tx.purchaseItem.update({
      where: { id: poItem.id },
      data: { returnedQuantity: poItem.returnedQuantity.plus(qty) },
    });

    const lineTaxable = r2(qty.mul(poItem.unitCost));
    const lineTax = r2(lineTaxable.mul(poItem.taxRate).div(100));
    const lineTotal = lineTaxable.plus(lineTax);

    totalTaxable = totalTaxable.plus(lineTaxable);
    totalTax = totalTax.plus(lineTax);
    totalRefund = totalRefund.plus(lineTotal);

    await tx.returnItem.create({
      data: {
        returnId: returnDoc.id,
        productId: poItem.productId,
        orderItemId: poItem.id,
        quantity: qty,
        condition: 'DAMAGED',
        unitCost: poItem.unitCost,
        batchId: itemInput.batchId,
        serialNumberId: itemInput.serialNumberId,
      },
    });
  }

  // Create Debit Note Invoice record
  const debitNote = await tx.invoice.create({
    data: {
      invoiceNumber: dnNumber,
      type: 'DEBIT_NOTE',
      status: 'ISSUED',
      supplierId: po.supplierId,
      returnId: returnDoc.id,
      subtotal: totalTaxable,
      discount: D(0),
      igst: totalTax,
      total: totalRefund,
      paymentStatus: 'UNPAID',
      snapshot: {
        supplier: po.supplier,
        poNumber: po.purchaseOrderNumber,
        items: input.items,
      },
    },
  });

  await tx.returnDoc.update({
    where: { id: returnDoc.id },
    data: { refundAmount: totalRefund, creditNoteId: debitNote.id },
  });

  await logAudit(tx, ctx, {
    action: 'PURCHASE_RETURN_PROCESS',
    entityType: 'ReturnDoc',
    entityId: returnDoc.id,
    newValue: { returnNumber, dnNumber, totalRefund: totalRefund.toString() },
  });

  return { returnDoc, debitNote };
}
