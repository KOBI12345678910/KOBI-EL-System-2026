import { describe, it, expect, beforeEach } from "vitest";

const VAT_RATE = 0.17;

interface Quote {
  id: number;
  quoteNumber: string;
  customerId: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  beforeVat: number;
  vatAmount: number;
  totalAmount: number;
  createdAt: Date;
}

interface WorkOrder {
  id: number;
  workOrderNumber: string;
  quoteId: number;
  customerId: number;
  status: "draft" | "in_progress" | "completed";
  totalAmount: number;
  createdAt: Date;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  quoteId?: number;
  workOrderId?: number;
  customerId: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  createdAt: Date;
  dueDate: Date;
}

interface Payment {
  id: number;
  paymentNumber: string;
  invoiceId: number;
  customerId: number;
  amount: number;
  paymentMethod: "cash" | "bank_transfer" | "check" | "credit_card";
  createdAt: Date;
}

let idCounter = 1;

function createQuote(params: {
  customerId: number;
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
  discountPct?: number;
}): Quote {
  const subtotal = params.lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const discountPct = params.discountPct ?? 0;
  const discountAmount = Math.round(subtotal * discountPct / 100 * 100) / 100;
  const beforeVat = Math.round((subtotal - discountAmount) * 100) / 100;
  const vatAmount = Math.round(beforeVat * VAT_RATE * 100) / 100;
  const totalAmount = Math.round((beforeVat + vatAmount) * 100) / 100;

  return {
    id: idCounter++,
    quoteNumber: `Q-${String(idCounter).padStart(4, "0")}`,
    customerId: params.customerId,
    status: "draft",
    lineItems: params.lineItems,
    subtotal,
    discountPct,
    discountAmount,
    beforeVat,
    vatAmount,
    totalAmount,
    createdAt: new Date(),
  };
}

function acceptQuote(quote: Quote): Quote {
  if (quote.status !== "draft" && quote.status !== "sent") {
    throw new Error(`Cannot accept quote in status: ${quote.status}`);
  }
  return { ...quote, status: "accepted" };
}

function convertQuoteToWorkOrder(quote: Quote): WorkOrder {
  if (quote.status !== "accepted") {
    throw new Error("Only accepted quotes can be converted to work orders");
  }
  return {
    id: idCounter++,
    workOrderNumber: `WO-${String(idCounter).padStart(4, "0")}`,
    quoteId: quote.id,
    customerId: quote.customerId,
    status: "draft",
    totalAmount: quote.totalAmount,
    createdAt: new Date(),
  };
}

function createInvoiceFromWorkOrder(workOrder: WorkOrder, quote: Quote): Invoice {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  return {
    id: idCounter++,
    invoiceNumber: `INV-${String(idCounter).padStart(4, "0")}`,
    quoteId: quote.id,
    workOrderId: workOrder.id,
    customerId: workOrder.customerId,
    status: "draft",
    subtotal: quote.beforeVat,
    vatAmount: quote.vatAmount,
    totalAmount: quote.totalAmount,
    amountPaid: 0,
    balanceDue: quote.totalAmount,
    createdAt: new Date(),
    dueDate,
  };
}

function recordPayment(
  invoice: Invoice,
  params: { amount: number; paymentMethod: Payment["paymentMethod"] }
): { invoice: Invoice; payment: Payment } {
  if (invoice.status === "cancelled") {
    throw new Error("Cannot record payment for cancelled invoice");
  }
  const newAmountPaid = Math.round((invoice.amountPaid + params.amount) * 100) / 100;
  const newBalance = Math.round((invoice.totalAmount - newAmountPaid) * 100) / 100;
  const newStatus: Invoice["status"] = newBalance <= 0 ? "paid" : invoice.status;

  const updatedInvoice: Invoice = {
    ...invoice,
    amountPaid: newAmountPaid,
    balanceDue: Math.max(0, newBalance),
    status: newStatus,
  };

  const payment: Payment = {
    id: idCounter++,
    paymentNumber: `CPAY-${String(idCounter).padStart(4, "0")}`,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
    createdAt: new Date(),
  };

  return { invoice: updatedInvoice, payment };
}

function getCustomerBalance(invoices: Invoice[]): number {
  return invoices.reduce((sum, inv) => {
    if (inv.status !== "cancelled") {
      return sum + inv.balanceDue;
    }
    return sum;
  }, 0);
}

