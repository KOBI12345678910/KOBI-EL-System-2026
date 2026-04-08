import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

async function qRaw(query: ReturnType<typeof sql>) {
  try {
    const r = await db.execute(query);
    return r.rows || [];
  } catch (e: any) {
    console.error("COA query error:", e.message);
    throw e;
  }
}

router.get("/chart-of-accounts", async (_req, res) => {
  try {
    res.json(await qRaw(sql`SELECT * FROM chart_of_accounts ORDER BY account_number ASC`));
  } catch (e: any) { res.status(500).json({ error: "שגיאה בטעינת חשבונות" }); }
});

router.get("/chart-of-accounts/stats", async (_req, res) => {
  try {
    const rows = await qRaw(sql`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='active') as active,
      COUNT(*) FILTER (WHERE is_group=true) as groups,
      COUNT(*) FILTER (WHERE is_group=false OR is_group IS NULL) as leaf_accounts,
      COUNT(*) FILTER (WHERE account_type='asset') as assets,
      COUNT(*) FILTER (WHERE account_type='liability') as liabilities,
      COUNT(*) FILTER (WHERE account_type='equity') as equity,
      COUNT(*) FILTER (WHERE account_type='revenue') as revenues,
      COUNT(*) FILTER (WHERE account_type='expense') as expenses,
      COALESCE(SUM(current_balance) FILTER (WHERE account_type='asset'), 0) as total_assets,
      COALESCE(SUM(current_balance) FILTER (WHERE account_type='liability'), 0) as total_liabilities,
      COALESCE(SUM(current_balance) FILTER (WHERE account_type='revenue'), 0) as total_revenue,
      COALESCE(SUM(current_balance) FILTER (WHERE account_type='expense'), 0) as total_expenses,
      COALESCE(SUM(debit_total), 0) as total_debits,
      COALESCE(SUM(credit_total), 0) as total_credits,
      MAX(hierarchy_level) as max_depth
    FROM chart_of_accounts`);
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: "שגיאה בטעינת סטטיסטיקות" }); }
});

router.get("/chart-of-accounts/tree", async (_req, res) => {
  try {
    const all = await qRaw(sql`SELECT * FROM chart_of_accounts WHERE status='active' ORDER BY sort_order ASC, account_number ASC`);
    const map = new Map<number, any>();
    const roots: any[] = [];
    for (const a of all) { (a as any).children = []; map.set((a as any).id, a); }
    for (const a of all) {
      const parentId = (a as any).parent_account_id;
      if (parentId && map.has(parentId)) { map.get(parentId).children.push(a); }
      else { roots.push(a); }
    }
    res.json(roots);
  } catch (e: any) { res.status(500).json({ error: "שגיאה בבניית עץ חשבונות" }); }
});

