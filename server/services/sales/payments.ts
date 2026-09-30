import { Prisma, PaymentMethod, PaymentDirection } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { D, r2 } from '../../lib/money';

export interface AllocationInput {
  invoiceId: string;
  amount: Prisma.Decimal.Value;
}

export interface CreatePaymentInput {
  direction?: PaymentDirection;
  referenceType: string;
  referenceId: string;
  partyId?: string;
  amount: Prisma.Decimal.Value;
  method: PaymentMethod;
  transactionReference?: string;
  note?: string;
  allocations?: AllocationInput[];
}

export async function recordPayment(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreatePaymentInput
) {
  const amount = r2(D(input.amount));
  if (amount.lte(0)) {
    throw new AppError('INVALID_AMOUNT', 'Payment amount must be positive', 400);
  }

  let totalAllocated = D(0);

  if (input.allocations?.length) {
    for (const alloc of input.allocations) {
      const allocAmt = r2(D(alloc.amount));
      totalAllocated = totalAllocated.plus(allocAmt);

      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });

      const paidAgg = await tx.paymentAllocation.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      });
      const currentPaid = paidAgg._sum.amount ? D(paidAgg._sum.amount) : D(0);
      const outstanding = invoice.total.minus(currentPaid);

      if (allocAmt.gt(outstanding)) {
        throw new AppError('PAYMENT_OVER_ALLOCATION', `Allocated amount (₹${allocAmt.toFixed(2)}) exceeds invoice outstanding (₹${outstanding.toFixed(2)})`, 422);
      }
    }

    if (totalAllocated.gt(amount)) {
      throw new AppError('PAYMENT_OVER_ALLOCATION', 'Total allocations exceed payment amount', 422);
    }
  }

  const payment = await tx.payment.create({
    data: {
      direction: input.direction ?? 'IN',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      partyId: input.partyId,
      amount,
      method: input.method,
      status: 'PAID',
      transactionReference: input.transactionReference,
      note: input.note,
      createdBy: ctx.userId,
      allocations: input.allocations?.length
        ? {
            create: input.allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amount: r2(D(a.amount)),
            })),
          }
        : undefined,
    },
    include: { allocations: true },
  });

  // Update invoice payment statuses
  if (input.allocations?.length) {
    for (const alloc of input.allocations) {
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: alloc.invoiceId } });

      const paidAgg = await tx.paymentAllocation.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      });
      const totalPaid = paidAgg._sum.amount ? D(paidAgg._sum.amount) : D(0);

      let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';
      if (totalPaid.gte(invoice.total)) {
        paymentStatus = 'PAID';
      } else if (totalPaid.gt(0)) {
        paymentStatus = 'PARTIAL';
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paymentStatus },
      });
    }
  }

  await logAudit(tx, ctx, {
    action: 'PAYMENT_RECORD',
    entityType: 'Payment',
    entityId: payment.id,
    newValue: { amount: amount.toString(), method: input.method },
  });

  return payment;
}
