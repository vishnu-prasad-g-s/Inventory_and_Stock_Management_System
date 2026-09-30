import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { D, r3, r4 } from '../../lib/money';

export async function addCostLayer(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  quantity: Prisma.Decimal,
  unitCost: Prisma.Decimal
) {
  return tx.costLayer.create({
    data: {
      productId,
      warehouseId,
      qtyRemaining: quantity,
      unitCost,
      receivedAt: new Date(),
    },
  });
}

export async function consumeCostLayers(
  tx: Prisma.TransactionClient,
  productId: string,
  warehouseId: string,
  qtyToConsume: Prisma.Decimal
): Promise<Prisma.Decimal> {
  const need = r3(qtyToConsume);

  const layers = await tx.$queryRaw<{ id: string; qtyRemaining: Prisma.Decimal; unitCost: Prisma.Decimal }[]>`
    SELECT id, "qtyRemaining", "unitCost" FROM "CostLayer"
    WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} AND "qtyRemaining" > 0
    ORDER BY "receivedAt" ASC
    FOR UPDATE`;

  let remaining = need;
  let totalCost = D(0);

  for (const layer of layers) {
    if (remaining.lte(0)) break;
    const layerQty = D(layer.qtyRemaining);
    const take = Prisma.Decimal.min(remaining, layerQty);

    totalCost = totalCost.plus(take.mul(D(layer.unitCost)));
    remaining = remaining.minus(take);

    const newQtyRemaining = layerQty.minus(take);
    await tx.costLayer.update({
      where: { id: layer.id },
      data: { qtyRemaining: newQtyRemaining },
    });
  }

  if (remaining.gt(0)) {
    throw new AppError('FIFO_INSUFFICIENT_LAYERS', 'Not enough cost layers available to satisfy FIFO deduction', 409);
  }

  return r4(totalCost.div(need));
}

export async function getCostingMethod(tx: Prisma.TransactionClient): Promise<'WAC' | 'FIFO'> {
  const org = await tx.organization.findFirst();
  return org?.costingMethod ?? 'WAC';
}
