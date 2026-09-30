import { Prisma, PaymentMethod } from '@prisma/client';
import { Ctx } from '../../lib/route';
import { createSalesOrder } from './orders';
import { applyMovement } from '../inventory/movement';
import { createTaxInvoice } from './invoices';
import { recordPayment } from './payments';

export interface PosPaymentInput {
  method: PaymentMethod;
  amount: Prisma.Decimal.Value;
  transactionReference?: string;
}

export interface ProcessPosSaleInput {
  customerId?: string;
  warehouseId: string;
  lines: Array<{
    productId: string;
    quantity: Prisma.Decimal.Value;
    unitPrice: Prisma.Decimal.Value;
    discount?: Prisma.Decimal.Value;
    batchId?: string;
    serialIds?: string[];
  }>;
  payments: PosPaymentInput[];
}

export async function processPosSale(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: ProcessPosSaleInput
) {
  // 1. Create Sales Order
  const order = await createSalesOrder(tx, ctx, {
    customerId: input.customerId,
    warehouseId: input.warehouseId,
    channel: 'POS',
    lines: input.lines,
  });

  // 2. Sort items by productId to avoid deadlocks & apply SALE stock movements
  const sortedItems = [...order.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of sortedItems) {
    await applyMovement(tx, {
      productId: item.productId,
      warehouseId: input.warehouseId,
      type: 'SALE',
      quantity: item.quantity,
      batchId: item.batchId ?? undefined,
      serialIds: item.serialIds,
      refType: 'SALES_ORDER',
      refId: order.id,
      performedBy: ctx.userId,
    });
  }

  // Mark SalesOrder as COMPLETED
  await tx.salesOrder.update({
    where: { id: order.id },
    data: { status: 'COMPLETED' },
  });

  // 3. Issue Tax Invoice
  const invoice = await createTaxInvoice(tx, ctx, {
    salesOrderId: order.id,
    customerId: input.customerId,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    snapshot: {
      orderNumber: order.orderNumber,
      items: order.items,
    },
  });

  // 4. Record Payments
  const recordedPayments = [];
  for (const payInput of input.payments) {
    const payment = await recordPayment(tx, ctx, {
      direction: 'IN',
      referenceType: 'SALES_ORDER',
      referenceId: order.id,
      partyId: input.customerId,
      amount: payInput.amount,
      method: payInput.method,
      transactionReference: payInput.transactionReference,
      allocations: [
        {
          invoiceId: invoice.id,
          amount: payInput.amount,
        },
      ],
    });
    recordedPayments.push(payment);
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    total: order.total,
    payments: recordedPayments,
  };
}