router.post("/chart-of-accounts", async (req, res) => {
  try {
    const d = req.body;
    const user = (req as any).user;

    const validAccountTypes = ['asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue'];
    const accountType = validAccountTypes.includes(d.accountType) ? d.accountType : 'expense';
    const normalBal = ['asset','expense','contra_liability','contra_equity','contra_revenue'].includes(accountType) ? 'debit' : 'credit';
    const currency = ['ILS','USD','EUR'].includes(d.currency) ? d.currency : 'ILS';
    const status = ['active','inactive','closed'].includes(d.status) ? d.status : 'active';
    const parentId = d.parentAccountId ? Number(d.parentAccountId) : null;

    if (!d.accountNumber || !d.accountName) {
      res.status(400).json({ error: "מספר חשבון ושם חשבון הם שדות חובה" });
      return;
    }

    const existing = await qRaw(sql`SELECT id FROM chart_of_accounts WHERE account_number = ${String(d.accountNumber)}`);
    if (existing.length > 0) {
      res.status(409).json({ error: `מספר חשבון ${d.accountNumber} כבר קיים במערכת` });
      return;
    }

    let parentPath = '';
    let level = 1;
    if (parentId) {
      const parent = await qRaw(sql`SELECT hierarchy_path, hierarchy_level FROM chart_of_accounts WHERE id = ${parentId}`);
      if (parent[0]) {
        parentPath = (parent[0] as any).hierarchy_path || '';
        level = ((parent[0] as any).hierarchy_level || 0) + 1;
      }
    }
    const hierarchyPath = parentPath ? `${parentPath}/${d.accountNumber}` : String(d.accountNumber);

    await qRaw(sql`INSERT INTO chart_of_accounts (
      account_number, account_name, account_name_en, account_type, account_subtype,
      parent_account_id, parent_account_number, hierarchy_level, hierarchy_path,
      is_group, is_system_account, currency, status, opening_balance, current_balance,
      normal_balance, tax_category, tax_rate, cost_center, department,
      bank_account_number, bank_name, bank_branch, reconciliation_required,
      allow_direct_posting, budget_code, budget_amount, sort_order,
      description, notes, created_by, created_by_name
    ) VALUES (
      ${String(d.accountNumber)},
      ${String(d.accountName)},
      ${d.accountNameEn ? String(d.accountNameEn) : null},
      ${accountType},
      ${d.accountSubtype ? String(d.accountSubtype) : null},
      ${parentId},
      ${d.parentAccountNumber ? String(d.parentAccountNumber) : null},
      ${level},
      ${hierarchyPath},
      ${Boolean(d.isGroup)},
      ${Boolean(d.isSystemAccount)},
      ${currency},
      ${status},
      ${Number(d.openingBalance) || 0},
      ${Number(d.openingBalance) || 0},
      ${normalBal},
      ${d.taxCategory ? String(d.taxCategory) : null},
      ${d.taxRate !== undefined && d.taxRate !== null ? Number(d.taxRate) : null},
      ${d.costCenter ? String(d.costCenter) : null},
      ${d.department ? String(d.department) : null},
      ${d.bankAccountNumber ? String(d.bankAccountNumber) : null},
      ${d.bankName ? String(d.bankName) : null},
      ${d.bankBranch ? String(d.bankBranch) : null},
      ${Boolean(d.reconciliationRequired)},
      ${d.allowDirectPosting !== false},
      ${d.budgetCode ? String(d.budgetCode) : null},
      ${Number(d.budgetAmount) || 0},
      ${Number(d.sortOrder) || 0},
      ${d.description ? String(d.description) : null},
      ${d.notes ? String(d.notes) : null},
      ${user?.id ? Number(user.id) : null},
      ${user?.fullName ? String(user.fullName) : null}
    )`);

    const created = await qRaw(sql`SELECT * FROM chart_of_accounts WHERE account_number = ${String(d.accountNumber)}`);
    res.json(created[0] || null);
  } catch (e: any) {
    if (e.code === '23505') {
      res.status(409).json({ error: "מספר חשבון כבר קיים במערכת" });
    } else {
      res.status(500).json({ error: "שגיאה ביצירת חשבון" });
    }
  }
});

