import { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { D, r3 } from '../../lib/money';

export async function reserve(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    salesOrderId: string;
    quantity: Prisma.Decimal.Value;
    userId: string;
    ttlMin?: number;
  }
) {
  const qty = r3(D(input.quantity));
  if (qty.lte(0)) throw new AppError('INVALID_QUANTITY', 'Reservation quantity must be positive', 400);

  const qStr = qty.toString();
  const updatedCount = await tx.$executeRaw`
    UPDATE "Inventory" SET
      "reservedQuantity" = "reservedQuantity" + ${qStr}::numeric,
      version = version + 1,
      "updatedAt" = now()
    WHERE "productId" = ${input.productId} AND "warehouseId" = ${input.warehouseId}
      AND (quantity - "reservedQuantity") >= ${qStr}::numeric`;

  if (updatedCount === 0) {
    const cur = await tx.inventory.findUnique({
      where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
    });
    const available = cur ? cur.quantity.minus(cur.reservedQuantity).toString() : '0';
    throw new AppError('INSUFFICIENT_STOCK', 'Cannot reserve: not enough available stock', 409, {
      available,
      requested: qStr,
    });
  }

  const expiresAt = input.ttlMin ? new Date(Date.now() + input.ttlMin * 60 * 1000) : null;

  return tx.stockReservation.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      salesOrderId: input.salesOrderId,
      quantity: qty,
      status: 'ACTIVE',
      createdBy: input.userId,
      expiresAt,
    },
  });
}

export async function release(
  tx: Prisma.TransactionClient,
  reservationId: string,
  newStatus: 'RELEASED' | 'EXPIRED' = 'RELEASED'
) {
  const r = await tx.stockReservation.findUniqueOrThrow({ where: { id: reservationId } });
  if (r.status !== 'ACTIVE') return r;

  await tx.$executeRaw`
    UPDATE "Inventory" SET
      "reservedQuantity" = "reservedQuantity" - ${r.quantity.toString()}::numeric,
      version = version + 1,
      "updatedAt" = now()
    WHERE "productId" = ${r.productId} AND "warehouseId" = ${r.warehouseId}`;

  return tx.stockReservation.update({
    where: { id: r.id },
    data: { status: newStatus },
  });
}

export async function consumeReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
  qty: Prisma.Decimal
) {
  const r = await tx.stockReservation.findUniqueOrThrow({ where: { id: reservationId } });
  if (r.status !== 'ACTIVE') {
    throw new AppError('RESERVATION_NOT_ACTIVE', 'Reservation is no longer active', 409);
  }

  if (qty.gt(r.quantity)) {
    throw new AppError('RESERVATION_TOO_SMALL', 'Shipping more than reserved quantity', 422);
  }

  const remaining = r.quantity.minus(qty);
  if (remaining.gt(0)) {
    return tx.stockReservation.update({
      where: { id: r.id },
      data: { quantity: remaining },
    });
  }

  return tx.stockReservation.update({
    where: { id: r.id },
    data: { status: 'CONSUMED' },
  });
}
