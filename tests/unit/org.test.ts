import { describe, it, expect, vi } from 'vitest';
import { setupOrganization, updateOrganizationSettings } from '../../server/services/settings/org';
import { AppError } from '../../server/lib/errors';
import { Ctx } from '../../server/lib/route';

const dummyCtx: Ctx = {
  userId: 'user_123',
  roleId: 'admin_role',
  perms: new Set(['*']),
  warehouseIds: 'ALL',
  requestId: 'req_123',
};

describe('Organization Settings Service', () => {
  it('should lock costing method upon organization creation', async () => {
    const mockTx: any = {
      organization: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'org_1', ...data })),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };

    const org = await setupOrganization(mockTx, dummyCtx, {
      name: 'StockPilot India Pvt Ltd',
      costingMethod: 'WAC',
    });

    expect(org.costingMethod).toBe('WAC');
    expect(org.costingLocked).toBe(true);
  });

  it('should reject attempt to change costing method when locked', async () => {
    const mockTx: any = {
      organization: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'org_1',
          name: 'StockPilot Ltd',
          costingMethod: 'WAC',
          costingLocked: true,
        }),
      },
    };

    await expect(
      updateOrganizationSettings(mockTx, dummyCtx, 'org_1', {
        costingMethod: 'FIFO',
      })
    ).rejects.toThrow(AppError);
  });
});
