import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';

export async function createCategory(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: { name: string; description?: string; parentId?: string }
) {
  if (input.parentId) {
    const parent = await tx.category.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new AppError('NOT_FOUND', 'Parent category not found', 404);
  }

  const category = await tx.category.create({
    data: {
      name: input.name,
      description: input.description,
      parentId: input.parentId ?? null,
    },
  });

  await logAudit(tx, ctx, {
    action: 'CATEGORY_CREATE',
    entityType: 'Category',
    entityId: category.id,
    newValue: category,
  });

  return category;
}

export async function updateCategory(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  id: string,
  input: { name?: string; description?: string; parentId?: string | null }
) {
  const category = await tx.category.findUniqueOrThrow({ where: { id } });

  if (input.parentId !== undefined && input.parentId !== category.parentId) {
    if (input.parentId === id) {
      throw new AppError('CATEGORY_CYCLE', 'A category cannot be its own parent', 422);
    }
    if (input.parentId !== null) {
      // Check if proposed parentId is a descendant of current category
      let currentParentId: string | null = input.parentId;
      while (currentParentId) {
        if (currentParentId === id) {
          throw new AppError('CATEGORY_CYCLE', 'Cannot set parent to a descendant category (cycle detected)', 422);
        }
        const parentCat: { parentId: string | null } | null = await tx.category.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });
        currentParentId = parentCat ? parentCat.parentId : null;
      }
    }
  }

  const updated = await tx.category.update({
    where: { id },
    data: {
      name: input.name ?? category.name,
      description: input.description ?? category.description,
      parentId: input.parentId !== undefined ? input.parentId : category.parentId,
    },
  });

  await logAudit(tx, ctx, {
    action: 'CATEGORY_UPDATE',
    entityType: 'Category',
    entityId: id,
    oldValue: category,
    newValue: updated,
  });

  return updated;
}

export async function deleteCategory(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  id: string
) {
  const childrenCount = await tx.category.count({ where: { parentId: id } });
  if (childrenCount > 0) {
    throw new AppError('CATEGORY_IN_USE', 'Cannot delete a category that has child categories', 422);
  }

  const productCount = await tx.product.count({ where: { categoryId: id, deletedAt: null } });
  if (productCount > 0) {
    throw new AppError('CATEGORY_IN_USE', 'Cannot delete a category assigned to active products', 422);
  }

  const deleted = await tx.category.delete({ where: { id } });

  await logAudit(tx, ctx, {
    action: 'CATEGORY_DELETE',
    entityType: 'Category',
    entityId: id,
    oldValue: deleted,
  });

  return deleted;
}
