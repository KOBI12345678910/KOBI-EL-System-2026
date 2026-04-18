// ============================================================
// Shared helpers for workforce routes.
// Workforce is the most PII-sensitive domain — every route
// installs `authMiddleware` + `hrOrAdminMiddleware`. Sensitive
// business endpoints also check `isPayrollOfficer` /
// `isFinanceManager` / `isHrManager` / `isSelf`.
// ============================================================
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import {
  buildSafeWhere,
  buildSafeOrderBy,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
} from "../_safe-list-helpers";

export { authMiddleware, adminMiddleware };
export { db, sql };
export {
  buildSafeWhere,
  buildSafeOrderBy,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
};

// HR / admin / payroll-officer guard — the softest workforce guard.
// Allows isSuperAdmin OR users with an 'hr_manager' / 'hr_admin' /
// 'payroll_operator' role via governance.user_roles (best-effort).
export async function hrOrAdminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.isSuperAdmin) return next();
    const uid = Number((req as { userId?: unknown }).userId);
    if (!Number.isInteger(uid) || uid <= 0) {
      res.status(401).json({ error: "אין טוקן הרשאה" });
      return;
    }
    const r = await db.execute(sql`
      select 1
      from governance.user_roles ur
      join governance.roles r on r.id = ur.role_id
      where ur.user_id = ${uid}
        and coalesce(ur.active, true) = true
        and r.role_code in ('hr_manager','hr_admin','payroll_operator','finance_manager','admin','super_admin')
      limit 1
    `);
    if ((r.rows ?? []).length === 0) {
      res.status(403).json({ error: "אין הרשאה למשאבי אנוש" });
      return;
    }
    next();
  } catch (err) {
    console.error("[workforce:hrOrAdminMiddleware]", err);
    res.status(500).json({ error: "שגיאה באימות הרשאות" });
  }
}

// Strict HR-manager guard — for payroll approval.
export async function hrManagerMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.isSuperAdmin) return next();
    const uid = Number((req as { userId?: unknown }).userId);
    if (!Number.isInteger(uid) || uid <= 0) {
      res.status(401).json({ error: "אין טוקן הרשאה" });
      return;
    }
    const r = await db.execute(sql`
      select 1 from governance.user_roles ur
      join governance.roles r on r.id = ur.role_id
      where ur.user_id = ${uid}
        and coalesce(ur.active, true) = true
        and r.role_code in ('hr_manager','hr_admin','admin','super_admin')
      limit 1
    `);
    if ((r.rows ?? []).length === 0) {
      res.status(403).json({ error: "דרושה הרשאת מנהל משאבי אנוש" });
      return;
    }
    next();
  } catch (err) {
    console.error("[workforce:hrManagerMiddleware]", err);
    res.status(500).json({ error: "שגיאה באימות הרשאות" });
  }
}

// Strict finance-manager guard — for payroll PAY step.
export async function financeManagerMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.isSuperAdmin) return next();
    const uid = Number((req as { userId?: unknown }).userId);
    if (!Number.isInteger(uid) || uid <= 0) {
      res.status(401).json({ error: "אין טוקן הרשאה" });
      return;
    }
    const r = await db.execute(sql`
      select 1 from governance.user_roles ur
      join governance.roles r on r.id = ur.role_id
      where ur.user_id = ${uid}
        and coalesce(ur.active, true) = true
        and r.role_code in ('finance_manager','finance_admin','admin','super_admin')
      limit 1
    `);
    if ((r.rows ?? []).length === 0) {
      res.status(403).json({ error: "דרושה הרשאת מנהל כספים" });
      return;
    }
    next();
  } catch (err) {
    console.error("[workforce:financeManagerMiddleware]", err);
    res.status(500).json({ error: "שגיאה באימות הרשאות" });
  }
}

export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "בקשה לא תקינה", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ error: "בקשה לא תקינה", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function idFromParams(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return null;
  }
  return id;
}

export function currentUserId(req: Request): number | null {
  const v = Number((req as { userId?: unknown }).userId);
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function sendDbError(res: Response, err: unknown, label: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("duplicate key")) {
    res.status(409).json({ error: "רשומה כבר קיימת", message: msg });
    return;
  }
  if (msg.includes("foreign key")) {
    res.status(400).json({ error: "קישור לא תקין", message: msg });
    return;
  }
  if (msg.includes("violates check constraint")) {
    res.status(400).json({ error: "סטטוס לא חוקי", message: msg });
    return;
  }
  console.error(`[workforce:${label}]`, err);
  res.status(500).json({ error: "שגיאה בשירות כוח-אדם" });
}

// Generic LIST helper using safe-list primitives.
export async function runSafeList<T>(params: {
  table: string;
  conditions: SQL[];
  allowedOrderColumns: Set<string>;
  fallbackColumn: string;
  orderBy: string | undefined;
  orderDir: string | undefined;
  limit: number;
  offset: number;
  columns?: string;
}) {
  const {
    table, conditions, allowedOrderColumns, fallbackColumn,
    orderBy, orderDir, limit, offset, columns = "*",
  } = params;

  const where = buildSafeWhere(conditions);
  const orderClause = buildSafeOrderBy(orderBy, orderDir, allowedOrderColumns, fallbackColumn, "desc");
  const safeColumns = columns === "*" ? "*" : columns;

  const rowsRes = await db.execute(sql`
    select ${sql.raw(safeColumns)} from ${sql.raw(table)}
    ${where}
    order by ${sql.raw(orderClause)}
    limit ${limit} offset ${offset}
  `);
  const countRes = await db.execute(sql`
    select count(*)::bigint as total from ${sql.raw(table)} ${where}
  `);
  const total = Number(
    (countRes.rows?.[0] as { total?: number | string } | undefined)?.total ?? 0,
  );
  return buildListResponse<T>((rowsRes.rows ?? []) as T[], total, limit, offset);
}

// Resolve the employee row id owned by the current user (if any).
// Used for self-only policies on sensitive employee endpoints.
export async function getSelfEmployeeId(req: Request): Promise<number | null> {
  const uid = currentUserId(req);
  if (!uid) return null;
  try {
    const r = await db.execute(sql`
      select id from workforce.employees
      where metadata->>'user_id' = ${String(uid)}
         or created_by = ${uid}
      limit 1
    `);
    const row = (r.rows ?? [])[0] as { id?: number | string } | undefined;
    const id = row?.id !== undefined ? Number(row.id) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
