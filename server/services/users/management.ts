import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { hashPassword } from './password';

export async function deactivateUser(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  targetUserId: string
) {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: targetUserId },
    include: { role: true },
  });

  // Guard against deactivating the last active Admin
  if (user.role.name === 'Admin' && user.status === 'ACTIVE') {
    const adminRole = await tx.role.findUniqueOrThrow({ where: { name: 'Admin' } });
    const activeAdmins = await tx.user.count({
      where: {
        roleId: adminRole.id,
        status: 'ACTIVE',
      },
    });

    if (activeAdmins <= 1) {
      throw new AppError('LAST_ADMIN', 'Cannot deactivate the last active administrator account', 422);
    }
  }

  const updated = await tx.user.update({
    where: { id: targetUserId },
    data: { status: 'INACTIVE' },
  });

  // Revoke all sessions for deactivated user
  await tx.session.deleteMany({ where: { userId: targetUserId } });

  await logAudit(tx, ctx, {
    action: 'USER_DEACTIVATE',
    entityType: 'User',
    entityId: targetUserId,
    oldValue: { status: user.status },
    newValue: { status: 'INACTIVE' },
  });

  return updated;
}

export async function createUser(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    name: string;
    email: string;
    roleId: string;
    warehouseIds?: string[];
    password?: string;
  }
) {
  const existing = await tx.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError('USER_EXISTS', 'A user with this email address already exists', 400);
  }

  const initialPassword = input.password ?? 'TempPassword123!';
  const passwordHash = await hashPassword(initialPassword);

  const user = await tx.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      roleId: input.roleId,
      status: 'ACTIVE',
      mustChangePassword: true,
      warehouses: input.warehouseIds?.length
        ? {
            create: input.warehouseIds.map((wid) => ({
              warehouse: { connect: { id: wid } },
            })),
          }
        : undefined,
    },
  });

  await logAudit(tx, ctx, {
    action: 'USER_CREATE',
    entityType: 'User',
    entityId: user.id,
    newValue: { id: user.id, email: user.email, roleId: user.roleId },
  });

  return user;
}
