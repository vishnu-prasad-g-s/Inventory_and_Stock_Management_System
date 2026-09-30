import { PrismaClient } from '@prisma/client';
import { AppError } from './errors';
import { Ctx } from './route';

export async function buildUserCtx(
  prisma: PrismaClient,
  userId: string,
  requestId: string
): Promise<Ctx> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
      warehouses: true,
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    throw new AppError('UNAUTHENTICATED', 'User is inactive or not found', 401);
  }

  const perms = new Set<string>();
  user.role.permissions.forEach((rp) => perms.add(rp.permission.key));

  const hasAllWarehouses = perms.has('warehouses.all');
  const warehouseIds: string[] | 'ALL' = hasAllWarehouses
    ? 'ALL'
    : user.warehouses.map((w) => w.warehouseId);

  return {
    userId: user.id,
    roleId: user.roleId,
    perms,
    warehouseIds,
    requestId,
  };
}

export function assertWarehouseAccess(ctx: Ctx, warehouseId: string): void {
  if (ctx.warehouseIds !== 'ALL' && !ctx.warehouseIds.includes(warehouseId)) {
    throw new AppError('WAREHOUSE_FORBIDDEN', 'No access to specified warehouse', 403);
  }
}
