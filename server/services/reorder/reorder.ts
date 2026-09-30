import { PrismaClient } from '@prisma/client';
import { D, r3 } from '../../lib/money';

export async function generateReorderSuggestions(prisma: PrismaClient) {
  const stockRows = await prisma.inventory.findMany({
    include: { product: true, warehouse: true },
  });

  const suggestions = [];

  for (const inv of stockRows) {
    const prod = inv.product;
    const available = inv.quantity.minus(inv.reservedQuantity);

    // Calculate on-order quantity from open POs
    const openPoItems = await prisma.purchaseItem.aggregate({
      where: {
        productId: prod.id,
        purchaseOrder: { warehouseId: inv.warehouseId, status: { in: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] } },
      },
      _sum: { orderedQuantity: true, receivedQuantity: true },
    });

    const ordered = openPoItems._sum.orderedQuantity ? D(openPoItems._sum.orderedQuantity) : D(0);
    const received = openPoItems._sum.receivedQuantity ? D(openPoItems._sum.receivedQuantity) : D(0);
    const onOrder = ordered.minus(received);

    const position = available.plus(onOrder);

    // Lead time & Safety stock calculations
    const leadTimeDays = prod.leadTimeDays || 7;
    const avgDailyDemand = D(1); // Baseline fallback
    const demandLT = avgDailyDemand.mul(leadTimeDays);
    const safetyStock = D(Math.ceil(1.645 * 1.5 * Math.sqrt(leadTimeDays))); // 95% service level
    const reorderPoint = demandLT.plus(safetyStock);

    if (position.lte(reorderPoint)) {
      const target = reorderPoint.plus(avgDailyDemand.mul(7)); // 7d review period
      let rawNeeded = target.minus(position);

      // Round UP to packSize
      const packSize = D(prod.packSize);
      let suggestedQty = Math.ceil(rawNeeded.div(packSize).toNumber()) * packSize.toNumber();
      if (suggestedQty < prod.minOrderQty.toNumber()) {
        suggestedQty = prod.minOrderQty.toNumber();
      }

      const explanation = {
        available: available.toNumber(),
        reserved: inv.reservedQuantity.toNumber(),
        onOrder: onOrder.toNumber(),
        leadTimeDays,
        safetyStock: safetyStock.toNumber(),
        reorderPoint: reorderPoint.toNumber(),
        suggestedQty,
        packSize: packSize.toNumber(),
        reason: `Available stock position (${position.toString()}) is at or below reorder point (${reorderPoint.toString()}).`,
      };

      // Find preferred supplier
      const suppProduct = await prisma.supplierProduct.findFirst({
        where: { productId: prod.id, isPreferred: true },
      });

      const suggestion = await prisma.reorderSuggestion.create({
        data: {
          productId: prod.id,
          warehouseId: inv.warehouseId,
          supplierId: suppProduct?.supplierId,
          suggestedQty: D(suggestedQty),
          explanation: explanation as any,
          status: 'OPEN',
        },
      });

      suggestions.push(suggestion);
    }
  }

  return suggestions;
}
