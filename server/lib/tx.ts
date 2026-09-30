import { Prisma } from '@prisma/client';
import { prisma } from './db';

const RETRYABLE = new Set(['P2034', '40001', '40P01']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<T> {
  const max = opts.maxRetries ?? 3;
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        maxWait: 5_000,
        timeout: opts.timeoutMs ?? 15_000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (e: any) {
      const code = e?.code === 'P2010' ? e?.meta?.code : e?.code;
      if (attempt < max && RETRYABLE.has(code)) {
        await sleep(50 * 2 ** attempt + Math.random() * 50);
        continue;
      }
      throw e;
    }
  }
}
