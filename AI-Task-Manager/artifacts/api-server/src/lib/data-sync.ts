import { db } from "@workspace/db";
import {
  rawMaterialsTable,
  suppliersTable,
  foreignSuppliersTable,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  inventoryTransactionsTable,
  importOrdersTable,
  importOrderItemsTable,
  supplierPriceHistoryTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { triggerOutboundEDIForPO } from "./edi-processor";

function esc(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}

function escNum(val: number | string | null | undefined): string {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return "0";
  return String(n);
}

function escDate(val: string | null | undefined): string {
  if (!val) return "NULL";
  const d = String(val).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "NULL";
  return `'${d}'`;
}

function escInt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  const n = Math.floor(Number(val));
  if (isNaN(n)) return "NULL";
  return String(n);
}

async function safeExec(query: string): Promise<any[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    const detail = err.detail || err.hint || err.code || "";
    console.error(`[data-sync] query error: ${err.message}${detail ? ` [${detail}]` : ""}`);
    return [];
  }
}

const APPROVED_STATUSES = ["אושר", "מאושר", "approved"];
const RECEIVED_STATUSES = ["התקבל", "התקבל במלואו", "received"];
const ORDERED_STATUSES = ["הוזמן", "ordered", "בהזמנה"];
const COMPLETED_STATUSES = ["הושלם", "completed", "אושר", "מאושר", "התקבל"];

function matchesStatus(status: string, set: string[]): boolean {
  const normalized = status.trim().toLowerCase();
  return set.some(s => s.toLowerCase() === normalized);
}

export async function onPurchaseOrderApproved(orderId: number) {
  try {
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, orderId));
    if (!order) return;

    const totalAmount = parseFloat(order.totalAmount || "0");
    if (totalAmount <= 0) return;

    const supplierName = await getSupplierName(order.supplierId);
    const invoiceNum = `PO-${order.orderNumber}`;

    await safeExec(`
      INSERT INTO accounts_payable (supplier_id, supplier_name, invoice_number, amount, currency, paid_amount, balance_due, due_date, invoice_date, status, payment_terms, description, category)
      VALUES (
        ${escInt(order.supplierId)},
        ${esc(supplierName)},
        ${esc(invoiceNum)},
        ${escNum(totalAmount)},
        ${esc(order.currency || "ILS")},
        0,
        ${escNum(totalAmount)},
        COALESCE(${escDate(order.expectedDelivery)}, CURRENT_DATE + INTERVAL '30 days'),
        CURRENT_DATE,
        'open',
        ${esc(order.paymentTerms || "שוטף+30")},
        ${esc(`הזמנת רכש ${order.orderNumber}`)},
        'רכש'
      )
      ON CONFLICT DO NOTHING
    `);

    await updateBudgetSpend("רכש", totalAmount);

    console.log(`[data-sync] PO ${order.orderNumber} approved → AP created, budget updated`);

    void triggerOutboundEDIForPO(orderId);
  } catch (err: any) {
    console.error("[data-sync] onPurchaseOrderApproved error:", err.message);
  }
}

export async function onPurchaseOrderReceived(orderId: number) {
  try {
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, orderId));
    if (!order) return;

    const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, orderId));

    for (const item of items) {
      if (!item.materialId) continue;
      const qty = parseFloat(item.quantity || "0");
      if (qty <= 0) continue;

      await db.update(rawMaterialsTable).set({
        currentStock: sql`COALESCE(current_stock, '0')::numeric + ${qty}`,
        lastReceiptDate: new Date().toISOString().slice(0, 10),
        updatedAt: new Date(),
      }).where(eq(rawMaterialsTable.id, item.materialId));

      await db.insert(inventoryTransactionsTable).values({
        materialId: item.materialId,
        transactionType: "receipt",
        quantity: String(qty),
        referenceType: "purchase_order",
        referenceId: orderId,
        notes: `קבלה מהזמנת רכש ${order.orderNumber}`,
      });

      const unitPrice = parseFloat(item.unitPrice || "0");
      if (unitPrice > 0) {
        await db.insert(supplierPriceHistoryTable).values({
          supplierId: order.supplierId,
          materialId: item.materialId,
          price: String(unitPrice),
          currency: order.currency || "ILS",
          priceListName: `PO-${order.orderNumber}`,
          notes: `מחיר מהזמנת רכש ${order.orderNumber}`,
        });
      }
    }

    await db.update(suppliersTable).set({
      updatedAt: new Date(),
    }).where(eq(suppliersTable.id, order.supplierId));

    console.log(`[data-sync] PO ${order.orderNumber} received → stock updated, price history recorded`);
  } catch (err: any) {
    console.error("[data-sync] onPurchaseOrderReceived error:", err.message);
  }
}

