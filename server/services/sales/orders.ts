import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r2, r3 } from '../../lib/money';
import { reserve, release } from '../inventory/reservations';
import { computeLineGST } from '../../lib/gst';
import { applyMovement } from '../inventory/movement';
import { createTaxInvoice } from './invoices';

export interface CreateSalesLineInput {
  productId: string;
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discount?: Prisma.Decimal.Value;
  batchId?: string;
  serialIds?: string[];
}

export interface CreateSalesOrderInput {
  customerId?: string;
  warehouseId: string;
  channel?: string;
  placeOfSupply?: string;
  notes?: string;
  lines: CreateSalesLineInput[];
}

export async function createSalesOrder(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateSalesOrderInput
) {
  if (!input.lines || input.lines.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Sales order must contain at least one line item', 400);
  }

  const org = await tx.organization.findFirst();
  const sameState = input.placeOfSupply && org?.stateCode ? input.placeOfSupply === org.stateCode : true;

  const orderNumber = await nextNumber(tx, 'SO');

  let subtotal = D(0);
  let taxTotal = D(0);
  let discountTotal = D(0);
  let cgstTotal = D(0);
  let sgstTotal = D(0);
  let igstTotal = D(0);

  const orderItemsData = [];

  for (const line of input.lines) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });

    if (product.status !== 'ACTIVE') {
      throw new AppError('PRODUCT_INACTIVE', `Product '${product.name}' is not active for sale`, 422);
    }

    const qty = r3(D(line.quantity));
    const price = r2(D(line.unitPrice));
    const discount = line.discount ? r2(D(line.discount)) : D(0);

    // Below-cost check
    if (price.lt(product.purchasePrice) && !ctx.perms.has('sales.below_cost') && !ctx.perms.has('*')) {
      throw new AppError('BELOW_COST', `Selling price for '${product.name}' is below unit cost`, 422);
    }

    const gst = computeLineGST({
      qty,
      unitPrice: price,
      discount,
      taxRate: product.taxRate,
      sameState,
      inclusive: org?.taxInclusivePrices ?? false,
    });

    subtotal = subtotal.plus(gst.taxable);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(gst.totalTax);
    cgstTotal = cgstTotal.plus(gst.cgst);
    sgstTotal = sgstTotal.plus(gst.sgst);
    igstTotal = igstTotal.plus(gst.igst);

    orderItemsData.push({
      productId: line.productId,
      quantity: qty,
      shippedQuantity: D(0),
      returnedQuantity: D(0),
      unitPrice: price,
      unitCost: product.purchasePrice,
      discount,
      hsnCode: product.hsnCode,
      taxRate: product.taxRate,
      taxableValue: gst.taxable,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      total: gst.total,
      batchId: line.batchId,
      serialIds: line.serialIds ?? [],
    });
  }

  const grandTotal = r2(subtotal.plus(taxTotal));

  // Customer Credit Limit Check
  if (input.customerId) {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId } });
    if (customer.creditLimit.gt(0)) {
      const unpaidInvoices = await tx.invoice.aggregate({
        where: { customerId: customer.id, paymentStatus: { in: ['UNPAID', 'PARTIAL'] } },
        _sum: { total: true },
      });
      const outstanding = unpaidInvoices._sum.total ? D(unpaidInvoices._sum.total) : D(0);
      if (outstanding.plus(grandTotal).gt(customer.creditLimit)) {
        throw new AppError('CREDIT_LIMIT_EXCEEDED', `Customer credit limit exceeded. Outstanding: ₹${outstanding.toFixed(2)}, Order: ₹${grandTotal.toFixed(2)}, Limit: ₹${customer.creditLimit.toFixed(2)}`, 422);
      }
    }
  }

  const salesOrder = await tx.salesOrder.create({
    data: {
      orderNumber,
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      status: 'DRAFT',
      channel: input.channel ?? 'COUNTER',
      placeOfSupply: input.placeOfSupply,
      subtotal: r2(subtotal),
      tax: r2(taxTotal),
      discount: r2(discountTotal),
      total: grandTotal,
      notes: input.notes,
      createdBy: ctx.userId,
      items: {
        create: orderItemsData,
      },
    },
    include: { items: true },
  });

  await logAudit(tx, ctx, {
    action: 'SO_CREATE',
    entityType: 'SalesOrder',
    entityId: salesOrder.id,
    newValue: salesOrder,
  });

  return salesOrder;
}

export async function confirmSalesOrder(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  orderId: string
) {
  const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });

  if (order.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only DRAFT orders can be confirmed', 409);
  }

  // Reserve stock for each line (sorted by productId to avoid deadlocks)
  const items = [...order.items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of items) {
    await reserve(tx, {
      productId: item.productId,
      warehouseId: order.warehouseId,
      salesOrderId: order.id,
      quantity: item.quantity,
      userId: ctx.userId,
    });
  }

  const updated = await tx.salesOrder.update({
    where: { id: orderId },
    data: { status: 'CONFIRMED' },
  });

  await logAudit(tx, ctx, {
    action: 'SO_CONFIRM',
    entityType: 'SalesOrder',
    entityId: orderId,
    newValue: { status: 'CONFIRMED' },
  });

  return updated;
}
