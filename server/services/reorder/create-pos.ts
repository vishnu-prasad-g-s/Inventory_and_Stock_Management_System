import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { createPurchaseOrder } from '../purchasing/orders';

export async function createGroupedPurchaseOrdersFromSuggestions(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  suggestionIds: string[]
) {
  const suggestions = await tx.reorderSuggestion.findMany({
    where: { id: { in: suggestionIds }, status: 'OPEN' },
    include: { product: true },
  });

  if (suggestions.length === 0) {
    throw new AppError('NOT_FOUND', 'No valid OPEN suggestions selected', 404);
  }

  // Group by (supplierId, warehouseId)
  const grouped = new Map<string, typeof suggestions>();

  for (const s of suggestions) {
    if (!s.supplierId) {
      throw new AppError('SUPPLIER_REQUIRED', `Suggestion for product '${s.product.name}' has no assigned supplier`, 422);
    }
    const key = `${s.supplierId}:${s.warehouseId}`;
    const list = grouped.get(key) || [];
    list.push(s);
    grouped.set(key, list);
  }

  const createdPos = [];

  for (const [key, group] of grouped.entries()) {
    const [supplierId, warehouseId] = key.split(':');

    const lines = group.map((s) => ({
      productId: s.productId,
      orderedQuantity: s.suggestedQty,
      unitCost: s.product.purchasePrice,
    }));

    const po = await createPurchaseOrder(tx, ctx, {
      supplierId,
      warehouseId,
      notes: 'Generated automatically from reorder suggestions',
      lines,
    });

    // Mark PO as generated from suggestion
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { fromSuggestion: true },
    });

    // Mark suggestions as ACCEPTED
    await tx.reorderSuggestion.updateMany({
      where: { id: { in: group.map((s) => s.id) } },
      data: { status: 'ACCEPTED', purchaseOrderId: po.id },
    });

    createdPos.push(po);
  }

  return createdPos;
}