export async function onGoodsReceiptCompleted(receiptId: number) {
  try {
    const [receipt] = await db.select().from(goodsReceiptsTable).where(eq(goodsReceiptsTable.id, receiptId));
    if (!receipt) return;

    const items = await db.select().from(goodsReceiptItemsTable).where(eq(goodsReceiptItemsTable.receiptId, receiptId));

    for (const item of items) {
      if (!item.materialId) continue;
      const qty = parseFloat(item.receivedQuantity || "0");
      if (qty <= 0) continue;

      await db.update(rawMaterialsTable).set({
        currentStock: sql`COALESCE(current_stock, '0')::numeric + ${qty}`,
        lastReceiptDate: receipt.receiptDate || new Date().toISOString().slice(0, 10),
        updatedAt: new Date(),
      }).where(eq(rawMaterialsTable.id, item.materialId));

      await db.insert(inventoryTransactionsTable).values({
        materialId: item.materialId,
        transactionType: "receipt",
        quantity: String(qty),
        referenceType: "goods_receipt",
        referenceId: receiptId,
        warehouseLocation: item.storageLocation || receipt.warehouseLocation || undefined,
        notes: `קבלת סחורה ${receipt.receiptNumber}`,
      });
    }

    if (receipt.orderId) {
      for (const item of items) {
        if (!item.orderItemId) continue;
        await db.update(purchaseOrderItemsTable).set({
          receivedQuantity: sql`COALESCE(received_quantity, '0')::numeric + ${parseFloat(item.receivedQuantity || "0")}`,
        }).where(eq(purchaseOrderItemsTable.id, item.orderItemId));
      }

      const poItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, receipt.orderId));
      const allReceived = poItems.every(pi => parseFloat(pi.receivedQuantity || "0") >= parseFloat(pi.quantity || "0"));
      if (allReceived) {
        await db.update(purchaseOrdersTable).set({
          status: "התקבל",
          updatedAt: new Date(),
        }).where(eq(purchaseOrdersTable.id, receipt.orderId));
      }
    }

    await db.update(suppliersTable).set({
      updatedAt: new Date(),
    }).where(eq(suppliersTable.id, receipt.supplierId));

    import("../routes/supplier-intelligence").then(({ triggerSupplierKpiRecalculation }) => {
      triggerSupplierKpiRecalculation(receipt.supplierId).catch(err => {
        console.error(`[data-sync] KPI recalculation failed for supplier ${receipt.supplierId}:`, err);
      });
    }).catch(err => {
      console.error("[data-sync] Failed to import supplier-intelligence for KPI recalculation:", err);
    });

    for (const item of items) {
      if (!item.materialId) continue;
      const [poItem] = receipt.orderId && item.orderItemId
        ? await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, item.orderItemId))
        : [];
      if (poItem) {
        const unitPrice = parseFloat(poItem.unitPrice || "0");
        if (unitPrice > 0) {
          await db.insert(supplierPriceHistoryTable).values({
            supplierId: receipt.supplierId,
            materialId: item.materialId,
            price: String(unitPrice),
            currency: "ILS",
            priceListName: `GR-${receipt.receiptNumber}`,
            notes: `מחיר מקבלת סחורה ${receipt.receiptNumber}`,
          });
        }
      }
    }

    console.log(`[data-sync] Goods Receipt ${receipt.receiptNumber} completed → stock, PO, supplier, price history updated`);
  } catch (err: any) {
    console.error("[data-sync] onGoodsReceiptCompleted error:", err.message);
  }
}

