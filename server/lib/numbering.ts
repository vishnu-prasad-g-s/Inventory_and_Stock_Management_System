import { Prisma } from '@prisma/client';

export function fyLabel(d: Date = new Date(), startMonth = 4): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const start = m >= startMonth ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`; // e.g. 2026-27
}

export async function nextNumber(
  tx: Prisma.TransactionClient,
  prefix: 'PO' | 'GRN' | 'SO' | 'INV' | 'CN' | 'DN' | 'TRF' | 'RET' | 'ADJ' | 'CNT',
  sep = '-'
): Promise<string> {
  const fy = fyLabel(new Date());
  const key = `${prefix}:${fy}`;

  const rows = await tx.$queryRaw<{ current: number }[]>`
    INSERT INTO "NumberSequence"(key, current) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET current = "NumberSequence".current + 1
    RETURNING current`;

  const current = rows[0].current;
  return `${prefix}${sep}${fy}${sep}${String(current).padStart(6, '0')}`;
}
