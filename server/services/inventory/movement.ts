import { Prisma, InvTxType, RefType } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { AppError } from '../../lib/errors';
import { D, r3, r4 } from '../../lib/money';
import { computeRowHash } from './ledger-hash';
import { consumeReservation } from './reservations';
import { transitionSerials } from './serials';
import { getCostingMethod, addCostLayer, consumeCostLayers } from './costing';

const SIGN: Record<InvTxType, 1 | -1> = {
  INITIAL_STOCK: 1,
  PURCHASE: 1,
  SALES_RETURN: 1,
  ADJUSTMENT_IN: 1,
  TRANSFER_IN: 1,
  ASSEMBLY_IN: 1,
  SALE: -1,
  PURCHASE_RETURN: -1,
  DAMAGE: -1,
  EXPIRY: -1,
  LOSS: -1,
  ADJUSTMENT_OUT: -1,
  TRANSFER_OUT: -1,
  ASSEMBLY_OUT: -1,
};

export interface MovementInput {
  productId: string;
  warehouseId: string;
  type: InvTxType;
  quantity: Prisma.Decimal.Value;
  unitCost?: Prisma.Decimal.Value;
  refType?: RefType;
  refId?: string;
  batchId?: string;
  serialIds?: string[];
  locationId?: string;
  reason?: string;
  performedBy: string;
  idempotencyKey?: string;
  consumeReservationId?: string;
}

