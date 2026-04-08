import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const ALLOWED_TABLES = new Set([
  "employees", "customers", "work_orders", "production_work_orders",
  "raw_materials", "price_quotes", "customer_invoices", "supplier_invoices",
  "suppliers", "purchase_orders", "sales_orders", "quotes", "projects",
  "inventory_transactions", "leads", "contacts", "machines", "products",
  "tasks", "contracts", "installations", "delivery_notes", "credit_notes",
]);

function validateTable(table: string): string {
  const clean = table.replace(/[^a-z0-9_]/gi, "");
  if (!ALLOWED_TABLES.has(clean)) {
    throw new Error(`Table "${clean}" is not allowed for soft delete operations`);
  }
  return clean;
}

function validateField(field: string): string {
  const clean = field.replace(/[^a-z0-9_]/gi, "");
  if (clean.length === 0 || clean.length > 64) {
    throw new Error(`Invalid field name: "${field}"`);
  }
  return clean;
}

function validateId(id: number): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid id: ${id}`);
  }
  return n;
}

export async function softDelete(table: string, id: number): Promise<boolean> {
  try {
    const safeTable = validateTable(table);
    const safeId = validateId(id);
    await db.execute(
      sql.raw(`UPDATE "${safeTable}" SET deleted_at = NOW() WHERE id = ${safeId}`)
    );
    return true;
  } catch (e: any) {
    console.error(`Soft delete error for ${table}:`, e.message);
    return false;
  }
}

export async function softDeleteByField(
  table: string,
  field: string,
  value: any
): Promise<boolean> {
  try {
    const safeTable = validateTable(table);
    const safeField = validateField(field);
    const escapedValue = typeof value === "string"
      ? `'${value.replace(/'/g, "''")}'`
      : validateId(Number(value));
    await db.execute(
      sql.raw(`UPDATE "${safeTable}" SET deleted_at = NOW() WHERE "${safeField}" = ${escapedValue}`)
    );
    return true;
  } catch (e: any) {
    console.error(`Soft delete error for ${table}:`, e.message);
    return false;
  }
}

export async function hardDelete(table: string, id: number): Promise<boolean> {
  try {
    const safeTable = validateTable(table);
    const safeId = validateId(id);
    await db.execute(
      sql.raw(`DELETE FROM "${safeTable}" WHERE id = ${safeId}`)
    );
    return true;
  } catch (e: any) {
    console.error(`Hard delete error for ${table}:`, e.message);
    return false;
  }
}

export async function restore(table: string, id: number): Promise<boolean> {
  try {
    const safeTable = validateTable(table);
    const safeId = validateId(id);
    await db.execute(
      sql.raw(`UPDATE "${safeTable}" SET deleted_at = NULL WHERE id = ${safeId}`)
    );
    return true;
  } catch (e: any) {
    console.error(`Restore error for ${table}:`, e.message);
    return false;
  }
}

export async function query(sqlQuery: string): Promise<any[]> {
  try {
    const result = await db.execute(sql.raw(sqlQuery));
    return result.rows || [];
  } catch (e: any) {
    console.error("Soft delete query error:", e.message);
    return [];
  }
}
