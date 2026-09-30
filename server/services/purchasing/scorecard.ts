import { PrismaClient, Prisma } from '@prisma/client';
import { D, r2 } from '../../lib/money';

export async function computeSupplierScorecard(
  prisma: PrismaClient,
  supplierId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const receipts = await prisma.goodsReceipt.findMany({
    where: {
      purchaseOrder: { supplierId },
      receivedAt: { gte: periodStart, lte: periodEnd },
    },
    include: {
      purchaseOrder: true,
      items: { include: { purchaseItem: true } },
    },
  });

  if (receipts.length === 0) {
    return {
      onTimePct: D(100),
      fillRatePct: D(100),
      priceVariancePct: D(0),
      qualityPct: D(100),
      score: D(100),
    };
  }

  let onTimeCount = 0;
  let totalOrderedQty = D(0);
  let totalReceivedQty = D(0);
  let totalRejectedQty = D(0);
  let totalExpectedCost = D(0);
  let totalActualCost = D(0);

  for (const grn of receipts) {
    const po = grn.purchaseOrder;
    if (!po.expectedDate || grn.receivedAt <= po.expectedDate) {
      onTimeCount++;
    }

    for (const item of grn.items) {
      const rec = D(item.quantityReceived);
      const rej = D(item.quantityRejected);
      const ordered = D(item.purchaseItem.orderedQuantity);
      const expectedCost = D(item.purchaseItem.unitCost);
      const actualCost = D(item.unitCost);

      totalOrderedQty = totalOrderedQty.plus(ordered);
      totalReceivedQty = totalReceivedQty.plus(rec);
      totalRejectedQty = totalRejectedQty.plus(rej);
      totalExpectedCost = totalExpectedCost.plus(rec.mul(expectedCost));
      totalActualCost = totalActualCost.plus(rec.mul(actualCost));
    }
  }

  const onTimePct = r2(D(onTimeCount).div(receipts.length).mul(100));

  const fillRatePct = totalOrderedQty.gt(0)
    ? r2(totalReceivedQty.div(totalOrderedQty).mul(100))
    : D(100);

  const qualityPct = totalReceivedQty.gt(0)
    ? r2(totalReceivedQty.minus(totalRejectedQty).div(totalReceivedQty).mul(100))
    : D(100);

  const priceVariancePct = totalExpectedCost.gt(0)
    ? r2(totalActualCost.minus(totalExpectedCost).div(totalExpectedCost).mul(100))
    : D(0);

  // Overall Score = 40% OnTime + 30% FillRate + 30% Quality
  const score = r2(
    onTimePct.mul(0.4).plus(fillRatePct.mul(0.3)).plus(qualityPct.mul(0.3))
  );

  return prisma.supplierMetric.upsert({
    where: {
      supplierId_periodStart: {
        supplierId,
        periodStart,
      },
    },
    update: {
      periodEnd,
      onTimePct,
      fillRatePct,
      priceVariancePct,
      qualityPct,
      score,
    },
    create: {
      supplierId,
      periodStart,
      periodEnd,
      onTimePct,
      fillRatePct,
      priceVariancePct,
      qualityPct,
      score,
    },
  });
}
