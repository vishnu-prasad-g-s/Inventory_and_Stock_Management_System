import { PrismaClient } from '@prisma/client';
import { verifyLedgerIntegrity } from '../../../scripts/verify-ledger';

export async function checkLiveness() {
  return {
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}

export async function checkReadiness(prisma: PrismaClient) {
  let dbStatus = 'DOWN';
  let ledgerStatus = 'UNKNOWN';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'UP';

    const verifyRes = await verifyLedgerIntegrity();
    ledgerStatus = verifyRes.isClean ? 'CLEAN' : 'TAMPERED';
  } catch (err) {
    dbStatus = 'DOWN';
  }

  const isReady = dbStatus === 'UP' && ledgerStatus === 'CLEAN';

  return {
    status: isReady ? 'READY' : 'NOT_READY',
    dbStatus,
    ledgerStatus,
    timestamp: new Date().toISOString(),
  };
}
