import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

interface EntityMatch {
  entityType: string;
  entityId: number;
  entityName: string;
}

export async function resolveEntityByPhone(phone: string): Promise<EntityMatch | null> {
  const normalized = phone.replace(/[^0-9]/g, "");
  if (!normalized || normalized.length < 7) return null;

  const phoneSuffix = normalized.slice(-9);

  const supplierResult = await db.execute(sql`
    SELECT id, name FROM suppliers
    WHERE REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), '-', ''), ' ', ''), '+', '') LIKE ${'%' + phoneSuffix}
       OR REPLACE(REPLACE(REPLACE(COALESCE(mobile, ''), '-', ''), ' ', ''), '+', '') LIKE ${'%' + phoneSuffix}
    LIMIT 1
  `);

  if (supplierResult.rows && supplierResult.rows.length > 0) {
    const row = supplierResult.rows[0] as { id: number; name: string };
    return { entityType: "suppliers", entityId: row.id, entityName: row.name };
  }

  const contactResult = await db.execute(sql`
    SELECT sc.id, sc.name, sc.supplier_id FROM supplier_contacts sc
    WHERE REPLACE(REPLACE(REPLACE(COALESCE(sc.phone, ''), '-', ''), ' ', ''), '+', '') LIKE ${'%' + phoneSuffix}
       OR REPLACE(REPLACE(REPLACE(COALESCE(sc.mobile, ''), '-', ''), ' ', ''), '+', '') LIKE ${'%' + phoneSuffix}
    LIMIT 1
  `);

  if (contactResult.rows && contactResult.rows.length > 0) {
    const row = contactResult.rows[0] as { id: number; name: string; supplier_id: number };
    return { entityType: "supplier_contacts", entityId: row.id, entityName: row.name };
  }

  const userResult = await db.execute(sql`
    SELECT id, name FROM users
    WHERE REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), '-', ''), ' ', ''), '+', '') LIKE ${'%' + phoneSuffix}
    LIMIT 1
  `);

  if (userResult.rows && userResult.rows.length > 0) {
    const row = userResult.rows[0] as { id: number; name: string };
    return { entityType: "users", entityId: row.id, entityName: row.name || "User" };
  }

  return null;
}

export async function resolveEntityByEmail(email: string): Promise<EntityMatch | null> {
  if (!email) return null;

  const normalizedEmail = email.toLowerCase().trim();
  const emailMatch = normalizedEmail.match(/[^\s@<]+@[^\s@>]+/);
  if (!emailMatch) return null;
  const cleanEmail = emailMatch[0];

  const supplierResult = await db.execute(sql`
    SELECT id, name FROM suppliers
    WHERE LOWER(TRIM(email)) = ${cleanEmail}
    LIMIT 1
  `);

  if (supplierResult.rows && supplierResult.rows.length > 0) {
    const row = supplierResult.rows[0] as { id: number; name: string };
    return { entityType: "suppliers", entityId: row.id, entityName: row.name };
  }

  const contactResult = await db.execute(sql`
    SELECT sc.id, sc.name, sc.supplier_id FROM supplier_contacts sc
    WHERE LOWER(TRIM(sc.email)) = ${cleanEmail}
    LIMIT 1
  `);

  if (contactResult.rows && contactResult.rows.length > 0) {
    const row = contactResult.rows[0] as { id: number; name: string; supplier_id: number };
    return { entityType: "supplier_contacts", entityId: row.id, entityName: row.name };
  }

  const foreignSupplierResult = await db.execute(sql`
    SELECT id, name FROM foreign_suppliers
    WHERE LOWER(TRIM(email)) = ${cleanEmail}
    LIMIT 1
  `);

  if (foreignSupplierResult.rows && foreignSupplierResult.rows.length > 0) {
    const row = foreignSupplierResult.rows[0] as { id: number; name: string };
    return { entityType: "foreign_suppliers", entityId: row.id, entityName: row.name };
  }

  const userResult = await db.execute(sql`
    SELECT id, name FROM users
    WHERE LOWER(TRIM(email)) = ${cleanEmail}
    LIMIT 1
  `);

  if (userResult.rows && userResult.rows.length > 0) {
    const row = userResult.rows[0] as { id: number; name: string };
    return { entityType: "users", entityId: row.id, entityName: row.name || cleanEmail };
  }

  return null;
}
