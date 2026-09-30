import { PrismaClient } from '@prisma/client';
import { D, r2 } from '../../lib/money';

export async function getValuationAsOfDate(
  prisma: PrismaClient,
  asOfDate: Date,
  warehouseId?: string
) {
  const whereWh = warehouseId ? { warehouseId } : {};

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: { category: true },
  });

  const valuationRows = [];
  let grandTotalValuation = D(0);

  for (const prod of products) {
    // Find the latest transaction for product on or before asOfDate
    const lastTx = await prisma.inventoryTransaction.findFirst({
      where: {
        productId: prod.id,
        createdAt: { lte: asOfDate },
        ...whereWh,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastTx && !D(lastTx.balanceAfter).equals(0)) {
      const qty = D(lastTx.balanceAfter);
      const cost = lastTx.avgCostAfter ? D(lastTx.avgCostAfter) : D(prod.purchasePrice);
      const totalVal = r2(qty.mul(cost));

      grandTotalValuation = grandTotalValuation.plus(totalVal);

      valuationRows.push({
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        category: prod.category.name,
        quantityAsOf: qty.toNumber(),
        avgCostAsOf: cost.toNumber(),
        totalValueAsOf: totalVal.toNumber(),
      });
    }
  }

  return {
    asOfDate: asOfDate.toISOString(),
    grandTotalValuation: r2(grandTotalValuation).toNumber(),
    rows: valuationRows,
  };
}
