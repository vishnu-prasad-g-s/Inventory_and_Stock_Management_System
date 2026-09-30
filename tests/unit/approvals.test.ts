import { describe, it, expect, vi } from 'vitest';
import { evaluateCondition, decideApproval } from '../../server/services/approvals/approvals';
import { AppError } from '../../server/lib/errors';
import { Ctx } from '../../server/lib/route';

const dummyCtx: Ctx = {
  userId: 'user_requester',
  roleId: 'role_manager',
  perms: new Set(['*']),
  warehouseIds: 'ALL',
  requestId: 'req_app',
};

describe('Approval Engine Service', () => {
  it('should evaluate rule condition correctly', () => {
    const condition = {
      all: [
        { field: 'total', op: '>', value: 50000 },
        { field: 'kind', op: 'in', value: ['LOSS', 'EXPIRY'] },
      ],
    };

    expect(evaluateCondition(condition, { total: 60000, kind: 'LOSS' })).toBe(true);
    expect(evaluateCondition(condition, { total: 40000, kind: 'LOSS' })).toBe(false);
    expect(evaluateCondition(condition, { total: 60000, kind: 'OTHER' })).toBe(false);
  });

  it('should block self-approval by the requester', async () => {
    const mockTx: any = {
      approval: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'app_1',
          requestedBy: 'user_requester',
          status: 'PENDING',
        }),
      },
    };

    await expect(
      decideApproval(mockTx, dummyCtx, 'app_1', 'APPROVED', 'Looks good')
    ).rejects.toThrow(AppError);
  });
});
