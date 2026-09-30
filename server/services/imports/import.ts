import { PrismaClient, Prisma, JobStatus } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { Ctx } from '../../lib/route';
import { logAudit } from '../audit/audit';
import { createProduct } from '../master/products';

export interface ColumnMapping {
  csvHeader: string;
  targetField: string;
}

export async function createImportJob(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  input: {
    entity: 'products' | 'suppliers' | 'customers' | 'opening_stock';
    fileKey: string;
    dryRun?: boolean;
  }
) {
  const job = await tx.importJob.create({
    data: {
      entity: input.entity,
      fileKey: input.fileKey,
      status: 'QUEUED',
      dryRun: input.dryRun ?? true,
      createdBy: ctx.userId,
    },
  });

  await logAudit(tx, ctx, {
    action: 'IMPORT_JOB_CREATE',
    entityType: 'ImportJob',
    entityId: job.id,
    newValue: job,
  });

  return job;
}

export async function processImportChunk<T>(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  jobId: string,
  rows: T[],
  processor: (row: T) => Promise<void>
) {
  let okCount = 0;
  let errCount = 0;

  for (const row of rows) {
    try {
      await processor(row);
      okCount++;
    } catch (err) {
      errCount++;
    }
  }

  await tx.importJob.update({
    where: { id: jobId },
    data: {
      okRows: { increment: okCount },
      errorRows: { increment: errCount },
    },
  });

  return { okCount, errCount };
}
