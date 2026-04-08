import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { logAudit } from "../lib/audit-log";

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

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("FinCS query error:", e.message); return []; }
}

const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => Number(v) || 0;

async function nextNum(prefix: string, table: string, col: string) {
  const r = await q(`SELECT NEXTVAL('invoice_number_seq') as seq_num`);
  const seqNum = r[0]?.seq_num || 1;
  return `${prefix}${String(seqNum).padStart(4, "0")}`;
}

function crudRoutes(basePath: string, table: string, prefix: string, numCol: string, nameField: string, orderCol: string) {
  router.get(`/${basePath}`, async (req, res) => {
    const includeDeleted = req.query.includeDeleted === "true";
    const whereClause = includeDeleted ? "" : "WHERE deleted_at IS NULL";
    res.json(await q(`SELECT * FROM ${table} ${whereClause} ORDER BY ${orderCol} DESC, id DESC`));
  });
  router.get(`/${basePath}/stats`, async (req, res) => {
    const includeDeleted = req.query.includeDeleted === "true";
    const whereClause = includeDeleted ? "" : "AND deleted_at IS NULL";
    const rows = await q(`SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as total_amount,
      COUNT(*) FILTER (WHERE (status='draft' OR status='pending') ${whereClause}) as pending,
      COUNT(*) FILTER (WHERE (status='completed' OR status='approved' OR status='paid') ${whereClause}) as completed
      FROM ${table} ${whereClause ? whereClause.replace("AND", "WHERE") : ""}`);
    res.json(rows[0] || {});
  });
  router.post(`/${basePath}`, async (req, res) => {
    const d = req.body;
    const num = await nextNum(prefix, table, numCol);
    const user = (req as any).user;
    if (table === "customer_refunds") {
      await q(`INSERT INTO customer_refunds (refund_number, refund_date, customer_name, customer_tax_id, invoice_number, reason, amount, vat_rate, vat_amount, total_amount, status, payment_method, notes, created_by, created_by_name)
        VALUES ('${num}', ${d.refundDate ? s(d.refundDate) : "'"+new Date().toISOString().slice(0,10)+"'"}, ${s(d.customerName)}, ${s(d.customerTaxId)}, ${s(d.invoiceNumber)}, ${s(d.reason)}, ${n(d.amount)}, ${n(d.vatRate)||17}, ${n(d.vatAmount)}, ${n(d.totalAmount)}, '${d.status||'pending'}', ${s(d.paymentMethod)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
    } else if (table === "customer_payments") {
      await q(`INSERT INTO customer_payments (payment_number, payment_date, customer_name, customer_tax_id, invoice_number, amount, payment_method, reference_number, bank_name, check_number, status, notes, created_by, created_by_name)
        VALUES ('${num}', ${d.paymentDate ? s(d.paymentDate) : "'"+new Date().toISOString().slice(0,10)+"'"}, ${s(d.customerName)}, ${s(d.customerTaxId)}, ${s(d.invoiceNumber)}, ${n(d.amount)}, ${s(d.paymentMethod)||"'bank_transfer'"}, ${s(d.referenceNumber)}, ${s(d.bankName)}, ${s(d.checkNumber)}, '${d.status||'completed'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
    } else if (table === "supplier_invoices") {
      await q(`INSERT INTO supplier_invoices (invoice_number, invoice_type, invoice_date, due_date, supplier_name, supplier_tax_id, status, currency, subtotal, discount_amount, before_vat, vat_rate, vat_amount, total_amount, amount_paid, payment_terms, payment_method, po_number, item_description, notes, created_by, created_by_name)
        VALUES ('${num}', '${d.invoiceType||'tax_invoice'}', ${d.invoiceDate ? s(d.invoiceDate) : "'"+new Date().toISOString().slice(0,10)+"'"}, ${d.dueDate ? s(d.dueDate) : 'NULL'}, ${s(d.supplierName)}, ${s(d.supplierTaxId)}, '${d.status||'draft'}', '${d.currency||'ILS'}', ${n(d.subtotal)}, ${n(d.discountAmount)}, ${n(d.beforeVat)}, ${n(d.vatRate)||17}, ${n(d.vatAmount)}, ${n(d.totalAmount)}, ${n(d.amountPaid)}, '${d.paymentTerms||'net_30'}', ${s(d.paymentMethod)}, ${s(d.poNumber)}, ${s(d.itemDescription)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
    } else if (table === "supplier_credit_notes") {
      await q(`INSERT INTO supplier_credit_notes (credit_number, credit_date, supplier_name, supplier_tax_id, invoice_number, reason, amount, vat_rate, vat_amount, total_amount, status, notes, created_by, created_by_name)
        VALUES ('${num}', ${d.creditDate ? s(d.creditDate) : "'"+new Date().toISOString().slice(0,10)+"'"}, ${s(d.supplierName)}, ${s(d.supplierTaxId)}, ${s(d.invoiceNumber)}, ${s(d.reason)}, ${n(d.amount)}, ${n(d.vatRate)||17}, ${n(d.vatAmount)}, ${n(d.totalAmount)}, '${d.status||'draft'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
    } else if (table === "supplier_payments") {
      await q(`INSERT INTO supplier_payments (payment_number, payment_date, supplier_name, supplier_tax_id, invoice_number, amount, payment_method, reference_number, bank_name, check_number, status, notes, created_by, created_by_name)
        VALUES ('${num}', ${d.paymentDate ? s(d.paymentDate) : "'"+new Date().toISOString().slice(0,10)+"'"}, ${s(d.supplierName)}, ${s(d.supplierTaxId)}, ${s(d.invoiceNumber)}, ${n(d.amount)}, ${s(d.paymentMethod)||"'bank_transfer'"}, ${s(d.referenceNumber)}, ${s(d.bankName)}, ${s(d.checkNumber)}, '${d.status||'completed'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
    }
    const row = await q(`SELECT * FROM ${table} WHERE ${numCol}='${num}'`);
    
    // H-04: Log INSERT operation to audit_log
    if (row[0]) {
      await logAudit({
        user_id: user?.id,
        user_name: user?.fullName,
        table_name: table,
        record_id: row[0].id,
        action: "INSERT",
        new_values: row[0],
        ip_address: req.ip || (req.connection as any)?.remoteAddress,
      });
    }
    
    res.json(row[0]);
  });
  router.put(`/${basePath}/:id`, async (req, res) => {
    const user = (req as any).user;
    
    // H-04: Get old values before update
    const oldRow = await q(`SELECT * FROM ${table} WHERE id=${req.params.id} AND deleted_at IS NULL`);
    const oldValues = oldRow[0] || {};
    
    const d = req.body; const sets: string[] = [];
    for (const [k, v] of Object.entries(d)) {
      if (k === "id") continue;
      const col = k.replace(/[A-Z]/g, m => "_" + m.toLowerCase());
      if (col === "balance_due") continue;
      if (typeof v === "number") sets.push(`${col}=${v}`);
      else if (v === null || v === "") sets.push(`${col}=NULL`);
      else sets.push(`${col}=${s(v)}`);
    }
    sets.push(`updated_at=NOW()`);
    if (sets.length > 1) {
      await q(`UPDATE ${table} SET ${sets.join(",")} WHERE id=${req.params.id} AND deleted_at IS NULL`);
    }
    
    const newRow = await q(`SELECT * FROM ${table} WHERE id=${req.params.id} AND deleted_at IS NULL`);
    const newValues = newRow[0] || {};
    
    // H-04: Log UPDATE operation to audit_log
    if (Object.keys(d).length > 0 && newRow[0]) {
      await logAudit({
        user_id: user?.id,
        user_name: user?.fullName,
        table_name: table,
        record_id: parseInt(req.params.id),
        action: "UPDATE",
        old_values: oldValues,
        new_values: newValues,
        ip_address: req.ip || (req.connection as any)?.remoteAddress,
      });
    }
    
    res.json(newValues);
  });
  router.delete(`/${basePath}/:id`, async (req, res) => {
    const user = (req as any).user;
    
    // H-04: Get record before deletion for audit log
    const oldRow = await q(`SELECT * FROM ${table} WHERE id=${req.params.id}`);
    
    await q(`UPDATE ${table} SET deleted_at=NOW() WHERE id=${req.params.id}`);
    
    // H-04: Log DELETE operation to audit_log
    if (oldRow[0]) {
      await logAudit({
        user_id: user?.id,
        user_name: user?.fullName,
        table_name: table,
        record_id: parseInt(req.params.id),
        action: "DELETE",
        old_values: oldRow[0],
        ip_address: req.ip || (req.connection as any)?.remoteAddress,
      });
    }
    
    res.json({ success: true, message: "Record soft-deleted" });
  });
  router.post(`/${basePath}/:id/restore`, async (req, res) => {
    const user = (req as any).user;
    
    // H-04: Get record before restore for audit log
    const oldRow = await q(`SELECT * FROM ${table} WHERE id=${req.params.id}`);
    
    await q(`UPDATE ${table} SET deleted_at=NULL WHERE id=${req.params.id}`);
    
    const newRow = await q(`SELECT * FROM ${table} WHERE id=${req.params.id}`);
    
    // H-04: Log RESTORE operation to audit_log as UPDATE action
    if (newRow[0]) {
      await logAudit({
        user_id: user?.id,
        user_name: user?.fullName,
        table_name: table,
        record_id: parseInt(req.params.id),
        action: "UPDATE",
        old_values: oldRow[0] || {},
        new_values: newRow[0],
        ip_address: req.ip || (req.connection as any)?.remoteAddress,
        notes: "Record restored from soft-delete",
      });
    }
    
    res.json({ success: true, message: "Record restored" });
  });
}

crudRoutes("customer-refunds", "customer_refunds", "REF-", "refund_number", "customer_name", "refund_date");
crudRoutes("customer-payments", "customer_payments", "CPAY-", "payment_number", "customer_name", "payment_date");
crudRoutes("supplier-invoices", "supplier_invoices", "SINV-", "invoice_number", "supplier_name", "invoice_date");
crudRoutes("supplier-credit-notes", "supplier_credit_notes", "SCN-", "credit_number", "supplier_name", "credit_date");
crudRoutes("supplier-payments", "supplier_payments", "SPAY-", "payment_number", "supplier_name", "payment_date");

export default router;
