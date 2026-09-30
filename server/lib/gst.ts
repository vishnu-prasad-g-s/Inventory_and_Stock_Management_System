import { Prisma } from '@prisma/client';
import { D, r2 } from './money';

export interface ComputeLineGSTInput {
  qty: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discount?: Prisma.Decimal.Value;
  taxRate: Prisma.Decimal.Value;
  inclusive?: boolean;
  sameState: boolean;
}

export interface LineGSTResult {
  gross: Prisma.Decimal;
  taxable: Prisma.Decimal;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  igst: Prisma.Decimal;
  totalTax: Prisma.Decimal;
  total: Prisma.Decimal;
}

export function computeLineGST(a: ComputeLineGSTInput): LineGSTResult {
  const qty = D(a.qty);
  const price = D(a.unitPrice);
  const discount = a.discount ? D(a.discount) : D(0);
  const rate = D(a.taxRate);

  const gross = qty.mul(price).minus(discount);

  let taxable: Prisma.Decimal;
  let totalTax: Prisma.Decimal;

  if (a.inclusive) {
    taxable = r2(gross.div(D(1).plus(rate.div(100))));
    totalTax = r2(gross.minus(taxable));
  } else {
    taxable = r2(gross);
    totalTax = r2(taxable.mul(rate).div(100));
  }

  let cgst = D(0);
  let sgst = D(0);
  let igst = D(0);

  if (a.sameState) {
    cgst = r2(totalTax.div(2));
    sgst = totalTax.minus(cgst); // Remainder allocation avoids paise mismatch
  } else {
    igst = totalTax;
  }

  const total = a.inclusive ? r2(gross) : r2(taxable.plus(totalTax));

  return {
    gross,
    taxable,
    cgst,
    sgst,
    igst,
    totalTax,
    total,
  };
}
