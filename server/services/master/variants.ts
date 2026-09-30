import { PrismaClient, Prisma } from '@prisma/client';
import { Ctx } from '../../lib/route';
import { createProduct } from './products';

export interface AttributeOption {
  name: string;   // e.g. "Size", "Color"
  values: string[]; // e.g. ["S", "M"], ["Red", "Blue"]
}

export async function generateProductVariants(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  productId: string,
  attributes: AttributeOption[]
) {
  const parent = await tx.product.findUniqueOrThrow({ where: { id: productId } });

  // Cartesian product helper for attribute combinations
  const Cartesian = (arrays: string[][]): string[][] => {
    return arrays.reduce<string[][]>(
      (acc, curr) => acc.flatMap((d) => curr.map((e) => [...d, e])),
      [[]]
    );
  };

  const attrNames = attributes.map((a) => a.name);
  const attrValuesMatrix = attributes.map((a) => a.values);
  const combinations = Cartesian(attrValuesMatrix);

  const createdVariants = [];

  for (const combo of combinations) {
    const attrMap: Record<string, string> = {};
    const skuSuffixParts: string[] = [];

    combo.forEach((val, idx) => {
      const name = attrNames[idx];
      attrMap[name] = val;
      skuSuffixParts.push(val.toUpperCase().replace(/\s+/g, '-'));
    });

    const childSku = `${parent.sku}-${skuSuffixParts.join('-')}`;
    const childName = `${parent.name} (${combo.join(', ')})`;

    // Check if variant SKU already exists
    const existingVariant = await tx.productVariant.findUnique({ where: { sku: childSku } });
    if (existingVariant) continue;

    // Create child product materialized row
    const childProduct = await createProduct(tx, ctx, {
      sku: childSku,
      name: childName,
      categoryId: parent.categoryId,
      brand: parent.brand ?? undefined,
      baseUnit: parent.baseUnit,
      purchasePrice: parent.purchasePrice,
      sellingPrice: parent.sellingPrice,
      mrp: parent.mrp ?? undefined,
      hsnCode: parent.hsnCode ?? undefined,
      taxRate: parent.taxRate,
      trackBatch: parent.trackBatch,
      trackExpiry: parent.trackExpiry,
      trackSerial: parent.trackSerial,
    });

    // Create ProductVariant linking record
    const variantRecord = await tx.productVariant.create({
      data: {
        productId: parent.id,
        childProductId: childProduct.id,
        sku: childSku,
        attributes: attrMap,
      },
    });

    createdVariants.push({ childProduct, variantRecord });
  }

  return createdVariants;
}
