import { db, pool } from "@workspace/db";
import { entityRecordsTable, moduleEntitiesTable, notificationsTable, usersTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { eventBus, type RecordEvent } from "./event-bus";

interface SyncResult {
  handler: string;
  success: boolean;
  details?: Record<string, any>;
  error?: string;
  timestamp: string;
}

const syncHistory: SyncResult[] = [];
const MAX_HISTORY = 200;

function addSyncResult(result: SyncResult) {
  syncHistory.unshift(result);
  if (syncHistory.length > MAX_HISTORY) {
    syncHistory.length = MAX_HISTORY;
  }
}

export function getSyncHistory(): SyncResult[] {
  return syncHistory;
}

export function getSyncStatus(): {
  totalSyncs: number;
  recentSyncs: number;
  successRate: number;
  handlers: { name: string; description: string; active: boolean }[];
} {
  const last24h = syncHistory.filter(
    (s) => new Date(s.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000
  );
  const successCount = last24h.filter((s) => s.success).length;

  return {
    totalSyncs: syncHistory.length,
    recentSyncs: last24h.length,
    successRate: last24h.length > 0 ? (successCount / last24h.length) * 100 : 100,
    handlers: [
      { name: "procurement_to_inventory", description: "הזמנת רכש מאושרת → עדכון מלאי", active: true },
      { name: "lead_to_customer", description: "ליד הומר ללקוח → יצירת רשומת לקוח", active: true },
      { name: "employee_status_change", description: "שינוי סטטוס עובד → עדכון הרשאות", active: true },
      { name: "supplier_invoice_to_ap", description: "חשבונית ספק → עדכון חשבונות זכאים", active: true },
      { name: "sales_order_to_invoice", description: "הזמנת מכירה → יצירת חשבונית", active: true },
      { name: "inventory_low_stock", description: "מלאי נמוך → התראה והזמנת רכש", active: true },
      { name: "quotation_to_sales_order", description: "הצעת מחיר מאושרת → הזמנת מכירה", active: true },
      { name: "sales_order_to_project", description: "הזמנת מכירה → פתיחת פרויקט", active: true },
      { name: "work_order_to_delivery", description: "פקודת עבודה הושלמה → תעודת משלוח", active: true },
      { name: "delivery_to_installation", description: "תעודת משלוח → הזמנת התקנה", active: true },
      { name: "installation_to_invoice", description: "התקנה הושלמה → חשבונית סופית", active: true },
      { name: "qc_failure_to_ncr", description: "כשל בדיקת איכות → דוח אי-התאמה", active: true },
      { name: "work_order_to_project_tasks", description: "עדכון פקודת עבודה → סנכרון אוטומטי למשימות פרויקט", active: true },
      { name: "project_task_to_work_orders", description: "עדכון משימת פרויקט → סנכרון אוטומטי לפקודות עבודה", active: true },
    ],
  };
}

async function findEntityBySlug(slug: string): Promise<{ id: number; moduleId: number } | null> {
  const [entity] = await db
    .select({ id: moduleEntitiesTable.id, moduleId: moduleEntitiesTable.moduleId })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, slug));
  return entity || null;
}

async function findEntityBySlugs(slugs: string[]): Promise<{ id: number; moduleId: number; slug: string } | null> {
  for (const slug of slugs) {
    const [entity] = await db
      .select({ id: moduleEntitiesTable.id, moduleId: moduleEntitiesTable.moduleId, slug: moduleEntitiesTable.slug })
      .from(moduleEntitiesTable)
      .where(eq(moduleEntitiesTable.slug, slug));
    if (entity) return entity;
  }
  return null;
}

const processedPOSyncs = new Set<string>();

