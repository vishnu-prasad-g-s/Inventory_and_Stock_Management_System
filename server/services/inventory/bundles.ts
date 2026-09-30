import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { D, r3, r4 } from '../../lib/money';
import { applyMovement } from './movement';

export async function assembleBundle(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    bundleProductId: string;
    warehouseId: string;
    quantity: Prisma.Decimal.Value;
  }
) {
  const qtyToAssemble = r3(D(input.quantity));
  if (qtyToAssemble.lte(0)) {
    throw new AppError('INVALID_QUANTITY', 'Assembly quantity must be positive', 400);
  }

  const bundle = await tx.product.findUniqueOrThrow({
    where: { id: input.bundleProductId },
    include: {
      bundleParent: {
        include: { component: true },
      },
    },
  });

  if (!bundle.isBundle) {
    throw new AppError('VALIDATION_ERROR', `Product '${bundle.name}' is not marked as a bundle`, 400);
  }

  let totalComponentsCost = D(0);

  // Sort components by ID to avoid deadlocks
  const components = [...bundle.bundleParent].sort((a, b) => a.componentProductId.localeCompare(b.componentProductId));

  // 1. Deduct component quantities via ASSEMBLY_OUT
  for (const item of components) {
    const compQtyNeeded = r3(qtyToAssemble.mul(item.quantity));

    const inv = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: item.componentProductId,
          warehouseId: input.warehouseId,
        },
      },
    });

    const compCost = inv ? inv.avgCost : D(0);
    totalComponentsCost = totalComponentsCost.plus(compQtyNeeded.mul(compCost));

    await applyMovement(tx, {
      productId: item.componentProductId,
      warehouseId: input.warehouseId,
      type: 'ASSEMBLY_OUT',
      quantity: compQtyNeeded,
      refType: 'ASSEMBLY',
      refId: bundle.id,
      reason: `Assembly of bundle '${bundle.sku}'`,
      performedBy: ctx.userId,
    });
  }

  const unitBundleCost = r4(totalComponentsCost.div(qtyToAssemble));

  // 2. Add bundle stock via ASSEMBLY_IN
  const res = await applyMovement(tx, {
    productId: bundle.id,
    warehouseId: input.warehouseId,
    type: 'ASSEMBLY_IN',
    quantity: qtyToAssemble,
    unitCost: unitBundleCost,
    refType: 'ASSEMBLY',
    refId: bundle.id,
    reason: `Assembled from components`,
    performedBy: ctx.userId,
  });

  await logAudit(tx, ctx, {
    action: 'BUNDLE_ASSEMBLE',
    entityType: 'Product',
    entityId: bundle.id,
    newValue: { assembledQty: qtyToAssemble.toString(), unitCost: unitBundleCost.toString() },
  });

  return res;
}
