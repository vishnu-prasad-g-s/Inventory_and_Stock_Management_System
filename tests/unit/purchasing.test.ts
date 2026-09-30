import { describe, it, expect, vi } from 'vitest';
import { allocateLandedCost } from '../../server/services/purchasing/landed-cost';
import { D } from '../../server/lib/money';

describe('Phase 4 — Purchasing & Landed Cost Tests', () => {
  it('should allocate landed freight cost pro-rata by value with exact rounding', () => {
    const items = [
      { productId: 'p1', qty: D(10), unitCost: D(100) }, // Total value: 1000 (1/3)
      { productId: 'p2', qty: D(20), unitCost: D(100) }, // Total value: 2000 (2/3)
    ];

    const additions = [
      { amount: D(300), method: 'VALUE' as const }, // Total freight: 300
    ];

    const allocated = allocateLandedCost(items, additions);

    expect(allocated.get('p1')?.toNumber()).toBe(100);
    expect(allocated.get('p2')?.toNumber()).toBe(200);
  });

  it('should allocate landed freight cost pro-rata by quantity', () => {
    const items = [
      { productId: 'p1', qty: D(10), unitCost: D(500) },
      { productId: 'p2', qty: D(40), unitCost: D(100) },
    ];

    const additions = [
      { amount: D(500), method: 'QUANTITY' as const },
    ];

    const allocated = allocateLandedCost(items, additions);

    expect(allocated.get('p1')?.toNumber()).toBe(100);
    expect(allocated.get('p2')?.toNumber()).toBe(400);
  });
});
