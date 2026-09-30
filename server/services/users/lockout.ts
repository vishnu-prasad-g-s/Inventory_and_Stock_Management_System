import { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors';

export async function handleFailedLogin(prisma: PrismaClient, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const newFailures = user.failedLogins + 1;
  let lockedUntil: Date | null = user.lockedUntil;

  if (newFailures >= 5) {
    lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lockout
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins: newFailures,
      lockedUntil,
    },
  });
}

export async function handleSuccessfulLogin(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}

export function checkAccountLockout(user: { status: string; lockedUntil: Date | null }): void {
  if (user.status !== 'ACTIVE') {
    throw new AppError('UNAUTHENTICATED', 'Account is disabled or inactive', 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(
      'UNAUTHENTICATED',
      `Account is temporarily locked due to multiple failed login attempts. Try again in ${minutesLeft} minutes.`,
      401
    );
  }
}
