import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

export interface RowHashParams {
  prevHash: string | null;
  id: string;
  productId: string;
  warehouseId: string;
  type: string;
  delta: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  avgCostAfter: Prisma.Decimal | null;
  refType?: string | null;
  refId?: string | null;
  batchId?: string | null;
  createdAt: Date;
  performedBy: string;
}

export function computeRowHash(p: RowHashParams): string {
  const payload = [
    p.prevHash ?? 'GENESIS',
    p.id,
    p.productId,
    p.warehouseId,
    p.type,
    p.delta.toFixed(3),
    p.balanceAfter.toFixed(3),
    p.unitCost ? p.unitCost.toFixed(4) : '',
    p.avgCostAfter ? p.avgCostAfter.toFixed(4) : '',
    p.refType ?? '',
    p.refId ?? '',
    p.batchId ?? '',
    p.createdAt.toISOString(),
    p.performedBy,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}