export async function onPaymentCreated(paymentData: {
  type: string; amount: number; bankAccountId?: number; method?: string;
  fromEntity?: string; toEntity?: string; description?: string; relatedInvoice?: string;
}) {
  try {
    const amount = escNum(paymentData.amount);
    const bankId = escInt(paymentData.bankAccountId);

    if (paymentData.bankAccountId) {
      if (paymentData.type === "outgoing" || paymentData.type === "payment") {
        await safeExec(`
          UPDATE bank_accounts SET
            current_balance = COALESCE(current_balance, 0) - ${amount},
            available_balance = COALESCE(available_balance, 0) - ${amount},
            updated_at = NOW()
          WHERE id = ${bankId}
        `);
      } else if (paymentData.type === "incoming" || paymentData.type === "receipt") {
        await safeExec(`
          UPDATE bank_accounts SET
            current_balance = COALESCE(current_balance, 0) + ${amount},
            available_balance = COALESCE(available_balance, 0) + ${amount},
            updated_at = NOW()
          WHERE id = ${bankId}
        `);
      }
    }

    if (paymentData.relatedInvoice) {
      const invoiceNum = esc(paymentData.relatedInvoice);
      if (paymentData.type === "outgoing" || paymentData.type === "payment") {
        await safeExec(`
          UPDATE accounts_payable SET
            paid_amount = COALESCE(paid_amount, 0) + ${amount},
            balance_due = GREATEST(COALESCE(amount, 0) - COALESCE(paid_amount, 0) - ${amount}, 0),
            status = CASE
              WHEN COALESCE(paid_amount, 0) + ${amount} >= COALESCE(amount, 0) THEN 'paid'
              WHEN ${amount} > 0 THEN 'partial'
              ELSE status
            END,
            updated_at = NOW()
          WHERE invoice_number = ${invoiceNum}
        `);
      } else if (paymentData.type === "incoming" || paymentData.type === "receipt") {
        await safeExec(`
          UPDATE accounts_receivable SET
            paid_amount = COALESCE(paid_amount, 0) + ${amount},
            balance_due = GREATEST(COALESCE(amount, 0) - COALESCE(paid_amount, 0) - ${amount}, 0),
            status = CASE
              WHEN COALESCE(paid_amount, 0) + ${amount} >= COALESCE(amount, 0) THEN 'paid'
              WHEN ${amount} > 0 THEN 'partial'
              ELSE status
            END,
            updated_at = NOW()
          WHERE invoice_number = ${invoiceNum}
        `);
      }
    }

    if (paymentData.type === "outgoing" || paymentData.type === "payment") {
      await safeExec(`
        INSERT INTO expenses (description, amount, currency, category, expense_date, vendor_name, status, payment_method)
        VALUES (
          ${esc(paymentData.description || "תשלום")},
          ${amount},
          'ILS',
          'תשלום לספק',
          CURRENT_DATE,
          ${esc(paymentData.toEntity || "")},
          'approved',
          ${esc(paymentData.method || "העברה בנקאית")}
        )
      `);
    }

    const txType = (paymentData.type === "incoming" || paymentData.type === "receipt") ? "income" : "expense";
    await safeExec(`
      INSERT INTO financial_transactions (type, amount, currency, description, category, "date", status, related_entity_type)
      VALUES (
        ${esc(txType)},
        ${amount},
        'ILS',
        ${esc(paymentData.description || "תשלום")},
        'תשלום',
        CURRENT_DATE,
        'completed',
        'payment'
      )
    `);

    console.log(`[data-sync] Payment ${paymentData.type} ₪${paymentData.amount} → bank, AP/AR, expenses, transactions updated`);
  } catch (err: any) {
    console.error("[data-sync] onPaymentCreated error:", err.message);
  }
}

