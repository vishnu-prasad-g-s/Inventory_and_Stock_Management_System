import { describe, it, expect } from 'vitest';
import { can, assertWarehouseAccess } from '../../server/lib/authz';
import { Ctx } from '../../server/lib/route';
import { AppError } from '../../server/lib/errors';

describe('RBAC & Warehouse Scoping System', () => {
  const adminCtx: Ctx = {
    userId: 'u_admin',
    roleId: 'r_admin',
    perms: new Set(['*']),
    warehouseIds: 'ALL',
    requestId: 'req_1',
  };

  const warehouseStaffCtx: Ctx = {
    userId: 'u_staff',
    roleId: 'r_staff',
    perms: new Set(['products.read', 'stock.read', 'transfers.receive']),
    warehouseIds: ['wh_mumbai'],
    requestId: 'req_2',
  };

  it('should allow admin to access any permission and warehouse', () => {
    expect(can(adminCtx, 'users.manage')).toBe(true);
    expect(() => assertWarehouseAccess(adminCtx, 'wh_delhi')).not.toThrow();
  });

  it('should allow warehouse staff permitted actions within assigned warehouse', () => {
    expect(can(warehouseStaffCtx, 'stock.read')).toBe(true);
    expect(() => assertWarehouseAccess(warehouseStaffCtx, 'wh_mumbai')).not.toThrow();
  });

  it('should deny warehouse staff access to unassigned warehouses', () => {
    expect(() => assertWarehouseAccess(warehouseStaffCtx, 'wh_delhi')).toThrow(AppError);
  });

  it('should deny ungranted permissions', () => {
    expect(can(warehouseStaffCtx, 'users.manage')).toBe(false);
  });
});
