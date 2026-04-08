import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface AuditLogEntry {
  user_id?: number | null;
  user_name?: string | null;
  table_name: string;
  record_id: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  ip_address?: string | null;
  notes?: string | null;
}

function sanitizeTableName(name: string): string {
  return name.replace(/[^a-z0-9_]/gi, "");
}

function sanitizeString(val: string): string {
  return val.replace(/'/g, "''");
}

function sanitizeIp(ip: string): string {
  return ip.replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45);
}

export async function logAudit(entry: AuditLogEntry): Promise<boolean> {
  try {
    const oldValuesJson = entry.old_values ? JSON.stringify(entry.old_values) : null;
    const newValuesJson = entry.new_values ? JSON.stringify(entry.new_values) : null;
    const safeTable = sanitizeTableName(entry.table_name);
    const safeAction = ["INSERT", "UPDATE", "DELETE"].includes(entry.action) ? entry.action : "UPDATE";
    const safeRecordId = Number.isInteger(Number(entry.record_id)) ? Number(entry.record_id) : 0;

    const query = `
      INSERT INTO audit_log (user_id, user_name, table_name, record_id, action, old_values, new_values, ip_address, notes)
      VALUES (
        ${entry.user_id && Number.isInteger(Number(entry.user_id)) ? Number(entry.user_id) : "NULL"},
        ${entry.user_name ? `'${sanitizeString(entry.user_name)}'` : "NULL"},
        '${safeTable}',
        ${safeRecordId},
        '${safeAction}',
        ${oldValuesJson ? `'${sanitizeString(oldValuesJson)}'::jsonb` : "NULL"},
        ${newValuesJson ? `'${sanitizeString(newValuesJson)}'::jsonb` : "NULL"},
        ${entry.ip_address ? `'${sanitizeIp(entry.ip_address)}'` : "NULL"},
        ${entry.notes ? `'${sanitizeString(entry.notes)}'` : "NULL"}
      )
    `;

    await db.execute(sql.raw(query));
    return true;
  } catch (e: any) {
    console.error("Audit log error:", e.message);
    return false;
  }
}

export async function getAuditLog(
  tableNameFilter?: string,
  recordIdFilter?: number,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  try {
    let whereClause = "WHERE 1=1";
    if (tableNameFilter) {
      whereClause += ` AND table_name = '${sanitizeTableName(tableNameFilter)}'`;
    }
    if (recordIdFilter !== undefined && recordIdFilter !== null) {
      const safeId = Number.isInteger(Number(recordIdFilter)) ? Number(recordIdFilter) : 0;
      whereClause += ` AND record_id = ${safeId}`;
    }
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 1000);
    const safeOffset = Math.max(0, Number(offset) || 0);

    const query = `
      SELECT id, user_id, user_name, table_name, record_id, action, old_values, new_values, timestamp, ip_address, notes
      FROM audit_log
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `;

    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (e: any) {
    console.error("Get audit log error:", e.message);
    return [];
  }
}

export async function getAuditStats(): Promise<any> {
  try {
    const query = `
      SELECT
        COUNT(*) as total_logs,
        COUNT(DISTINCT table_name) as tables_audited,
        COUNT(DISTINCT record_id) as records_audited,
        COUNT(CASE WHEN action='INSERT' THEN 1 END) as inserts,
        COUNT(CASE WHEN action='UPDATE' THEN 1 END) as updates,
        COUNT(CASE WHEN action='DELETE' THEN 1 END) as deletes,
        MAX(timestamp) as last_audit_time
      FROM audit_log
    `;

    const result = await db.execute(sql.raw(query));
    return result.rows?.[0] || {};
  } catch (e: any) {
    console.error("Audit stats error:", e.message);
    return {};
  }
}