export async function onImportOrderStatusChange(orderId: number, newStatus: string, oldStatus?: string) {
  try {
    const [order] = await db.select().from(importOrdersTable).where(eq(importOrdersTable.id, orderId));
    if (!order) return;

    if (matchesStatus(newStatus, ORDERED_STATUSES) && (!oldStatus || !matchesStatus(oldStatus, ORDERED_STATUSES))) {
      const totalValue = parseFloat(order.totalValue || "0");
      if (totalValue > 0) {
        const invoiceNum = `IMP-${order.orderNumber}`;

        await safeExec(`
          INSERT INTO accounts_payable (supplier_name, invoice_number, amount, currency, paid_amount, balance_due, due_date, invoice_date, status, description, category)
          VALUES (
            ${esc(order.supplierName || "")},
            ${esc(invoiceNum)},
            ${escNum(totalValue)},
            ${esc(order.currency || "USD")},
            0,
            ${escNum(totalValue)},
            COALESCE(${escDate(order.estimatedArrival)}, CURRENT_DATE + INTERVAL '60 days'),
            CURRENT_DATE,
            'open',
            ${esc(`הזמנת יבוא ${order.orderNumber}`)},
            'יבוא'
          )
          ON CONFLICT DO NOTHING
        `);

        await updateBudgetSpend("יבוא", totalValue);
      }

      if (order.supplierId) {
        await db.update(foreignSuppliersTable).set({
          totalOrders: sql`COALESCE(total_orders, 0) + 1`,
          lastOrderDate: new Date().toISOString().slice(0, 10),
          totalImportValue: sql`COALESCE(total_import_value, '0')::numeric + ${parseFloat(order.totalValue || "0")}`,
          updatedAt: new Date(),
        }).where(eq(foreignSuppliersTable.id, order.supplierId));
      }
    }

    if (matchesStatus(newStatus, RECEIVED_STATUSES)) {
      const items = await db.select().from(importOrderItemsTable).where(eq(importOrderItemsTable.importOrderId, orderId));

      for (const item of items) {
        const existingMaterials = await safeExec(`
          SELECT id FROM raw_materials WHERE material_number = ${esc(item.itemCode || "")} OR material_name = ${esc(item.itemName || "")} LIMIT 1
        `);

        if (existingMaterials.length > 0) {
          const matId = existingMaterials[0].id;
          const qty = parseFloat(item.quantity || "0");

          await db.update(rawMaterialsTable).set({
            currentStock: sql`COALESCE(current_stock, '0')::numeric + ${qty}`,
            lastReceiptDate: new Date().toISOString().slice(0, 10),
            standardPrice: item.unitPrice || undefined,
            updatedAt: new Date(),
          }).where(eq(rawMaterialsTable.id, matId));

          await db.insert(inventoryTransactionsTable).values({
            materialId: matId,
            transactionType: "import_receipt",
            quantity: String(qty),
            referenceType: "import_order",
            referenceId: orderId,
            notes: `יבוא ${order.orderNumber} - ${item.itemName}`,
          });
        }
      }

      await safeExec(`
        UPDATE accounts_payable SET
          status = 'paid',
          paid_amount = amount,
          balance_due = 0,
          updated_at = NOW()
        WHERE invoice_number = ${esc(`IMP-${order.orderNumber}`)}
      `);
    }

    console.log(`[data-sync] Import Order ${order.orderNumber} → ${newStatus}: cascades executed`);
  } catch (err: any) {
    console.error("[data-sync] onImportOrderStatusChange error:", err.message);
  }
}