async function handlePurchaseOrderApproved(event: RecordEvent): Promise<void> {
  const syncKey = `po-inv-${event.recordId}`;
  if (processedPOSyncs.has(syncKey)) {
    addSyncResult({
      handler: "procurement_to_inventory",
      success: true,
      details: { purchaseOrderId: event.recordId, action: "skipped_already_processed" },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const data = event.data;
  const items = data.items || data.order_items || data.line_items;
  if (!items || !Array.isArray(items)) return;

  const inventoryEntity = await findEntityBySlugs(["inventory", "inventory_item", "stock", "raw_material"]);
  if (!inventoryEntity) return;

  const inventoryRecords = await db
    .select()
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, inventoryEntity.id));

  const alreadySynced = inventoryRecords.some((r) => {
    const rd = r.data as Record<string, any>;
    return rd.last_po_id === event.recordId;
  });

  if (alreadySynced) {
    processedPOSyncs.add(syncKey);
    addSyncResult({
      handler: "procurement_to_inventory",
      success: true,
      details: { purchaseOrderId: event.recordId, action: "skipped_already_synced" },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  let updatedCount = 0;

  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    const productId = String(item.product_id || item.item_id || item.sku || "");
    const quantity = Number(item.quantity || item.qty || 0);
    if (!productId || quantity <= 0) continue;
    quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
  }

  for (const [productId, totalQty] of quantityByProduct.entries()) {
    for (const record of inventoryRecords) {
      const recData = record.data as Record<string, any>;
      const recProductId = String(recData.product_id || recData.item_id || recData.sku || recData.code || "");
      if (recProductId !== productId) continue;

      const [freshRecord] = await db
        .select()
        .from(entityRecordsTable)
        .where(eq(entityRecordsTable.id, record.id));
      if (!freshRecord) continue;

      const freshData = freshRecord.data as Record<string, any>;
      const qtyField = freshData.quantity !== undefined
        ? "quantity"
        : freshData.stock_quantity !== undefined
          ? "stock_quantity"
          : "available_quantity";
      const currentQty = Number(freshData[qtyField] || 0);
      const newQty = currentQty + totalQty;

      await db
        .update(entityRecordsTable)
        .set({
          data: {
            ...freshData,
            [qtyField]: newQty,
            last_restock_date: new Date().toISOString(),
            last_po_id: event.recordId,
          },
          updatedAt: new Date(),
        })
        .where(eq(entityRecordsTable.id, record.id));

      updatedCount++;
    }
  }

  processedPOSyncs.add(syncKey);

  if (updatedCount > 0) {
    await db.insert(notificationsTable).values({
      type: "sync_update",
      title: "סנכרון מלאי מהזמנת רכש",
      message: `עודכנו ${updatedCount} פריטי מלאי מהזמנת רכש #${event.recordId}`,
      recordId: event.recordId,
    });
  }

  addSyncResult({
    handler: "procurement_to_inventory",
    success: true,
    details: { purchaseOrderId: event.recordId, itemsUpdated: updatedCount },
    timestamp: new Date().toISOString(),
  });
}

async function handleLeadConvertedToCustomer(event: RecordEvent): Promise<void> {
  const data = event.data;

  const customerEntity = await findEntityBySlugs(["customer", "customers", "client", "clients"]);
  if (!customerEntity) return;

  const existingCustomers = await db
    .select()
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, customerEntity.id));

  const email = data.email || data.contact_email;
  const phone = data.phone || data.contact_phone || data.mobile;
  if (email) {
    const duplicate = existingCustomers.find((c) => {
      const cd = c.data as Record<string, any>;
      return cd.email === email || cd.contact_email === email;
    });
    if (duplicate) {
      addSyncResult({
        handler: "lead_to_customer",
        success: true,
        details: { leadId: event.recordId, action: "skipped_duplicate", email },
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }

  const customerData: Record<string, any> = {
    name: data.name || data.company_name || data.full_name || "",
    email: email || "",
    phone: phone || "",
    source: "lead_conversion",
    lead_id: event.recordId,
    converted_at: new Date().toISOString(),
  };

  if (data.company_name) customerData.company_name = data.company_name;
  if (data.address) customerData.address = data.address;
  if (data.city) customerData.city = data.city;
  if (data.industry) customerData.industry = data.industry;
  if (data.notes) customerData.notes = data.notes;
  if (data.contact_name) customerData.contact_name = data.contact_name;
  if (data.website) customerData.website = data.website;

  const [newCustomer] = await db
    .insert(entityRecordsTable)
    .values({
      entityId: customerEntity.id,
      data: customerData,
      status: "active",
    })
    .returning();

  let financeRecordId: number | null = null;
  const financeEntity = await findEntityBySlugs([
    "accounts_receivable", "receivable", "ar", "customer_account", "finance_account",
  ]);
  if (financeEntity) {
    const [financeRecord] = await db
      .insert(entityRecordsTable)
      .values({
        entityId: financeEntity.id,
        data: {
          customer_id: newCustomer.id,
          customer_name: customerData.name,
          email: customerData.email,
          phone: customerData.phone,
          source: "lead_conversion",
          lead_id: event.recordId,
          balance: 0,
          credit_limit: 0,
          payment_terms: "net30",
          created_at: new Date().toISOString(),
        },
        status: "active",
      })
      .returning();
    financeRecordId = financeRecord.id;
  }

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "ליד הומר ללקוח",
    message: `ליד "${data.name || data.company_name || ""}" הומר ללקוח חדש #${newCustomer.id}${financeRecordId ? ` + חשבון פיננסי #${financeRecordId}` : ""}`,
    recordId: event.recordId,
  });

  addSyncResult({
    handler: "lead_to_customer",
    success: true,
    details: { leadId: event.recordId, customerId: newCustomer.id, financeRecordId },
    timestamp: new Date().toISOString(),
  });
}

async function handleEmployeeStatusChange(event: RecordEvent): Promise<void> {
  const data = event.data;
  const newStatus = event.status;
  const oldStatus = event.oldStatus;

  if (!newStatus || newStatus === oldStatus) return;

  let accessLevel = "active";
  let permissionAction = "";

  if (newStatus === "terminated" || newStatus === "fired" || newStatus === "resigned" || newStatus === "inactive") {
    accessLevel = "disabled";
    permissionAction = "revoked";
  } else if (newStatus === "on_leave" || newStatus === "suspended") {
    accessLevel = "suspended";
    permissionAction = "suspended";
  } else if (newStatus === "active" || newStatus === "hired") {
    accessLevel = "active";
    permissionAction = "granted";
  }

  const [existing] = await db
    .select()
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.id, event.recordId));

  if (existing) {
    const currentData = (existing.data as Record<string, any>) || {};
    await db
      .update(entityRecordsTable)
      .set({
        data: {
          ...currentData,
          access_level: accessLevel,
          access_updated_at: new Date().toISOString(),
          access_updated_reason: `Status changed from ${oldStatus} to ${newStatus}`,
        },
        updatedAt: new Date(),
      })
      .where(eq(entityRecordsTable.id, event.recordId));
  }

  const employeeEmail = data.email || data.work_email;
  const employeeUserId = data.user_id || data.system_user_id;
  let permissionUpdated = false;

  if (employeeUserId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(employeeUserId)));
    if (user) {
      const isActive = accessLevel === "active";
      await db
        .update(usersTable)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      permissionUpdated = true;
    } else {
      console.warn(`[CrossModuleSync] Employee user_id ${employeeUserId} not found in users table for permission update`);
    }
  }

  const permissionEntity = await findEntityBySlugs([
    "user_permission", "permission", "access_control", "user_access",
  ]);
  if (permissionEntity) {
    const permRecords = await db
      .select()
      .from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, permissionEntity.id));

    const employeePermission = permRecords.find((r) => {
      const rd = r.data as Record<string, any>;
      return rd.employee_id === event.recordId || rd.user_id === (data.user_id || data.system_user_id);
    });

    if (employeePermission) {
      const permData = employeePermission.data as Record<string, any>;
      await db
        .update(entityRecordsTable)
        .set({
          data: {
            ...permData,
            access_level: accessLevel,
            updated_by: "system_sync",
            updated_at: new Date().toISOString(),
            reason: `Employee status changed to ${newStatus}`,
          },
          status: accessLevel === "disabled" ? "revoked" : accessLevel === "suspended" ? "suspended" : "active",
          updatedAt: new Date(),
        })
        .where(eq(entityRecordsTable.id, employeePermission.id));
      permissionUpdated = true;
    } else if (accessLevel === "active") {
      await db
        .insert(entityRecordsTable)
        .values({
          entityId: permissionEntity.id,
          data: {
            employee_id: event.recordId,
            employee_name: data.name || data.full_name || "",
            user_id: data.user_id || data.system_user_id || null,
            access_level: accessLevel,
            role: data.role || data.position || "employee",
            granted_at: new Date().toISOString(),
          },
          status: "active",
        });
      permissionUpdated = true;
    }
  }

  const employeeName = data.name || data.full_name || data.first_name || "";

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "עדכון הרשאות עובד",
    message: `הרשאות ${permissionAction === "revoked" ? "בוטלו" : permissionAction === "suspended" ? "הושעו" : "הופעלו"} עבור "${employeeName}" (סטטוס: ${newStatus})`,
    recordId: event.recordId,
  });

  addSyncResult({
    handler: "employee_status_change",
    success: true,
    details: {
      employeeId: event.recordId,
      oldStatus,
      newStatus,
      accessLevel,
      permissionAction,
      permissionUpdated,
    },
    timestamp: new Date().toISOString(),
  });
}

