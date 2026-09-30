import { describe, it, expect } from 'vitest';
import { computeLineGST } from '../../server/lib/gst';

describe('GST Calculation Engine', () => {
  it('should correctly calculate intra-state CGST + SGST (exclusive)', () => {
    // 10 items @ 100 each = 1000. 18% GST -> 180 total tax -> CGST 90, SGST 90. Total 1180.
    const res = computeLineGST({
      qty: 10,
      unitPrice: 100,
      taxRate: 18,
      sameState: true,
      inclusive: false,
    });

    expect(res.taxable.toNumber()).toBe(1000);
    expect(res.totalTax.toNumber()).toBe(180);
    expect(res.cgst.toNumber()).toBe(90);
    expect(res.sgst.toNumber()).toBe(90);
    expect(res.igst.toNumber()).toBe(0);
    expect(res.total.toNumber()).toBe(1180);
  });

  it('should correctly calculate inter-state IGST (exclusive)', () => {
    // 10 items @ 100 each = 1000. 18% GST -> IGST 180. CGST 0, SGST 0. Total 1180.
    const res = computeLineGST({
      qty: 10,
      unitPrice: 100,
      taxRate: 18,
      sameState: false,
      inclusive: false,
    });

    expect(res.taxable.toNumber()).toBe(1000);
    expect(res.cgst.toNumber()).toBe(0);
    expect(res.sgst.toNumber()).toBe(0);
    expect(res.igst.toNumber()).toBe(180);
    expect(res.total.toNumber()).toBe(1180);
  });

  it('should handle tax-inclusive pricing correctly', () => {
    // 10 items @ 118 each inclusive = 1180 gross. 18% GST -> taxable = 1000, tax = 180.
    const res = computeLineGST({
      qty: 10,
      unitPrice: 118,
      taxRate: 18,
      sameState: true,
      inclusive: true,
    });

    expect(res.taxable.toNumber()).toBe(1000);
    expect(res.totalTax.toNumber()).toBe(180);
    expect(res.cgst.toNumber()).toBe(90);
    expect(res.sgst.toNumber()).toBe(90);
    expect(res.total.toNumber()).toBe(1180);
  });
});
