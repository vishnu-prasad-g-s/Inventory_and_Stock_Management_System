import { PrismaClient } from '@prisma/client';
import { D, r2 } from '../../lib/money';

export async function getGstSalesRegister(
  prisma: PrismaClient,
  startDate: Date,
  endDate: Date
) {
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceDate: { gte: startDate, lte: endDate },
      status: 'ISSUED',
    },
    include: { customer: true },
    orderBy: { invoiceDate: 'asc' },
  });

  let totalTaxable = D(0);
  let totalCgst = D(0);
  let totalSgst = D(0);
  let totalIgst = D(0);
  let totalAmount = D(0);

  const rows = invoices.map((inv) => {
    const taxable = D(inv.subtotal).minus(D(inv.discount));
    const cgst = D(inv.cgst);
    const sgst = D(inv.sgst);
    const igst = D(inv.igst);
    const total = D(inv.total);

    totalTaxable = totalTaxable.plus(taxable);
    totalCgst = totalCgst.plus(cgst);
    totalSgst = totalSgst.plus(sgst);
    totalIgst = totalIgst.plus(igst);
    totalAmount = totalAmount.plus(total);

    return {
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate.toISOString().split('T')[0],
      type: inv.type,
      customerName: inv.customer?.name ?? 'Walk-in Customer',
      customerGstin: inv.customer?.gstin ?? 'URP',
      placeOfSupply: inv.placeOfSupply ?? 'Intra-state',
      taxableValue: r2(taxable).toNumber(),
      cgst: r2(cgst).toNumber(),
      sgst: r2(sgst).toNumber(),
      igst: r2(igst).toNumber(),
      totalAmount: r2(total).toNumber(),
    };
  });

  return {
    summary: {
      totalTaxable: r2(totalTaxable).toNumber(),
      totalCgst: r2(totalCgst).toNumber(),
      totalSgst: r2(totalSgst).toNumber(),
      totalIgst: r2(totalIgst).toNumber(),
      totalAmount: r2(totalAmount).toNumber(),
    },
    invoices: rows,
  };
}