async function handleSupplierInvoiceReceived(event: RecordEvent): Promise<void> {
  const data = event.data;

  const apEntity = await findEntityBySlugs([
    "accounts_payable",
    "payable",
    "ap",
    "supplier_payment",
    "vendor_payment",
  ]);

  const amount = Number(data.amount || data.total || data.total_amount || data.invoice_amount || 0);
  const supplierId = data.supplier_id || data.vendor_id;
  const supplierName = data.supplier_name || data.vendor_name || "";
  const invoiceNumber = data.invoice_number || data.invoice_no || `INV-${event.recordId}`;
  const dueDate = data.due_date || data.payment_due_date;

  if (apEntity && amount > 0) {
    const existingPayables = await db
      .select()
      .from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, apEntity.id));

    const alreadySynced = existingPayables.find((r) => {
      const rd = r.data as Record<string, any>;
      return rd.source_record_id === event.recordId;
    });
    if (alreadySynced) {
      addSyncResult({
        handler: "supplier_invoice_to_ap",
        success: true,
        details: { invoiceId: event.recordId, action: "skipped_duplicate" },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const payableData: Record<string, any> = {
      supplier_id: supplierId,
      supplier_name: supplierName,
      invoice_number: invoiceNumber,
      amount,
      currency: data.currency || "ILS",
      due_date: dueDate,
      source_record_id: event.recordId,
      created_from: "supplier_invoice_sync",
    };

    if (data.description) payableData.description = data.description;
    if (data.po_number) payableData.po_number = data.po_number;
    if (data.tax_amount) payableData.tax_amount = data.tax_amount;

    const [newPayable] = await db
      .insert(entityRecordsTable)
      .values({
        entityId: apEntity.id,
        data: payableData,
        status: "pending",
      })
      .returning();

    await db.insert(notificationsTable).values({
      type: "sync_update",
      title: "חשבונית ספק → חשבונות זכאים",
      message: `חשבונית ${invoiceNumber} מ-${supplierName} (₪${amount.toLocaleString("he-IL")}) נוספה לחשבונות זכאים`,
      recordId: event.recordId,
    });

    addSyncResult({
      handler: "supplier_invoice_to_ap",
      success: true,
      details: {
        invoiceId: event.recordId,
        payableId: newPayable.id,
        amount,
        supplierName,
      },
      timestamp: new Date().toISOString(),
    });
  } else {
    await db.insert(notificationsTable).values({
      type: "sync_update",
      title: "חשבונית ספק חדשה",
      message: `חשבונית ${invoiceNumber} מ-${supplierName} (₪${amount.toLocaleString("he-IL")}) התקבלה`,
      recordId: event.recordId,
    });

    addSyncResult({
      handler: "supplier_invoice_to_ap",
      success: true,
      details: { invoiceId: event.recordId, action: "notification_only", reason: "no_ap_entity" },
      timestamp: new Date().toISOString(),
    });
  }
}

async function handleSalesOrderApproved(event: RecordEvent): Promise<void> {
  const data = event.data;

  const invoiceEntity = await findEntityBySlugs(["invoice", "invoices", "sales_invoice"]);
  if (!invoiceEntity) return;

  const existingInvoices = await db
    .select()
    .from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, invoiceEntity.id));

  const alreadySynced = existingInvoices.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_order_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({
      handler: "sales_order_to_invoice",
      success: true,
      details: { orderId: event.recordId, action: "skipped_duplicate" },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const amount = Number(data.total || data.amount || data.total_amount || 0);
  const customerName = data.customer_name || data.client_name || "";
  const customerId = data.customer_id || data.client_id;

  if (amount <= 0) return;

  const invoiceData: Record<string, any> = {
    customer_name: customerName,
    customer_id: customerId,
    amount,
    currency: data.currency || "ILS",
    source_order_id: event.recordId,
    created_from: "sales_order_sync",
    issue_date: new Date().toISOString(),
  };

  if (data.items) invoiceData.items = data.items;
  if (data.tax_amount) invoiceData.tax_amount = data.tax_amount;
  if (data.payment_terms) invoiceData.payment_terms = data.payment_terms;
  if (data.description) invoiceData.description = data.description;

  const [newInvoice] = await db
    .insert(entityRecordsTable)
    .values({
      entityId: invoiceEntity.id,
      data: invoiceData,
      status: "draft",
    })
    .returning();

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "הזמנת מכירה → חשבונית",
    message: `חשבונית חדשה #${newInvoice.id} נוצרה מהזמנה #${event.recordId} (${customerName}, ₪${amount.toLocaleString("he-IL")})`,
    recordId: event.recordId,
  });

  addSyncResult({
    handler: "sales_order_to_invoice",
    success: true,
    details: { orderId: event.recordId, invoiceId: newInvoice.id, amount },
    timestamp: new Date().toISOString(),
  });
}

