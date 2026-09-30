import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import { AppError } from '../../lib/errors';

export function generateApiKey(name: string, scopes: string[]): {
  rawKey: string;
  prefix: string;
  hashedKey: string;
} {
  const prefix = randomBytes(4).toString('hex'); // 8 char prefix
  const secret = randomBytes(32).toString('hex'); // 64 char secret
  const rawKey = `sp_live_${prefix}_${secret}`;
  const hashedKey = createHash('sha256').update(rawKey).digest('hex');

  return { rawKey, prefix, hashedKey };
}

export async function createApiKey(
  prisma: PrismaClient,
  userId: string,
  name: string,
  scopes: string[]
) {
  const { rawKey, prefix, hashedKey } = generateApiKey(name, scopes);

  const keyRecord = await prisma.apiKey.create({
    data: {
      name,
      hashedKey,
      prefix,
      scopes,
      userId,
    },
  });

  return { keyRecord, rawKey }; // Display rawKey ONLY ONCE
}

export async function verifyApiKey(
  prisma: PrismaClient,
  rawKey: string
) {
  const hashedKey = createHash('sha256').update(rawKey).digest('hex');

  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey },
    include: { user: true },
  });

  if (!apiKey || apiKey.revokedAt || apiKey.user.status !== 'ACTIVE') {
    throw new AppError('UNAUTHENTICATED', 'Invalid or revoked API key', 401);
  }

  // Update lastUsedAt timestamp
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return apiKey;
}
