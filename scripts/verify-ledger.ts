import { PrismaClient } from '@prisma/client';
import { computeRowHash } from '../server/services/inventory/ledger-hash';
import { D } from '../server/lib/money';

const prisma = new PrismaClient();

export interface LedgerVerifyResult {
  isClean: boolean;
  errors: Array<{ type: string; productId: string; warehouseId: string; message: string }>;
}

export async function verifyLedgerIntegrity(): Promise<LedgerVerifyResult> {
  const errors: LedgerVerifyResult['errors'] = [];

  // 1. Get all unique product/warehouse pairs
  const pairs = await prisma.inventory.findMany({
    select: { productId: true, warehouseId: true, quantity: true, reservedQuantity: true, lastLedgerHash: true },
  });

  for (const p of pairs) {
    const { productId: pid, warehouseId: wid, quantity: invQty, reservedQuantity: invReserved, lastLedgerHash } = p;

    // Load ledger transactions for this pair ordered by creation date
    const txs = await prisma.inventoryTransaction.findMany({
      where: { productId: pid, warehouseId: wid },
      orderBy: { createdAt: 'asc' },
    });

    if (txs.length === 0) continue;

    let expectedPrevHash: string | null = null;
    let runningBalance = D(0);

    for (let i = 0; i < txs.length; i++) {
      const row = txs[i];

      // Check prevHash pointer match
      if (row.prevHash !== expectedPrevHash) {
        errors.push({
          type: 'LEDGER_TAMPERED',
          productId: pid,
          warehouseId: wid,
          message: `Broken prevHash at tx ${row.id}. Expected '${expectedPrevHash}', got '${row.prevHash}'`,
        });
      }

      // Recompute row hash
      const computedHash = computeRowHash({
        prevHash: row.prevHash,
        id: row.id,
        productId: row.productId,
        warehouseId: row.warehouseId,
        type: row.type,
        delta: D(row.quantityDelta),
        balanceAfter: D(row.balanceAfter),
        unitCost: row.unitCost ? D(row.unitCost) : null,
        avgCostAfter: row.avgCostAfter ? D(row.avgCostAfter) : null,
        refType: row.referenceType ?? undefined,
        refId: row.referenceId ?? undefined,
        batchId: row.batchId ?? undefined,
        createdAt: row.createdAt,
        performedBy: row.performedBy,
      });

      if (computedHash !== row.rowHash) {
        errors.push({
          type: 'LEDGER_TAMPERED',
          productId: pid,
          warehouseId: wid,
          message: `Hash mismatch at tx ${row.id}. Computed '${computedHash}', stored '${row.rowHash}'`,
        });
      }

      // Balance tracking check
      runningBalance = runningBalance.plus(D(row.quantityDelta));
      if (!runningBalance.equals(D(row.balanceAfter))) {
        errors.push({
          type: 'LEDGER_DRIFT',
          productId: pid,
          warehouseId: wid,
          message: `Balance mismatch at tx ${row.id}. Expected ${runningBalance.toString()}, got ${row.balanceAfter.toString()}`,
        });
      }

      expectedPrevHash = row.rowHash;
    }

    // Compare last ledger row balance with Inventory table quantity
    const lastRow = txs[txs.length - 1];
    if (!D(lastRow.balanceAfter).equals(D(invQty))) {
      errors.push({
        type: 'LEDGER_DRIFT',
        productId: pid,
        warehouseId: wid,
        message: `Inventory table quantity (${invQty.toString()}) does not match last ledger balance (${lastRow.balanceAfter.toString()})`,
      });
    }

    if (lastRow.rowHash !== lastLedgerHash) {
      errors.push({
        type: 'LEDGER_DRIFT',
        productId: pid,
        warehouseId: wid,
        message: `Inventory lastLedgerHash pointer mismatch`,
      });
    }

    // Reservation drift check
    const activeReservations = await prisma.stockReservation.aggregate({
      where: { productId: pid, warehouseId: wid, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    const reservedSum = activeReservations._sum.quantity ? D(activeReservations._sum.quantity) : D(0);

    if (!reservedSum.equals(D(invReserved))) {
      errors.push({
        type: 'RESERVATION_DRIFT',
        productId: pid,
        warehouseId: wid,
        message: `Inventory reservedQuantity (${invReserved.toString()}) does not match active reservations sum (${reservedSum.toString()})`,
      });
    }
  }

  return { isClean: errors.length === 0, errors };
}

async function main() {
  console.log('Running StockPilot ledger integrity verification...');
  const res = await verifyLedgerIntegrity();

  if (res.isClean) {
    console.log('Ledger Integrity Check: PASSED (All hash chains, balances, and reservations are valid).');
    process.exit(0);
  } else {
    console.error(`Ledger Integrity Check: FAILED with ${res.errors.length} errors:`);
    console.error(JSON.stringify(res.errors, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error during ledger verification:', err);
    process.exit(1);
  });
}
