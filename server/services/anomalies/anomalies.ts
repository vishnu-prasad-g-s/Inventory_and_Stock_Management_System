import { PrismaClient } from '@prisma/client';

export async function detectNegativeMarginSales(prisma: PrismaClient) {
  const salesItems = await prisma.salesItem.findMany({
    where: {
      salesOrder: { status: 'COMPLETED' },
    },
    include: { product: true, salesOrder: true },
    orderBy: { id: 'desc' },
    take: 100,
  });

  const anomalies = [];

  for (const item of salesItems) {
    if (item.unitCost && item.unitPrice.lt(item.unitCost)) {
      const existing = await prisma.anomalyEvent.findFirst({
        where: { type: 'NEGATIVE_MARGIN_SALE', entityId: item.id },
      });

      if (!existing) {
        const anomaly = await prisma.anomalyEvent.create({
          data: {
            type: 'NEGATIVE_MARGIN_SALE',
            entityType: 'SalesItem',
            entityId: item.id,
            severity: 2,
            evidence: {
              orderNumber: item.salesOrder.orderNumber,
              productName: item.product.name,
              unitPrice: item.unitPrice.toString(),
              unitCost: item.unitCost.toString(),
              marginLoss: item.unitCost.minus(item.unitPrice).toString(),
            },
            status: 'OPEN',
          },
        });
        anomalies.push(anomaly);
      }
    }
  }

  return anomalies;
}
