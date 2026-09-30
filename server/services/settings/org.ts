import { Prisma, CostingMethod } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';

export interface SetupOrganizationInput {
  name: string;
  legalName?: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  currency?: string;
  timezone?: string;
  costingMethod?: CostingMethod;
  fyStartMonth?: number;
}

export async function setupOrganization(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: SetupOrganizationInput
) {
  const existing = await tx.organization.findFirst();
  if (existing) {
    throw new AppError('ORGANIZATION_EXISTS', 'Organization has already been set up', 400);
  }

  const costing = input.costingMethod ?? 'WAC';

  const org = await tx.organization.create({
    data: {
      name: input.name,
      legalName: input.legalName,
      gstin: input.gstin,
      stateCode: input.stateCode,
      address: input.address,
      currency: input.currency ?? 'INR',
      timezone: input.timezone ?? 'Asia/Kolkata',
      costingMethod: costing,
      costingLocked: true, // Lock costing method upon initial setup
      fyStartMonth: input.fyStartMonth ?? 4,
    },
  });

  await logAudit(tx, ctx, {
    action: 'ORGANIZATION_SETUP',
    entityType: 'Organization',
    entityId: org.id,
    newValue: org,
  });

  return org;
}

export async function updateOrganizationSettings(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  orgId: string,
  data: Partial<SetupOrganizationInput>
) {
  const existing = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });

  if (data.costingMethod && data.costingMethod !== existing.costingMethod && existing.costingLocked) {
    throw new AppError('COSTING_LOCKED', 'Costing method is locked after initial setup and cannot be changed', 422);
  }

  const updated = await tx.organization.update({
    where: { id: orgId },
    data: {
      name: data.name ?? existing.name,
      legalName: data.legalName ?? existing.legalName,
      gstin: data.gstin ?? existing.gstin,
      stateCode: data.stateCode ?? existing.stateCode,
      address: data.address ?? existing.address,
      currency: data.currency ?? existing.currency,
      timezone: data.timezone ?? existing.timezone,
      fyStartMonth: data.fyStartMonth ?? existing.fyStartMonth,
    },
  });

  await logAudit(tx, ctx, {
    action: 'ORGANIZATION_UPDATE',
    entityType: 'Organization',
    entityId: orgId,
    oldValue: existing,
    newValue: updated,
  });

  return updated;
}
