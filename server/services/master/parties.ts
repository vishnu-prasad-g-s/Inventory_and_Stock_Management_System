import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { validateGSTIN } from '../../lib/validators';
import { D } from '../../lib/money';

export interface CreateSupplierInput {
  code: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  country?: string;
  postalCode?: string;
  gstin?: string;
  taxId?: string;
  paymentTermsDays?: number;
}

export async function createSupplier(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateSupplierInput
) {
  if (input.gstin) {
    const gstRes = validateGSTIN(input.gstin);
    if (!gstRes.isValid) {
      throw new AppError('VALIDATION_ERROR', gstRes.error || 'Invalid Supplier GSTIN', 400);
    }
  }

  const existingCode = await tx.supplier.findUnique({ where: { code: input.code } });
  if (existingCode) {
    throw new AppError('CODE_EXISTS', `Supplier code '${input.code}' already exists`, 409);
  }

  const supplier = await tx.supplier.create({
    data: {
      code: input.code,
      name: input.name,
      companyName: input.companyName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      city: input.city,
      state: input.state,
      stateCode: input.stateCode,
      country: input.country ?? 'IN',
      postalCode: input.postalCode,
      gstin: input.gstin ? input.gstin.trim().toUpperCase() : null,
      taxId: input.taxId,
      paymentTermsDays: input.paymentTermsDays ?? 0,
    },
  });

  await logAudit(tx, ctx, {
    action: 'SUPPLIER_CREATE',
    entityType: 'Supplier',
    entityId: supplier.id,
    newValue: supplier,
  });

  return supplier;
}

export interface CreateCustomerInput {
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  country?: string;
  postalCode?: string;
  gstin?: string;
  taxId?: string;
  creditLimit?: Prisma.Decimal.Value;
}

export async function createCustomer(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: CreateCustomerInput
) {
  if (input.gstin) {
    const gstRes = validateGSTIN(input.gstin);
    if (!gstRes.isValid) {
      throw new AppError('VALIDATION_ERROR', gstRes.error || 'Invalid Customer GSTIN', 400);
    }
  }

  const existingCode = await tx.customer.findUnique({ where: { code: input.code } });
  if (existingCode) {
    throw new AppError('CODE_EXISTS', `Customer code '${input.code}' already exists`, 409);
  }

  const customer = await tx.customer.create({
    data: {
      code: input.code,
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      city: input.city,
      state: input.state,
      stateCode: input.stateCode,
      country: input.country ?? 'IN',
      postalCode: input.postalCode,
      gstin: input.gstin ? input.gstin.trim().toUpperCase() : null,
      taxId: input.taxId,
      creditLimit: input.creditLimit ? D(input.creditLimit) : D(0),
    },
  });

  await logAudit(tx, ctx, {
    action: 'CUSTOMER_CREATE',
    entityType: 'Customer',
    entityId: customer.id,
    newValue: customer,
  });

  return customer;
}
