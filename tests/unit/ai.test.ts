import { describe, it, expect } from 'vitest';
import { forecastMovingAverage, computeWAPE } from '../../server/services/forecasting/models';

describe('Phase 8 — Intelligence & AI Engine Tests', () => {
  it('should accurately calculate moving average forecast and daily standard deviation', () => {
    const history = [
      { date: '2026-09-20', qty: 10 },
      { date: '2026-09-21', qty: 12 },
      { date: '2026-09-22', qty: 8 },
      { date: '2026-09-23', qty: 10 },
    ];

    const fc = forecastMovingAverage(history, 7, 4);

    expect(fc.daily.length).toBe(7);
    expect(fc.daily[0].mean).toBe(10); // Average of 10, 12, 8, 10 is 10
    expect(fc.meanLT).toBe(70);
  });

  it('should calculate WAPE error metric accurately', () => {
    const actuals = [10, 20, 30];
    const forecasts = [10, 15, 35]; // Absolute diffs: 0 + 5 + 5 = 10. Total actuals = 60.
    const wape = computeWAPE(actuals, forecasts);

    expect(wape).toBe(0.167); // 10 / 60 = 0.1666... -> 0.167
  });
});
