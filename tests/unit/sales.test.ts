import { describe, it, expect } from 'vitest';
import { computeLineGST } from '../../server/lib/gst';
import { D } from '../../server/lib/money';

describe('Phase 5 — Sales, Invoicing & GST Tests', () => {
  it('should accurately split intra-state CGST + SGST to the paisa without rounding errors', () => {
    // Total 1000 taxable @ 18% GST -> 90 CGST, 90 SGST
    const gst = computeLineGST({
      qty: 10,
      unitPrice: 100,
      taxRate: 18,
      sameState: true,
      inclusive: false,
    });

    expect(gst.taxable.toNumber()).toBe(1000);
    expect(gst.cgst.toNumber()).toBe(90);
    expect(gst.sgst.toNumber()).toBe(90);
    expect(gst.cgst.plus(gst.sgst).toNumber()).toBe(gst.totalTax.toNumber());
  });

  it('should verify IGST calculation for inter-state customer transactions', () => {
    const gst = computeLineGST({
      qty: 5,
      unitPrice: 200,
      taxRate: 12,
      sameState: false,
      inclusive: false,
    });

    expect(gst.taxable.toNumber()).toBe(1000);
    expect(gst.igst.toNumber()).toBe(120);
    expect(gst.cgst.toNumber()).toBe(0);
    expect(gst.sgst.toNumber()).toBe(0);
    expect(gst.total.toNumber()).toBe(1120);
  });
});