async function handleQuotationApproved(event: RecordEvent): Promise<void> {
  const data = event.data;
  const soEntity = await findEntityBySlugs(["sales_order", "sales_orders", "order", "orders"]);
  if (!soEntity) return;

  const existingSOs = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, soEntity.id));
  const alreadySynced = existingSOs.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_quote_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({ handler: "quotation_to_sales_order", success: true, details: { quoteId: event.recordId, action: "skipped_duplicate" }, timestamp: new Date().toISOString() });
    return;
  }

  const soData: Record<string, any> = {
    customer_id: data.customer_id || data.client_id,
    customer_name: data.customer_name || data.client_name || "",
    items: data.items || [],
    total_amount: Number(data.total || data.amount || data.total_amount || 0),
    currency: data.currency || "ILS",
    source_quote_id: event.recordId,
    quote_number: data.quote_number || data.number || "",
    payment_terms: data.payment_terms || "net30",
    delivery_date: data.delivery_date || data.due_date,
    notes: data.notes || "",
    created_from: "quotation_conversion",
  };

  const [newSO] = await db.insert(entityRecordsTable).values({ entityId: soEntity.id, data: soData, status: "draft" }).returning();

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "הצעת מחיר → הזמנת מכירה",
    message: `הצעה #${event.recordId} אושרה ונוצרה הזמנת מכירה #${newSO.id} (${soData.customer_name})`,
    recordId: event.recordId,
  });

  addSyncResult({ handler: "quotation_to_sales_order", success: true, details: { quoteId: event.recordId, salesOrderId: newSO.id, amount: soData.total_amount }, timestamp: new Date().toISOString() });
}

