import { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { D } from '../../lib/money';

export async function createWarehouse(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    name: string;
    code: string;
    address?: string;
    stateCode?: string;
    managerId?: string;
  }
) {
  const existingCode = await tx.warehouse.findUnique({ where: { code: input.code } });
  if (existingCode) {
    throw new AppError('CODE_EXISTS', `Warehouse code '${input.code}' already exists`, 409);
  }

  const warehouse = await tx.warehouse.create({
    data: {
      name: input.name,
      code: input.code,
      address: input.address,
      stateCode: input.stateCode,
      managerId: input.managerId,
    },
  });

  await logAudit(tx, ctx, {
    action: 'WAREHOUSE_CREATE',
    entityType: 'Warehouse',
    entityId: warehouse.id,
    newValue: warehouse,
  });

  return warehouse;
}

export async function generateLocationRanges(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    warehouseId: string;
    aisles: string[]; // e.g. ["A", "B", "C"]
    racksStart: number; // e.g. 1
    racksEnd: number;   // e.g. 10
    levelsStart: number;// e.g. 1
    levelsEnd: number;  // e.g. 4
    capacityPerBin?: Prisma.Decimal.Value;
  }
) {
  const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: input.warehouseId } });

  const locationsToCreate = [];

  for (const aisle of input.aisles) {
    for (let r = input.racksStart; r <= input.racksEnd; r++) {
      for (let l = input.levelsStart; l <= input.levelsEnd; l++) {
        const rackStr = String(r).padStart(2, '0');
        const levelStr = String(l).padStart(2, '0');
        const code = `${aisle}-${rackStr}-${levelStr}`;

        locationsToCreate.push({
          warehouseId: warehouse.id,
          code,
          zone: `Zone ${aisle}`,
          rack: `Rack ${rackStr}`,
          bin: `Level ${levelStr}`,
          capacity: input.capacityPerBin ? D(input.capacityPerBin) : null,
        });
      }
    }
  }

  // Skip existing locations
  const created = [];
  for (const loc of locationsToCreate) {
    const existing = await tx.location.findUnique({
      where: {
        warehouseId_code: {
          warehouseId: loc.warehouseId,
          code: loc.code,
        },
      },
    });

    if (!existing) {
      const newLoc = await tx.location.create({ data: loc });
      created.push(newLoc);
    }
  }

  await logAudit(tx, ctx, {
    action: 'LOCATIONS_RANGE_GENERATE',
    entityType: 'Warehouse',
    entityId: warehouse.id,
    newValue: { count: created.length },
  });

  return created;
}
