import { PrismaClient } from '@prisma/client';
import { D, r2 } from '../../lib/money';

export async function runAbcClassification(prisma: PrismaClient) {
  // Calculate revenue contribution for active products in last 90 days
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const salesItems = await prisma.salesItem.groupBy({
    by: ['productId'],
    _sum: { total: true },
    where: {
      salesOrder: {
        orderDate: { gte: startDate },
        status: 'COMPLETED',
      },
    },
  });

  const productRevenues = salesItems
    .map((item) => ({
      productId: item.productId,
      revenue: item._sum.total ? D(item._sum.total) : D(0),
    }))
    .sort((a, b) => b.revenue.minus(a.revenue).toNumber());

  const totalRevenue = productRevenues.reduce((acc, p) => acc.plus(p.revenue), D(0));

  if (totalRevenue.lte(0)) return;

  let cumulativeRevenue = D(0);

  for (const item of productRevenues) {
    cumulativeRevenue = cumulativeRevenue.plus(item.revenue);
    const cumulativePct = cumulativeRevenue.div(totalRevenue).mul(100).toNumber();

    let abcClass = 'C';
    if (cumulativePct <= 70) {
      abcClass = 'A';
    } else if (cumulativePct <= 90) {
      abcClass = 'B';
    }

    await prisma.product.update({
      where: { id: item.productId },
      data: { abcClass },
    });
  }
}
