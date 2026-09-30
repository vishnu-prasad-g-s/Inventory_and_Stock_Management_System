import { Prisma } from '@prisma/client';
import { D, r4 } from '../../lib/money';

export interface ItemForLandedCost {
  productId: string;
  qty: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  weightKg?: Prisma.Decimal | null;
}

export interface LandedCostAddition {
  amount: Prisma.Decimal;
  method: 'VALUE' | 'QUANTITY' | 'WEIGHT';
}

export function allocateLandedCost(
  items: ItemForLandedCost[],
  additions: LandedCostAddition[]
): Map<string, Prisma.Decimal> {
  const allocatedMap = new Map<string, Prisma.Decimal>();
  items.forEach((item) => allocatedMap.set(item.productId, D(0)));

  if (items.length === 0 || additions.length === 0) return allocatedMap;

  for (const addition of additions) {
    let denominator = D(0);

    if (addition.method === 'VALUE') {
      denominator = items.reduce((acc, item) => acc.plus(item.qty.mul(item.unitCost)), D(0));
    } else if (addition.method === 'QUANTITY') {
      denominator = items.reduce((acc, item) => acc.plus(item.qty), D(0));
    } else if (addition.method === 'WEIGHT') {
      denominator = items.reduce((acc, item) => acc.plus(item.qty.mul(item.weightKg ?? D(1))), D(0));
    }

    if (denominator.lte(0)) continue;

    let totalAllocatedForAddition = D(0);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let numerator = D(0);

      if (addition.method === 'VALUE') {
        numerator = item.qty.mul(item.unitCost);
      } else if (addition.method === 'QUANTITY') {
        numerator = item.qty;
      } else if (addition.method === 'WEIGHT') {
        numerator = item.qty.mul(item.weightKg ?? D(1));
      }

      // Handle rounding remainder by assigning exact difference to last item
      let share: Prisma.Decimal;
      if (i === items.length - 1) {
        share = addition.amount.minus(totalAllocatedForAddition);
      } else {
        share = r4(addition.amount.mul(numerator).div(denominator));
        totalAllocatedForAddition = totalAllocatedForAddition.plus(share);
      }

      const existing = allocatedMap.get(item.productId) || D(0);
      allocatedMap.set(item.productId, existing.plus(share));
    }
  }

  return allocatedMap;
}
