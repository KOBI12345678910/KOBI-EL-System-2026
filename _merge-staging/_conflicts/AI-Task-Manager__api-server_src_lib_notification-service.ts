import { db, backgroundPool } from "@workspace/db";
import {
  notificationsTable,
  notificationPreferencesTable,
  rawMaterialsTable,
} from "@workspace/db/schema";
import { drizzle as makeDrizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

type AnyDb = NodePgDatabase<typeof schema>;

const triggerDbStorage = new AsyncLocalStorage<AnyDb>();

function getDb(): AnyDb {
  return (triggerDbStorage.getStore() ?? db) as AnyDb;
}

function extractRows(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown[] }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  if (Array.isArray(result)) return result;
  return [];
}

const PRIORITY_LEVELS: Record<string, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

const DEDUP_WINDOW_HOURS = 24;

async function isDuplicate(type: string, userId: number | null, dedupeKey?: string): Promise<boolean> {
  if (!dedupeKey) return false;
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
  const conditions = [
    eq(notificationsTable.type, type),
    sql`${notificationsTable.createdAt} > ${windowStart}`,
    sql`${notificationsTable.metadata}->>'dedupeKey' = ${dedupeKey}`,
  ];
  if (userId) {
    conditions.push(eq(notificationsTable.userId, userId));
  }
  const [existing] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(...conditions));
  return (existing?.count || 0) > 0;
}

export interface CreateNotificationParams {
  type: string;
  title: string;
  message: string;
  userId?: number | null;
  priority?: "low" | "normal" | "high" | "critical";
  category?: "anomaly" | "task" | "approval" | "system" | "workflow";
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  moduleId?: number | null;
  recordId?: number | null;
  dedupeKey?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  const {
    type,
    title,
    message,
    userId = null,
    priority = "normal",
    category = "system",
    actionUrl = null,
    metadata = null,
    moduleId = null,
    recordId = null,
    dedupeKey,
  } = params;

  if (dedupeKey) {
    const dup = await isDuplicate(type, userId, dedupeKey);
    if (dup) return null;
  }

  if (userId) {
    const prefs = await getDb()
      .select()
      .from(notificationPreferencesTable)
      .where(
        and(
          eq(notificationPreferencesTable.userId, userId),
          eq(notificationPreferencesTable.category, category)
        )
      )
      .limit(1);

    if (prefs.length > 0) {
      const pref = prefs[0];
      if (!pref.enabled) return null;
      const minLevel = PRIORITY_LEVELS[pref.minPriority] ?? 0;
      const currentLevel = PRIORITY_LEVELS[priority] ?? 1;
      if (currentLevel < minLevel) return null;
    }
  }

  const finalMetadata = dedupeKey
    ? { ...(metadata || {}), dedupeKey }
    : metadata;

  const [notification] = await getDb()
    .insert(notificationsTable)
    .values({
      type,
      title,
      message,
      userId,
      priority,
      category,
      actionUrl,
      metadata: finalMetadata,
      moduleId,
      recordId,
    })
    .returning();

  if (notification) {
    const { dispatchNotification } = await import("./notification-dispatcher");
    dispatchNotification({
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      category: notification.category,
      userId: notification.userId,
      actionUrl: notification.actionUrl,
    }).catch((err) => console.error("[NotificationService] Dispatch error:", err));
  }

  return notification;
}

export async function createNotificationForAllUsers(
  params: Omit<CreateNotificationParams, "userId">
) {
  const { usersTable } = await import("@workspace/db/schema");
  const users = await getDb().select({ id: usersTable.id }).from(usersTable);

  const results = [];
  for (const user of users) {
    const result = await createNotification({ ...params, userId: user.id });
    if (result) results.push(result);
  }
  return results;
}

let _roleTablesAvailable: boolean | null = null;
let _roleTablesCheckedAt = 0;
const ROLE_TABLES_TTL_MS = 5 * 60 * 1000;

