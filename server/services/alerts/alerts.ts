import { PrismaClient } from '@prisma/client';
import { createNotification } from '../notifications/notifications';
import { D } from '../../lib/money';

export async function runStockHealthCheck(prisma: PrismaClient) {
  const stockRows = await prisma.inventory.findMany({
    include: { product: true, warehouse: true },
  });

  const admins = await prisma.user.findMany({
    where: { role: { name: 'Admin' }, status: 'ACTIVE' },
  });

  for (const item of stockRows) {
    const available = D(item.quantity).minus(D(item.reservedQuantity));
    const reorderLevel = item.reorderLevel ? D(item.reorderLevel) : D(item.product.reorderLevel);

    if (available.lte(0)) {
      const dedupeKey = `OUT:${item.productId}:${item.warehouseId}`;
      for (const admin of admins) {
        await prisma.$transaction(async (tx) => {
          await createNotification(tx, {
            userId: admin.id,
            type: 'OUT_OF_STOCK',
            title: 'Out of Stock Alert',
            message: `Product '${item.product.name}' is out of stock in warehouse '${item.warehouse.name}'.`,
            entityType: 'Product',
            entityId: item.productId,
            dedupeKey,
          });
        });
      }
    } else if (available.lte(reorderLevel)) {
      const dedupeKey = `LOW:${item.productId}:${item.warehouseId}`;
      for (const admin of admins) {
        await prisma.$transaction(async (tx) => {
          await createNotification(tx, {
            userId: admin.id,
            type: 'LOW_STOCK',
            title: 'Low Stock Warning',
            message: `Product '${item.product.name}' available quantity (${available.toString()}) is below reorder level (${reorderLevel.toString()}) in '${item.warehouse.name}'.`,
            entityType: 'Product',
            entityId: item.productId,
            dedupeKey,
          });
        });
      }
    }
  }
}
