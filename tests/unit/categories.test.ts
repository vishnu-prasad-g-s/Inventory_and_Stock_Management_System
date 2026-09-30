import { describe, it, expect, vi } from 'vitest';
import { updateCategory, deleteCategory } from '../../server/services/master/categories';
import { AppError } from '../../server/lib/errors';
import { Ctx } from '../../server/lib/route';

const dummyCtx: Ctx = {
  userId: 'user_1',
  roleId: 'role_admin',
  perms: new Set(['*']),
  warehouseIds: 'ALL',
  requestId: 'req_cat',
};

describe('Category Service & Cycle Prevention', () => {
  it('should reject making a category its own parent', async () => {
    const mockTx: any = {
      category: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'cat_1', name: 'Electronics', parentId: null }),
      },
    };

    await expect(
      updateCategory(mockTx, dummyCtx, 'cat_1', { parentId: 'cat_1' })
    ).rejects.toThrow(AppError);
  });

  it('should detect indirect cycle when setting parent to a descendant', async () => {
    // Structure: A (cat_1) -> B (cat_2) -> C (cat_3).
    // Attempting to set cat_1's parent to cat_3 must fail with CATEGORY_CYCLE.
    const mockTx: any = {
      category: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'cat_1', name: 'Electronics', parentId: null }),
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === 'cat_3') return Promise.resolve({ parentId: 'cat_2' });
          if (where.id === 'cat_2') return Promise.resolve({ parentId: 'cat_1' });
          if (where.id === 'cat_1') return Promise.resolve({ parentId: null });
          return Promise.resolve(null);
        }),
      },
    };

    await expect(
      updateCategory(mockTx, dummyCtx, 'cat_1', { parentId: 'cat_3' })
    ).rejects.toThrow(AppError);
  });

  it('should block deletion of category with children', async () => {
    const mockTx: any = {
      category: {
        count: vi.fn().mockResolvedValue(2), // 2 children exist
      },
      product: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    await expect(deleteCategory(mockTx, dummyCtx, 'cat_parent')).rejects.toThrow(AppError);
  });
});