async function checkRoleTablesAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_roleTablesAvailable !== null && now - _roleTablesCheckedAt < ROLE_TABLES_TTL_MS) {
    return _roleTablesAvailable;
  }
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('user_role_assignments', 'roles')
    `);
    const cnt = Number((extractRows(result)[0] as Record<string, unknown>)?.cnt ?? 0);
    _roleTablesAvailable = cnt >= 2;
    _roleTablesCheckedAt = now;
  } catch {
    _roleTablesAvailable = false;
    _roleTablesCheckedAt = now;
  }
  return _roleTablesAvailable;
}

export async function createNotificationForSuperAdmins(
  params: Omit<CreateNotificationParams, "userId">
) {
  try {
    const { usersTable } = await import("@workspace/db/schema");
    const { eq: eqFn } = await import("drizzle-orm");
    const admins = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eqFn(usersTable.isSuperAdmin, true));

    const results = [];
    for (const admin of admins) {
      const result = await createNotification({ ...params, userId: admin.id });
      if (result) results.push(result);
    }
    return results;
  } catch (err) {
    console.error("[NotificationService] createNotificationForSuperAdmins error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function createNotificationForRole(
  roleName: string,
  params: Omit<CreateNotificationParams, "userId">
) {
  let roleUsers: Record<string, unknown>[] = [];
  try {
    const tablesAvailable = await checkRoleTablesAvailable();
    if (!tablesAvailable) {
      return createNotificationForAllUsers(params);
    }
    roleUsers = extractRows(
      await getDb().execute(
        sql`SELECT DISTINCT ra.user_id FROM role_assignments ra
            JOIN platform_roles pr ON pr.id = ra.role_id
            WHERE pr.name = ${roleName} OR pr.name_he = ${roleName}`
      )
    );
  } catch {
    return createNotificationForSuperAdmins(params);
  }

  if (roleUsers.length === 0) {
    return createNotificationForSuperAdmins(params);
  }

  const results = [];
  for (const row of roleUsers) {
    const userId = Number(row.user_id);
    if (userId) {
      const result = await createNotification({ ...params, userId });
      if (result) results.push(result);
    }
  }
  return results;
}

export async function checkBudgetAnomalies() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, budget_name, category, budgeted_amount, actual_amount FROM budgets WHERE budgeted_amount > 0`
    );
    const budgets = extractRows(result);

    for (const budget of budgets) {
      const spent = Number(budget.actual_amount || 0);
      const total = Number(budget.budgeted_amount || 0);
      if (total > 0 && spent / total > 0.9) {
        const percentage = Math.round((spent / total) * 100);
        await createNotificationForAllUsers({
          type: "budget_exceeded",
          title: `חריגת תקציב: ${budget.budget_name || budget.category}`,
          message: `נוצלו ${percentage}% מהתקציב (${spent.toLocaleString()} מתוך ${total.toLocaleString()})`,
          priority: percentage >= 100 ? "critical" : "high",
          category: "anomaly",
          actionUrl: "/finance/budgets",
          metadata: { budgetId: budget.id, percentage, spent, total },
          dedupeKey: `budget_${budget.id}`,
        });
      }
    }
  } catch (err) {
    console.error("[NotificationService] checkBudgetAnomalies error:", err);
  }
}

export async function checkLowInventory() {
  try {
    const materials = await getDb().select({
      id: rawMaterialsTable.id,
      materialName: rawMaterialsTable.materialName,
      currentStock: rawMaterialsTable.currentStock,
      minimumStock: rawMaterialsTable.minimumStock,
    }).from(rawMaterialsTable);

    for (const material of materials) {
      const qty = Number(material.currentStock ?? 0);
      const minQty = Number(material.minimumStock ?? 0);
      if (minQty > 0 && qty <= minQty) {
        await createNotificationForAllUsers({
          type: "low_inventory",
          title: `מלאי נמוך: ${material.materialName}`,
          message: `כמות נוכחית: ${qty}, מינימום נדרש: ${minQty}`,
          priority: qty === 0 ? "critical" : "high",
          category: "anomaly",
          actionUrl: "/raw-materials",
          metadata: { materialId: material.id, currentQty: qty, minQty },
          dedupeKey: `inventory_${material.id}`,
        });
      }
    }
  } catch (err) {
    console.error("[NotificationService] checkLowInventory error:", err);
  }
}

