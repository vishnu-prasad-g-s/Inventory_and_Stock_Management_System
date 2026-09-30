import { describe, it, expect, vi } from 'vitest';
import { deactivateUser } from '../../server/services/users/management';
import { AppError } from '../../server/lib/errors';
import { Ctx } from '../../server/lib/route';

const dummyCtx: Ctx = {
  userId: 'admin_1',
  roleId: 'role_admin',
  perms: new Set(['*']),
  warehouseIds: 'ALL',
  requestId: 'req_123',
};

describe('User Management Service', () => {
  it('should prevent deactivating the last active Admin', async () => {
    const mockTx: any = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'admin_1',
          name: 'Super Admin',
          status: 'ACTIVE',
          role: { name: 'Admin' },
        }),
        count: vi.fn().mockResolvedValue(1), // Only 1 active admin exists
      },
      role: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'role_admin', name: 'Admin' }),
      },
    };

    await expect(deactivateUser(mockTx, dummyCtx, 'admin_1')).rejects.toThrow(AppError);
  });
});
