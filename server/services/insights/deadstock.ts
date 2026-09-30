import { PrismaClient } from '@prisma/client';
import { D, r2 } from '../../lib/money';

export async function getDeadStockReport(
  prisma: PrismaClient,
  noSalesDaysThreshold = 90
) {
  const cutoffDate = new Date(Date.now() - noSalesDaysThreshold * 24 * 60 * 60 * 1000);

  const inventoryRows = await prisma.inventory.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: true, warehouse: true },
  });

  const deadItems = [];
  let totalCashLocked = D(0);

  for (const inv of inventoryRows) {
    const lastSale = await prisma.inventoryTransaction.findFirst({
      where: {
        productId: inv.productId,
        warehouseId: inv.warehouseId,
        type: 'SALE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastSale || lastSale.createdAt < cutoffDate) {
      const qty = D(inv.quantity);
      const cost = D(inv.avgCost);
      const cashLocked = r2(qty.mul(cost));

      totalCashLocked = totalCashLocked.plus(cashLocked);

      deadItems.push({
        productId: inv.productId,
        sku: inv.product.sku,
        name: inv.product.name,
        warehouseName: inv.warehouse.name,
        quantityOnHand: qty.toNumber(),
        avgCost: cost.toNumber(),
        cashLocked: cashLocked.toNumber(),
        lastSaleDate: lastSale ? lastSale.createdAt.toISOString().split('T')[0] : 'Never',
        suggestedAction: 'Promotional discount / Supplier return',
      });
    }
  }

  return {
    noSalesDaysThreshold,
    totalCashLocked: r2(totalCashLocked).toNumber(),
    deadStockCount: deadItems.length,
    items: deadItems,
  };
}