async function handleSalesOrderToProject(event: RecordEvent): Promise<void> {
  const data = event.data;
  const projectEntity = await findEntityBySlugs(["project", "projects"]);
  if (!projectEntity) return;

  const existingProjects = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, projectEntity.id));
  const alreadySynced = existingProjects.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_order_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({ handler: "sales_order_to_project", success: true, details: { orderId: event.recordId, action: "skipped_duplicate" }, timestamp: new Date().toISOString() });
    return;
  }

  const projectData: Record<string, any> = {
    project_name: `פרויקט - ${data.customer_name || data.client_name || ""} #${event.recordId}`,
    customer_id: data.customer_id || data.client_id,
    customer_name: data.customer_name || data.client_name || "",
    source_order_id: event.recordId,
    budget: Number(data.total || data.amount || data.total_amount || 0),
    items: data.items || [],
    delivery_date: data.delivery_date || data.due_date,
    address: data.address || data.delivery_address || data.site_address || "",
    created_from: "sales_order_sync",
    completion_pct: 0,
  };

  const [newProject] = await db.insert(entityRecordsTable).values({ entityId: projectEntity.id, data: projectData, status: "active" }).returning();

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "הזמנת מכירה → פרויקט",
    message: `פרויקט חדש #${newProject.id} נוצר מהזמנה #${event.recordId} (${projectData.customer_name})`,
    recordId: event.recordId,
  });

  addSyncResult({ handler: "sales_order_to_project", success: true, details: { orderId: event.recordId, projectId: newProject.id }, timestamp: new Date().toISOString() });
}

async function handleWorkOrderToDelivery(event: RecordEvent): Promise<void> {
  const data = event.data;
  const deliveryEntity = await findEntityBySlugs(["delivery_note", "delivery_notes", "deliveries"]);
  if (!deliveryEntity) return;

  const existingDeliveries = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, deliveryEntity.id));
  const alreadySynced = existingDeliveries.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_work_order_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({ handler: "work_order_to_delivery", success: true, details: { workOrderId: event.recordId, action: "skipped_duplicate" }, timestamp: new Date().toISOString() });
    return;
  }

  const deliveryData: Record<string, any> = {
    source_work_order_id: event.recordId,
    source_order_id: data.sales_order_id || data.order_id,
    customer_id: data.customer_id || data.client_id,
    customer_name: data.customer_name || data.client_name || "",
    items: data.items || data.products || [],
    delivery_address: data.address || data.delivery_address || data.site_address || "",
    created_from: "work_order_completion",
  };

  const [newDelivery] = await db.insert(entityRecordsTable).values({ entityId: deliveryEntity.id, data: deliveryData, status: "pending" }).returning();

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "פקודת עבודה הושלמה → תעודת משלוח",
    message: `תעודת משלוח #${newDelivery.id} נוצרה מפקודת עבודה #${event.recordId}`,
    recordId: event.recordId,
  });

  addSyncResult({ handler: "work_order_to_delivery", success: true, details: { workOrderId: event.recordId, deliveryId: newDelivery.id }, timestamp: new Date().toISOString() });
}

async function handleDeliveryToInstallation(event: RecordEvent): Promise<void> {
  const data = event.data;
  const installEntity = await findEntityBySlugs(["installation", "installations", "installation_order"]);
  if (!installEntity) return;

  const existingInstalls = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, installEntity.id));
  const alreadySynced = existingInstalls.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_delivery_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({ handler: "delivery_to_installation", success: true, details: { deliveryId: event.recordId, action: "skipped_duplicate" }, timestamp: new Date().toISOString() });
    return;
  }

  const installData: Record<string, any> = {
    source_delivery_id: event.recordId,
    source_order_id: data.source_order_id || data.order_id,
    customer_id: data.customer_id || data.client_id,
    customer_name: data.customer_name || data.client_name || "",
    items: data.items || [],
    site_address: data.delivery_address || data.address || "",
    created_from: "delivery_completion",
  };

  const [newInstall] = await db.insert(entityRecordsTable).values({ entityId: installEntity.id, data: installData, status: "scheduled" }).returning();

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "תעודת משלוח → הזמנת התקנה",
    message: `הזמנת התקנה #${newInstall.id} נוצרה מתעודת משלוח #${event.recordId} (${installData.customer_name})`,
    recordId: event.recordId,
  });

  addSyncResult({ handler: "delivery_to_installation", success: true, details: { deliveryId: event.recordId, installationId: newInstall.id }, timestamp: new Date().toISOString() });
}

