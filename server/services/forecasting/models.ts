import { PrismaClient } from '@prisma/client';
import { D, r2, r3 } from '../../lib/money';

export interface DailyDemandPoint {
  date: string;
  qty: number;
}

export function forecastMovingAverage(history: DailyDemandPoint[], horizonDays = 14, windowDays = 28): {
  daily: Array<{ date: string; mean: number; p10: number; p90: number }>;
  meanLT: number;
  sigmaDaily: number;
} {
  const recent = history.slice(-windowDays);
  const sum = recent.reduce((acc, p) => acc + p.qty, 0);
  const meanDaily = recent.length > 0 ? sum / recent.length : 0;

  // Calculate daily standard deviation
  const variance = recent.length > 1
    ? recent.reduce((acc, p) => acc + Math.pow(p.qty - meanDaily, 2), 0) / (recent.length - 1)
    : 0;
  const sigmaDaily = Math.sqrt(variance);

  const daily = [];
  const today = new Date();

  for (let i = 1; i <= horizonDays; i++) {
    const nextDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    daily.push({
      date: nextDate,
      mean: Math.round(meanDaily * 100) / 100,
      p10: Math.max(0, Math.round((meanDaily - 1.28 * sigmaDaily) * 100) / 100),
      p90: Math.round((meanDaily + 1.28 * sigmaDaily) * 100) / 100,
    });
  }

  const meanLT = meanDaily * horizonDays;
  return { daily, meanLT: Math.round(meanLT * 100) / 100, sigmaDaily: Math.round(sigmaDaily * 100) / 100 };
}

export function computeWAPE(actuals: number[], forecasts: number[]): number {
  let sumAbsDiff = 0;
  let sumActual = 0;

  for (let i = 0; i < Math.min(actuals.length, forecasts.length); i++) {
    sumAbsDiff += Math.abs(actuals[i] - forecasts[i]);
    sumActual += actuals[i];
  }

  if (sumActual === 0) return 0;
  return Math.round((sumAbsDiff / sumActual) * 1000) / 1000;
}

export async function generateProductForecast(
  prisma: PrismaClient,
  productId: string,
  warehouseId: string,
  horizonDays = 14
) {
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const salesTxs = await prisma.inventoryTransaction.findMany({
    where: {
      productId,
      warehouseId,
      type: 'SALE',
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Aggregate by date string
  const demandMap = new Map<string, number>();
  salesTxs.forEach((tx) => {
    const dateStr = tx.createdAt.toISOString().split('T')[0];
    const qty = Math.abs(tx.quantityDelta.toNumber());
    demandMap.set(dateStr, (demandMap.get(dateStr) || 0) + qty);
  });

  const history: DailyDemandPoint[] = Array.from(demandMap.entries()).map(([date, qty]) => ({ date, qty }));

  const fc = forecastMovingAverage(history, horizonDays);

  const wape = history.length >= 7 ? computeWAPE(history.slice(-7).map((h) => h.qty), history.slice(-7).map(() => fc.daily[0].mean)) : 0.2;

  return prisma.demandForecast.create({
    data: {
      productId,
      warehouseId,
      horizonDays,
      model: 'moving_average_28d',
      forecast: fc.daily as any,
      wape: D(wape),
      lowConfidence: history.length < 14,
    },
  });
}
