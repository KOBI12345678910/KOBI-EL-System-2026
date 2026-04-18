import { describe, it, expect } from "vitest";

const VAT_RATE = 0.17;

interface LineItem {
  quantity: number;
  unitPrice: number;
  discountPct?: number;
}

function calculateLineTotal(item: LineItem): number {
  const gross = item.quantity * item.unitPrice;
  const discount = gross * ((item.discountPct || 0) / 100);
  return Math.round((gross - discount) * 100) / 100;
}

function calculateInvoiceTotals(
  lineItems: LineItem[],
  globalDiscountPct: number = 0,
  vatRate: number = VAT_RATE
): {
  subtotal: number;
  discountAmount: number;
  beforeVat: number;
  vatAmount: number;
  grandTotal: number;
} {
  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  const discountAmount = Math.round(subtotal * (globalDiscountPct / 100) * 100) / 100;
  const beforeVat = Math.round((subtotal - discountAmount) * 100) / 100;
  const vatAmount = Math.round(beforeVat * vatRate * 100) / 100;
  const grandTotal = Math.round((beforeVat + vatAmount) * 100) / 100;
  return { subtotal, discountAmount, beforeVat, vatAmount, grandTotal };
}

function generateSequentialNumber(prefix: string, lastNumber: string): string {
  const numPart = lastNumber.replace(prefix, "");
  const next = parseInt(numPart, 10) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

describe("Invoice & Quote Calculation Tests", () => {
  describe("Line item totals", () => {
    it("calculates basic line total: qty × price", () => {
      expect(calculateLineTotal({ quantity: 5, unitPrice: 100 })).toBe(500);
    });

    it("calculates line total with discount", () => {
      expect(calculateLineTotal({ quantity: 10, unitPrice: 200, discountPct: 10 })).toBe(1800);
    });

    it("handles zero quantity", () => {
      expect(calculateLineTotal({ quantity: 0, unitPrice: 1000 })).toBe(0);
    });

    it("handles fractional quantities", () => {
      expect(calculateLineTotal({ quantity: 2.5, unitPrice: 100 })).toBe(250);
    });

    it("applies 100% discount resulting in zero", () => {
      expect(calculateLineTotal({ quantity: 5, unitPrice: 200, discountPct: 100 })).toBe(0);
    });
  });

  describe("Invoice totals with VAT 17%", () => {
    it("calculates subtotal as sum of all line totals", () => {
      const lines: LineItem[] = [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 2, unitPrice: 500 },
      ];
      const result = calculateInvoiceTotals(lines);
      expect(result.subtotal).toBe(2000);
    });

    it("applies 17% VAT correctly", () => {
      const lines: LineItem[] = [{ quantity: 1, unitPrice: 1000 }];
      const result = calculateInvoiceTotals(lines);
      expect(result.vatAmount).toBe(170);
      expect(result.grandTotal).toBe(1170);
    });

    it("grand total = beforeVat + VAT", () => {
      const lines: LineItem[] = [
        { quantity: 3, unitPrice: 750 },
        { quantity: 1, unitPrice: 500 },
      ];
      const result = calculateInvoiceTotals(lines);
      expect(result.grandTotal).toBe(result.beforeVat + result.vatAmount);
    });

    it("applies global discount before VAT", () => {
      const lines: LineItem[] = [{ quantity: 1, unitPrice: 1000 }];
      const result = calculateInvoiceTotals(lines, 10);
      expect(result.discountAmount).toBe(100);
      expect(result.beforeVat).toBe(900);
      expect(result.vatAmount).toBe(153);
      expect(result.grandTotal).toBe(1053);
    });

    it("zero discount has no effect", () => {
      const lines: LineItem[] = [{ quantity: 1, unitPrice: 2000 }];
      const result = calculateInvoiceTotals(lines, 0);
      expect(result.discountAmount).toBe(0);
      expect(result.beforeVat).toBe(2000);
    });

    it("VAT calculation is based on beforeVat, not subtotal when discount applied", () => {
      const lines: LineItem[] = [{ quantity: 1, unitPrice: 1000 }];
      const result = calculateInvoiceTotals(lines, 20);
      expect(result.beforeVat).toBe(800);
      expect(result.vatAmount).toBe(Math.round(800 * 0.17 * 100) / 100);
    });

    it("handles multiple items with individual discounts and global discount", () => {
      const lines: LineItem[] = [
        { quantity: 2, unitPrice: 1000, discountPct: 5 },
        { quantity: 1, unitPrice: 500, discountPct: 0 },
      ];
      const result = calculateInvoiceTotals(lines, 10);
      const line1Total = calculateLineTotal(lines[0]);
      const line2Total = calculateLineTotal(lines[1]);
      const subtotal = line1Total + line2Total;
      expect(result.subtotal).toBeCloseTo(subtotal, 2);
      expect(result.grandTotal).toBeGreaterThan(0);
    });

    it("zero VAT rate produces no VAT amount", () => {
      const lines: LineItem[] = [{ quantity: 1, unitPrice: 1000 }];
      const result = calculateInvoiceTotals(lines, 0, 0);
      expect(result.vatAmount).toBe(0);
      expect(result.grandTotal).toBe(1000);
    });
  });

  describe("Sequential document numbering", () => {
    it("generates first invoice number as INV-0001 from INV-0000 seed", () => {
      expect(generateSequentialNumber("INV-", "INV-0000")).toBe("INV-0001");
    });

    it("increments invoice number by 1", () => {
      expect(generateSequentialNumber("INV-", "INV-0042")).toBe("INV-0043");
    });

    it("pads with leading zeros to 4 digits", () => {
      expect(generateSequentialNumber("Q-", "Q-0009")).toBe("Q-0010");
    });

    it("handles prefix QUO for quotes", () => {
      expect(generateSequentialNumber("QUO-", "QUO-0100")).toBe("QUO-0101");
    });

    it("handles CPAY prefix for customer payments", () => {
      expect(generateSequentialNumber("CPAY-", "CPAY-0005")).toBe("CPAY-0006");
    });

    it("handles REF prefix for refunds", () => {
      expect(generateSequentialNumber("REF-", "REF-0001")).toBe("REF-0002");
    });
  });

  describe("Credit note calculations", () => {
    it("credit note total equals original invoice amount when fully refunded", () => {
      const invoiceTotal = 1170;
      const creditAmount = 1000;
      const creditVat = Math.round(creditAmount * VAT_RATE * 100) / 100;
      const creditTotal = Math.round((creditAmount + creditVat) * 100) / 100;
      expect(creditTotal).toBe(invoiceTotal);
    });

    it("partial credit note includes correct VAT proportion", () => {
      const refundAmount = 500;
      const vatAmount = Math.round(refundAmount * VAT_RATE * 100) / 100;
      expect(vatAmount).toBe(85);
      expect(refundAmount + vatAmount).toBe(585);
    });
  });

  describe("Real-world invoice scenario", () => {
    it("handles typical gate installation invoice", () => {
      const lines: LineItem[] = [
        { quantity: 1, unitPrice: 5000 },
        { quantity: 2, unitPrice: 800 },
        { quantity: 1, unitPrice: 350 },
      ];
      const result = calculateInvoiceTotals(lines, 5);
      expect(result.subtotal).toBe(6950);
      expect(result.discountAmount).toBe(347.5);
      expect(result.beforeVat).toBe(6602.5);
      expect(result.vatAmount).toBe(Math.round(6602.5 * 0.17 * 100) / 100);
      expect(result.grandTotal).toBe(result.beforeVat + result.vatAmount);
    });
  });
});