async function handleInstallationCompleted(event: RecordEvent): Promise<void> {
  const data = event.data;

  const invoiceEntity = await findEntityBySlugs(["invoice", "invoices", "sales_invoice"]);
  if (!invoiceEntity) return;

  const existingInvoices = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, invoiceEntity.id));
  const alreadySynced = existingInvoices.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_installation_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({ handler: "installation_to_invoice", success: true, details: { installationId: event.recordId, action: "skipped_duplicate" }, timestamp: new Date().toISOString() });
    return;
  }

  const amount = Number(data.total || data.amount || data.total_amount || data.invoice_amount || 0);
  if (amount <= 0) {
    addSyncResult({ handler: "installation_to_invoice", success: true, details: { installationId: event.recordId, action: "skipped_no_amount" }, timestamp: new Date().toISOString() });
    return;
  }

  const invoiceData: Record<string, any> = {
    customer_id: data.customer_id || data.client_id,
    customer_name: data.customer_name || data.client_name || "",
    amount,
    currency: data.currency || "ILS",
    source_installation_id: event.recordId,
    source_order_id: data.source_order_id || data.order_id,
    items: data.items || [],
    description: `חשבונית סופית - התקנה #${event.recordId}`,
    created_from: "installation_completion",
    issue_date: new Date().toISOString(),
  };

  const [newInvoice] = await db.insert(entityRecordsTable).values({ entityId: invoiceEntity.id, data: invoiceData, status: "draft" }).returning();

  await db.insert(notificationsTable).values({
    type: "sync_update",
    title: "התקנה הושלמה → חשבונית",
    message: `חשבונית #${newInvoice.id} נוצרה מהשלמת התקנה #${event.recordId} (${invoiceData.customer_name}, ₪${amount.toLocaleString("he-IL")})`,
    recordId: event.recordId,
  });

  addSyncResult({ handler: "installation_to_invoice", success: true, details: { installationId: event.recordId, invoiceId: newInvoice.id, amount }, timestamp: new Date().toISOString() });
}

async function handleWorkOrderQCFailed(event: RecordEvent): Promise<void> {
  const data = event.data;
  const ncrEntity = await findEntityBySlugs(["non_conformance", "non_conformance_report", "ncr", "quality_issue"]);
  if (!ncrEntity) return;

  const existingNCRs = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, ncrEntity.id));
  const alreadySynced = existingNCRs.find((r) => {
    const rd = r.data as Record<string, any>;
    return rd.source_work_order_id === event.recordId;
  });
  if (alreadySynced) {
    addSyncResult({ handler: "qc_failure_to_ncr", success: true, details: { workOrderId: event.recordId, action: "skipped_duplicate" }, timestamp: new Date().toISOString() });
    return;
  }

  const ncrData: Record<string, any> = {
    source_work_order_id: event.recordId,
    work_order_number: data.order_number || data.wo_number || "",
    product_name: data.product_name || data.item_name || "",
    defect_description: data.quality_notes || data.defect_notes || data.rejection_reason || "",
    detected_by: data.inspector || data.checked_by || "מערכת",
    severity: data.severity || "medium",
    created_from: "qc_failure_sync",
  };

  const [newNCR] = await db.insert(entityRecordsTable).values({ entityId: ncrEntity.id, data: ncrData, status: "open" }).returning();

  await db.insert(notificationsTable).values({
    type: "quality_alert",
    title: "כשל בדיקת איכות → NCR",
    message: `דוח אי-התאמה #${newNCR.id} נפתח מפקודת עבודה #${event.recordId}`,
    recordId: event.recordId,
  });

  addSyncResult({ handler: "qc_failure_to_ncr", success: true, details: { workOrderId: event.recordId, ncrId: newNCR.id }, timestamp: new Date().toISOString() });
}

async function handleInventoryLowStock(event: RecordEvent): Promise<void> {
  const data = event.data;

  const currentQty = Number(data.quantity || data.stock_quantity || data.available_quantity || 0);
  const minQty = Number(data.min_quantity || data.reorder_point || data.minimum_stock || 0);

  if (minQty <= 0 || currentQty > minQty) return;

  const itemName = data.name || data.item_name || data.product_name || "";

  await db.insert(notificationsTable).values({
    type: "low_stock_alert",
    title: "התראת מלאי נמוך",
    message: `פריט "${itemName}" ירד מתחת לרמת המינימום (נוכחי: ${currentQty}, מינימום: ${minQty})`,
    recordId: event.recordId,
  });

  addSyncResult({
    handler: "inventory_low_stock",
    success: true,
    details: { itemId: event.recordId, currentQty, minQty, itemName },
    timestamp: new Date().toISOString(),
  });
}

const entitySlugCache = new Map<number, string>();

async function getEntitySlug(entityId: number): Promise<string | null> {
  if (entitySlugCache.has(entityId)) {
    return entitySlugCache.get(entityId)!;
  }
  const [entity] = await db
    .select({ slug: moduleEntitiesTable.slug })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.id, entityId));
  if (entity) {
    entitySlugCache.set(entityId, entity.slug);
    return entity.slug;
  }
  return null;
}

