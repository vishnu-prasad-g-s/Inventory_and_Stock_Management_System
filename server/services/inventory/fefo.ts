import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { D, r3 } from '../../lib/money';

export interface BatchPick {
  batchId: string;
  qty: Prisma.Decimal;
}

export async function pickBatchesFEFO(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    quantity: Prisma.Decimal.Value;
  }
): Promise<BatchPick[]> {
  const reqQty = r3(D(input.quantity));

  const rows = await tx.$queryRaw<{ id: string; quantity: Prisma.Decimal }[]>`
    SELECT id, quantity FROM "Batch"
    WHERE "productId" = ${input.productId} AND "warehouseId" = ${input.warehouseId}
      AND status = 'AVAILABLE' AND quantity > 0
      AND ("expiryDate" IS NULL OR "expiryDate" >= CURRENT_DATE)
    ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC
    FOR UPDATE`;

  let need = reqQty;
  const picks: BatchPick[] = [];

  for (const b of rows) {
    if (need.lte(0)) break;
    const availableInBatch = D(b.quantity);
    const take = Prisma.Decimal.min(need, availableInBatch);
    picks.push({ batchId: b.id, qty: take });
    need = need.minus(take);
  }

  if (need.gt(0)) {
    throw new AppError(
      'INSUFFICIENT_SELLABLE_STOCK',
      'Not enough non-expired available batch stock for FEFO picking',
      409,
      { short: need.toString(), requested: reqQty.toString() }
    );
  }

  return picks;
}
