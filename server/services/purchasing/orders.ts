import { Prisma, PurchaseStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r2, r3, r4 } from '../../lib/money';
import { evaluateAndRequestApproval } from '../approvals/approvals';

export interface CreatePOLineInput {
  productId: string;
  orderedQuantity: Prisma.Decimal.Value;
  unitCost: Prisma.Decimal.Value;
  taxRate?: Prisma.Decimal.Value;
  discount?: Prisma.Decimal.Value;
}

export interface CreatePOInput {
  supplierId: string;
  warehouseId: string;
  expectedDate?: Date;
  notes?: string;
  lines: CreatePOLineInput[];
}

export async function createPurchaseOrder(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreatePOInput
) {
  if (!input.lines || input.lines.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Purchase Order must contain at least one line item', 400);
  }

  const poNumber = await nextNumber(tx, 'PO');

  let subtotal = D(0);
  let taxTotal = D(0);
  let discountTotal = D(0);

  const poItemsData = [];

  for (const line of input.lines) {
    const qty = r3(D(line.orderedQuantity));
    const cost = r4(D(line.unitCost));
    const taxRate = line.taxRate ? D(line.taxRate) : D(0);
    const discount = line.discount ? D(line.discount) : D(0);

    const gross = qty.mul(cost).minus(discount);
    const tax = gross.mul(taxRate).div(100);
    const lineTotal = r2(gross.plus(tax));

    subtotal = subtotal.plus(qty.mul(cost));
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(tax);

    poItemsData.push({
      productId: line.productId,
      orderedQuantity: qty,
      receivedQuantity: D(0),
      returnedQuantity: D(0),
      unitCost: cost,
      taxRate,
      discount,
      total: lineTotal,
    });
  }

  const grandTotal = r2(subtotal.minus(discountTotal).plus(taxTotal));

  const po = await tx.purchaseOrder.create({
    data: {
      purchaseOrderNumber: poNumber,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: 'DRAFT',
      expectedDate: input.expectedDate,
      subtotal: r2(subtotal),
      tax: r2(taxTotal),
      discount: r2(discountTotal),
      total: grandTotal,
      notes: input.notes,
      createdBy: ctx.userId,
      items: {
        create: poItemsData,
      },
    },
    include: { items: true },
  });

  await logAudit(tx, ctx, {
    action: 'PO_CREATE',
    entityType: 'PurchaseOrder',
    entityId: po.id,
    newValue: po,
  });

  return po;
}

export async function submitPurchaseOrder(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  poId: string
) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { items: true } });

  if (po.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', 'Only DRAFT POs can be submitted for approval', 409);
  }

  // Evaluate approval rules
  const { requiresApproval } = await evaluateAndRequestApproval(
    tx,
    ctx,
    'PURCHASE_ORDER',
    po.id,
    { total: po.total.toNumber() }
  );

  const nextStatus: PurchaseStatus = requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED';

  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: { status: nextStatus, approvedBy: requiresApproval ? null : ctx.userId },
  });

  await logAudit(tx, ctx, {
    action: 'PO_SUBMIT',
    entityType: 'PurchaseOrder',
    entityId: poId,
    oldValue: { status: po.status },
    newValue: { status: nextStatus },
  });

  return updated;
}
