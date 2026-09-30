import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { nextNumber } from '../../lib/numbering';
import { D, r2 } from '../../lib/money';

export interface CreateInvoiceInput {
  salesOrderId?: string;
  customerId?: string;
  placeOfSupply?: string;
  subtotal: Prisma.Decimal.Value;
  discount?: Prisma.Decimal.Value;
  cgst?: Prisma.Decimal.Value;
  sgst?: Prisma.Decimal.Value;
  igst?: Prisma.Decimal.Value;
  roundOff?: Prisma.Decimal.Value;
  total: Prisma.Decimal.Value;
  dueDate?: Date;
  snapshot: Record<string, any>;
  vpa?: string;
  payeeName?: string;
}

export async function createTaxInvoice(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateInvoiceInput
) {
  const invoiceNumber = await nextNumber(tx, 'INV');

  const org = await tx.organization.findFirst();
  const vpa = input.vpa ?? (org?.settings as any)?.upiVpa ?? 'pay@stockpilot';
  const payeeName = input.payeeName ?? org?.name ?? 'StockPilot';
  const totalAmt = r2(D(input.total)).toFixed(2);

  // Generate UPI payment payload string for QR code rendering
  const upiPayload = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(payeeName)}&am=${totalAmt}&cu=INR&tn=${invoiceNumber}`;

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      type: 'TAX_INVOICE',
      status: 'ISSUED',
      salesOrderId: input.salesOrderId,
      customerId: input.customerId,
      placeOfSupply: input.placeOfSupply,
      subtotal: r2(D(input.subtotal)),
      discount: input.discount ? r2(D(input.discount)) : D(0),
      cgst: input.cgst ? r2(D(input.cgst)) : D(0),
      sgst: input.sgst ? r2(D(input.sgst)) : D(0),
      igst: input.igst ? r2(D(input.igst)) : D(0),
      roundOff: input.roundOff ? r2(D(input.roundOff)) : D(0),
      total: r2(D(input.total)),
      paymentStatus: 'UNPAID',
      dueDate: input.dueDate,
      snapshot: input.snapshot as Prisma.InputJsonValue,
      upiPayload,
    },
  });

  await logAudit(tx, ctx, {
    action: 'INVOICE_ISSUE',
    entityType: 'Invoice',
    entityId: invoice.id,
    newValue: { invoiceNumber, total: totalAmt },
  });

  return invoice;
}