describe("Financial Flow - Integration Tests", () => {
  let customerId: number;

  beforeEach(() => {
    customerId = 1001;
    idCounter = 1;
  });

  describe("Quote creation", () => {
    it("creates a quote with correct subtotal", () => {
      const quote = createQuote({
        customerId,
        lineItems: [
          { description: "Gate", qty: 1, unitPrice: 5000 },
          { description: "Installation", qty: 2, unitPrice: 500 },
        ],
      });
      expect(quote.subtotal).toBe(6000);
    });

    it("applies 17% VAT to before-VAT amount", () => {
      const quote = createQuote({ customerId, lineItems: [{ description: "Railing", qty: 1, unitPrice: 1000 }] });
      expect(quote.vatAmount).toBe(170);
      expect(quote.totalAmount).toBe(1170);
    });

    it("grand total equals beforeVat + VAT", () => {
      const quote = createQuote({
        customerId,
        lineItems: [{ description: "Pergola", qty: 1, unitPrice: 8000 }],
        discountPct: 10,
      });
      expect(quote.totalAmount).toBe(quote.beforeVat + quote.vatAmount);
    });

    it("applies discount before VAT", () => {
      const quote = createQuote({
        customerId,
        lineItems: [{ description: "Gate", qty: 1, unitPrice: 1000 }],
        discountPct: 20,
      });
      expect(quote.discountAmount).toBe(200);
      expect(quote.beforeVat).toBe(800);
      expect(quote.vatAmount).toBe(Math.round(800 * 0.17 * 100) / 100);
    });

    it("starts in draft status", () => {
      const quote = createQuote({ customerId, lineItems: [{ description: "Item", qty: 1, unitPrice: 100 }] });
      expect(quote.status).toBe("draft");
    });

    it("assigns a quote number", () => {
      const quote = createQuote({ customerId, lineItems: [{ description: "Item", qty: 1, unitPrice: 100 }] });
      expect(quote.quoteNumber).toMatch(/^Q-/);
    });
  });

  describe("Quote acceptance", () => {
    it("accepts a draft quote", () => {
      const quote = createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] });
      const accepted = acceptQuote(quote);
      expect(accepted.status).toBe("accepted");
    });

    it("accepts a sent quote", () => {
      const quote = { ...createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }), status: "sent" as const };
      const accepted = acceptQuote(quote);
      expect(accepted.status).toBe("accepted");
    });

    it("cannot accept a rejected quote", () => {
      const quote = { ...createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }), status: "rejected" as const };
      expect(() => acceptQuote(quote)).toThrow();
    });

    it("cannot accept an already accepted quote", () => {
      const quote = { ...createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }), status: "accepted" as const };
      expect(() => acceptQuote(quote)).toThrow();
    });
  });

  describe("Quote to work order conversion", () => {
    it("converts accepted quote to work order", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      expect(workOrder.quoteId).toBe(quote.id);
      expect(workOrder.status).toBe("draft");
    });

    it("work order inherits customer and total from quote", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      expect(workOrder.customerId).toBe(customerId);
      expect(workOrder.totalAmount).toBe(quote.totalAmount);
    });

    it("cannot convert draft quote to work order", () => {
      const quote = createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] });
      expect(() => convertQuoteToWorkOrder(quote)).toThrow();
    });

    it("work order number is assigned", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      expect(workOrder.workOrderNumber).toMatch(/^WO-/);
    });
  });

  describe("Invoice creation", () => {
    it("invoice total matches work order / quote total", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      const invoice = createInvoiceFromWorkOrder(workOrder, quote);
      expect(invoice.totalAmount).toBe(quote.totalAmount);
    });

    it("invoice starts with amountPaid=0 and balanceDue=totalAmount", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      const invoice = createInvoiceFromWorkOrder(workOrder, quote);
      expect(invoice.amountPaid).toBe(0);
      expect(invoice.balanceDue).toBe(invoice.totalAmount);
    });

    it("invoice is linked to work order and quote", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      const invoice = createInvoiceFromWorkOrder(workOrder, quote);
      expect(invoice.workOrderId).toBe(workOrder.id);
      expect(invoice.quoteId).toBe(quote.id);
    });

    it("invoice has 30-day due date", () => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      const invoice = createInvoiceFromWorkOrder(workOrder, quote);
      const diffDays = Math.round((invoice.dueDate.getTime() - invoice.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });
  });

  describe("Payment recording", () => {
    let invoice: Invoice;

    beforeEach(() => {
      const quote = acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 5000 }] }));
      const workOrder = convertQuoteToWorkOrder(quote);
      invoice = createInvoiceFromWorkOrder(workOrder, quote);
    });

    it("records a partial payment", () => {
      const { invoice: updated } = recordPayment(invoice, { amount: 2000, paymentMethod: "bank_transfer" });
      expect(updated.amountPaid).toBe(2000);
      expect(updated.balanceDue).toBe(invoice.totalAmount - 2000);
    });

    it("partial payment does not change status to paid", () => {
      const { invoice: updated } = recordPayment(invoice, { amount: 100, paymentMethod: "cash" });
      expect(updated.status).not.toBe("paid");
    });

    it("full payment marks invoice as paid", () => {
      const { invoice: updated } = recordPayment(invoice, { amount: invoice.totalAmount, paymentMethod: "bank_transfer" });
      expect(updated.status).toBe("paid");
      expect(updated.balanceDue).toBe(0);
    });

    it("overpayment does not cause negative balance", () => {
      const { invoice: updated } = recordPayment(invoice, { amount: invoice.totalAmount + 500, paymentMethod: "check" });
      expect(updated.balanceDue).toBe(0);
      expect(updated.status).toBe("paid");
    });

    it("multiple partial payments accumulate correctly", () => {
      const { invoice: after1 } = recordPayment(invoice, { amount: 1000, paymentMethod: "cash" });
      const { invoice: after2 } = recordPayment(after1, { amount: invoice.totalAmount - 1000, paymentMethod: "bank_transfer" });
      expect(after2.amountPaid).toBe(invoice.totalAmount);
      expect(after2.status).toBe("paid");
    });

    it("payment is linked to correct invoice", () => {
      const { payment } = recordPayment(invoice, { amount: 500, paymentMethod: "credit_card" });
      expect(payment.invoiceId).toBe(invoice.id);
      expect(payment.customerId).toBe(invoice.customerId);
    });

    it("cannot record payment for cancelled invoice", () => {
      const cancelledInvoice = { ...invoice, status: "cancelled" as const };
      expect(() => recordPayment(cancelledInvoice, { amount: 100, paymentMethod: "cash" })).toThrow();
    });
  });

  describe("Customer balance", () => {
    it("calculates total balance across multiple invoices", () => {
      const invoices: Invoice[] = [
        { ...createInvoiceFromWorkOrder(convertQuoteToWorkOrder(acceptQuote(createQuote({ customerId, lineItems: [{ description: "G1", qty: 1, unitPrice: 1000 }] }))), acceptQuote(createQuote({ customerId, lineItems: [{ description: "G1", qty: 1, unitPrice: 1000 }] }))), balanceDue: 585, amountPaid: 600 },
        { ...createInvoiceFromWorkOrder(convertQuoteToWorkOrder(acceptQuote(createQuote({ customerId, lineItems: [{ description: "G2", qty: 1, unitPrice: 2000 }] }))), acceptQuote(createQuote({ customerId, lineItems: [{ description: "G2", qty: 1, unitPrice: 2000 }] }))), balanceDue: 2340, amountPaid: 0 },
      ];
      const balance = getCustomerBalance(invoices);
      expect(balance).toBe(2925);
    });

    it("excludes cancelled invoices from balance", () => {
      const activeInvoice = { ...createInvoiceFromWorkOrder(convertQuoteToWorkOrder(acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 1000 }] }))), acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 1000 }] }))), balanceDue: 1170 };
      const cancelledInvoice = { ...activeInvoice, id: 9999, status: "cancelled" as const, balanceDue: 500 };
      const balance = getCustomerBalance([activeInvoice, cancelledInvoice]);
      expect(balance).toBe(1170);
    });

    it("zero balance when all invoices are paid", () => {
      const paidInvoice = {
        ...createInvoiceFromWorkOrder(convertQuoteToWorkOrder(acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 1000 }] }))), acceptQuote(createQuote({ customerId, lineItems: [{ description: "Gate", qty: 1, unitPrice: 1000 }] }))),
        status: "paid" as const,
        balanceDue: 0,
        amountPaid: 1170,
      };
      expect(getCustomerBalance([paidInvoice])).toBe(0);
    });
  });

  describe("Complete financial flow", () => {
    it("end-to-end: create quote → accept → work order → invoice → payment → verify balance", () => {
      const quote = createQuote({
        customerId,
        lineItems: [
          { description: "Sliding Gate", qty: 1, unitPrice: 8000 },
          { description: "Motor", qty: 1, unitPrice: 2000 },
          { description: "Installation", qty: 3, unitPrice: 500 },
        ],
        discountPct: 5,
      });

      expect(quote.subtotal).toBe(11500);
      expect(quote.discountAmount).toBe(575);
      expect(quote.beforeVat).toBe(10925);
      expect(quote.vatAmount).toBeCloseTo(10925 * 0.17, 0);

      const accepted = acceptQuote(quote);
      expect(accepted.status).toBe("accepted");

      const workOrder = convertQuoteToWorkOrder(accepted);
      expect(workOrder.totalAmount).toBe(quote.totalAmount);

      const invoice = createInvoiceFromWorkOrder(workOrder, accepted);
      expect(invoice.totalAmount).toBe(quote.totalAmount);
      expect(invoice.balanceDue).toBe(quote.totalAmount);

      const { invoice: after1 } = recordPayment(invoice, { amount: 5000, paymentMethod: "bank_transfer" });
      expect(after1.balanceDue).toBe(quote.totalAmount - 5000);
      expect(after1.status).not.toBe("paid");

      const { invoice: finalInvoice } = recordPayment(after1, { amount: after1.balanceDue, paymentMethod: "bank_transfer" });
      expect(finalInvoice.status).toBe("paid");
      expect(finalInvoice.balanceDue).toBe(0);
      expect(finalInvoice.amountPaid).toBe(quote.totalAmount);

      const balance = getCustomerBalance([finalInvoice]);
      expect(balance).toBe(0);
    });
  });
});
