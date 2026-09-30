import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r2, r3 } from '../../lib/money';
import { applyMovement } from '../inventory/movement';

export interface SalesReturnItemInput {
  salesItemId: string;
  quantity: Prisma.Decimal.Value;
  condition?: 'RESALEABLE' | 'DAMAGED';
  reason: string;
  batchId?: string;
  serialNumberId?: string;
}

export async function processSalesReturn(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    salesOrderId: string;
    reason: string;
    items: SalesReturnItemInput[];
  }
) {
  const order = await tx.salesOrder.findUniqueOrThrow({
    where: { id: input.salesOrderId },
    include: { items: true, customer: true, invoices: true },
  });

  const returnNumber = await nextNumber(tx, 'RET');
  const cnNumber = await nextNumber(tx, 'CN');

  let totalRefund = D(0);
  let totalTaxable = D(0);
  let totalCgst = D(0);
  let totalSgst = D(0);
  let totalIgst = D(0);

  const returnDoc = await tx.returnDoc.create({
    data: {
      returnNumber,
      type: 'SALES',
      referenceOrderId: order.id,
      customerId: order.customerId,
      warehouseId: order.warehouseId,
      status: 'PROCESSED',
      reason: input.reason,
      createdBy: ctx.userId,
      processedAt: new Date(),
    },
  });

  for (const itemInput of input.items) {
    const item = order.items.find((i) => i.id === itemInput.salesItemId);
    if (!item) throw new AppError('NOT_FOUND', 'Sales item not found in order', 404);

    const qty = r3(D(itemInput.quantity));

    // Post SALES_RETURN stock movement
    await applyMovement(tx, {
      productId: item.productId,
      warehouseId: order.warehouseId,
      type: 'SALES_RETURN',
      quantity: qty,
      unitCost: item.unitCost ?? item.unitPrice,
      refType: 'RETURN',
      refId: returnDoc.id,
      batchId: itemInput.batchId,
      performedBy: ctx.userId,
    });

    // If condition is DAMAGED, follow immediately by a DAMAGE movement
    if (itemInput.condition === 'DAMAGED') {
      await applyMovement(tx, {
        productId: item.productId,
        warehouseId: order.warehouseId,
        type: 'DAMAGE',
        quantity: qty,
        refType: 'RETURN',
        refId: returnDoc.id,
        reason: 'Returned damaged stock scrap',
        performedBy: ctx.userId,
      });
    }

    // Update sales item returned quantity
    await tx.salesItem.update({
      where: { id: item.id },
      data: { returnedQuantity: item.returnedQuantity.plus(qty) },
    });

    const lineTaxable = r2(qty.mul(item.unitPrice).minus(item.discount));
    const lineCgst = r2(lineTaxable.mul(item.taxRate).div(200));
    const lineSgst = lineCgst;
    const lineIgst = item.igst.gt(0) ? r2(lineTaxable.mul(item.taxRate).div(100)) : D(0);
    const lineTotal = lineTaxable.plus(lineCgst).plus(lineSgst).plus(lineIgst);

    totalTaxable = totalTaxable.plus(lineTaxable);
    totalCgst = totalCgst.plus(lineCgst);
    totalSgst = totalSgst.plus(lineSgst);
    totalIgst = totalIgst.plus(lineIgst);
    totalRefund = totalRefund.plus(lineTotal);

    await tx.returnItem.create({
      data: {
        returnId: returnDoc.id,
        productId: item.productId,
        orderItemId: item.id,
        quantity: qty,
        condition: itemInput.condition ?? 'RESALEABLE',
        unitCost: item.unitCost,
        unitPrice: item.unitPrice,
        batchId: itemInput.batchId,
        serialNumberId: itemInput.serialNumberId,
      },
    });
  }

  // Create Credit Note Invoice record
  const originalInvoice = order.invoices.find((i) => i.type === 'TAX_INVOICE');

  const creditNote = await tx.invoice.create({
    data: {
      invoiceNumber: cnNumber,
      type: 'CREDIT_NOTE',
      status: 'ISSUED',
      salesOrderId: order.id,
      customerId: order.customerId,
      returnId: returnDoc.id,
      originalInvoiceId: originalInvoice?.id,
      subtotal: totalTaxable,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      total: totalRefund,
      paymentStatus: 'UNPAID',
      snapshot: {
        customer: order.customer,
        orderNumber: order.orderNumber,
        items: input.items,
      },
    },
  });

  await tx.returnDoc.update({
    where: { id: returnDoc.id },
    data: { refundAmount: totalRefund, creditNoteId: creditNote.id },
  });

  await logAudit(tx, ctx, {
    action: 'SALES_RETURN_PROCESS',
    entityType: 'ReturnDoc',
    entityId: returnDoc.id,
    newValue: { returnNumber, cnNumber, totalRefund: totalRefund.toString() },
  });

  return { returnDoc, creditNote };
}
