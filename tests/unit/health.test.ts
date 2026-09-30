import { describe, it, expect, vi } from 'vitest';
import { checkLiveness, checkReadiness } from '../../server/services/health/health';

describe('Phase 10 — Health & Readiness Endpoint Tests', () => {
  it('should return UP liveness status with timestamp', async () => {
    const res = await checkLiveness();
    expect(res.status).toBe('UP');
    expect(res.timestamp).toBeDefined();
  });

  it('should return READY readiness status when DB is connected and ledger is clean', async () => {
    const mockPrisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
      inventory: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const res = await checkReadiness(mockPrisma);
    expect(res.dbStatus).toBe('UP');
  });
});
