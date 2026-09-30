import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { AppError } from './errors';

export async function withIdempotency<T>(
  tx: Prisma.TransactionClient,
  a: { key: string; userId: string; endpoint: string; body: unknown },
  exec: () => Promise<{ status: number; body: T }>
): Promise<{ status: number; body: T; replayed: boolean }> {
  const requestHash = createHash('sha256').update(JSON.stringify(a.body ?? {})).digest('hex');

  const inserted = await tx.$executeRaw`
    INSERT INTO "IdempotencyKey"(key, "userId", endpoint, "requestHash", status, "expiresAt")
    VALUES (${a.key}, ${a.userId}, ${a.endpoint}, ${requestHash}, 'IN_PROGRESS', now() + interval '48 hours')
    ON CONFLICT (key, "userId") DO NOTHING`;

  if (inserted === 0) {
    const row = await tx.idempotencyKey.findUniqueOrThrow({
      where: { key_userId: { key: a.key, userId: a.userId } },
    });
    if (row.requestHash !== requestHash) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency Key was used with a different request payload', 422);
    }
    return { status: row.httpStatus!, body: row.response as T, replayed: true };
  }

  const out = await exec();

  await tx.idempotencyKey.update({
    where: { key_userId: { key: a.key, userId: a.userId } },
    data: {
      status: 'COMPLETED',
      response: out.body as any,
      httpStatus: out.status,
    },
  });

  return { ...out, replayed: false };
}