export async function onIncomeDocumentCreated(doc: {
  documentNumber: string; customerName: string; amount: number; vatAmount?: number;
  totalWithVat?: number; dueDate?: string; paymentMethod?: string;
}) {
  try {
    const total = doc.totalWithVat || (doc.amount + (doc.vatAmount || 0));
    const isPaid = doc.paymentMethod === "cash" || doc.paymentMethod === "credit_card";

    await safeExec(`
      INSERT INTO accounts_receivable (customer_name, invoice_number, amount, currency, paid_amount, balance_due, due_date, invoice_date, status, description, category)
      VALUES (
        ${esc(doc.customerName)},
        ${esc(doc.documentNumber)},
        ${escNum(total)},
        'ILS',
        ${isPaid ? escNum(total) : "0"},
        ${isPaid ? "0" : escNum(total)},
        COALESCE(${escDate(doc.dueDate)}, CURRENT_DATE + INTERVAL '30 days'),
        CURRENT_DATE,
        ${isPaid ? "'paid'" : "'open'"},
        ${esc(`חשבונית ${doc.documentNumber}`)},
        'מכירות'
      )
      ON CONFLICT DO NOTHING
    `);

    await safeExec(`
      INSERT INTO financial_transactions (type, amount, currency, description, category, "date", status, related_entity_type, reference_number)
      VALUES (
        'income',
        ${escNum(total)},
        'ILS',
        ${esc(`חשבונית ${doc.documentNumber} - ${doc.customerName}`)},
        'מכירות',
        CURRENT_DATE,
        'completed',
        'income_document',
        ${esc(doc.documentNumber)}
      )
    `);

    console.log(`[data-sync] Income doc ${doc.documentNumber} → AR created, transaction recorded`);
  } catch (err: any) {
    console.error("[data-sync] onIncomeDocumentCreated error:", err.message);
  }
}

export async function onEmployeeCreated(employeeRecordId: number, employeeData: {
  full_name?: string; employee_id?: string; department?: string;
}) {
  try {
    const entityId35 = 35;
    const entityId36 = 36;

    const today = new Date().toISOString().slice(0, 10);

    const attendanceData = JSON.stringify({
      employee_id: employeeData.employee_id || String(employeeRecordId),
      employee_name: employeeData.full_name || "",
      date: today,
      type: "נוכחות",
      check_in: "",
      check_out: "",
      total_hours: 0,
      overtime_hours: 0,
    });

    await safeExec(`
      INSERT INTO entity_records (entity_id, data, status, created_at, updated_at)
      VALUES (
        ${escInt(entityId35)},
        ${esc(attendanceData)}::jsonb,
        'active',
        NOW(),
        NOW()
      )
    `);

    const daysOfWeek = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];
    for (const day of daysOfWeek) {
      const shiftData = JSON.stringify({
        employee_id: employeeData.employee_id || String(employeeRecordId),
        employee_name: employeeData.full_name || "",
        shift_date: today,
        shift_name: "משמרת בוקר",
        shift_type: "בוקר",
        day_of_week: day,
        start_time: "08:00",
        end_time: "16:00",
      });

      await safeExec(`
        INSERT INTO entity_records (entity_id, data, status, created_at, updated_at)
        VALUES (
          ${escInt(entityId36)},
          ${esc(shiftData)}::jsonb,
          'active',
          NOW(),
          NOW()
        )
      `);
    }

    console.log(`[data-sync] Employee ${employeeData.full_name} created → attendance + shifts initialized`);
  } catch (err: any) {
    console.error("[data-sync] onEmployeeCreated error:", err.message);
  }
}

export async function onExpenseCreated(expense: {
  amount: number; category?: string; department?: string; description?: string;
}) {
  try {
    await updateBudgetSpend(expense.category || "כללי", expense.amount);

    await safeExec(`
      INSERT INTO financial_transactions (type, amount, currency, description, category, "date", status, related_entity_type)
      VALUES (
        'expense',
        ${escNum(expense.amount)},
        'ILS',
        ${esc(expense.description || "הוצאה")},
        ${esc(expense.category || "כללי")},
        CURRENT_DATE,
        'completed',
        'expense'
      )
    `);

    console.log(`[data-sync] Expense ₪${expense.amount} (${expense.category}) → budget + transaction updated`);
  } catch (err: any) {
    console.error("[data-sync] onExpenseCreated error:", err.message);
  }
}

async function updateBudgetSpend(category: string, amount: number) {
  try {
    await safeExec(`
      UPDATE budgets SET
        spent = COALESCE(spent, 0) + ${escNum(amount)},
        updated_at = NOW()
      WHERE LOWER(category) = LOWER(${esc(category)})
        AND status = 'active'
        AND period_start <= CURRENT_DATE
        AND period_end >= CURRENT_DATE
    `);
  } catch (err: any) {
    console.error("[data-sync] updateBudgetSpend error:", err.message);
  }
}