router.put("/chart-of-accounts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const d = req.body;

    const setParts: ReturnType<typeof sql>[] = [];
    if (d.accountName) setParts.push(sql`account_name = ${String(d.accountName)}`);
    if (d.accountNameEn !== undefined) setParts.push(sql`account_name_en = ${d.accountNameEn ? String(d.accountNameEn) : null}`);
    if (d.accountType) {
      const validTypes = ['asset','liability','equity','revenue','expense','contra_asset','contra_liability','contra_equity','contra_revenue'];
      if (validTypes.includes(d.accountType)) setParts.push(sql`account_type = ${d.accountType}`);
    }
    if (d.accountSubtype !== undefined) setParts.push(sql`account_subtype = ${d.accountSubtype ? String(d.accountSubtype) : null}`);
    if (d.parentAccountId !== undefined) setParts.push(sql`parent_account_id = ${d.parentAccountId ? Number(d.parentAccountId) : null}`);
    if (d.parentAccountNumber !== undefined) setParts.push(sql`parent_account_number = ${d.parentAccountNumber ? String(d.parentAccountNumber) : null}`);
    if (d.isGroup !== undefined) setParts.push(sql`is_group = ${Boolean(d.isGroup)}`);
    if (d.currency && ['ILS','USD','EUR'].includes(d.currency)) setParts.push(sql`currency = ${d.currency}`);
    if (d.status && ['active','inactive','closed'].includes(d.status)) setParts.push(sql`status = ${d.status}`);
    if (d.openingBalance !== undefined) setParts.push(sql`opening_balance = ${Number(d.openingBalance)}`);
    if (d.currentBalance !== undefined) setParts.push(sql`current_balance = ${Number(d.currentBalance)}`);
    if (d.debitTotal !== undefined) setParts.push(sql`debit_total = ${Number(d.debitTotal)}`);
    if (d.creditTotal !== undefined) setParts.push(sql`credit_total = ${Number(d.creditTotal)}`);
    if (d.taxCategory !== undefined) setParts.push(sql`tax_category = ${d.taxCategory ? String(d.taxCategory) : null}`);
    if (d.taxRate !== undefined) setParts.push(sql`tax_rate = ${d.taxRate !== null ? Number(d.taxRate) : null}`);
    if (d.costCenter !== undefined) setParts.push(sql`cost_center = ${d.costCenter ? String(d.costCenter) : null}`);
    if (d.department !== undefined) setParts.push(sql`department = ${d.department ? String(d.department) : null}`);
    if (d.bankAccountNumber !== undefined) setParts.push(sql`bank_account_number = ${d.bankAccountNumber ? String(d.bankAccountNumber) : null}`);
    if (d.bankName !== undefined) setParts.push(sql`bank_name = ${d.bankName ? String(d.bankName) : null}`);
    if (d.reconciliationRequired !== undefined) setParts.push(sql`reconciliation_required = ${Boolean(d.reconciliationRequired)}`);
    if (d.allowDirectPosting !== undefined) setParts.push(sql`allow_direct_posting = ${Boolean(d.allowDirectPosting)}`);
    if (d.budgetCode !== undefined) setParts.push(sql`budget_code = ${d.budgetCode ? String(d.budgetCode) : null}`);
    if (d.budgetAmount !== undefined) setParts.push(sql`budget_amount = ${Number(d.budgetAmount)}`);
    if (d.sortOrder !== undefined) setParts.push(sql`sort_order = ${Number(d.sortOrder)}`);
    if (d.description !== undefined) setParts.push(sql`description = ${d.description ? String(d.description) : null}`);
    if (d.notes !== undefined) setParts.push(sql`notes = ${d.notes ? String(d.notes) : null}`);
    setParts.push(sql`updated_at = NOW()`);

    if (setParts.length === 1) {
      const rows = await qRaw(sql`SELECT * FROM chart_of_accounts WHERE id = ${id}`);
      res.json(rows[0] || null);
      return;
    }

    const setClause = setParts.reduce((acc, part, i) => i === 0 ? part : sql`${acc}, ${part}`);
    await qRaw(sql`UPDATE chart_of_accounts SET ${setClause} WHERE id = ${id}`);
    const rows = await qRaw(sql`SELECT * FROM chart_of_accounts WHERE id = ${id}`);
    res.json(rows[0] || null);
  } catch (e: any) { res.status(500).json({ error: "שגיאה בעדכון חשבון" }); }
});

router.delete("/chart-of-accounts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }

    const children = await qRaw(sql`SELECT COUNT(*) as cnt FROM chart_of_accounts WHERE parent_account_id = ${id}`);
    if (Number((children[0] as any)?.cnt) > 0) {
      res.status(400).json({ error: "לא ניתן למחוק חשבון עם חשבונות בנים" });
      return;
    }
    await qRaw(sql`UPDATE chart_of_accounts SET status = 'closed', updated_at = NOW() WHERE id = ${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "שגיאה במחיקת חשבון" }); }
});

export default router;