export async function applyMovement(
  tx: Prisma.TransactionClient,
  m: MovementInput
): Promise<{ ledgerId: string; balanceAfter: Prisma.Decimal; unitCost: Prisma.Decimal }> {
  const qty = r3(D(m.quantity));
  if (qty.lte(0)) {
    throw new AppError('INVALID_QUANTITY', 'Movement quantity must be positive', 400);
  }

  const sign = SIGN[m.type];
  const delta = qty.mul(sign);
  const { productId: pid, warehouseId: wid } = m;

  let balanceAfter: Prisma.Decimal;
  let avgCost: Prisma.Decimal;
  let prevHash: string | null;

  if (sign === 1) {
    if (m.unitCost === undefined) {
      throw new AppError('UNIT_COST_REQUIRED', 'IN stock movements require unitCost', 400);
    }
    const cost = r4(D(m.unitCost));

    // Upsert inventory balance and calculate weighted average cost in one atomic query
    const rows = await tx.$queryRaw<any[]>`
      INSERT INTO "Inventory"(id, "productId", "warehouseId", quantity, "reservedQuantity", "avgCost", version, "updatedAt")
      VALUES (${createId()}, ${pid}, ${wid}, ${qty.toString()}::numeric, 0, ${cost.toString()}::numeric, 1, now())
      ON CONFLICT ("productId", "warehouseId") DO UPDATE SET
        "avgCost" = CASE WHEN "Inventory".quantity + EXCLUDED.quantity > 0
             THEN (("Inventory".quantity * "Inventory"."avgCost") + (EXCLUDED.quantity * ${cost.toString()}::numeric))
                  / ("Inventory".quantity + EXCLUDED.quantity)
             ELSE "Inventory"."avgCost" END,
        quantity = "Inventory".quantity + EXCLUDED.quantity,
        version = "Inventory".version + 1,
        "updatedAt" = now()
      RETURNING quantity, "avgCost", "lastLedgerHash"`;

    balanceAfter = D(rows[0].quantity);
    avgCost = D(rows[0].avgCost);
    prevHash = rows[0].lastLedgerHash;
  } else {
    const releasing = m.consumeReservationId ? qty : D(0);

    // Single guarded atomic UPDATE query preventing oversell
    const rows = await tx.$queryRaw<any[]>`
      UPDATE "Inventory" SET
        quantity = quantity - ${qty.toString()}::numeric,
        "reservedQuantity" = "reservedQuantity" - ${releasing.toString()}::numeric,
        version = version + 1,
        "updatedAt" = now()
      WHERE "productId" = ${pid} AND "warehouseId" = ${wid}
        AND (quantity - ${qty.toString()}::numeric) >= ("reservedQuantity" - ${releasing.toString()}::numeric)
      RETURNING quantity, "avgCost", "lastLedgerHash", "reservedQuantity"`;

    if (rows.length === 0) {
      const cur = await tx.inventory.findUnique({
        where: { productId_warehouseId: { productId: pid, warehouseId: wid } },
      });
      const available = cur ? cur.quantity.minus(cur.reservedQuantity).toString() : '0';
      throw new AppError('INSUFFICIENT_STOCK', 'Not enough available stock', 409, {
        available,
        requested: qty.toString(),
      });
    }

    balanceAfter = D(rows[0].quantity);
    avgCost = D(rows[0].avgCost);
    prevHash = rows[0].lastLedgerHash;
  }

  // Batch level update (if product is batch tracked)
  if (m.batchId) {
    const updatedBatchCount = await tx.$executeRaw`
      UPDATE "Batch" SET
        quantity = quantity + ${delta.toString()}::numeric,
        status = CASE WHEN quantity + ${delta.toString()}::numeric = 0 THEN 'DEPLETED'::"BatchStatus" ELSE status END,
        "updatedAt" = now()
      WHERE id = ${m.batchId} AND quantity + ${delta.toString()}::numeric >= 0`;

    if (updatedBatchCount === 0) {
      throw new AppError('BATCH_INSUFFICIENT', 'Batch does not have enough quantity available', 409);
    }
  }

  // Location/bin level update (optional)
  if (m.locationId) {
    await tx.$executeRaw`
      INSERT INTO "InventoryLocation"(id, "productId", "locationId", "batchId", quantity)
      VALUES (${createId()}, ${pid}, ${m.locationId}, ${m.batchId ?? null}, ${delta.toString()}::numeric)
      ON CONFLICT ("productId", "locationId", "batchId") DO UPDATE SET
        quantity = "InventoryLocation".quantity + EXCLUDED.quantity`;
  }

  // Serial number state transition (optional)
  if (m.serialIds?.length) {
    await transitionSerials(tx, m.type, m.serialIds, wid);
  }

  // Reservation consumption
  if (m.consumeReservationId) {
    await consumeReservation(tx, m.consumeReservationId, qty);
  }

  // Costing calculation
  let unitCost: Prisma.Decimal = sign === 1 ? r4(D(m.unitCost!)) : avgCost;
  const costingMethod = await getCostingMethod(tx);

  if (costingMethod === 'FIFO') {
    if (sign === 1) {
      await addCostLayer(tx, pid, wid, qty, unitCost);
    } else {
      unitCost = await consumeCostLayers(tx, pid, wid, qty);
    }
  }

  // Append signed ledger row
  const ledgerId = createId();
  const createdAt = new Date();
  const rowHash = computeRowHash({
    prevHash,
    id: ledgerId,
    productId: pid,
    warehouseId: wid,
    type: m.type,
    delta,
    balanceAfter,
    unitCost,
    avgCostAfter: avgCost,
    refType: m.refType,
    refId: m.refId,
    batchId: m.batchId,
    createdAt,
    performedBy: m.performedBy,
  });

  await tx.inventoryTransaction.create({
    data: {
      id: ledgerId,
      productId: pid,
      warehouseId: wid,
      type: m.type,
      quantityDelta: delta,
      balanceAfter,
      unitCost,
      avgCostAfter: avgCost,
      referenceType: m.refType,
      referenceId: m.refId,
      batchId: m.batchId,
      locationId: m.locationId,
      serialNumberId: m.serialIds?.[0],
      reason: m.reason,
      performedBy: m.performedBy,
      idempotencyKey: m.idempotencyKey,
      prevHash,
      rowHash,
      createdAt,
    },
  });

  // Update Inventory last ledger hash pointer
  await tx.$executeRaw`
    UPDATE "Inventory" SET "lastLedgerHash" = ${rowHash}
    WHERE "productId" = ${pid} AND "warehouseId" = ${wid}`;

  return { ledgerId, balanceAfter, unitCost };
}