async function getSupplierName(supplierId: number): Promise<string> {
  try {
    const [supplier] = await db.select({ supplierName: suppliersTable.supplierName }).from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    return supplier?.supplierName || "";
  } catch {
    return "";
  }
}

export async function syncOverdueInvoices() {
  try {
    await safeExec(`
      UPDATE accounts_payable SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('open', 'partial') AND due_date < CURRENT_DATE
    `);
    await safeExec(`
      UPDATE accounts_receivable SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('open', 'partial') AND due_date < CURRENT_DATE
    `);
    console.log("[data-sync] Overdue invoices synced");
  } catch (err: any) {
    console.error("[data-sync] syncOverdueInvoices error:", err.message);
  }
}

export async function getSystemSyncSummary() {
  try {
    const [inventory, poOpen, importActive, apOpen, arOpen, bankBalance, expenseMonth, budgetActive] = await Promise.all([
      safeExec(`SELECT COUNT(*) as count, COALESCE(SUM(current_stock::numeric), 0) as total_stock, COALESCE(SUM(current_stock::numeric * COALESCE(standard_price::numeric, 0)), 0) as total_value FROM raw_materials WHERE status IN ('פעיל', 'active')`),
      safeExec(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount::numeric), 0) as total FROM purchase_orders WHERE status NOT IN ('בוטל', 'התקבל', 'סגור')`),
      safeExec(`SELECT COUNT(*) as count, COALESCE(SUM(total_value::numeric), 0) as total_usd, COALESCE(SUM(total_value_ils::numeric), 0) as total_ils FROM import_orders WHERE status NOT IN ('בוטל', 'התקבל')`),
      safeExec(`SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM accounts_payable WHERE status IN ('open', 'partial', 'overdue')`),
      safeExec(`SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM accounts_receivable WHERE status IN ('open', 'partial', 'overdue')`),
      safeExec(`SELECT COALESCE(SUM(current_balance), 0) as total FROM bank_accounts WHERE is_active = true`),
      safeExec(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE status NOT IN ('cancelled', 'rejected') AND expense_date >= date_trunc('month', CURRENT_DATE)`),
      safeExec(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_budget, COALESCE(SUM(spent), 0) as total_spent FROM budgets WHERE status = 'active' AND period_start <= CURRENT_DATE AND period_end >= CURRENT_DATE`),
    ]);

    return {
      inventory: {
        activeItems: Number(inventory[0]?.count || 0),
        totalStock: Number(inventory[0]?.total_stock || 0),
        totalValue: Number(inventory[0]?.total_value || 0),
      },
      procurement: {
        openPurchaseOrders: Number(poOpen[0]?.count || 0),
        poTotalAmount: Number(poOpen[0]?.total || 0),
        activeImportOrders: Number(importActive[0]?.count || 0),
        importTotalUSD: Number(importActive[0]?.total_usd || 0),
        importTotalILS: Number(importActive[0]?.total_ils || 0),
      },
      finance: {
        accountsPayable: Number(apOpen[0]?.total || 0),
        apCount: Number(apOpen[0]?.count || 0),
        accountsReceivable: Number(arOpen[0]?.total || 0),
        arCount: Number(arOpen[0]?.count || 0),
        bankBalance: Number(bankBalance[0]?.total || 0),
        monthlyExpenses: Number(expenseMonth[0]?.total || 0),
      },
      budgets: {
        activeBudgets: Number(budgetActive[0]?.count || 0),
        totalBudget: Number(budgetActive[0]?.total_budget || 0),
        totalSpent: Number(budgetActive[0]?.total_spent || 0),
        utilization: Number(budgetActive[0]?.total_budget || 0) > 0
          ? Math.round((Number(budgetActive[0]?.total_spent || 0) / Number(budgetActive[0]?.total_budget || 0)) * 100)
          : 0,
      },
    };
  } catch (err: any) {
    console.error("[data-sync] getSystemSyncSummary error:", err.message);
    return {};
  }
}

export { matchesStatus, APPROVED_STATUSES, RECEIVED_STATUSES, COMPLETED_STATUSES, ORDERED_STATUSES };