export function initializeCrossModuleSync(): void {
  eventBus.on("record.status_changed", async (event: RecordEvent) => {
    try {
      const slug = await getEntitySlug(event.entityId);
      if (!slug) return;

      if (
        (slug === "purchase_order" || slug === "po" || slug === "purchase_orders") &&
        (event.status === "approved" || event.status === "received")
      ) {
        await handlePurchaseOrderApproved(event);
      }

      if (
        (slug === "lead" || slug === "leads") &&
        (event.status === "converted" || event.status === "won" || event.status === "customer")
      ) {
        await handleLeadConvertedToCustomer(event);
      }

      if (
        slug === "employee" || slug === "employees" || slug === "staff"
      ) {
        await handleEmployeeStatusChange(event);
      }

      if (
        (slug === "sales_order" || slug === "order" || slug === "sales_orders") &&
        (event.status === "approved" || event.status === "confirmed")
      ) {
        await handleSalesOrderApproved(event);
        await handleSalesOrderToProject(event);
      }

      if (
        (slug === "quotation" || slug === "quotations" || slug === "quote" || slug === "quotes" || slug === "price_quote" || slug === "price_quotes") &&
        (event.status === "approved" || event.status === "accepted" || event.status === "won")
      ) {
        await handleQuotationApproved(event);
      }

      if (
        (slug === "work_order" || slug === "work_orders" || slug === "production_order" || slug === "production_work_order") &&
        (event.status === "completed" || event.status === "done" || event.status === "finished")
      ) {
        await handleWorkOrderToDelivery(event);
      }

      if (
        (slug === "work_order" || slug === "work_orders" || slug === "production_order") &&
        (event.status === "failed" || event.status === "rejected" || event.status === "qc_failed")
      ) {
        await handleWorkOrderQCFailed(event);
      }

      if (
        (slug === "delivery_note" || slug === "delivery_notes" || slug === "deliveries") &&
        (event.status === "delivered" || event.status === "completed")
      ) {
        await handleDeliveryToInstallation(event);
      }

      if (
        (slug === "installation" || slug === "installations" || slug === "installation_order") &&
        (event.status === "completed" || event.status === "done" || event.status === "finished")
      ) {
        await handleInstallationCompleted(event);
      }
    } catch (err) {
      console.error("[CrossModuleSync] Error handling status_changed:", err);
      addSyncResult({
        handler: "status_changed_handler",
        success: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  eventBus.on("record.created", async (event: RecordEvent) => {
    try {
      const slug = await getEntitySlug(event.entityId);
      if (!slug) return;

      if (
        slug === "supplier_invoice" || slug === "vendor_invoice" || slug === "supplier_invoices"
      ) {
        await handleSupplierInvoiceReceived(event);
      }
    } catch (err) {
      console.error("[CrossModuleSync] Error handling record.created:", err);
      addSyncResult({
        handler: "created_handler",
        success: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  eventBus.on("record.updated", async (event: RecordEvent) => {
    try {
      const slug = await getEntitySlug(event.entityId);
      if (!slug) return;

      if (
        slug === "inventory" || slug === "inventory_item" || slug === "stock" || slug === "raw_material"
      ) {
        await handleInventoryLowStock(event);
      }
    } catch (err) {
      console.error("[CrossModuleSync] Error handling record.updated:", err);
      addSyncResult({
        handler: "updated_handler",
        success: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ─── Project task status change → auto-sync linked production work orders ────
  // When a project_task entity record is updated, propagate task completion
  // back to linked production_work_orders (task → WO direction of bidirectional sync).
  // Resolves links using the stable project_task_id from the entity record data field,
  // then looks up project_work_order_links by that ID — never by mutable title.
  eventBus.on("record.updated", async (event: RecordEvent) => {
    const slug = await getEntitySlug(event.entityId).catch(() => null);
    if (!slug) return;
    if (slug !== "project_task" && slug !== "project_tasks") return;

    const data = event.data;
    const taskStatus = data.status || event.status;
    const taskCompletion = Number(data.completion_percent ?? data.completion_percentage ?? (taskStatus === "done" ? 100 : null));

    // Resolve stable project task DB id from event payload.
    // Check all known field names where the raw project_tasks.id may be stored.
    const projectTaskId: number | null =
      Number(data.task_id || data.project_task_id || data.id) || null;
    if (!projectTaskId || !Number.isFinite(taskCompletion)) {
      // Missing stable task ID — fail closed, log and skip rather than guess
      if (taskStatus) {
        addSyncResult({
          handler: "project_task_to_work_orders",
          success: false,
          error: "Missing stable task_id in event payload — sync skipped",
          details: { eventRecordId: event.recordId, taskStatus },
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    // Map task status to WO status
    const woStatus =
      taskStatus === "done" ? "completed" :
      taskStatus === "in-progress" || taskStatus === "in_progress" ? "in_progress" :
      "planned";
    const woCompletion = taskStatus === "done" ? 100 : taskCompletion;

    try {
      // Resolve links strictly by stable project_task_id from the link join table
      const { rows: links } = await pool.query(
        `SELECT pwl.id AS link_id, pwl.work_order_id
         FROM project_work_order_links pwl
         WHERE pwl.project_task_id = $1`,
        [projectTaskId]
      );
      for (const link of links) {
        await pool.query(
          `UPDATE production_work_orders
           SET status = $1, completion_percentage = $2, updated_at = NOW()
           WHERE id = $3
             AND (status != 'completed' OR $1 = 'completed')`,
          [woStatus, woCompletion, link.work_order_id]
        );
        await pool.query(
          `UPDATE project_work_order_links SET sync_status = 'synced', last_synced_at = NOW()
           WHERE id = $1`,
          [link.link_id]
        );
      }
      if (links.length > 0) {
        addSyncResult({
          handler: "project_task_to_work_orders",
          success: true,
          details: { projectTaskId, woStatus, woCompletion, woUpdated: links.length },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      addSyncResult({
        handler: "project_task_to_work_orders",
        success: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ─── Work order status change → auto-sync linked project tasks ──────────────
  // When a production_work_order is updated via the entity record system,
  // propagate completion and status to linked project_tasks automatically.
  // Also updates production_work_orders table directly for raw-SQL WO updates.
  eventBus.on("record.updated", async (event: RecordEvent) => {
    const slug = await getEntitySlug(event.entityId).catch(() => null);
    if (!slug) return;
    if (
      slug !== "work_order" &&
      slug !== "work_orders" &&
      slug !== "production_order" &&
      slug !== "production_work_order"
    ) return;

    const data = event.data;
    const woStatus = data.status || event.status;
    const woCompletion = Number(data.completion_percentage ?? data.completion_pct ?? (woStatus === "completed" ? 100 : null));

    // Resolve stable production_work_orders.id first (direct id from payload),
    // then fall back to order_number (stable unique business key) if available.
    const directWoId: number | null = Number(data.work_order_id || data.id) || null;
    const orderNumber: string | null = data.order_number || data.wo_number || null;
    if (!directWoId && !orderNumber) {
      addSyncResult({
        handler: "work_order_to_project_tasks",
        success: false,
        error: "Missing stable work_order_id or order_number in event payload — sync skipped",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      const whereClause = directWoId
        ? "wo.id = $1"
        : "wo.order_number = $1";
      const whereVal = directWoId || orderNumber;
      const { rows: links } = await pool.query(
        `SELECT pwl.id, pwl.project_task_id, pt.project_id
         FROM project_work_order_links pwl
         JOIN production_work_orders wo ON wo.id = pwl.work_order_id
         JOIN project_tasks pt ON pt.id = pwl.project_task_id
         WHERE ${whereClause}`,
        [whereVal]
      );

      let synced = 0;
      const projectIds = new Set<number>();
      for (const link of links) {
        const taskStatus =
          woStatus === "completed" || woStatus === "done" || woStatus === "finished" ? "done" :
          woStatus === "in_progress" || woStatus === "in-progress" || woStatus === "started" || woStatus === "active" ? "in-progress" :
          woStatus === "cancelled" || woStatus === "canceled" ? "cancelled" :
          woStatus === "on_hold" || woStatus === "paused" ? "on-hold" :
          "todo";
        const taskCompletion =
          taskStatus === "done" ? 100 :
          Number.isFinite(woCompletion) ? woCompletion : null;

        if (taskCompletion !== null) {
          await pool.query(
            `UPDATE project_tasks SET status = $1, completion_percent = $2, updated_at = NOW() WHERE id = $3`,
            [taskStatus, taskCompletion, link.project_task_id]
          );
          await pool.query(
            `UPDATE project_work_order_links SET sync_status = 'synced', last_synced_at = NOW() WHERE id = $1`,
            [link.id]
          );
          synced++;
        }
        if (link.project_id) projectIds.add(link.project_id);
      }

      for (const projectId of projectIds) {
        const { rows: tasks } = await pool.query(
          `SELECT pt.id, pt.completion_percent, pt.status,
                  COALESCE((
                    SELECT MAX(wo2.completion_percentage)
                    FROM project_work_order_links pwl2
                    JOIN production_work_orders wo2 ON wo2.id = pwl2.work_order_id
                    WHERE pwl2.project_task_id = pt.id
                  ), NULL) AS wo_completion
           FROM project_tasks pt WHERE pt.project_id = $1`,
          [projectId]
        );
        if (!tasks.length) continue;
        const completions = tasks.map((t: any) => {
          const base = t.status === "done" ? 100 : parseFloat(t.completion_percent || "0");
          const wo = t.wo_completion !== null ? parseFloat(t.wo_completion || "0") : null;
          return wo !== null ? Math.max(base, wo) : base;
        });
        const avg = Math.round(completions.reduce((s: number, v: number) => s + v, 0) / completions.length);
        await pool.query(`UPDATE projects SET completion_pct = $1, updated_at = NOW() WHERE id = $2`, [avg, projectId]);
      }

      if (synced > 0) {
        addSyncResult({
          handler: "work_order_to_project_tasks",
          success: true,
          details: { orderNumber, synced, projectsUpdated: projectIds.size },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      addSyncResult({
        handler: "work_order_to_project_tasks",
        success: false,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  console.log("[CrossModuleSync] Initialized - cross-module data synchronization active");
}
