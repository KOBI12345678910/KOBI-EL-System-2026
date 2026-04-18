import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const logger = console;

export async function createSupplierNotification(supplierId: number, supplierName: string) {
  try {
    // Get procurement managers or admins to notify
    const managersResult = await db.execute(
      sql`SELECT id, email FROM users WHERE role IN ('procurement_manager', 'admin') LIMIT 5`
    );

    if (managersResult.rows.length === 0) {
      logger.warn("[Supplier Notification] No managers found to notify");
      return;
    }

    for (const manager of managersResult.rows) {
      await db.execute(
        sql`INSERT INTO notifications (type, title, message, module_id, record_id, record_name, user_id, action_url, is_read, created_at)
          VALUES ('supplier_created', 'New Supplier Created', ${`Supplier ${supplierName} has been added to the system`}, 'suppliers', ${supplierId}, ${supplierName}, ${manager.email}, '/supplier-mgmt/supplier-details/' || ${supplierId}, false, NOW())`
      );
    }

    logger.info("[Supplier Notification] Created notification for new supplier:", {
      supplierId,
      supplierName,
    });
  } catch (error: any) {
    logger.error("[Supplier Notification] Failed to create notification:", error.message);
  }
}

// Call this when a supplier is created via the custom module system
export async function notifyOnSupplierCreation(recordId: number, recordName: string, moduleId: string) {
  if (moduleId === "suppliers" || recordName?.includes("supplier")) {
    await createSupplierNotification(recordId, recordName);
  }
}
