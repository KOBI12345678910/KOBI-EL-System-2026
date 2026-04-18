import { useEffect } from "react";
import { entityFilter, entityCreate, entityUpdate, entityList } from "@/lib/entity-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Invoice {
  id: string;
  invoice_number?: string;
  total?: number;
  status?: string;
  due_date?: string;
  customer_email?: string;
  created_date?: string;
}

interface PaymentReminder {
  id?: string;
  invoice_id: string;
  reminder_type: string;
  sent_at?: string;
  customer_email?: string;
}

interface SalesOrder {
  id: string;
  status?: string;
  total?: number;
  material_cost?: number;
  labor_cost?: number;
  overhead_cost?: number;
  profitability_calculated?: boolean;
}

interface RentabilityAnalysis {
  id?: string;
  order_id: string;
  revenue: number;
  total_cost: number;
  profit: number;
  margin_percentage: number;
  analysis_date: string;
}

interface Expense {
  id: string;
  amount?: number;
  status?: string;
}

interface Alert {
  id?: string;
  title: string;
  message: string;
  severity: string;
  category: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function FinancialAutomation() {
  useEffect(() => {
    const interval = setInterval(runFinancialAutomation, 30 * 60 * 1000);
    runFinancialAutomation().catch((err) =>
      console.error("Initial financial automation failed:", err)
    );
    return () => clearInterval(interval);
  }, []);

  const runFinancialAutomation = async () => {
    try {
      await sendPaymentReminders();
      await calculateProfitability();
      await detectAnomalies();
      await forecastCashFlow();
    } catch (error) {
      console.error("Financial automation error:", error);
    }
  };

  const sendPaymentReminders = async () => {
    const invoices = await entityFilter<Invoice>("invoice", { status: "pending" });

    for (const invoice of invoices) {
      if (!invoice.due_date) continue;
      const daysOverdue = Math.floor(
        (Date.now() - new Date(invoice.due_date).getTime()) / 86_400_000
      );
      if (daysOverdue <= 0) continue;

      const reminders = await entityFilter<PaymentReminder>("payment-reminder", {
        invoice_id: invoice.id,
      });

      if (daysOverdue === 1 && reminders.length === 0) {
        await sendReminderEmail(invoice, "first");
      }
      if (daysOverdue === 7 && reminders.filter((r) => r.reminder_type === "second").length === 0) {
        await sendReminderEmail(invoice, "second");
      }
      if (daysOverdue === 14 && reminders.filter((r) => r.reminder_type === "third").length === 0) {
        await sendReminderEmail(invoice, "third");
      }
    }
  };

  const sendReminderEmail = async (invoice: Invoice, reminderType: string) => {
    try {
      if (!invoice.customer_email || !invoice.customer_email.includes("@")) return;

      // NOTE: SendEmail integration removed. Replace with your own API.
      console.info(
        `[FinancialAutomation] Would send ${reminderType} reminder for invoice ${invoice.invoice_number}`
      );

      await entityCreate<PaymentReminder>("payment-reminder", {
        invoice_id: invoice.id,
        reminder_type: reminderType,
        sent_at: new Date().toISOString(),
        customer_email: invoice.customer_email,
      } as PaymentReminder);
    } catch (error) {
      console.error("Payment reminder email error:", error);
    }
  };

  const calculateProfitability = async () => {
    const orders = await entityFilter<SalesOrder>("sales-order", { status: "completed" });

    for (const order of orders) {
      if (order.profitability_calculated) continue;

      const totalCost =
        (order.material_cost || 0) + (order.labor_cost || 0) + (order.overhead_cost || 0);
      const revenue = order.total || 0;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      await entityCreate<RentabilityAnalysis>("rentability-analysis", {
        order_id: order.id,
        revenue,
        total_cost: totalCost,
        profit,
        margin_percentage: margin,
        analysis_date: new Date().toISOString(),
      } as RentabilityAnalysis);

      await entityUpdate<SalesOrder>("sales-order", order.id, {
        profitability_calculated: true,
      } as Partial<SalesOrder>);
    }
  };

  const detectAnomalies = async () => {
    const recentInvoices = await entityList<Invoice>("invoice");
    if (recentInvoices.length < 10) return;

    const amounts = recentInvoices.map((i) => i.total || 0);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / amounts.length
    );

    for (const invoice of recentInvoices.slice(0, 5)) {
      const deviation = Math.abs((invoice.total ?? 0) - avg) / stdDev;

      if (deviation > 2) {
        await entityCreate<Alert>("alert", {
          title: "Anomalous invoice detected",
          message: `Invoice ${invoice.invoice_number} amount ${invoice.total?.toLocaleString()} deviates from average`,
          severity: "medium",
          category: "financial_anomaly",
          status: "active",
        } as Alert);
      }
    }
  };

  const forecastCashFlow = async () => {
    const pendingInvoices = await entityFilter<Invoice>("invoice", { status: "pending" });
    const expectedRevenue = pendingInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

    const pendingExpenses = await entityFilter<Expense>("expense", { status: "pending" });
    const expectedExpenses = pendingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const netCashFlow = expectedRevenue - expectedExpenses;

    if (netCashFlow < 0) {
      await entityCreate<Alert>("alert", {
        title: "Cash flow warning",
        message: `Expected negative cash flow: ${netCashFlow.toLocaleString()}`,
        severity: "high",
        category: "cash_flow",
        status: "active",
      } as Alert);
    }
  };

  return null;
}
