import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { journalEntryLinesTable } from "@workspace/db/schema";
import { validateSession } from "../lib/auth";
import { z } from "zod/v4";
import { createNotificationForAllUsers } from "../lib/notification-service";

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

function parseId(id: string): number {
  const num = parseInt(id, 10);
  if (isNaN(num) || num <= 0) throw new Error("Invalid ID");
  return num;
}

function parseNum(val: any, fallback: number = 0): number {
  if (val === undefined || val === null) return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function parseStr(val: any): string | null {
  if (val === undefined || val === null || val === "") return null;
  return String(val);
}

function buildDynamicUpdate(table: string, setClauses: SQL[], id: number): SQL {
  const joined = sql.join(setClauses, sql.raw(", "));
  return sql`${sql.raw(`UPDATE ${table} SET`)} ${joined} ${sql.raw("WHERE id =")} ${id}`;
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const pattern = `${prefix}${year}-%`;
  const rows = await db.execute(sql`SELECT ${sql.raw(col)} FROM ${sql.raw(table)} WHERE ${sql.raw(col)} LIKE ${pattern} ORDER BY id DESC LIMIT 1`);
  const last = (rows.rows?.[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

const JournalEntrySchema = z.object({
  entryDate: z.string().optional(),
  description: z.string().optional(),
  reference: z.string().nullable().optional(),
  entryType: z.string().optional(),
  debitAccountId: z.coerce.number().nullable().optional(),
  debitAccountName: z.string().nullable().optional(),
  creditAccountId: z.coerce.number().nullable().optional(),
  creditAccountName: z.string().nullable().optional(),
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
  exchangeRate: z.coerce.number().optional(),
  amountIls: z.coerce.number().optional(),
  status: z.string().optional(),
  sourceDocument: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  fiscalYear: z.coerce.number().optional(),
  fiscalPeriod: z.coerce.number().optional(),
  tags: z.string().nullable().optional(),
  isRecurring: z.coerce.boolean().optional(),
  recurringFrequency: z.string().nullable().optional(),
});

router.get("/journal-entries", async (_req, res) => {
  const rows = await db.execute(sql`SELECT * FROM journal_entries ORDER BY entry_date DESC, id DESC`);
  res.json(rows.rows || []);
});

router.get("/journal-entries/stats", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='posted') as posted,
    COUNT(*) FILTER (WHERE status='pending_approval') as pending,
    COUNT(*) FILTER (WHERE status='reversed') as reversed,
    COALESCE(SUM(total_debit), 0) as total_debit,
    COALESCE(SUM(total_credit), 0) as total_credit,
    COUNT(*) FILTER (WHERE is_balanced = false) as unbalanced,
    COUNT(*) FILTER (WHERE is_recurring = true) as recurring,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='posted'), 0) as posted_amount,
    COALESCE(SUM(amount) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month_amount
  FROM journal_entries WHERE status != 'cancelled'`);
  res.json(rows.rows?.[0] || {});
});

router.post("/journal-entries", async (req, res) => {
  try {
    const d = JournalEntrySchema.parse(req.body);
    const num = await nextNum("JE-", "journal_entries", "entry_number");
    const user = (req as any).user;
    const entryDate = d.entryDate || new Date().toISOString().slice(0, 10);
    const entryType = d.entryType || "standard";
    const currency = d.currency || "ILS";
    const status = d.status || "draft";
    const amount = parseNum(d.amount);
    const amountIls = parseNum(d.amountIls, amount);
    const exchangeRate = parseNum(d.exchangeRate, 1);
    const fiscalYear = d.fiscalYear || new Date().getFullYear();
    const fiscalPeriod = d.fiscalPeriod || new Date().getMonth() + 1;

    await db.execute(sql`INSERT INTO journal_entries (entry_number, entry_date, description, reference, entry_type, debit_account_id, debit_account_name, credit_account_id, credit_account_name, amount, currency, exchange_rate, amount_ils, status, source_document, source_type, notes, created_by, created_by_name, fiscal_year, fiscal_period, tags, is_recurring, recurring_frequency)
      VALUES (${num}, ${entryDate}, ${parseStr(d.description)}, ${parseStr(d.reference)}, ${entryType}, ${d.debitAccountId ?? null}, ${parseStr(d.debitAccountName)}, ${d.creditAccountId ?? null}, ${parseStr(d.creditAccountName)}, ${amount}, ${currency}, ${exchangeRate}, ${amountIls}, ${status}, ${parseStr(d.sourceDocument)}, ${parseStr(d.sourceType)}, ${parseStr(d.notes)}, ${user?.id ?? null}, ${parseStr(user?.fullName)}, ${fiscalYear}, ${fiscalPeriod}, ${parseStr(d.tags)}, ${d.isRecurring || false}, ${parseStr(d.recurringFrequency)})`);
    const rows = await db.execute(sql`SELECT * FROM journal_entries WHERE entry_number=${num}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/journal-entries/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const d = JournalEntrySchema.parse(req.body);
    const user = (req as any).user;
    const sets: SQL[] = [];

    if (d.entryDate) sets.push(sql`entry_date = ${d.entryDate}`);
    if (d.description) sets.push(sql`description = ${d.description}`);
    if (d.reference !== undefined) sets.push(sql`reference = ${parseStr(d.reference)}`);
    if (d.entryType) sets.push(sql`entry_type = ${d.entryType}`);
    if (d.debitAccountId !== undefined) sets.push(sql`debit_account_id = ${d.debitAccountId}`);
    if (d.debitAccountName) sets.push(sql`debit_account_name = ${d.debitAccountName}`);
    if (d.creditAccountId !== undefined) sets.push(sql`credit_account_id = ${d.creditAccountId}`);
    if (d.creditAccountName) sets.push(sql`credit_account_name = ${d.creditAccountName}`);
    if (d.amount !== undefined) sets.push(sql`amount = ${d.amount}`);
    if (d.currency) sets.push(sql`currency = ${d.currency}`);
    if (d.status) {
      sets.push(sql`status = ${d.status}`);
      if (d.status === "approved") {
        sets.push(sql`approved_by = ${user?.id ?? null}`);
        sets.push(sql`approved_by_name = ${parseStr(user?.fullName)}`);
        sets.push(sql.raw("approved_at = NOW()"));
      }
      if (d.status === "posted") sets.push(sql.raw("posted_at = NOW()"));
      if (d.status === "reversed") sets.push(sql.raw("reversed_at = NOW()"));
    }
    if (d.notes !== undefined) sets.push(sql`notes = ${parseStr(d.notes)}`);
    if (d.exchangeRate !== undefined) sets.push(sql`exchange_rate = ${d.exchangeRate}`);
    if (d.fiscalYear) sets.push(sql`fiscal_year = ${d.fiscalYear}`);
    if (d.fiscalPeriod) sets.push(sql`fiscal_period = ${d.fiscalPeriod}`);
    if (d.isRecurring !== undefined) sets.push(sql`is_recurring = ${d.isRecurring}`);
    if (d.recurringFrequency !== undefined) sets.push(sql`recurring_frequency = ${parseStr(d.recurringFrequency)}`);
    sets.push(sql.raw("updated_at = NOW()"));

    if (sets.length > 0) {
      await db.execute(buildDynamicUpdate("journal_entries", sets, id));
    }
    const rows = await db.execute(sql`SELECT * FROM journal_entries WHERE id=${id}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/journal-entries/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await db.execute(sql`DELETE FROM journal_entries WHERE id=${id} AND status='draft'`);
  res.json({ success: true });
});

router.get("/journal-entries/:id/lines", async (req, res) => {
  const id = parseId(req.params.id);
  const rows = await db.execute(sql`SELECT * FROM journal_entry_lines WHERE journal_entry_id=${id} ORDER BY line_number ASC`);
  res.json(rows.rows || []);
});

router.post("/journal-entries/:id/lines", async (req, res) => {
  try {
    const entryId = parseId(req.params.id);
    const d = req.body;
    const lines = Array.isArray(d) ? d : [d];
    const lineValues = lines.map(line => {
      const debitAmount = parseNum(line.debitAmount);
      const creditAmount = parseNum(line.creditAmount);
      const exchRate = parseNum(line.exchangeRate, 1);
      return {
        journalEntryId: entryId,
        lineNumber: parseNum(line.lineNumber, 1),
        accountNumber: parseStr(line.accountNumber),
        accountName: parseStr(line.accountName),
        accountId: line.accountId ?? null,
        debitAmount: String(debitAmount),
        creditAmount: String(creditAmount),
        currency: line.currency || "ILS",
        exchangeRate: String(exchRate),
        debitAmountIls: String(debitAmount * exchRate),
        creditAmountIls: String(creditAmount * exchRate),
        costCenter: parseStr(line.costCenter),
        department: parseStr(line.department),
        projectName: parseStr(line.projectName),
        taxCode: parseStr(line.taxCode),
        taxAmount: String(parseNum(line.taxAmount)),
        description: parseStr(line.description),
        reference: parseStr(line.reference),
        notes: parseStr(line.notes),
      };
    });
    await db.insert(journalEntryLinesTable).values(lineValues);
    const allLines = await db.execute(sql`SELECT * FROM journal_entry_lines WHERE journal_entry_id=${entryId} ORDER BY line_number ASC`);
    const lineRows = allLines.rows || [];
    const totalDebit = lineRows.reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0);
    const totalCredit = lineRows.reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0);
    await db.execute(sql`UPDATE journal_entries SET total_debit=${totalDebit}, total_credit=${totalCredit}, is_balanced=${totalDebit === totalCredit}, lines_count=${lineRows.length}, updated_at=NOW() WHERE id=${entryId}`);
    res.json(lineRows);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/journal-entry-lines/:lineId", async (req, res) => {
  const lineId = parseId(req.params.lineId);
  const lineResult = await db.execute(sql`SELECT journal_entry_id FROM journal_entry_lines WHERE id=${lineId}`);
  await db.execute(sql`DELETE FROM journal_entry_lines WHERE id=${lineId}`);
  const entryRow = lineResult.rows?.[0] as any;
  if (entryRow) {
    const entryId = entryRow.journal_entry_id;
    const allLines = await db.execute(sql`SELECT * FROM journal_entry_lines WHERE journal_entry_id=${entryId}`);
    const lineRows = allLines.rows || [];
    const totalDebit = lineRows.reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0);
    const totalCredit = lineRows.reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0);
    await db.execute(sql`UPDATE journal_entries SET total_debit=${totalDebit}, total_credit=${totalCredit}, is_balanced=${totalDebit === totalCredit}, lines_count=${lineRows.length}, updated_at=NOW() WHERE id=${entryId}`);
  }
  res.json({ success: true });
});

const BankReconciliationSchema = z.object({
  bankAccountId: z.coerce.number().nullable().optional(),
  bankAccountName: z.string().nullable().optional(),
  statementDate: z.string().optional(),
  statementStartDate: z.string().nullable().optional(),
  statementEndDate: z.string().nullable().optional(),
  openingBalanceBank: z.coerce.number().optional(),
  closingBalanceBank: z.coerce.number().optional(),
  openingBalanceBooks: z.coerce.number().optional(),
  closingBalanceBooks: z.coerce.number().optional(),
  depositsInTransit: z.coerce.number().optional(),
  outstandingChecks: z.coerce.number().optional(),
  bankCharges: z.coerce.number().optional(),
  interestEarned: z.coerce.number().optional(),
  otherAdjustments: z.coerce.number().optional(),
  difference: z.coerce.number().optional(),
  status: z.string().optional(),
  reconciledItemsCount: z.coerce.number().optional(),
  unreconciledItemsCount: z.coerce.number().optional(),
  notes: z.string().nullable().optional(),
  currency: z.string().optional(),
});

router.get("/bank-reconciliations", async (_req, res) => {
  const rows = await db.execute(sql`SELECT * FROM bank_reconciliations ORDER BY statement_date DESC, id DESC`);
  res.json(rows.rows || []);
});

router.get("/bank-reconciliations/stats", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COALESCE(SUM(ABS(difference)), 0) as total_differences,
    COALESCE(SUM(reconciled_items_count), 0) as total_reconciled_items,
    COALESCE(SUM(unreconciled_items_count), 0) as total_unreconciled_items,
    COUNT(DISTINCT bank_account_id) as accounts_count
  FROM bank_reconciliations`);
  res.json(rows.rows?.[0] || {});
});

router.post("/bank-reconciliations", async (req, res) => {
  try {
    const d = BankReconciliationSchema.parse(req.body);
    const num = await nextNum("BRC-", "bank_reconciliations", "reconciliation_number");
    const user = (req as any).user;
    const statementDate = d.statementDate || new Date().toISOString().slice(0, 10);
    const currency = d.currency || "ILS";
    const status = d.status || "in_progress";

    await db.execute(sql`INSERT INTO bank_reconciliations (reconciliation_number, bank_account_id, bank_account_name, statement_date, statement_start_date, statement_end_date, opening_balance_bank, closing_balance_bank, opening_balance_books, closing_balance_books, deposits_in_transit, outstanding_checks, bank_charges, interest_earned, other_adjustments, difference, status, reconciled_items_count, unreconciled_items_count, notes, reconciled_by, reconciled_by_name, currency)
      VALUES (${num}, ${d.bankAccountId ?? null}, ${parseStr(d.bankAccountName)}, ${statementDate}, ${parseStr(d.statementStartDate)}, ${parseStr(d.statementEndDate)}, ${parseNum(d.openingBalanceBank)}, ${parseNum(d.closingBalanceBank)}, ${parseNum(d.openingBalanceBooks)}, ${parseNum(d.closingBalanceBooks)}, ${parseNum(d.depositsInTransit)}, ${parseNum(d.outstandingChecks)}, ${parseNum(d.bankCharges)}, ${parseNum(d.interestEarned)}, ${parseNum(d.otherAdjustments)}, ${parseNum(d.difference)}, ${status}, ${parseNum(d.reconciledItemsCount)}, ${parseNum(d.unreconciledItemsCount)}, ${parseStr(d.notes)}, ${user?.id ?? null}, ${parseStr(user?.fullName)}, ${currency})`);
    const rows = await db.execute(sql`SELECT * FROM bank_reconciliations WHERE reconciliation_number=${num}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/bank-reconciliations/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const d = BankReconciliationSchema.parse(req.body);
    const sets: SQL[] = [];

    if (d.bankAccountId !== undefined) sets.push(sql`bank_account_id = ${d.bankAccountId}`);
    if (d.bankAccountName) sets.push(sql`bank_account_name = ${d.bankAccountName}`);
    if (d.statementDate) sets.push(sql`statement_date = ${d.statementDate}`);
    if (d.closingBalanceBank !== undefined) sets.push(sql`closing_balance_bank = ${d.closingBalanceBank}`);
    if (d.closingBalanceBooks !== undefined) sets.push(sql`closing_balance_books = ${d.closingBalanceBooks}`);
    if (d.depositsInTransit !== undefined) sets.push(sql`deposits_in_transit = ${d.depositsInTransit}`);
    if (d.outstandingChecks !== undefined) sets.push(sql`outstanding_checks = ${d.outstandingChecks}`);
    if (d.bankCharges !== undefined) sets.push(sql`bank_charges = ${d.bankCharges}`);
    if (d.interestEarned !== undefined) sets.push(sql`interest_earned = ${d.interestEarned}`);
    if (d.otherAdjustments !== undefined) sets.push(sql`other_adjustments = ${d.otherAdjustments}`);
    if (d.difference !== undefined) sets.push(sql`difference = ${d.difference}`);
    if (d.status) {
      sets.push(sql`status = ${d.status}`);
      if (d.status === "completed") sets.push(sql.raw("reconciled_at = NOW()"));
    }
    if (d.reconciledItemsCount !== undefined) sets.push(sql`reconciled_items_count = ${d.reconciledItemsCount}`);
    if (d.unreconciledItemsCount !== undefined) sets.push(sql`unreconciled_items_count = ${d.unreconciledItemsCount}`);
    if (d.notes !== undefined) sets.push(sql`notes = ${parseStr(d.notes)}`);
    sets.push(sql.raw("updated_at = NOW()"));

    if (sets.length > 0) {
      await db.execute(buildDynamicUpdate("bank_reconciliations", sets, id));
    }
    const rows = await db.execute(sql`SELECT * FROM bank_reconciliations WHERE id=${id}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/bank-reconciliations/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await db.execute(sql`DELETE FROM bank_reconciliations WHERE id=${id} AND status='in_progress'`);
  res.json({ success: true });
});

router.get("/bank-accounts-list", async (_req, res) => {
  const rows = await db.execute(sql`SELECT id, bank_name, branch_number, account_number, account_type, current_balance, available_balance, credit_limit, currency, is_active, last_reconciled_at FROM bank_accounts WHERE is_active=true ORDER BY bank_name, account_number`);
  res.json(rows.rows || []);
});

router.get("/bank-reconciliations/:id/items", async (req, res) => {
  const id = parseId(req.params.id);
  const rows = await db.execute(sql`SELECT * FROM reconciliation_items WHERE reconciliation_id=${id} ORDER BY item_date ASC, id ASC`);
  res.json(rows.rows || []);
});

router.post("/bank-reconciliations/:id/items", async (req, res) => {
  try {
    const recId = parseId(req.params.id);
    const d = req.body;
    const num = await nextNum("RI-", "reconciliation_items", "item_number");
    const itemDate = d.itemDate || new Date().toISOString().slice(0, 10);
    const itemType = d.itemType || "bank_only";
    const source = d.source || "manual";

    await db.execute(sql`INSERT INTO reconciliation_items (reconciliation_id, item_number, item_date, description, reference, item_type, amount, debit_amount, credit_amount, bank_amount, book_amount, difference, matched, category, source, notes)
      VALUES (${recId}, ${num}, ${itemDate}, ${parseStr(d.description)}, ${parseStr(d.reference)}, ${itemType}, ${parseNum(d.amount)}, ${parseNum(d.debitAmount)}, ${parseNum(d.creditAmount)}, ${parseNum(d.bankAmount)}, ${parseNum(d.bookAmount)}, ${parseNum(d.difference)}, ${d.matched || false}, ${parseStr(d.category)}, ${source}, ${parseStr(d.notes)})`);

    const allItems = await db.execute(sql`SELECT * FROM reconciliation_items WHERE reconciliation_id=${recId}`);
    const itemRows = allItems.rows || [];
    const matchedCount = itemRows.filter((i: any) => i.matched).length;
    const unmatchedCount = itemRows.length - matchedCount;
    const matchRate = itemRows.length > 0 ? ((matchedCount / itemRows.length) * 100).toFixed(1) : '0';
    await db.execute(sql`UPDATE bank_reconciliations SET total_items_count=${itemRows.length}, reconciled_items_count=${matchedCount}, unreconciled_items_count=${unmatchedCount}, match_rate=${parseFloat(matchRate)}, updated_at=NOW() WHERE id=${recId}`);
    res.json(itemRows);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/bank-reconciliations/items/:id", async (req, res) => {
  try {
    const itemId = parseId(req.params.id);
    const d = req.body;
    const sets: SQL[] = [];

    if (d.description !== undefined) sets.push(sql`description = ${parseStr(d.description)}`);
    if (d.amount !== undefined) sets.push(sql`amount = ${d.amount}`);
    if (d.matched !== undefined) {
      sets.push(sql`matched = ${d.matched}`);
      if (d.matched && !d.matchedDate) sets.push(sql.raw("matched_date = CURRENT_DATE"));
    }
    if (d.itemType) sets.push(sql`item_type = ${d.itemType}`);
    if (d.bankAmount !== undefined) sets.push(sql`bank_amount = ${d.bankAmount}`);
    if (d.bookAmount !== undefined) sets.push(sql`book_amount = ${d.bookAmount}`);
    if (d.difference !== undefined) sets.push(sql`difference = ${d.difference}`);
    if (d.category !== undefined) sets.push(sql`category = ${parseStr(d.category)}`);
    if (d.notes !== undefined) sets.push(sql`notes = ${parseStr(d.notes)}`);

    if (sets.length > 0) {
      await db.execute(buildDynamicUpdate("reconciliation_items", sets, itemId));

      const item = await db.execute(sql`SELECT reconciliation_id FROM reconciliation_items WHERE id=${itemId}`);
      const itemRow = item.rows?.[0] as any;
      if (itemRow) {
        const recId = itemRow.reconciliation_id;
        const allItems = await db.execute(sql`SELECT * FROM reconciliation_items WHERE reconciliation_id=${recId}`);
        const itemRows = allItems.rows || [];
        const matchedCount = itemRows.filter((i: any) => i.matched).length;
        const unmatchedCount = itemRows.length - matchedCount;
        const matchRate = itemRows.length > 0 ? ((matchedCount / itemRows.length) * 100).toFixed(1) : '0';
        await db.execute(sql`UPDATE bank_reconciliations SET reconciled_items_count=${matchedCount}, unreconciled_items_count=${unmatchedCount}, match_rate=${parseFloat(matchRate)}, updated_at=NOW() WHERE id=${recId}`);
      }
    }
    const rows = await db.execute(sql`SELECT * FROM reconciliation_items WHERE id=${itemId}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/bank-reconciliations/items/:id", async (req, res) => {
  const itemId = parseId(req.params.id);
  const item = await db.execute(sql`SELECT reconciliation_id FROM reconciliation_items WHERE id=${itemId}`);
  await db.execute(sql`DELETE FROM reconciliation_items WHERE id=${itemId}`);
  const itemRow = item.rows?.[0] as any;
  if (itemRow) {
    const recId = itemRow.reconciliation_id;
    const allItems = await db.execute(sql`SELECT * FROM reconciliation_items WHERE reconciliation_id=${recId}`);
    const itemRows = allItems.rows || [];
    const matchedCount = itemRows.filter((i: any) => i.matched).length;
    const unmatchedCount = itemRows.length - matchedCount;
    const matchRate = itemRows.length > 0 ? ((matchedCount / itemRows.length) * 100).toFixed(1) : '0';
    await db.execute(sql`UPDATE bank_reconciliations SET total_items_count=${itemRows.length}, reconciled_items_count=${matchedCount}, unreconciled_items_count=${unmatchedCount}, match_rate=${parseFloat(matchRate)}, updated_at=NOW() WHERE id=${recId}`);
  }
  res.json({ success: true });
});

router.post("/bank-reconciliations/:id/match-item/:itemId", async (req, res) => {
  const recId = parseId(req.params.id);
  const itemId = parseId(req.params.itemId);
  await db.execute(sql`UPDATE reconciliation_items SET matched=true, matched_date=CURRENT_DATE WHERE id=${itemId} AND reconciliation_id=${recId}`);
  const allItems = await db.execute(sql`SELECT * FROM reconciliation_items WHERE reconciliation_id=${recId}`);
  const itemRows = allItems.rows || [];
  const matchedCount = itemRows.filter((i: any) => i.matched).length;
  const unmatchedCount = itemRows.length - matchedCount;
  const matchRate = itemRows.length > 0 ? ((matchedCount / itemRows.length) * 100).toFixed(1) : '0';
  await db.execute(sql`UPDATE bank_reconciliations SET reconciled_items_count=${matchedCount}, unreconciled_items_count=${unmatchedCount}, match_rate=${parseFloat(matchRate)}, updated_at=NOW() WHERE id=${recId}`);
  res.json({ success: true, matchedCount, unmatchedCount });
});

const CashFlowSchema = z.object({
  recordDate: z.string().optional(),
  flowType: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
  bankAccountId: z.coerce.number().nullable().optional(),
  bankAccountName: z.string().nullable().optional(),
  isRecurring: z.coerce.boolean().optional(),
  recurringFrequency: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  sourceReference: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  isForecast: z.coerce.boolean().optional(),
  forecastDate: z.string().nullable().optional(),
  forecastProbability: z.coerce.number().optional(),
  actualDate: z.string().nullable().optional(),
  actualAmount: z.coerce.number().nullable().optional(),
  fiscalYear: z.coerce.number().optional(),
  fiscalPeriod: z.coerce.number().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/cash-flow", async (_req, res) => {
  const rows = await db.execute(sql`SELECT * FROM cash_flow_records ORDER BY record_date DESC, id DESC`);
  res.json(rows.rows || []);
});

router.get("/cash-flow/stats", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    COUNT(*) as total,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='inflow' AND status='actual'), 0) as total_inflows,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='outflow' AND status='actual'), 0) as total_outflows,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='inflow' AND status='actual'), 0) - COALESCE(SUM(amount) FILTER (WHERE flow_type='outflow' AND status='actual'), 0) as net_flow,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='inflow' AND record_date >= DATE_TRUNC('month', CURRENT_DATE) AND status='actual'), 0) as month_inflows,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='outflow' AND record_date >= DATE_TRUNC('month', CURRENT_DATE) AND status='actual'), 0) as month_outflows,
    COUNT(*) FILTER (WHERE status='forecast') as forecasts,
    COUNT(*) FILTER (WHERE is_recurring=true) as recurring
  FROM cash_flow_records WHERE status != 'cancelled'`);
  res.json(rows.rows?.[0] || {});
});

router.post("/cash-flow", async (req, res) => {
  try {
    const d = CashFlowSchema.parse(req.body);
    const num = await nextNum("CF-", "cash_flow_records", "record_number");
    const user = (req as any).user;
    const recordDate = d.recordDate || new Date().toISOString().slice(0, 10);
    const flowType = d.flowType || "inflow";
    const category = d.category || "כללי";
    const currency = d.currency || "ILS";
    const status = d.status || "actual";

    await db.execute(sql`INSERT INTO cash_flow_records (record_number, record_date, flow_type, category, sub_category, description, amount, currency, bank_account_id, bank_account_name, is_recurring, recurring_frequency, source_type, source_reference, customer_name, supplier_name, project_name, is_forecast, forecast_date, forecast_probability, actual_date, actual_amount, fiscal_year, fiscal_period, status, notes, created_by)
      VALUES (${num}, ${recordDate}, ${flowType}, ${category}, ${parseStr(d.subCategory)}, ${parseStr(d.description)}, ${parseNum(d.amount)}, ${currency}, ${d.bankAccountId ?? null}, ${parseStr(d.bankAccountName)}, ${d.isRecurring || false}, ${parseStr(d.recurringFrequency)}, ${parseStr(d.sourceType)}, ${parseStr(d.sourceReference)}, ${parseStr(d.customerName)}, ${parseStr(d.supplierName)}, ${parseStr(d.projectName)}, ${d.isForecast || false}, ${parseStr(d.forecastDate)}, ${parseNum(d.forecastProbability, 100)}, ${parseStr(d.actualDate)}, ${d.actualAmount ?? null}, ${d.fiscalYear || new Date().getFullYear()}, ${d.fiscalPeriod || new Date().getMonth() + 1}, ${status}, ${parseStr(d.notes)}, ${user?.id ?? null})`);
    const rows = await db.execute(sql`SELECT * FROM cash_flow_records WHERE record_number=${num}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/cash-flow/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const d = CashFlowSchema.parse(req.body);
    const sets: SQL[] = [];

    if (d.recordDate) sets.push(sql`record_date = ${d.recordDate}`);
    if (d.flowType) sets.push(sql`flow_type = ${d.flowType}`);
    if (d.category) sets.push(sql`category = ${d.category}`);
    if (d.subCategory !== undefined) sets.push(sql`sub_category = ${parseStr(d.subCategory)}`);
    if (d.description !== undefined) sets.push(sql`description = ${parseStr(d.description)}`);
    if (d.amount !== undefined) sets.push(sql`amount = ${d.amount}`);
    if (d.status) sets.push(sql`status = ${d.status}`);
    if (d.actualAmount !== undefined) sets.push(sql`actual_amount = ${d.actualAmount}`);
    if (d.actualDate) sets.push(sql`actual_date = ${d.actualDate}`);
    if (d.notes !== undefined) sets.push(sql`notes = ${parseStr(d.notes)}`);
    sets.push(sql.raw("updated_at = NOW()"));

    if (sets.length > 0) {
      await db.execute(buildDynamicUpdate("cash_flow_records", sets, id));
    }
    const rows = await db.execute(sql`SELECT * FROM cash_flow_records WHERE id=${id}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/cash-flow/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await db.execute(sql`DELETE FROM cash_flow_records WHERE id=${id}`);
  res.json({ success: true });
});

router.get("/cash-flow/monthly", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    TO_CHAR(record_date, 'YYYY-MM') as month,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='inflow'), 0) as inflows,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='outflow'), 0) as outflows,
    COALESCE(SUM(amount) FILTER (WHERE flow_type='inflow'), 0) - COALESCE(SUM(amount) FILTER (WHERE flow_type='outflow'), 0) as net,
    COUNT(*) FILTER (WHERE flow_type='inflow') as inflow_count,
    COUNT(*) FILTER (WHERE flow_type='outflow') as outflow_count
  FROM cash_flow_records WHERE status IN ('actual','confirmed')
  GROUP BY TO_CHAR(record_date, 'YYYY-MM') ORDER BY month DESC LIMIT 24`);
  res.json(rows.rows || []);
});

router.get("/cash-flow/by-category", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    category,
    flow_type,
    COUNT(*) as count,
    COALESCE(SUM(amount), 0) as total,
    COALESCE(AVG(amount), 0) as avg_amount
  FROM cash_flow_records WHERE status IN ('actual','confirmed')
  GROUP BY category, flow_type ORDER BY total DESC`);
  res.json(rows.rows || []);
});

router.get("/cash-flow/forecast-vs-actual", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    TO_CHAR(record_date, 'YYYY-MM') as month,
    COALESCE(SUM(amount) FILTER (WHERE status='actual'), 0) as actual_total,
    COALESCE(SUM(amount) FILTER (WHERE status='forecast'), 0) as forecast_total,
    COALESCE(SUM(amount) FILTER (WHERE status='actual'), 0) - COALESCE(SUM(amount) FILTER (WHERE status='forecast'), 0) as variance,
    COUNT(*) FILTER (WHERE status='actual') as actual_count,
    COUNT(*) FILTER (WHERE status='forecast') as forecast_count
  FROM cash_flow_records WHERE status IN ('actual','forecast')
  GROUP BY TO_CHAR(record_date, 'YYYY-MM') ORDER BY month DESC LIMIT 12`);
  res.json(rows.rows || []);
});

const TaxRecordSchema = z.object({
  taxType: z.string().optional(),
  taxPeriod: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  filingDeadline: z.string().nullable().optional(),
  filingDate: z.string().nullable().optional(),
  taxBase: z.coerce.number().optional(),
  taxRate: z.coerce.number().optional(),
  taxAmount: z.coerce.number().optional(),
  inputVat: z.coerce.number().optional(),
  outputVat: z.coerce.number().optional(),
  withholdingTax: z.coerce.number().optional(),
  advancePayments: z.coerce.number().optional(),
  amountDue: z.coerce.number().optional(),
  amountPaid: z.coerce.number().optional(),
  paymentDate: z.string().nullable().optional(),
  paymentReference: z.string().nullable().optional(),
  status: z.string().optional(),
  filingStatus: z.string().optional(),
  confirmationNumber: z.string().nullable().optional(),
  taxAuthority: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/tax-records", async (_req, res) => {
  const rows = await db.execute(sql`SELECT * FROM tax_records ORDER BY period_end DESC, id DESC`);
  res.json(rows.rows || []);
});

router.get("/tax-records/stats", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='filed') as filed,
    COUNT(*) FILTER (WHERE status='paid') as paid,
    COUNT(*) FILTER (WHERE status='overdue') as overdue,
    COALESCE(SUM(amount_due), 0) as total_due,
    COALESCE(SUM(amount_paid), 0) as total_paid,
    COUNT(*) FILTER (WHERE filing_deadline < CURRENT_DATE AND filing_status='not_filed') as overdue_filings
  FROM tax_records WHERE status != 'cancelled'`);
  res.json(rows.rows?.[0] || {});
});