export async function checkOverdueApprovals(maxDays: number = 3) {
  try {
    const result = await getDb().execute(
      sql`SELECT id, created_at FROM approval_requests WHERE status = 'pending' AND created_at < NOW() - INTERVAL '${sql.raw(String(maxDays))} days'`
    );
    const overdue = extractRows(result);

    for (const request of overdue) {
      await createNotificationForAllUsers({
        type: "overdue_approval",
        title: `אישור ממתין מעל ${maxDays} ימים`,
        message: `בקשת אישור #${request.id} ממתינה לטיפול מאז ${new Date(String(request.created_at)).toLocaleDateString("he-IL")}`,
        priority: "high",
        category: "approval",
        actionUrl: "/purchase-approvals",
        metadata: { approvalRequestId: request.id },
        dedupeKey: `approval_${request.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOverdueApprovals error:", err);
  }
}

export async function checkOverdueTasks() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, entity_id, data FROM entity_records WHERE data->>'due_date' IS NOT NULL AND (data->>'due_date')::date < CURRENT_DATE LIMIT 50`
    );
    const overdueRecords = extractRows(result);

    for (const record of overdueRecords) {
      const data = (record.data as Record<string, unknown>) || {};
      const title = (data.title || data.name || data.subject || `רשומה #${record.id}`) as string;
      const dueDate = data.due_date as string | undefined;
      await createNotificationForAllUsers({
        type: "overdue_task",
        title: `משימה באיחור: ${title}`,
        message: `תאריך יעד: ${dueDate ? new Date(dueDate).toLocaleDateString("he-IL") : "לא ידוע"} — טרם הושלמה`,
        priority: "high",
        category: "task",
        actionUrl: `/builder/data/${record.entity_id}`,
        metadata: { recordId: record.id, entityId: record.entity_id, dueDate },
        dedupeKey: `task_${record.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOverdueTasks error:", err);
  }
}

export async function checkOverduePurchaseOrders() {
  try {
    const result = await getDb().execute(
      sql`SELECT po.id, po.order_number, po.expected_delivery, s.supplier_name
          FROM purchase_orders po
          LEFT JOIN suppliers s ON s.id = po.supplier_id
          WHERE po.status NOT IN ('received', 'cancelled', 'closed')
            AND po.expected_delivery IS NOT NULL
            AND po.expected_delivery < CURRENT_DATE
          LIMIT 50`
    );
    const overdue = extractRows(result);
    for (const po of overdue) {
      const daysLate = Math.floor((Date.now() - new Date(String(po.expected_delivery)).getTime()) / 86400000);
      await createNotificationForAllUsers({
        type: "overdue_purchase_order",
        title: `איחור הזמנת רכש: ${po.order_number || `#${po.id}`}`,
        message: `הזמנת רכש ${po.order_number || `#${po.id}`} מספק ${po.supplier_name || "לא ידוע"} באיחור של ${daysLate} ימים`,
        priority: daysLate > 7 ? "critical" : "high",
        category: "anomaly",
        actionUrl: "/purchase-orders",
        metadata: { poId: po.id, daysLate, expectedDelivery: po.expected_delivery },
        dedupeKey: `po_late_${po.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOverduePurchaseOrders error:", err);
  }
}

export async function checkOverdueWorkOrders() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, order_number, planned_end, status
          FROM production_work_orders
          WHERE status NOT IN ('completed', 'cancelled')
            AND planned_end IS NOT NULL
            AND planned_end < NOW()
          LIMIT 50`
    );
    const overdue = extractRows(result);
    for (const wo of overdue) {
      const daysLate = Math.floor((Date.now() - new Date(String(wo.planned_end)).getTime()) / 86400000);
      await createNotificationForAllUsers({
        type: "overdue_work_order",
        title: `איחור ייצור: פקודת עבודה ${wo.order_number || `#${wo.id}`}`,
        message: `פקודת עבודה ${wo.order_number || `#${wo.id}`} באיחור של ${daysLate} ימים מהלו"ז המתוכנן`,
        priority: daysLate > 5 ? "critical" : "high",
        category: "anomaly",
        actionUrl: "/production/work-orders",
        metadata: { workOrderId: wo.id, daysLate, plannedEnd: wo.planned_end },
        dedupeKey: `wo_late_${wo.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOverdueWorkOrders error:", err);
  }
}

export async function checkOverdueShipments() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, tracking_number, eta, carrier_name
          FROM shipment_tracking
          WHERE status NOT IN ('delivered', 'cancelled')
            AND eta IS NOT NULL
            AND eta < NOW()
          LIMIT 50`
    );
    const overdue = extractRows(result);
    for (const shipment of overdue) {
      const daysLate = Math.floor((Date.now() - new Date(String(shipment.eta)).getTime()) / 86400000);
      await createNotificationForAllUsers({
        type: "overdue_shipment",
        title: `איחור משלוח: ${shipment.tracking_number || `#${shipment.id}`}`,
        message: `משלוח ${shipment.tracking_number || `#${shipment.id}`} (${shipment.carrier_name || "לא ידוע"}) באיחור של ${daysLate} ימים`,
        priority: daysLate > 3 ? "critical" : "high",
        category: "anomaly",
        actionUrl: "/shipment-tracking",
        metadata: { shipmentId: shipment.id, daysLate, estimatedArrival: shipment.eta },
        dedupeKey: `shipment_late_${shipment.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOverdueShipments error:", err);
  }
}

export async function checkOpenNCRs() {
  try {
    const result = await getDb().execute(
      sql`SELECT COUNT(*)::int as count FROM entity_records er
          JOIN module_entities me ON me.id = er.entity_id
          WHERE me.slug = 'ncr'
            AND (er.data->>'status' IS NULL OR er.data->>'status' NOT IN ('closed', 'resolved'))
            AND er.created_at < NOW() - INTERVAL '3 days'`
    );
    const rows = extractRows(result);
    const count = Number(rows[0]?.count || 0);
    if (count > 0) {
      await createNotificationForAllUsers({
        type: "open_ncr",
        title: `חריגת איכות: ${count} אי-התאמות פתוחות`,
        message: `ישנן ${count} אי-התאמות (NCR) פתוחות מעל 3 ימים הדורשות טיפול`,
        priority: count > 5 ? "critical" : "high",
        category: "anomaly",
        actionUrl: "/builder/data/ncr",
        metadata: { openNcrCount: count },
        dedupeKey: `open_ncr_daily`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOpenNCRs error:", err);
  }
}

export async function checkOverdueInvoices() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, invoice_number, customer_name, COALESCE(balance_due, 0) as balance_due,
              due_date, (CURRENT_DATE - due_date) as days_overdue
          FROM accounts_receivable
          WHERE status IN ('open','partial','overdue')
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE - INTERVAL '7 days'
            AND COALESCE(balance_due, 0) > 0
          ORDER BY balance_due DESC
          LIMIT 20`
    );
    const overdue = extractRows(result);
    for (const inv of overdue) {
      const daysOverdue = Number(inv.days_overdue || 7);
      await createNotificationForAllUsers({
        type: "overdue_invoice",
        title: `חשבונית באיחור: ${inv.invoice_number || `#${inv.id}`}`,
        message: `חשבונית ${inv.invoice_number || `#${inv.id}`} של ${inv.customer_name || "לקוח"} — ₪${Number(inv.balance_due).toLocaleString()} באיחור של ${daysOverdue} ימים`,
        priority: daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "normal",
        category: "anomaly",
        actionUrl: "/finance/ar",
        metadata: { invoiceId: inv.id, daysOverdue, balanceDue: Number(inv.balance_due) },
        dedupeKey: `invoice_overdue_${inv.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkOverdueInvoices error:", err);
  }
}

export async function checkStockBelowReorderPoint() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, material_name, COALESCE(material_number,'') as sku,
              COALESCE(current_stock, 0) as current_stock,
              COALESCE(minimum_stock, 0) as reorder_point
          FROM raw_materials
          WHERE minimum_stock IS NOT NULL AND minimum_stock > 0
            AND COALESCE(current_stock, 0) <= minimum_stock
          ORDER BY current_stock ASC
          LIMIT 30`
    );
    const lowStock = extractRows(result);
    for (const item of lowStock) {
      const qty = Number(item.current_stock || 0);
      const reorder = Number(item.reorder_point || 0);
      await createNotificationForAllUsers({
        type: "stock_below_reorder",
        title: `מלאי מתחת לנקודת הזמנה: ${item.material_name}`,
        message: `${item.material_name}${item.sku ? ` (${item.sku})` : ""} — מלאי: ${qty}, נקודת הזמנה: ${reorder}`,
        priority: qty === 0 ? "critical" : "high",
        category: "anomaly",
        actionUrl: "/raw-materials",
        metadata: { materialId: item.id, currentStock: qty, reorderPoint: reorder },
        dedupeKey: `reorder_${item.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkStockBelowReorderPoint error:", err);
  }
}

export async function checkProjectsPastDeadline() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, project_name, COALESCE(project_number,'') as project_number,
              end_date, (CURRENT_DATE - end_date::date) as days_overdue,
              COALESCE(status,'') as status
          FROM projects
          WHERE status NOT IN ('completed','cancelled','closed','הושלם','בוטל')
            AND end_date IS NOT NULL
            AND end_date::date < CURRENT_DATE
          ORDER BY end_date ASC
          LIMIT 20`
    );
    const overdue = extractRows(result);
    for (const proj of overdue) {
      const daysOverdue = Number(proj.days_overdue || 1);
      await createNotificationForAllUsers({
        type: "project_past_deadline",
        title: `פרויקט באיחור: ${proj.project_name}`,
        message: `פרויקט ${proj.project_number ? `${proj.project_number} — ` : ""}${proj.project_name} באיחור של ${daysOverdue} ימים מהדדליין`,
        priority: daysOverdue > 14 ? "critical" : daysOverdue > 7 ? "high" : "normal",
        category: "anomaly",
        actionUrl: "/projects",
        metadata: { projectId: proj.id, daysOverdue, endDate: proj.end_date },
        dedupeKey: `project_deadline_${proj.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkProjectsPastDeadline error:", err);
  }
}

export async function checkExpiringSupplierContracts() {
  try {
    const result = await getDb().execute(
      sql`SELECT sc.id, sc.contract_number, sc.end_date,
              s.supplier_name,
              (sc.end_date::date - CURRENT_DATE) as days_until_expiry
          FROM supplier_contracts sc
          LEFT JOIN suppliers s ON s.id = sc.supplier_id
          WHERE sc.status NOT IN ('cancelled','terminated','expired','בוטל')
            AND sc.end_date IS NOT NULL
            AND sc.end_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
          ORDER BY sc.end_date ASC
          LIMIT 20`
    );
    const expiring = extractRows(result);
    for (const contract of expiring) {
      const daysLeft = Number(contract.days_until_expiry || 0);
      await createNotificationForAllUsers({
        type: "contract_expiring",
        title: `חוזה ספק פג בקרוב: ${contract.supplier_name || "לא ידוע"}`,
        message: `חוזה ${contract.contract_number || `#${contract.id}`} עם ${contract.supplier_name || "ספק"} פג תוקף בעוד ${daysLeft} ימים`,
        priority: daysLeft <= 7 ? "high" : "normal",
        category: "anomaly",
        actionUrl: "/supplier-contracts",
        metadata: { contractId: contract.id, daysUntilExpiry: daysLeft, endDate: contract.end_date },
        dedupeKey: `contract_exp_${contract.id}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkExpiringSupplierContracts error:", err);
  }
}

export async function checkEmployeeReviewsDue() {
  try {
    const result = await getDb().execute(
      sql`SELECT e.id, e.first_name, e.last_name, e.employee_number,
              e.last_review_date, e.next_review_date, COALESCE(e.department,'') as department
          FROM employees e
          WHERE e.status = 'active'
            AND (
              (e.next_review_date IS NOT NULL AND e.next_review_date::date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date AND e.next_review_date::date >= date_trunc('month', CURRENT_DATE)::date)
              OR
              (e.next_review_date IS NULL AND e.last_review_date IS NOT NULL AND e.last_review_date::date < CURRENT_DATE - INTERVAL '11 months')
              OR
              (e.next_review_date IS NULL AND e.last_review_date IS NULL AND e.start_date IS NOT NULL AND e.start_date::date < CURRENT_DATE - INTERVAL '11 months')
            )
          LIMIT 30`
    );
    const employees = extractRows(result);
    for (const emp of employees) {
      await createNotificationForAllUsers({
        type: "employee_review_due",
        title: `הערכת עובד: ${emp.first_name} ${emp.last_name}`,
        message: `הערכת ביצועים של ${emp.first_name} ${emp.last_name}${emp.employee_number ? ` (${emp.employee_number})` : ""}${emp.department ? ` — ${emp.department}` : ""} מתוכננת החודש`,
        priority: "normal",
        category: "task",
        actionUrl: "/hr",
        metadata: { employeeId: emp.id, nextReview: emp.next_review_date, lastReview: emp.last_review_date },
        dedupeKey: `review_${emp.id}_${new Date().getMonth()}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkEmployeeReviewsDue error:", err);
  }
}

export async function checkExpiredShelfLife() {
  try {
    const result = await getDb().execute(
      sql`SELECT id, material_name, material_number, COALESCE(sku,'') as sku,
              shelf_life_days, last_receipt_date, current_stock,
              (last_receipt_date::date + COALESCE(shelf_life_days, 0) * INTERVAL '1 day')::date as expiry_date,
              ((last_receipt_date::date + COALESCE(shelf_life_days, 0) * INTERVAL '1 day')::date - CURRENT_DATE) as days_until_expiry
          FROM raw_materials
          WHERE shelf_life_days IS NOT NULL AND shelf_life_days > 0
            AND last_receipt_date IS NOT NULL
            AND COALESCE(current_stock, 0) > 0
            AND (last_receipt_date::date + shelf_life_days * INTERVAL '1 day')::date <= CURRENT_DATE + INTERVAL '30 days'
          ORDER BY (last_receipt_date::date + shelf_life_days * INTERVAL '1 day')::date ASC
          LIMIT 50`
    );
    const expiring = extractRows(result);
    for (const item of expiring) {
      const daysLeft = Number(item.days_until_expiry || 0);
      const isExpired = daysLeft <= 0;
      const materialName = item.material_name || item.material_number || `חומר #${item.id}`;
      await createNotificationForAllUsers({
        type: "shelf_life_expiry",
        title: isExpired
          ? `פג תוקף: ${materialName}`
          : `פג תוקף בקרוב: ${materialName}`,
        message: isExpired
          ? `${materialName}${item.sku ? ` (${item.sku})` : ""} — פג תוקף! מלאי: ${item.current_stock} יח׳`
          : `${materialName}${item.sku ? ` (${item.sku})` : ""} — פג תוקף בעוד ${daysLeft} ימים. מלאי: ${item.current_stock} יח׳`,
        priority: isExpired ? "critical" : daysLeft <= 7 ? "high" : "normal",
        category: "anomaly",
        actionUrl: "/inventory/expiry-alerts",
        metadata: {
          materialId: item.id,
          expiryDate: item.expiry_date,
          daysUntilExpiry: daysLeft,
          currentStock: Number(item.current_stock || 0),
          shelfLifeDays: Number(item.shelf_life_days || 0),
        },
        dedupeKey: `shelf_exp_${item.id}`,
      });
    }
    if (expiring.length > 0) {
      console.log(`[NotificationService] Found ${expiring.length} items near/past shelf life expiry`);
    }
  } catch (err) {
    console.error("[NotificationService] checkExpiredShelfLife error:", err);
  }
}

export async function checkSlaBreaches() {
  try {
    const result = await getDb().execute(
      sql`SELECT st.id, st.sla_id, st.entity_type, st.record_id, st.record_label, st.department, st.started_at, st.deadline_at, st.status,
              sd.name as sla_name, sd.warning_threshold_pct, sd.breach_threshold_pct, sd.target_value, sd.metric_unit,
              sd.escalation_chain_id,
              EXTRACT(EPOCH FROM (NOW() - st.started_at)) / 3600 as elapsed_hours,
              EXTRACT(EPOCH FROM (st.deadline_at - st.started_at)) / 3600 as total_hours
          FROM sla_tracking st
          JOIN sla_definitions sd ON sd.id = st.sla_id
          WHERE st.status = 'active'
          LIMIT 100`
    );
    const trackingItems = extractRows(result);

    for (const item of trackingItems) {
      const elapsed = Number(item.elapsed_hours || 0);
      const total = Number(item.total_hours || 1);
      const pct = (elapsed / total) * 100;
      const warningPct = Number(item.warning_threshold_pct || 80);
      const breachPct = Number(item.breach_threshold_pct || 100);
      const label = item.record_label || item.entity_type || `#${item.id}`;

      if (pct >= breachPct && item.status === "active") {
        await getDb().execute(
          sql`UPDATE sla_tracking SET status = 'breached', updated_at = NOW() WHERE id = ${item.id as number} AND status = 'active'`
        );
        await createNotificationForAllUsers({
          type: "sla_breached",
          title: `הפרת SLA: ${item.sla_name}`,
          message: `SLA "${item.sla_name}" הופר עבור ${label}${item.department ? ` (${item.department})` : ""}. עברו ${Math.round(elapsed)} שעות מתוך יעד ${Math.round(total)} שעות`,
          priority: "critical",
          category: "approval",
          actionUrl: "/platform/sla-dashboard",
          metadata: { trackingId: item.id, slaId: item.sla_id, elapsed, total, pct: Math.round(pct) },
          dedupeKey: `sla_breach_${item.id}`,
        });

        // If the SLA definition has an escalation chain, auto-start it for this breach
        if (item.escalation_chain_id) {
          try {
            const { startChainInstance } = await import("../routes/platform/approval-chains");
            await startChainInstance({
              chainId: Number(item.escalation_chain_id),
              entityType: "sla_breach",
              recordId: item.id as number,
              recordLabel: `הפרת SLA: ${item.sla_name} — ${label}`,
              department: item.department as string | undefined,
              metadata: { slaTrackingId: item.id, slaId: item.sla_id, elapsedHours: elapsed, pct: Math.round(pct) },
            });
          } catch (escErr) {
            console.error("[NotificationService] Failed to start SLA escalation chain:", escErr);
          }
        }
      } else if (pct >= warningPct && pct < breachPct) {
        await createNotificationForAllUsers({
          type: "sla_warning",
          title: `אזהרת SLA: ${item.sla_name}`,
          message: `SLA "${item.sla_name}" מתקרב להפרה עבור ${label}. עברו ${Math.round(elapsed)} שעות מתוך ${Math.round(total)} (${Math.round(pct)}%)`,
          priority: "high",
          category: "approval",
          actionUrl: "/platform/sla-dashboard",
          metadata: { trackingId: item.id, slaId: item.sla_id, elapsed, total, pct: Math.round(pct) },
          dedupeKey: `sla_warning_${item.id}`,
        });
      }
    }
  } catch (err) {
    console.error("[NotificationService] checkSlaBreaches error:", err);
  }
}

export async function checkEscalationTimeouts() {
  try {
    // Use CAST to ensure valid interval construction from integer column
    const result = await getDb().execute(
      sql`SELECT ar.id, ar.created_at, ar.escalation_level, ar.chain_level_id,
              acl.timeout_hours, acl.escalation_role, acl.name as level_name
          FROM approval_requests ar
          LEFT JOIN approval_chain_levels acl ON acl.id = ar.chain_level_id
          WHERE ar.status = 'pending'
            AND acl.timeout_hours IS NOT NULL
            AND acl.timeout_hours > 0
            AND ar.created_at < NOW() - (CAST(acl.timeout_hours AS numeric) * INTERVAL '1 hour')
            AND (ar.escalated_at IS NULL OR ar.escalated_at < NOW() - (CAST(acl.timeout_hours AS numeric) * INTERVAL '1 hour'))
          LIMIT 50`
    );
    const overdueApprovals = extractRows(result);

    for (const approval of overdueApprovals) {
      const escalationRole = approval.escalation_role || "manager";
      const newEscalationLevel = (Number(approval.escalation_level) || 0) + 1;
      await getDb().execute(
        sql`UPDATE approval_requests
            SET escalated_at = NOW(), escalation_level = ${newEscalationLevel}
            WHERE id = ${approval.id as number}`
      );
      await createNotificationForRole(String(escalationRole), {
        type: "approval_escalation",
        title: `הסלמת אישור: שלב "${approval.level_name || "אישור"}"`,
        message: `בקשת אישור #${approval.id} עברה את פסק הזמן (${approval.timeout_hours} שעות) ודורשת טיפולך הדחוף`,
        priority: "critical",
        category: "approval",
        actionUrl: "/purchase-approvals",
        metadata: {
          approvalRequestId: approval.id,
          timeoutHours: approval.timeout_hours,
          escalationLevel: newEscalationLevel,
        },
        dedupeKey: `escalation_${approval.id}_${newEscalationLevel}`,
      });
    }
  } catch (err) {
    console.error("[NotificationService] checkEscalationTimeouts error:", err);
  }
}

export async function runAllTriggers() {
  const checks = [
    checkBudgetAnomalies,
    checkLowInventory,
    checkOverdueApprovals,
    checkOverdueTasks,
    checkOverduePurchaseOrders,
    checkOverdueWorkOrders,
    checkOverdueShipments,
    checkOpenNCRs,
    checkOverdueInvoices,
    checkStockBelowReorderPoint,
    checkProjectsPastDeadline,
    checkExpiringSupplierContracts,
    checkEmployeeReviewsDue,
    checkExpiredShelfLife,
    checkSlaBreaches,
    checkEscalationTimeouts,
  ];

  let client: pg.PoolClient | undefined;
  let scopedDb: AnyDb | undefined;
  try {
    client = await backgroundPool.connect();
    scopedDb = makeDrizzle(client, { schema }) as AnyDb;
  } catch {
    scopedDb = undefined;
  }

  const runChecks = async () => {
    for (const check of checks) {
      try {
        await check();
      } catch (err) {
        console.error("[NotificationService] Trigger failed:", err);
      }
    }
  };

  try {
    if (scopedDb && client) {
      await client.query("BEGIN");
      try {
        await triggerDbStorage.run(scopedDb, runChecks);
        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    } else {
      await runChecks();
    }
  } finally {
    client?.release();
  }
}

const TRIGGER_INTERVAL_MS = 60 * 60 * 1000;
let triggerTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduledTriggers() {
  if (triggerTimer) return;
  console.log(`[NotificationService] Starting scheduled triggers (every ${TRIGGER_INTERVAL_MS / 60000} min)`);
  triggerTimer = setInterval(async () => {
    try {
      await runAllTriggers();
      console.log("[NotificationService] Scheduled trigger check completed");
    } catch (err) {
      console.error("[NotificationService] Scheduled trigger error:", err);
    }
  }, TRIGGER_INTERVAL_MS);
}

export function stopScheduledTriggers() {
  if (triggerTimer) {
    clearInterval(triggerTimer);
    triggerTimer = null;
  }
}
