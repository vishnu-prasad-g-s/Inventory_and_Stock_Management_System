import { describe, it, expect, vi } from 'vitest';
import { updateProduct, softDeleteProduct } from '../../server/services/master/products';
import { AppError } from '../../server/lib/errors';
import { Ctx } from '../../server/lib/route';

const dummyCtx: Ctx = {
  userId: 'user_1',
  roleId: 'role_admin',
  perms: new Set(['*']),
  warehouseIds: 'ALL',
  requestId: 'req_prod',
};

describe('Product Service', () => {
  it('should enforce optimistic concurrency version check', async () => {
    const mockTx: any = {
      product: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'p_1',
          sku: 'SKU-001',
          name: 'Widget',
          version: 2, // Current database version is 2
        }),
      },
    };

    // Passing stale version 1 must throw VERSION_CONFLICT
    await expect(
      updateProduct(mockTx, dummyCtx, 'p_1', { name: 'Widget Updated', version: 1 })
    ).rejects.toThrow(AppError);
  });

  it('should prevent modifying tracking flags once inventory transactions exist', async () => {
    const mockTx: any = {
      product: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'p_1',
          sku: 'SKU-001',
          name: 'Widget',
          trackBatch: false,
          trackExpiry: false,
          trackSerial: false,
          version: 1,
        }),
      },
      inventoryTransaction: {
        count: vi.fn().mockResolvedValue(5), // 5 transactions exist
      },
    };

    // Trying to enable batch tracking must throw TRACKING_LOCKED
    await expect(
      updateProduct(mockTx, dummyCtx, 'p_1', { trackBatch: true, version: 1 })
    ).rejects.toThrow(AppError);
  });

  it('should prevent soft delete if transactions exist', async () => {
    const mockTx: any = {
      inventoryTransaction: {
        count: vi.fn().mockResolvedValue(1),
      },
    };

    await expect(softDeleteProduct(mockTx, dummyCtx, 'p_1')).rejects.toThrow(AppError);
  });
});