router.post("/tax-records", async (req, res) => {
  try {
    const d = TaxRecordSchema.parse(req.body);
    const num = await nextNum("TAX-", "tax_records", "record_number");
    const user = (req as any).user;
    const taxType = d.taxType || "vat";
    const taxPeriod = d.taxPeriod || "";
    const periodStart = d.periodStart || new Date().toISOString().slice(0, 10);
    const periodEnd = d.periodEnd || new Date().toISOString().slice(0, 10);
    const status = d.status || "pending";
    const filingStatus = d.filingStatus || "not_filed";
    const taxAuthority = d.taxAuthority || "רשות המסים";
    const currency = d.currency || "ILS";

    await db.execute(sql`INSERT INTO tax_records (record_number, tax_type, tax_period, period_start, period_end, filing_deadline, filing_date, tax_base, tax_rate, tax_amount, input_vat, output_vat, withholding_tax, advance_payments, amount_due, amount_paid, payment_date, payment_reference, status, filing_status, confirmation_number, tax_authority, currency, notes, created_by, created_by_name)
      VALUES (${num}, ${taxType}, ${taxPeriod}, ${periodStart}, ${periodEnd}, ${parseStr(d.filingDeadline)}, ${parseStr(d.filingDate)}, ${parseNum(d.taxBase)}, ${parseNum(d.taxRate, 17)}, ${parseNum(d.taxAmount)}, ${parseNum(d.inputVat)}, ${parseNum(d.outputVat)}, ${parseNum(d.withholdingTax)}, ${parseNum(d.advancePayments)}, ${parseNum(d.amountDue)}, ${parseNum(d.amountPaid)}, ${parseStr(d.paymentDate)}, ${parseStr(d.paymentReference)}, ${status}, ${filingStatus}, ${parseStr(d.confirmationNumber)}, ${taxAuthority}, ${currency}, ${parseStr(d.notes)}, ${user?.id ?? null}, ${parseStr(user?.fullName)})`);
    const rows = await db.execute(sql`SELECT * FROM tax_records WHERE record_number=${num}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/tax-records/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const d = TaxRecordSchema.parse(req.body);
    const sets: SQL[] = [];

    if (d.taxType) sets.push(sql`tax_type = ${d.taxType}`);
    if (d.taxPeriod) sets.push(sql`tax_period = ${d.taxPeriod}`);
    if (d.periodStart) sets.push(sql`period_start = ${d.periodStart}`);
    if (d.periodEnd) sets.push(sql`period_end = ${d.periodEnd}`);
    if (d.filingDeadline) sets.push(sql`filing_deadline = ${d.filingDeadline}`);
    if (d.filingDate) sets.push(sql`filing_date = ${d.filingDate}`);
    if (d.taxBase !== undefined) sets.push(sql`tax_base = ${d.taxBase}`);
    if (d.taxRate !== undefined) sets.push(sql`tax_rate = ${d.taxRate}`);
    if (d.taxAmount !== undefined) sets.push(sql`tax_amount = ${d.taxAmount}`);
    if (d.inputVat !== undefined) sets.push(sql`input_vat = ${d.inputVat}`);
    if (d.outputVat !== undefined) sets.push(sql`output_vat = ${d.outputVat}`);
    if (d.amountDue !== undefined) sets.push(sql`amount_due = ${d.amountDue}`);
    if (d.amountPaid !== undefined) sets.push(sql`amount_paid = ${d.amountPaid}`);
    if (d.status) sets.push(sql`status = ${d.status}`);
    if (d.filingStatus) sets.push(sql`filing_status = ${d.filingStatus}`);
    if (d.notes !== undefined) sets.push(sql`notes = ${parseStr(d.notes)}`);
    sets.push(sql.raw("updated_at = NOW()"));

    if (sets.length > 0) {
      await db.execute(buildDynamicUpdate("tax_records", sets, id));
    }
    const rows = await db.execute(sql`SELECT * FROM tax_records WHERE id=${id}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/tax-records/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await db.execute(sql`DELETE FROM tax_records WHERE id=${id} AND status IN ('pending','cancelled')`);
  res.json({ success: true });
});

router.get("/tax-records/by-type", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    tax_type,
    COUNT(*) as count,
    COALESCE(SUM(tax_amount), 0) as total_tax,
    COALESCE(SUM(amount_due), 0) as total_due,
    COALESCE(SUM(amount_paid), 0) as total_paid,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COUNT(*) FILTER (WHERE status='overdue') as overdue_count,
    COUNT(*) FILTER (WHERE filing_status='not_filed' AND filing_deadline < CURRENT_DATE) as overdue_filings
  FROM tax_records WHERE status != 'cancelled'
  GROUP BY tax_type ORDER BY total_tax DESC`);
  res.json(rows.rows || []);
});

router.get("/tax-records/vat-report", async (_req, res) => {
  const rows = await db.execute(sql`SELECT
    tax_period,
    period_start, period_end,
    COALESCE(SUM(output_vat), 0) as total_output_vat,
    COALESCE(SUM(input_vat), 0) as total_input_vat,
    COALESCE(SUM(net_vat), 0) as total_net_vat,
    COALESCE(SUM(amount_paid), 0) as total_paid,
    COALESCE(SUM(balance_due), 0) as total_balance,
    MAX(filing_deadline) as deadline,
    MAX(filing_status) as filing_status,
    MAX(status) as status
  FROM tax_records WHERE tax_type='vat' AND status != 'cancelled'
  GROUP BY tax_period, period_start, period_end
  ORDER BY period_end DESC LIMIT 24`);
  res.json(rows.rows || []);
});

router.get("/tax-records/deadlines", async (_req, res) => {
  const rows = await db.execute(sql`SELECT id, record_number, tax_type, tax_period, filing_deadline, amount_due, balance_due, status, filing_status
    FROM tax_records
    WHERE status NOT IN ('paid','cancelled') AND filing_deadline IS NOT NULL
    ORDER BY filing_deadline ASC LIMIT 20`);
  res.json(rows.rows || []);
});

router.get("/finance/trial-balance", async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT
      account_number, account_name, account_type, parent_account_id,
      CASE WHEN account_type IN ('asset','expense') THEN COALESCE(balance, 0) ELSE 0 END as debit_balance,
      CASE WHEN account_type IN ('liability','equity','revenue') THEN COALESCE(balance, 0) ELSE 0 END as credit_balance,
      COALESCE(balance, 0) as balance,
      is_active, currency
    FROM financial_accounts WHERE is_active = true ORDER BY account_number`);
    const accountRows = rows.rows || [];
    const totalDebit = accountRows.reduce((s: number, r: any) => s + Number(r.debit_balance || 0), 0);
    const totalCredit = accountRows.reduce((s: number, r: any) => s + Number(r.credit_balance || 0), 0);
    res.json({ accounts: accountRows, totalDebit, totalCredit, difference: totalDebit - totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
  } catch (err: any) {
    console.error("Trial balance error:", err.message);
    res.status(500).json({ error: "Failed to load trial balance" });
  }
});

// ========== PAYMENT ANOMALY DETECTION ==========

async function ensureAnomalyTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS payment_anomalies (
    id SERIAL PRIMARY KEY,
    anomaly_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    supplier_name VARCHAR(255),
    supplier_id INTEGER,
    amount NUMERIC(15,2) DEFAULT 0,
    reference_amount NUMERIC(15,2),
    payment_date DATE,
    payment_id INTEGER,
    payment_ref VARCHAR(100),
    recommendation TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
}

export async function runPaymentAnomalyDetection(): Promise<{ newAnomalies: number; critical: number }> {
  return runAnomalyDetection();
}

async function runAnomalyDetection(): Promise<{ newAnomalies: number; critical: number }> {
  await ensureAnomalyTable();
  let newAnomalies = 0;
  let criticalCount = 0;

  // Fetch recent payments from accounts_payable (last 90 days)
  let payments: any[] = [];
  try {
    const paymentsResult = await db.execute(sql`
      SELECT p.id, p.amount, p.payment_date, p.payment_method, p.reference,
             ap.supplier_name, ap.supplier_id, ap.po_matched, ap.po_number, ap.created_at as ap_created_at
      FROM ap_payments p
      JOIN accounts_payable ap ON ap.id = p.ap_id
      WHERE p.payment_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY p.payment_date DESC, p.id DESC
      LIMIT 500
    `);
    payments = (paymentsResult as any).rows || [];
  } catch (err: any) {
    console.warn("[PaymentAnomaly] Could not fetch ap_payments (table may be empty):", err.message);
  }

  // Historical supplier averages
  let avgResult: any = { rows: [] };
  try {
    avgResult = await db.execute(sql`
      SELECT ap.supplier_name, ap.supplier_id,
             AVG(p.amount) as avg_amount,
             COUNT(p.id) as payment_count,
             MIN(p.payment_date) as first_payment
      FROM ap_payments p
      JOIN accounts_payable ap ON ap.id = p.ap_id
      WHERE p.payment_date >= CURRENT_DATE - INTERVAL '365 days'
      GROUP BY ap.supplier_name, ap.supplier_id
    `);
  } catch (err: any) {
    console.warn("[PaymentAnomaly] Could not fetch supplier averages:", err.message);
  }
  const supplierAvg: Record<string, { avg: number; count: number; firstPayment: string }> = {};
  for (const r of ((avgResult as any).rows || []) as any[]) {
    supplierAvg[r.supplier_name] = { avg: Number(r.avg_amount || 0), count: Number(r.payment_count || 0), firstPayment: r.first_payment };
  }

  const insertedKeys = new Set<string>();

  async function insertAnomaly(data: {
    anomalyType: string;
    severity: string;
    title: string;
    description: string;
    supplierName: string | null;
    supplierId: number | null;
    amount: number;
    referenceAmount: number | null;
    paymentDate: string | null;
    paymentId: number | null;
    paymentRef: string | null;
    recommendation: string;
  }) {
    const dedupeKey = `${data.anomalyType}-${data.paymentId || 0}-${data.supplierName || ''}`;
    if (insertedKeys.has(dedupeKey)) return;
    const existing = await db.execute(sql`SELECT id FROM payment_anomalies WHERE anomaly_type=${data.anomalyType} AND payment_id=${data.paymentId ?? null} AND status='open' LIMIT 1`);
    if (((existing as any).rows || []).length > 0) return;
    insertedKeys.add(dedupeKey);
    await db.execute(sql`INSERT INTO payment_anomalies (anomaly_type, severity, title, description, supplier_name, supplier_id, amount, reference_amount, payment_date, payment_id, payment_ref, recommendation)
      VALUES (${data.anomalyType}, ${data.severity}, ${data.title}, ${data.description}, ${data.supplierName}, ${data.supplierId}, ${data.amount}, ${data.referenceAmount}, ${data.paymentDate}, ${data.paymentId}, ${data.paymentRef}, ${data.recommendation})`);
    newAnomalies++;
    if (data.severity === 'critical') criticalCount++;
  }

  // 1. Duplicate payments — same supplier, similar amount, within 7 days
  const paymentsBySupplier: Record<string, any[]> = {};
  for (const p of payments) {
    const key = p.supplier_name || 'unknown';
    if (!paymentsBySupplier[key]) paymentsBySupplier[key] = [];
    paymentsBySupplier[key].push(p);
  }
  for (const [supplier, spayments] of Object.entries(paymentsBySupplier)) {
    for (let i = 0; i < spayments.length; i++) {
      for (let j = i + 1; j < spayments.length; j++) {
        const a = spayments[i], b = spayments[j];
        const daysDiff = Math.abs(new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()) / 86400000;
        const amountDiff = Math.abs(Number(a.amount) - Number(b.amount)) / Math.max(Number(a.amount), 1);
        if (daysDiff <= 7 && amountDiff < 0.05) {
          await insertAnomaly({
            anomalyType: 'duplicate_payment',
            severity: 'critical',
            title: `תשלום כפול חשוד — ${supplier}`,
            description: `תשלום של ₪${Number(a.amount).toLocaleString('he-IL')} ותשלום נוסף של ₪${Number(b.amount).toLocaleString('he-IL')} לאותו ספק בפרק ${Math.ceil(daysDiff)} ימים`,
            supplierName: supplier,
            supplierId: a.supplier_id,
            amount: Number(a.amount),
            referenceAmount: Number(b.amount),
            paymentDate: a.payment_date,
            paymentId: a.id,
            paymentRef: a.reference,
            recommendation: 'בדוק האם שני התשלומים לגיטימיים — שקול ביטול כפול',
          });
        }
      }
    }
  }

  // 2. Amount anomaly — 50%+ above supplier historical average
  for (const p of payments) {
    const avg = supplierAvg[p.supplier_name];
    if (!avg || avg.avg === 0 || avg.count < 3) continue;
    const ratio = Number(p.amount) / avg.avg;
    if (ratio > 1.5) {
      await insertAnomaly({
        anomalyType: 'amount_anomaly',
        severity: ratio > 2.5 ? 'critical' : 'warning',
        title: `סכום חריג לספק — ${p.supplier_name}`,
        description: `תשלום של ₪${Number(p.amount).toLocaleString('he-IL')} חורג ב-${Math.round((ratio - 1) * 100)}% מהממוצע ההיסטורי (₪${Math.round(avg.avg).toLocaleString('he-IL')})`,
        supplierName: p.supplier_name,
        supplierId: p.supplier_id,
        amount: Number(p.amount),
        referenceAmount: avg.avg,
        paymentDate: p.payment_date,
        paymentId: p.id,
        paymentRef: p.reference,
        recommendation: 'וודא כי הסכום אושר — בדוק הזמנת הרכש ואסמכתאות',
      });
    }
  }

  // 3. New supplier + large payment (first or second payment, amount > 10000)
  for (const p of payments) {
    const avg = supplierAvg[p.supplier_name];
    if (!avg || avg.count > 2) continue;
    if (Number(p.amount) > 10000) {
      await insertAnomaly({
        anomalyType: 'new_supplier_large',
        severity: 'warning',
        title: `ספק חדש + תשלום גבוה — ${p.supplier_name}`,
        description: `תשלום של ₪${Number(p.amount).toLocaleString('he-IL')} לספק עם ${avg.count} תשלום(ים) בלבד בהיסטוריה`,
        supplierName: p.supplier_name,
        supplierId: p.supplier_id,
        amount: Number(p.amount),
        referenceAmount: null,
        paymentDate: p.payment_date,
        paymentId: p.id,
        paymentRef: p.reference,
        recommendation: 'וודא שהספק אומת — בקש חשבונית ואישור מנהל לפני ביצוע',
      });
    }
  }

  // 4. Payments (executed) without PO match (po_matched=false on the parent AP, amount > 5000)
  let apRowsResult: any = { rows: [] };
  try {
    apRowsResult = await db.execute(sql`
      SELECT p.id AS payment_id, ap.supplier_name, ap.supplier_id, p.amount, p.payment_date, p.reference, ap.invoice_number
      FROM ap_payments p
      JOIN accounts_payable ap ON ap.id = p.ap_id
      WHERE ap.po_matched = false AND p.amount > 5000
      AND p.payment_date >= CURRENT_DATE - INTERVAL '30 days'
      LIMIT 100
    `);
  } catch (err: any) {
    console.warn("[PaymentAnomaly] Could not query ap_payments for no_po check:", err.message);
  }
  for (const ap of ((apRowsResult as any).rows || []) as any[]) {
    const existing = await db.execute(sql`SELECT id FROM payment_anomalies WHERE anomaly_type='no_po' AND payment_id=${ap.payment_id} AND status='open' LIMIT 1`);
    if (((existing as any).rows || []).length > 0) continue;
    await db.execute(sql`INSERT INTO payment_anomalies (anomaly_type, severity, title, description, supplier_name, supplier_id, amount, payment_date, payment_id, payment_ref, recommendation)
      VALUES ('no_po', 'warning', ${`תשלום ללא הזמנת רכש — ${ap.supplier_name}`}, ${`תשלום של ₪${Number(ap.amount).toLocaleString('he-IL')} בוצע ללא PO מאושר (חשבונית ${ap.invoice_number || ap.reference || ''})`}, ${ap.supplier_name}, ${ap.supplier_id}, ${Number(ap.amount)}, ${ap.payment_date}, ${ap.payment_id}, ${ap.reference}, 'בדוק מדוע התשלום בוצע ללא הזמנת רכש — הצמד PO בדיעבד')`);
    newAnomalies++;
  }

  // 5. Payments outside business hours (before 7:00 or after 19:00)
  let latePayResult: any = { rows: [] };
  try {
    latePayResult = await db.execute(sql`
      SELECT p.id, p.amount, p.payment_date, p.created_at, ap.supplier_name, ap.supplier_id, p.reference
      FROM ap_payments p
      JOIN accounts_payable ap ON ap.id = p.ap_id
      WHERE p.created_at >= CURRENT_DATE - INTERVAL '30 days'
      AND (EXTRACT(HOUR FROM p.created_at) < 7 OR EXTRACT(HOUR FROM p.created_at) >= 19)
      LIMIT 50
    `);
  } catch (err: any) {
    console.warn("[PaymentAnomaly] Could not query after-hours payments:", err.message);
  }
  for (const p of ((latePayResult as any).rows || []) as any[]) {
    const hour = new Date(p.created_at).getHours();
    const existing = await db.execute(sql`SELECT id FROM payment_anomalies WHERE anomaly_type='after_hours' AND payment_id=${p.id} LIMIT 1`);
    if (((existing as any).rows || []).length > 0) continue;
    await db.execute(sql`INSERT INTO payment_anomalies (anomaly_type, severity, title, description, supplier_name, supplier_id, amount, payment_date, payment_id, payment_ref, recommendation)
      VALUES ('after_hours', 'warning', ${`תשלום מחוץ לשעות עבודה — ${p.supplier_name}`}, ${`תשלום של ₪${Number(p.amount).toLocaleString('he-IL')} אושר בשעה ${hour}:00 (מחוץ לשעות 07:00–19:00)`}, ${p.supplier_name}, ${p.supplier_id}, ${Number(p.amount)}, ${p.payment_date}, ${p.id}, ${p.reference}, 'בדוק זהות המאשר — שקול הגבלת אישורי תשלום בשעות חריגות')`);
    newAnomalies++;
  }

  // 6. Many payments to same supplier in 24 hours (>= 3)
  let multiResult: any = { rows: [] };
  try {
    multiResult = await db.execute(sql`
      SELECT ap.supplier_name, ap.supplier_id, DATE(p.payment_date) as pay_day, COUNT(p.id) as cnt, SUM(p.amount) as total_amount
      FROM ap_payments p
      JOIN accounts_payable ap ON ap.id = p.ap_id
      WHERE p.payment_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ap.supplier_name, ap.supplier_id, DATE(p.payment_date)
      HAVING COUNT(p.id) >= 3
    `);
  } catch (err: any) {
    console.warn("[PaymentAnomaly] Could not query multiple payments:", err.message);
  }
  for (const r of ((multiResult as any).rows || []) as any[]) {
    const existing = await db.execute(sql`SELECT id FROM payment_anomalies WHERE anomaly_type='multiple_payments' AND supplier_name=${r.supplier_name} AND payment_date=${r.pay_day} AND status='open' LIMIT 1`);
    if (((existing as any).rows || []).length > 0) continue;
    await db.execute(sql`INSERT INTO payment_anomalies (anomaly_type, severity, title, description, supplier_name, supplier_id, amount, payment_date, recommendation)
      VALUES ('multiple_payments', 'warning', ${`ריבוי תשלומים — ${r.supplier_name}`}, ${`${r.cnt} תשלומים לאותו ספק ביום ${r.pay_day} בסכום כולל ₪${Number(r.total_amount).toLocaleString('he-IL')}`}, ${r.supplier_name}, ${r.supplier_id}, ${Number(r.total_amount)}, ${r.pay_day}, 'בדוק האם כל התשלומים מבוצעים לפי הזמנות שונות')`);
    newAnomalies++;
  }

  // Send notification if new critical anomalies found
  if (criticalCount > 0) {
    await createNotificationForAllUsers({
      type: 'payment_anomaly_critical',
      title: `${criticalCount} חריגות תשלום קריטיות זוהו`,
      message: `מנוע הזיהוי האוטומטי זיהה ${criticalCount} חריגות קריטיות חדשות — נדרשת בדיקה מיידית`,
      priority: 'critical',
      category: 'anomaly',
      actionUrl: '/finance/payment-anomalies',
    }).catch(() => {});
  } else if (newAnomalies > 0) {
    await createNotificationForAllUsers({
      type: 'payment_anomaly_new',
      title: `${newAnomalies} חריגות תשלום חדשות`,
      message: `מנוע הזיהוי האוטומטי זיהה ${newAnomalies} חריגות חדשות הדורשות בדיקה`,
      priority: 'high',
      category: 'anomaly',
      actionUrl: '/finance/payment-anomalies',
    }).catch(() => {});
  }

  return { newAnomalies, critical: criticalCount };
}

router.get("/payment-anomalies", async (_req, res) => {
  try {
    await ensureAnomalyTable();
    const result = await db.execute(sql`SELECT * FROM payment_anomalies ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      created_at DESC`);
    res.json(result.rows || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/payment-anomalies/stats", async (_req, res) => {
  try {
    await Promise.race([
      ensureAnomalyTable(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
    const result = await db.execute(sql`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='open') as open_count,
      COUNT(*) FILTER (WHERE severity='critical' AND status='open') as critical_count,
      COUNT(*) FILTER (WHERE severity='warning' AND status='open') as warning_count,
      COUNT(*) FILTER (WHERE status='approved') as approved_count,
      COUNT(*) FILTER (WHERE status='frozen') as frozen_count,
      COALESCE(SUM(amount) FILTER (WHERE status='open'), 0) as total_exposure,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as week_count
    FROM payment_anomalies`);
    res.json(result.rows?.[0] || {});
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/payment-anomalies/detect", async (_req, res) => {
  try {
    const result = await runAnomalyDetection();
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/payment-anomalies/:id/status", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { status } = req.body;
    const user = (req as any).user;
    if (!['approved', 'frozen', 'escalated', 'open'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const sets: SQL[] = [sql`status = ${status}`, sql.raw("updated_at = NOW()")];
    if (status !== 'open') {
      sets.push(sql`resolved_by = ${parseStr(user?.fullName)}`);
      sets.push(sql.raw("resolved_at = NOW()"));
    }
    await db.execute(buildDynamicUpdate("payment_anomalies", sets, id));
    const rows = await db.execute(sql`SELECT * FROM payment_anomalies WHERE id=${id}`);
    res.json(rows.rows?.[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete("/payment-anomalies/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await db.execute(sql`DELETE FROM payment_anomalies WHERE id=${id}`);
  res.json({ success: true });
});

router.get("/finance/reports/summary", async (_req, res) => {
  const balanceSheet = await db.execute(sql`SELECT
    COALESCE(SUM(balance) FILTER (WHERE account_type='asset'), 0) as total_assets,
    COALESCE(SUM(balance) FILTER (WHERE account_type='liability'), 0) as total_liabilities,
    COALESCE(SUM(balance) FILTER (WHERE account_type='equity'), 0) as total_equity,
    COALESCE(SUM(balance) FILTER (WHERE account_type='revenue'), 0) as total_revenue,
    COALESCE(SUM(balance) FILTER (WHERE account_type='expense'), 0) as total_expenses,
    COUNT(*) as account_count
  FROM financial_accounts WHERE is_active = true`);
  const bankTotal = await db.execute(sql`SELECT COALESCE(SUM(current_balance), 0) as total FROM bank_accounts WHERE is_active = true`);
  const arTotal = await db.execute(sql`SELECT COALESCE(SUM(balance_due), 0) as total FROM accounts_receivable WHERE status IN ('open','partial','overdue')`);
  const apTotal = await db.execute(sql`SELECT COALESCE(SUM(balance_due), 0) as total FROM accounts_payable WHERE status IN ('open','partial','overdue')`);
  const taxTotal = await db.execute(sql`SELECT COALESCE(SUM(balance_due), 0) as total FROM tax_records WHERE status NOT IN ('paid','cancelled')`);
  const jeCount = await db.execute(sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='posted') as posted FROM journal_entries`);

  const bs = (balanceSheet.rows?.[0] as any) || {};
  const bank = (bankTotal.rows?.[0] as any) || {};
  const ar = (arTotal.rows?.[0] as any) || {};
  const ap = (apTotal.rows?.[0] as any) || {};
  const tax = (taxTotal.rows?.[0] as any) || {};
  const je = (jeCount.rows?.[0] as any) || {};
  res.json({
    totalAssets: Number(bs.total_assets || 0) + Number(bank.total || 0) + Number(ar.total || 0),
    totalLiabilities: Number(bs.total_liabilities || 0) + Number(ap.total || 0) + Number(tax.total || 0),
    totalEquity: Number(bs.total_equity || 0),
    totalRevenue: Number(bs.total_revenue || 0),
    totalExpenses: Number(bs.total_expenses || 0),
    bankBalance: Number(bank.total || 0),
    receivables: Number(ar.total || 0),
    payables: Number(ap.total || 0),
    taxLiabilities: Number(tax.total || 0),
    accountCount: Number(bs.account_count || 0),
    journalEntries: Number(je.total || 0),
    postedEntries: Number(je.posted || 0),
  });
});

export default router;
