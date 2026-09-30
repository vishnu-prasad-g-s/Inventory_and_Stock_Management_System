import { describe, it, expect, vi } from 'vitest';
import { createTransfer } from '../../server/services/transfers/transfers';
import { AppError } from '../../server/lib/errors';
import { Ctx } from '../../server/lib/route';

const dummyCtx: Ctx = {
  userId: 'user_1',
  roleId: 'role_wh',
  perms: new Set(['*']),
  warehouseIds: 'ALL',
  requestId: 'req_adv',
};

describe('Phase 6 — Advanced Stock Operations Tests', () => {
  it('should reject warehouse transfer when source and destination are identical', async () => {
    const mockTx: any = {};

    await expect(
      createTransfer(mockTx, dummyCtx, {
        sourceWarehouseId: 'wh_main',
        destinationWarehouseId: 'wh_main',
        items: [{ productId: 'p1', quantity: 5 }],
      })
    ).rejects.toThrow(AppError);
  });
});
