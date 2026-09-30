import { PrismaClient } from '@prisma/client';
import { Ctx } from '../../lib/route';
import { runTx } from '../../lib/tx';
import { withIdempotency } from '../../lib/idempotency';
import { AppError } from '../../lib/errors';
import { receiveGoodsReceipt } from '../purchasing/receipts';
import { postAdjustment } from '../adjustments/adjustments';

export interface SyncItemInput {
  id: string; // client UUID (idempotency key)
  type: 'PO_RECEIVE' | 'ADJUSTMENT_POST' | 'COUNT_LINE';
  createdAt: string;
  payload: any;
}

export interface SyncItemResult {
  id: string;
  status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
  message?: string;
}

export async function processBatchSync(
  prisma: PrismaClient,
  ctx: Ctx,
  items: SyncItemInput[]
): Promise<SyncItemResult[]> {
  const results: SyncItemResult[] = [];

  for (const item of items) {
    try {
      const res = await runTx(async (tx) => {
        return withIdempotency(
          tx,
          {
            key: item.id,
            userId: ctx.userId,
            endpoint: `/sync/batch:${item.type}`,
            body: item.payload,
          },
          async () => {
            switch (item.type) {
              case 'PO_RECEIVE':
                const grn = await receiveGoodsReceipt(tx, ctx, item.payload);
                return { status: 200, body: grn };

              case 'ADJUSTMENT_POST':
                const adj = await postAdjustment(tx, ctx, item.payload.adjustmentId);
                return { status: 200, body: adj };

              default:
                throw new AppError('VALIDATION_ERROR', `Unsupported sync item type '${item.type}'`, 400);
            }
          }
        );
      });

      if (res.replayed) {
        results.push({ id: item.id, status: 'DUPLICATE', message: 'Item already processed earlier' });
      } else {
        results.push({ id: item.id, status: 'APPLIED' });
      }
    } catch (err: any) {
      if (err instanceof AppError) {
        if (err.status === 409) {
          results.push({ id: item.id, status: 'CONFLICT', message: err.message });
        } else {
          results.push({ id: item.id, status: 'REJECTED', message: err.message });
        }
      } else {
        results.push({ id: item.id, status: 'REJECTED', message: err.message || 'Unknown processing failure' });
      }
    }
  }

  return results;
}
