import { PrismaClient, Prisma, ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { validateEAN13, validateHSN } from '../../lib/validators';
import { D } from '../../lib/money';

export interface CreateProductInput {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  categoryId: string;
  brand?: string;
  baseUnit?: string;
  purchasePrice?: Prisma.Decimal.Value;
  sellingPrice?: Prisma.Decimal.Value;
  mrp?: Prisma.Decimal.Value;
  hsnCode?: string;
  taxRate?: Prisma.Decimal.Value;
  reorderLevel?: Prisma.Decimal.Value;
  reorderQuantity?: Prisma.Decimal.Value;
  maximumStock?: Prisma.Decimal.Value;
  leadTimeDays?: number;
  packSize?: Prisma.Decimal.Value;
  minOrderQty?: Prisma.Decimal.Value;
  weightKg?: Prisma.Decimal.Value;
  trackBatch?: boolean;
  trackExpiry?: boolean;
  trackSerial?: boolean;
  isBundle?: boolean;
  conversions?: Array<{ fromUnit: string; factor: Prisma.Decimal.Value }>;
}

export async function createProduct(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateProductInput
) {
  // Validate Barcode if provided
  if (input.barcode) {
    if (input.barcode.length === 13 && !validateEAN13(input.barcode)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid EAN-13 barcode check digit', 400);
    }
  }

  // Validate HSN
  if (input.hsnCode && !validateHSN(input.hsnCode)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid HSN code format (4, 6, or 8 digits expected)', 400);
  }

  const trackExpiry = input.trackExpiry ?? false;
  const trackBatch = trackExpiry ? true : (input.trackBatch ?? false);
  const trackSerial = input.trackSerial ?? false;

  if (trackBatch && trackSerial) {
    throw new AppError('VALIDATION_ERROR', 'Product cannot have both batch and serial tracking enabled in v1', 400);
  }

  const existingSku = await tx.product.findUnique({ where: { sku: input.sku } });
  if (existingSku) {
    throw new AppError('SKU_EXISTS', `Product with SKU '${input.sku}' already exists`, 409);
  }

  const product = await tx.product.create({
    data: {
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      brand: input.brand,
      baseUnit: input.baseUnit ?? 'piece',
      purchasePrice: input.purchasePrice ? D(input.purchasePrice) : D(0),
      sellingPrice: input.sellingPrice ? D(input.sellingPrice) : D(0),
      mrp: input.mrp ? D(input.mrp) : null,
      hsnCode: input.hsnCode,
      taxRate: input.taxRate ? D(input.taxRate) : D(0),
      reorderLevel: input.reorderLevel ? D(input.reorderLevel) : D(0),
      reorderQuantity: input.reorderQuantity ? D(input.reorderQuantity) : D(0),
      maximumStock: input.maximumStock ? D(input.maximumStock) : null,
      leadTimeDays: input.leadTimeDays ?? 7,
      packSize: input.packSize ? D(input.packSize) : D(1),
      minOrderQty: input.minOrderQty ? D(input.minOrderQty) : D(1),
      weightKg: input.weightKg ? D(input.weightKg) : null,
      trackBatch,
      trackExpiry,
      trackSerial,
      isBundle: input.isBundle ?? false,
      conversions: input.conversions?.length
        ? {
            create: input.conversions.map((c) => ({
              fromUnit: c.fromUnit,
              factor: D(c.factor),
            })),
          }
        : undefined,
    },
  });

  await logAudit(tx, ctx, {
    action: 'PRODUCT_CREATE',
    entityType: 'Product',
    entityId: product.id,
    newValue: product,
  });

  return product;
}

export async function updateProduct(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  id: string,
  input: Partial<CreateProductInput> & { version: number }
) {
  const existing = await tx.product.findUniqueOrThrow({ where: { id } });

  // Optimistic Concurrency Check
  if (existing.version !== input.version) {
    throw new AppError('VERSION_CONFLICT', 'Product has been updated by another request. Please reload.', 409);
  }

  // Check tracking flag immutability
  const isChangingTracking =
    (input.trackBatch !== undefined && input.trackBatch !== existing.trackBatch) ||
    (input.trackExpiry !== undefined && input.trackExpiry !== existing.trackExpiry) ||
    (input.trackSerial !== undefined && input.trackSerial !== existing.trackSerial);

  if (isChangingTracking) {
    const txCount = await tx.inventoryTransaction.count({ where: { productId: id } });
    if (txCount > 0) {
      throw new AppError('TRACKING_LOCKED', 'Tracking flags cannot be modified after inventory transactions exist for this product', 422);
    }
  }

  const updated = await tx.product.update({
    where: { id },
    data: {
      sku: input.sku ?? existing.sku,
      barcode: input.barcode !== undefined ? input.barcode : existing.barcode,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      categoryId: input.categoryId ?? existing.categoryId,
      brand: input.brand ?? existing.brand,
      purchasePrice: input.purchasePrice ? D(input.purchasePrice) : existing.purchasePrice,
      sellingPrice: input.sellingPrice ? D(input.sellingPrice) : existing.sellingPrice,
      mrp: input.mrp !== undefined ? (input.mrp ? D(input.mrp) : null) : existing.mrp,
      hsnCode: input.hsnCode ?? existing.hsnCode,
      taxRate: input.taxRate !== undefined ? D(input.taxRate) : existing.taxRate,
      reorderLevel: input.reorderLevel !== undefined ? D(input.reorderLevel) : existing.reorderLevel,
      trackBatch: input.trackBatch ?? existing.trackBatch,
      trackExpiry: input.trackExpiry ?? existing.trackExpiry,
      trackSerial: input.trackSerial ?? existing.trackSerial,
      version: existing.version + 1,
    },
  });

  await logAudit(tx, ctx, {
    action: 'PRODUCT_UPDATE',
    entityType: 'Product',
    entityId: id,
    oldValue: existing,
    newValue: updated,
  });

  return updated;
}

export async function setProductStatus(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  id: string,
  status: ProductStatus
) {
  const existing = await tx.product.findUniqueOrThrow({ where: { id } });

  const updated = await tx.product.update({
    where: { id },
    data: { status, version: existing.version + 1 },
  });

  await logAudit(tx, ctx, {
    action: 'PRODUCT_STATUS_CHANGE',
    entityType: 'Product',
    entityId: id,
    oldValue: { status: existing.status },
    newValue: { status },
  });

  return updated;
}

export async function softDeleteProduct(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  id: string
) {
  const txCount = await tx.inventoryTransaction.count({ where: { productId: id } });
  if (txCount > 0) {
    throw new AppError('PRODUCT_IN_USE', 'Cannot delete a product with existing inventory transactions; set status to DISCONTINUED instead', 422);
  }

  const deleted = await tx.product.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAudit(tx, ctx, {
    action: 'PRODUCT_DELETE',
    entityType: 'Product',
    entityId: id,
  });

  return deleted;
}
