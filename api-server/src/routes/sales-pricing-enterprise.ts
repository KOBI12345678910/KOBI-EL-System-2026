import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getVatRateForDate } from "./israeli-accounting-engine";

const router = Router();

const q = async (query: any) => { try { const r = await db.execute(query); return r.rows; } catch(e) { console.error("[Sales-Pricing]", e); return []; } };

async function nextNumber(prefix: string) {
  const year = new Date().getFullYear();
  const tableName = prefix === "CUS" ? "sales_customers" : prefix === "SO" ? "sales_orders" : prefix === "QT" ? "sales_quotations" : prefix === "INV" ? "sales_invoices" : prefix === "OPP" ? "sales_opportunities" : prefix === "TKT" ? "support_tickets" : "sales_customers";
  const numCol = prefix === "CUS" ? "customer_number" : prefix === "SO" ? "order_number" : prefix === "QT" ? "quote_number" : prefix === "INV" ? "invoice_number" : prefix === "OPP" ? "opportunity_number" : prefix === "TKT" ? "ticket_number" : "id";
  const countResult = await db.execute(sql.raw(`SELECT COALESCE(MAX(id), 0) + 1 as next_val FROM ${tableName}`));
  const current = Number((countResult.rows as any[])?.[0]?.next_val || 1);
  return `${prefix}-${year}-${String(current).padStart(4, "0")}`;
}

function clean(d: any) {
  const o = { ...d };
  delete o.id; delete o.created_at; delete o.updated_at;
  for (const k in o) { if (o[k] === "" || o[k] === undefined) o[k] = null; }
  return o;
}



// ======================== CUSTOMERS ========================
router.get("/sales/customers", async (req: Request, res: Response) => {
  const { search, type, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(name ILIKE ${s} OR email ILIKE ${s} OR phone ILIKE ${s} OR customer_number ILIKE ${s})`); }
  if (type) conditions.push(sql`customer_type = ${String(type)}`);
  if (status) conditions.push(sql`status = ${String(status)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_customers ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/customers/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='active') as active_count,
    COUNT(*) FILTER(WHERE customer_type='company') as companies,
    COUNT(*) FILTER(WHERE customer_type='individual') as individuals,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '30 days') as new_this_month,
    COALESCE(SUM(total_revenue),0) as total_revenue,
    COALESCE(AVG(credit_limit) FILTER(WHERE credit_limit>0),0) as avg_credit_limit
    FROM sales_customers`);
  res.json(r[0] || {});
});

router.post("/sales/customers", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("CUS");
    await db.execute(sql`INSERT INTO sales_customers (
      customer_number, name, customer_type, email, phone, mobile, fax, website,
      address, city, country, postal_code, billing_address, shipping_address,
      credit_limit, payment_terms, credit_terms_days, currency, discount_percent,
      assigned_rep, salesperson_id, status, tags, contact_person, tax_id, notes,
      industry, category, source, region, vat_exempt, withholding_tax_rate,
      bank_name, bank_branch, bank_account, secondary_contact, secondary_phone, secondary_email,
      payment_method, price_list_id, language_pref, communication_pref, internal_notes,
      preferred_delivery, company_size, acquisition_source, customer_since
    ) VALUES (
      ${num}, ${d.name || ''}, ${d.customerType || 'company'}, ${d.email || null}, ${d.phone || null},
      ${d.mobile || null}, ${d.fax || null}, ${d.website || null},
      ${d.address || null}, ${d.city || null}, ${d.country || 'ישראל'}, ${d.postalCode || null},
      ${d.billingAddress || null}, ${d.shippingAddress || null},
      ${Number(d.creditLimit) || 0}, ${d.paymentTerms || 'שוטף 30'}, ${Number(d.creditTermsDays) || 30},
      ${d.currency || 'ILS'}, ${Number(d.discountPercent) || 0},
      ${d.assignedRep || null}, ${d.salespersonId ? Number(d.salespersonId) : null},
      ${d.status || 'active'}, ${d.tags || null}, ${d.contactPerson || null}, ${d.taxId || null}, ${d.notes || null},
      ${d.industry || null}, ${d.category || 'רגיל'}, ${d.source || null}, ${d.region || null},
      ${d.vatExempt === true || d.vatExempt === 'true'}, ${Number(d.withholdingTaxRate) || 0},
      ${d.bankName || null}, ${d.bankBranch || null}, ${d.bankAccount || null},
      ${d.secondaryContact || null}, ${d.secondaryPhone || null}, ${d.secondaryEmail || null},
      ${d.paymentMethod || null}, ${d.priceListId ? Number(d.priceListId) : null},
      ${d.languagePref || 'he'}, ${d.communicationPref || 'phone'}, ${d.internalNotes || null},
      ${d.preferredDelivery || null}, ${d.companySize || null}, ${d.acquisitionSource || null},
      ${d.customerSince || null}
    )`);
    res.json({ success: true, customer_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/customers/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_customers SET
      name=${d.name}, customer_type=${d.customerType}, email=${d.email}, phone=${d.phone},
      mobile=${d.mobile}, fax=${d.fax}, website=${d.website},
      address=${d.address}, city=${d.city}, country=${d.country}, postal_code=${d.postalCode},
      billing_address=${d.billingAddress}, shipping_address=${d.shippingAddress},
      credit_limit=${Number(d.creditLimit) || 0}, payment_terms=${d.paymentTerms},
      credit_terms_days=${Number(d.creditTermsDays) || 30}, currency=${d.currency || 'ILS'},
      discount_percent=${Number(d.discountPercent) || 0},
      assigned_rep=${d.assignedRep}, salesperson_id=${d.salespersonId ? Number(d.salespersonId) : null},
      status=${d.status}, tags=${d.tags}, contact_person=${d.contactPerson}, tax_id=${d.taxId}, notes=${d.notes},
      industry=${d.industry}, category=${d.category}, source=${d.source}, region=${d.region},
      vat_exempt=${d.vatExempt === true || d.vatExempt === 'true'},
      withholding_tax_rate=${Number(d.withholdingTaxRate) || 0},
      bank_name=${d.bankName}, bank_branch=${d.bankBranch}, bank_account=${d.bankAccount},
      secondary_contact=${d.secondaryContact}, secondary_phone=${d.secondaryPhone}, secondary_email=${d.secondaryEmail},
      payment_method=${d.paymentMethod}, price_list_id=${d.priceListId ? Number(d.priceListId) : null},
      language_pref=${d.languagePref}, communication_pref=${d.communicationPref},
      internal_notes=${d.internalNotes}, preferred_delivery=${d.preferredDelivery},
      company_size=${d.companySize}, acquisition_source=${d.acquisitionSource},
      customer_since=${d.customerSince || null},
      updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/customers/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_customers WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SALES ORDERS ========================
router.get("/sales/orders", async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(order_number ILIKE ${s} OR customer_name ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_orders ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/orders/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='draft') as draft_count,
    COUNT(*) FILTER(WHERE status='confirmed') as confirmed,
    COUNT(*) FILTER(WHERE status='shipped') as shipped,
    COUNT(*) FILTER(WHERE status='delivered') as delivered,
    COUNT(*) FILTER(WHERE status='cancelled') as cancelled,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '30 days') as this_month,
    COALESCE(SUM(total),0) as total_revenue,
    COALESCE(SUM(total) FILTER(WHERE created_at >= NOW() - INTERVAL '30 days'),0) as month_revenue,
    COALESCE(SUM(total) FILTER(WHERE payment_status='unpaid'),0) as pending_payment,
    COUNT(*) FILTER(WHERE delivery_date <= CURRENT_DATE AND status NOT IN ('delivered','cancelled')) as pending_delivery
    FROM sales_orders`);
  res.json(r[0] || {});
});

router.get("/sales/orders/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const order = await q(sql`SELECT * FROM sales_orders WHERE id = ${id}`);
  const lines = await q(sql`SELECT * FROM sales_order_lines WHERE order_id = ${id} ORDER BY sort_order`);
  res.json({ order: order[0] || null, lines });
});

router.post("/sales/orders", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("SO");
    const lines = d.lines || [];
    delete d.lines;
    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    const discountAmt = Number(d.discountAmount) || 0;
    // B-D031: date-aware VAT rate (0.18 from 2026-01-01, 0.17 prior)
    const taxAmt = Number(d.taxAmount) || (subtotal - discountAmt) * getVatRateForDate(d.orderDate || new Date());
    const total = subtotal - discountAmt + taxAmt;
    const result = await db.execute(sql`INSERT INTO sales_orders (
      order_number, order_type, customer_id, customer_name, customer_contact, customer_phone, customer_email,
      customer_po_number, order_date, delivery_date, requested_delivery, status, priority,
      subtotal, discount_amount, tax_amount, total, currency, payment_method, payment_status,
      shipping_method, shipping_address, billing_address, billing_city, warehouse, delivery_terms,
      salesperson, salesperson_id, commission_rate, quote_id, project_id, cost_center, department,
      po_number, reference_number, source_channel, notes, internal_notes, created_by,
      installation_required, installation_date, installation_address, installation_city,
      installation_contact, installation_phone, installation_notes,
      measurement_date, measurement_by, measurement_notes, measurement_status,
      deposit_required, deposit_amount, warranty_terms
    ) VALUES (
      ${num}, ${d.orderType || 'standard'}, ${d.customerId}, ${d.customerName},
      ${d.customerContact || null}, ${d.customerPhone || null}, ${d.customerEmail || null},
      ${d.customerPoNumber || null}, ${d.orderDate || new Date().toISOString().slice(0, 10)},
      ${d.deliveryDate || null}, ${d.requestedDelivery || null}, ${d.status || 'draft'}, ${d.priority || 'normal'},
      ${subtotal}, ${discountAmt}, ${taxAmt}, ${total}, ${d.currency || 'ILS'},
      ${d.paymentMethod || null}, ${d.paymentStatus || 'unpaid'},
      ${d.shippingMethod || null}, ${d.shippingAddress || null}, ${d.billingAddress || null},
      ${d.billingCity || null}, ${d.warehouse || null}, ${d.deliveryTerms || null},
      ${d.salesperson || null}, ${d.salespersonId ? Number(d.salespersonId) : null},
      ${Number(d.commissionRate) || 0}, ${d.quoteId ? Number(d.quoteId) : null},
      ${d.projectId ? Number(d.projectId) : null}, ${d.costCenter || null}, ${d.department || null},
      ${d.poNumber || null}, ${d.referenceNumber || null}, ${d.sourceChannel || 'direct'},
      ${d.notes || null}, ${d.internalNotes || null}, ${d.createdBy || null},
      ${d.installationRequired === true}, ${d.installationDate || null},
      ${d.installationAddress || null}, ${d.installationCity || null},
      ${d.installationContact || null}, ${d.installationPhone || null}, ${d.installationNotes || null},
      ${d.measurementDate || null}, ${d.measurementBy || null},
      ${d.measurementNotes || null}, ${d.measurementStatus || null},
      ${d.depositRequired === true}, ${Number(d.depositAmount) || 0}, ${d.warrantyTerms || null}
    ) RETURNING id`);
    const orderId = (result.rows as any[])[0]?.id;
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_order_lines (order_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${orderId}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }
    res.json({ success: true, order_number: num, id: orderId });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/orders/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const lines = d.lines || [];
    delete d.lines;
    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    const discountAmt = Number(d.discountAmount) || 0;
    // B-D031: date-aware VAT rate (0.18 from 2026-01-01, 0.17 prior)
    const taxAmt = Number(d.taxAmount) || (subtotal - discountAmt) * getVatRateForDate(d.orderDate || new Date());
    const total = subtotal - discountAmt + taxAmt;
    await db.execute(sql`UPDATE sales_orders SET
      order_type=${d.orderType || 'standard'}, customer_id=${d.customerId}, customer_name=${d.customerName},
      customer_contact=${d.customerContact}, customer_phone=${d.customerPhone}, customer_email=${d.customerEmail},
      customer_po_number=${d.customerPoNumber}, order_date=${d.orderDate}, delivery_date=${d.deliveryDate},
      requested_delivery=${d.requestedDelivery}, status=${d.status}, priority=${d.priority || 'normal'},
      subtotal=${subtotal}, discount_amount=${discountAmt}, tax_amount=${taxAmt}, total=${total},
      paid_amount=${Number(d.paidAmount) || 0}, payment_status=${d.paymentStatus || 'unpaid'},
      currency=${d.currency || 'ILS'}, payment_method=${d.paymentMethod},
      shipping_method=${d.shippingMethod}, shipping_address=${d.shippingAddress},
      billing_address=${d.billingAddress}, billing_city=${d.billingCity},
      warehouse=${d.warehouse}, delivery_terms=${d.deliveryTerms},
      salesperson=${d.salesperson}, salesperson_id=${d.salespersonId ? Number(d.salespersonId) : null},
      commission_rate=${Number(d.commissionRate) || 0}, notes=${d.notes}, internal_notes=${d.internalNotes},
      installation_required=${d.installationRequired === true},
      installation_date=${d.installationDate}, installation_address=${d.installationAddress},
      installation_city=${d.installationCity}, installation_contact=${d.installationContact},
      installation_phone=${d.installationPhone}, installation_notes=${d.installationNotes},
      measurement_date=${d.measurementDate}, measurement_by=${d.measurementBy},
      measurement_notes=${d.measurementNotes}, measurement_status=${d.measurementStatus},
      production_status=${d.productionStatus}, production_notes=${d.productionNotes},
      deposit_required=${d.depositRequired === true}, deposit_amount=${Number(d.depositAmount) || 0},
      deposit_paid=${d.depositPaid === true}, deposit_date=${d.depositDate},
      warranty_terms=${d.warrantyTerms},
      updated_at=NOW() WHERE id=${id}`);
    await db.execute(sql`DELETE FROM sales_order_lines WHERE order_id = ${id}`);
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_order_lines (order_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${id}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/orders/:id/confirm", async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    await db.execute(sql`UPDATE sales_orders SET status='confirmed', updated_at=NOW() WHERE id=${orderId}`);
    try {
      const orderLines = await q(sql`SELECT * FROM sales_order_lines WHERE order_id = ${orderId}`);
      for (const l of orderLines as any[]) {
        if (l.product_name) {
          await db.execute(sql`UPDATE raw_materials SET current_stock = GREATEST(0, CAST(current_stock AS numeric) - ${Number(l.quantity) || 0})::text WHERE material_name ILIKE ${l.product_name} AND status IN ('פעיל', 'active')`);
        }
      }
    } catch (invErr: any) { console.error("[DataFlow] Confirm inventory deduction:", invErr.message); }
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/orders/:id/ship", async (req: Request, res: Response) => {
  try { await db.execute(sql`UPDATE sales_orders SET status='shipped', updated_at=NOW() WHERE id=${Number(req.params.id)}`); res.json({ success: true }); }
  catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/orders/:id/deliver", async (req: Request, res: Response) => {
  try { await db.execute(sql`UPDATE sales_orders SET status='delivered', updated_at=NOW() WHERE id=${Number(req.params.id)}`); res.json({ success: true }); }
  catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/orders/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_order_lines WHERE order_id=${Number(req.params.id)}`);
    await db.execute(sql`DELETE FROM sales_orders WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== QUOTATIONS ========================
router.get("/sales/quotations", async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(quote_number ILIKE ${s} OR customer_name ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_quotations ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/quotations/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='draft') as draft_count,
    COUNT(*) FILTER(WHERE status='sent') as sent,
    COUNT(*) FILTER(WHERE status='accepted') as accepted,
    COUNT(*) FILTER(WHERE status='rejected') as rejected,
    COUNT(*) FILTER(WHERE status='expired') as expired,
    COALESCE(SUM(total),0) as total_value,
    COALESCE(SUM(total) FILTER(WHERE status='accepted'),0) as accepted_value,
    CASE WHEN COUNT(*)>0 THEN ROUND(COUNT(*) FILTER(WHERE status='accepted')::numeric / NULLIF(COUNT(*),0) * 100, 1) ELSE 0 END as conversion_rate,
    COUNT(*) FILTER(WHERE valid_until < CURRENT_DATE AND status='sent') as overdue
    FROM sales_quotations`);
  res.json(r[0] || {});
});

router.get("/sales/quotations/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const quote = await q(sql`SELECT * FROM sales_quotations WHERE id = ${id}`);
  const lines = await q(sql`SELECT * FROM sales_quotation_lines WHERE quotation_id = ${id} ORDER BY sort_order`);
  res.json({ quotation: quote[0] || null, lines });
});

router.post("/sales/quotations", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("QT");
    const lines = d.lines || [];
    delete d.lines;
    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    // B-D031: date-aware VAT rate (0.18 from 2026-01-01, 0.17 prior)
    const taxAmt = Number(d.taxAmount) || subtotal * getVatRateForDate(d.quoteDate || new Date());
    const total = subtotal + taxAmt;
    const result = await db.execute(sql`INSERT INTO sales_quotations (quote_number, customer_id, customer_name, quote_date, valid_until, status, notes, subtotal, tax_amount, total, created_by)
      VALUES (${num}, ${d.customerId}, ${d.customerName}, ${d.quoteDate || new Date().toISOString().slice(0,10)}, ${d.validUntil}, ${d.status || 'draft'}, ${d.notes}, ${subtotal}, ${taxAmt}, ${total}, ${d.createdBy}) RETURNING id`);

    const quoteId = (result.rows as any[])[0]?.id;
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_quotation_lines (quotation_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${quoteId}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }
    res.json({ success: true, quote_number: num, id: quoteId });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/quotations/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const lines = d.lines || [];
    delete d.lines;
    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    // B-D031: date-aware VAT rate (0.18 from 2026-01-01, 0.17 prior)
    const taxAmt = Number(d.taxAmount) || subtotal * getVatRateForDate(d.quoteDate || new Date());
    const total = subtotal + taxAmt;
    await db.execute(sql`UPDATE sales_quotations SET customer_id=${d.customerId}, customer_name=${d.customerName}, quote_date=${d.quoteDate}, valid_until=${d.validUntil}, status=${d.status}, notes=${d.notes}, subtotal=${subtotal}, tax_amount=${taxAmt}, total=${total}, updated_at=NOW() WHERE id=${id}`);
    await db.execute(sql`DELETE FROM sales_quotation_lines WHERE quotation_id = ${id}`);
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_quotation_lines (quotation_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${id}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/quotations/:id/convert", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const quote = await q(sql`SELECT * FROM sales_quotations WHERE id = ${id}`);
    if (!quote[0]) { res.status(404).json({ error: "הצעה לא נמצאה" }); return; }
    const qd = quote[0] as any;
    const lines = await q(sql`SELECT * FROM sales_quotation_lines WHERE quotation_id = ${id} ORDER BY sort_order`);
    const orderNum = await nextNumber("SO");
    const result = await db.execute(sql`INSERT INTO sales_orders (order_number, customer_id, customer_name, order_date, status, notes, subtotal, discount_amount, tax_amount, total)
      VALUES (${orderNum}, ${qd.customer_id}, ${qd.customer_name}, ${new Date().toISOString().slice(0,10)}, 'draft', ${qd.notes}, ${qd.subtotal}, 0, ${qd.tax_amount}, ${qd.total}) RETURNING id`);
    const orderId = (result.rows as any[])[0]?.id;
    for (const l of lines as any[]) {
      await db.execute(sql`INSERT INTO sales_order_lines (order_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${orderId}, ${l.product_name}, ${l.description}, ${l.quantity}, ${l.unit_price}, ${l.discount_percent}, ${l.line_total}, ${l.sort_order})`);
    }
    await db.execute(sql`UPDATE sales_quotations SET status='accepted', converted_order_id=${orderId}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true, order_id: orderId, order_number: orderNum });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/quotations/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_quotation_lines WHERE quotation_id=${Number(req.params.id)}`);
    await db.execute(sql`DELETE FROM sales_quotations WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SALES INVOICES ========================
router.get("/sales/invoices", async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(invoice_number ILIKE ${s} OR customer_name ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_invoices ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/invoices/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='draft') as draft_count,
    COUNT(*) FILTER(WHERE status='sent') as sent,
    COUNT(*) FILTER(WHERE status='paid') as paid,
    COUNT(*) FILTER(WHERE status='overdue') as overdue,
    COUNT(*) FILTER(WHERE status='cancelled') as cancelled,
    COALESCE(SUM(total),0) as total_invoiced,
    COALESCE(SUM(amount_paid),0) as total_collected,
    COALESCE(SUM(total - amount_paid) FILTER(WHERE status NOT IN ('paid','cancelled')),0) as total_outstanding,
    COUNT(*) FILTER(WHERE due_date < CURRENT_DATE AND status IN ('sent','overdue')) as overdue_count,
    COALESCE(SUM(total) FILTER(WHERE due_date < CURRENT_DATE AND status IN ('sent','overdue')),0) as overdue_amount,
    COALESCE(SUM(total) FILTER(WHERE invoice_date >= NOW() - INTERVAL '30 days'),0) as month_invoiced
    FROM sales_invoices`);
  res.json(r[0] || {});
});

router.get("/sales/invoices/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const inv = await q(sql`SELECT * FROM sales_invoices WHERE id = ${id}`);
  const lines = await q(sql`SELECT * FROM sales_invoice_lines WHERE invoice_id = ${id} ORDER BY sort_order`);
  res.json({ invoice: inv[0] || null, lines });
});

router.post("/sales/invoices", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("INV");
    const lines = d.lines || [];
    delete d.lines;
    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    // B-D031: date-aware VAT rate (0.18 from 2026-01-01, 0.17 prior)
    const taxAmt = Number(d.taxAmount) || subtotal * getVatRateForDate(d.invoiceDate || new Date());
    const total = subtotal + taxAmt;
    const result = await db.execute(sql`INSERT INTO sales_invoices (invoice_number, customer_id, customer_name, sales_order_id, invoice_date, due_date, status, subtotal, tax_amount, total, notes, created_by)
      VALUES (${num}, ${d.customerId}, ${d.customerName}, ${d.salesOrderId}, ${d.invoiceDate || new Date().toISOString().slice(0,10)}, ${d.dueDate}, ${d.status || 'draft'}, ${subtotal}, ${taxAmt}, ${total}, ${d.notes}, ${d.createdBy}) RETURNING id`);
    const invId = (result.rows as any[])[0]?.id;
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_invoice_lines (invoice_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${invId}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }
    res.json({ success: true, invoice_number: num, id: invId });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/invoices/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const lines = d.lines || [];
    delete d.lines;
    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    // B-D031: date-aware VAT rate (0.18 from 2026-01-01, 0.17 prior)
    const taxAmt = Number(d.taxAmount) || subtotal * getVatRateForDate(d.invoiceDate || new Date());
    const total = subtotal + taxAmt;
    await db.execute(sql`UPDATE sales_invoices SET customer_id=${d.customerId}, customer_name=${d.customerName}, sales_order_id=${d.salesOrderId}, invoice_date=${d.invoiceDate}, due_date=${d.dueDate}, status=${d.status}, subtotal=${subtotal}, tax_amount=${taxAmt}, total=${total}, amount_paid=${d.amountPaid || 0}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    await db.execute(sql`DELETE FROM sales_invoice_lines WHERE invoice_id = ${id}`);
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_invoice_lines (invoice_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${id}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/invoices/:id/send", async (req: Request, res: Response) => {
  try { await db.execute(sql`UPDATE sales_invoices SET status='sent', updated_at=NOW() WHERE id=${Number(req.params.id)}`); res.json({ success: true }); }
  catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/invoices/:id/pay", async (req: Request, res: Response) => {
  try {
    const amount = Number(req.body.amount) || 0;
    const id = Number(req.params.id);
    const inv = await q(sql`SELECT total, amount_paid FROM sales_invoices WHERE id = ${id}`);
    if (!inv[0]) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    const newPaid = Number((inv[0] as any).amount_paid || 0) + amount;
    const total = Number((inv[0] as any).total || 0);
    const newStatus = newPaid >= total ? 'paid' : 'sent';
    await db.execute(sql`UPDATE sales_invoices SET amount_paid=${newPaid}, status=${newStatus}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/invoices/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_invoice_lines WHERE invoice_id=${Number(req.params.id)}`);
    await db.execute(sql`DELETE FROM sales_invoices WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRM OPPORTUNITIES ========================
router.get("/sales/opportunities", async (req: Request, res: Response) => {
  const { search, stage } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(name ILIKE ${s} OR customer_name ILIKE ${s} OR opportunity_number ILIKE ${s})`); }
  if (stage) conditions.push(sql`stage = ${String(stage)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM crm_opportunities ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/opportunities/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE stage='lead') as lead_count,
    COUNT(*) FILTER(WHERE stage='qualified') as qualified,
    COUNT(*) FILTER(WHERE stage='proposal') as proposal,
    COUNT(*) FILTER(WHERE stage='negotiation') as negotiation,
    COUNT(*) FILTER(WHERE stage='won') as won,
    COUNT(*) FILTER(WHERE stage='lost') as lost,
    COALESCE(SUM(value),0) as pipeline_value,
    COALESCE(SUM(value) FILTER(WHERE stage='won'),0) as won_value,
    COALESCE(SUM(value * probability / 100.0),0) as weighted_value,
    CASE WHEN COUNT(*) FILTER(WHERE stage IN ('won','lost'))>0 THEN ROUND(COUNT(*) FILTER(WHERE stage='won')::numeric / NULLIF(COUNT(*) FILTER(WHERE stage IN ('won','lost')),0) * 100, 1) ELSE 0 END as win_rate,
    COUNT(*) FILTER(WHERE expected_close_date <= CURRENT_DATE + 30 AND stage NOT IN ('won','lost')) as closing_soon
    FROM crm_opportunities`);
  res.json(r[0] || {});
});

router.post("/sales/opportunities", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("OPP");
    await db.execute(sql`INSERT INTO crm_opportunities (opportunity_number, name, customer_id, customer_name, contact_name, email, phone, stage, value, probability, expected_close_date, assigned_rep, source, notes)
      VALUES (${num}, ${d.name}, ${d.customerId}, ${d.customerName}, ${d.contactName}, ${d.email}, ${d.phone}, ${d.stage || 'lead'}, ${d.value || 0}, ${d.probability || 0}, ${d.expectedCloseDate}, ${d.assignedRep}, ${d.source}, ${d.notes})`);
    res.json({ success: true, opportunity_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE crm_opportunities SET name=${d.name}, customer_id=${d.customerId}, customer_name=${d.customerName}, contact_name=${d.contactName}, email=${d.email}, phone=${d.phone}, stage=${d.stage}, value=${d.value || 0}, probability=${d.probability || 0}, expected_close_date=${d.expectedCloseDate}, assigned_rep=${d.assignedRep}, source=${d.source}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/opportunities/:id/stage", async (req: Request, res: Response) => {
  try {
    const { stage } = req.body;
    await db.execute(sql`UPDATE crm_opportunities SET stage=${stage}, updated_at=NOW() WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/opportunities/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_opportunities WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SUPPORT TICKETS ========================
router.get("/sales/tickets", async (req: Request, res: Response) => {
  const { search, status, priority } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(ticket_number ILIKE ${s} OR subject ILIKE ${s} OR customer_name ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  if (priority) conditions.push(sql`priority = ${String(priority)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM support_tickets ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/tickets/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='open') as open_count,
    COUNT(*) FILTER(WHERE status='in-progress') as in_progress,
    COUNT(*) FILTER(WHERE status='resolved') as resolved,
    COUNT(*) FILTER(WHERE status='closed') as closed_count,
    COUNT(*) FILTER(WHERE priority='urgent') as urgent_count,
    COUNT(*) FILTER(WHERE priority='high') as high_count,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '7 days') as new_this_week,
    COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER(WHERE resolved_at IS NOT NULL), 0) as avg_resolution_hours
    FROM support_tickets`);
  res.json(r[0] || {});
});

router.post("/sales/tickets", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("TKT");
    await db.execute(sql`INSERT INTO support_tickets (ticket_number, customer_id, customer_name, subject, description, category, priority, status, assigned_to)
      VALUES (${num}, ${d.customerId}, ${d.customerName}, ${d.subject}, ${d.description}, ${d.category}, ${d.priority || 'medium'}, ${d.status || 'open'}, ${d.assignedTo})`);
    res.json({ success: true, ticket_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/tickets/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const resolvedAt = d.status === 'resolved' || d.status === 'closed' ? 'NOW()' : null;
    await db.execute(sql`UPDATE support_tickets SET customer_id=${d.customerId}, customer_name=${d.customerName}, subject=${d.subject}, description=${d.description}, category=${d.category}, priority=${d.priority}, status=${d.status}, assigned_to=${d.assignedTo}, resolution_notes=${d.resolutionNotes}, updated_at=NOW() WHERE id=${id}`);
    if (d.status === 'resolved' || d.status === 'closed') {
      await db.execute(sql`UPDATE support_tickets SET resolved_at=NOW() WHERE id=${id} AND resolved_at IS NULL`);
    }
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/tickets/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM support_tickets WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== PRICE LISTS ========================
router.get("/sales/price-lists", async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(name ILIKE ${s} OR list_number ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_price_lists ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/price-lists/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='active') as active_count,
    COUNT(*) FILTER(WHERE status='inactive') as inactive,
    COUNT(DISTINCT customer_group) as groups,
    COUNT(*) FILTER(WHERE valid_to < CURRENT_DATE AND status='active') as expired
    FROM sales_price_lists`);
  const items = await q(sql`SELECT COUNT(*) as total_items, COALESCE(AVG(base_price),0) as avg_price FROM sales_price_list_items`);
  res.json({ ...((r[0] || {}) as any), ...(items[0] as any || {}) });
});

router.get("/sales/price-lists/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const list = await q(sql`SELECT * FROM sales_price_lists WHERE id = ${id}`);
  const items = await q(sql`SELECT * FROM sales_price_list_items WHERE price_list_id = ${id} ORDER BY sort_order`);
  res.json({ priceList: list[0] || null, items });
});

router.post("/sales/price-lists", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("PL");
    const items = d.items || [];
    delete d.items;
    const result = await db.execute(sql`INSERT INTO sales_price_lists (list_number, name, currency, valid_from, valid_to, customer_group, status, notes)
      VALUES (${num}, ${d.name}, ${d.currency || 'ILS'}, ${d.validFrom}, ${d.validTo}, ${d.customerGroup}, ${d.status || 'active'}, ${d.notes}) RETURNING id`);
    const listId = (result.rows as any[])[0]?.id;
    for (const it of items) {
      await db.execute(sql`INSERT INTO sales_price_list_items (price_list_id, product_name, sku, base_price, discounted_price, min_quantity, sort_order)
        VALUES (${listId}, ${it.productName}, ${it.sku}, ${it.basePrice || 0}, ${it.discountedPrice || 0}, ${it.minQuantity || 1}, ${it.sortOrder || 0})`);
    }
    res.json({ success: true, list_number: num, id: listId });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/price-lists/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const items = d.items || [];
    delete d.items;
    await db.execute(sql`UPDATE sales_price_lists SET name=${d.name}, currency=${d.currency}, valid_from=${d.validFrom}, valid_to=${d.validTo}, customer_group=${d.customerGroup}, status=${d.status}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    await db.execute(sql`DELETE FROM sales_price_list_items WHERE price_list_id = ${id}`);
    for (const it of items) {
      await db.execute(sql`INSERT INTO sales_price_list_items (price_list_id, product_name, sku, base_price, discounted_price, min_quantity, sort_order)
        VALUES (${id}, ${it.productName}, ${it.sku}, ${it.basePrice || 0}, ${it.discountedPrice || 0}, ${it.minQuantity || 1}, ${it.sortOrder || 0})`);
    }
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/price-lists/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_price_list_items WHERE price_list_id=${Number(req.params.id)}`);
    await db.execute(sql`DELETE FROM sales_price_lists WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== COST CALCULATIONS ========================
router.get("/sales/cost-calculations", async (req: Request, res: Response) => {
  const { search } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(name ILIKE ${s} OR product_service ILIKE ${s} OR calc_number ILIKE ${s})`); }
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_cost_calculations ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/cost-calculations/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COALESCE(AVG(margin_percent),0) as avg_margin,
    COALESCE(AVG(selling_price),0) as avg_selling_price,
    COALESCE(AVG(material_cost + labor_cost + overhead_cost),0) as avg_total_cost
    FROM sales_cost_calculations`);
  res.json(r[0] || {});
});

router.post("/sales/cost-calculations", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("CC");
    const material = Number(d.materialCost) || 0;
    const labor = Number(d.laborCost) || 0;
    const overhead = Number(d.overheadCost) || 0;
    const margin = Number(d.marginPercent) || 0;
    const totalCost = material + labor + overhead;
    const sellingPrice = d.sellingPrice || (totalCost * (1 + margin / 100));
    await db.execute(sql`INSERT INTO sales_cost_calculations (calc_number, name, product_service, material_cost, labor_cost, overhead_cost, margin_percent, selling_price, notes, created_by, calc_date)
      VALUES (${num}, ${d.name}, ${d.productService}, ${material}, ${labor}, ${overhead}, ${margin}, ${sellingPrice}, ${d.notes}, ${d.createdBy}, ${d.calcDate || new Date().toISOString().slice(0,10)})`);
    res.json({ success: true, calc_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/cost-calculations/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const material = Number(d.materialCost) || 0;
    const labor = Number(d.laborCost) || 0;
    const overhead = Number(d.overheadCost) || 0;
    const margin = Number(d.marginPercent) || 0;
    const totalCost = material + labor + overhead;
    const sellingPrice = d.sellingPrice || (totalCost * (1 + margin / 100));
    await db.execute(sql`UPDATE sales_cost_calculations SET name=${d.name}, product_service=${d.productService}, material_cost=${material}, labor_cost=${labor}, overhead_cost=${overhead}, margin_percent=${margin}, selling_price=${sellingPrice}, notes=${d.notes}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/cost-calculations/:id/recalculate", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const row = await q(sql`SELECT * FROM sales_cost_calculations WHERE id = ${id}`);
    if (!row[0]) { res.status(404).json({ error: "חישוב לא נמצא" }); return; }
    const r = row[0] as any;
    const totalCost = Number(r.material_cost) + Number(r.labor_cost) + Number(r.overhead_cost);
    const sellingPrice = totalCost * (1 + Number(r.margin_percent) / 100);
    await db.execute(sql`UPDATE sales_cost_calculations SET selling_price=${sellingPrice}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true, selling_price: sellingPrice });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/cost-calculations/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_cost_calculations WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== COLLECTION CASES ========================
router.get("/sales/collection-cases", async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(case_number ILIKE ${s} OR customer_name ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  const whereClause = conditions.length > 0 ? sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `) : sql``;
  const rows = await q(sql`SELECT * FROM sales_collection_cases ${whereClause} ORDER BY created_at DESC`);
  res.json(rows);
});

router.get("/sales/collection-cases/stats", async (_req: Request, res: Response) => {
  const r = await q(sql`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER(WHERE status='active') as active_count,
    COUNT(*) FILTER(WHERE status='resolved') as resolved,
    COUNT(*) FILTER(WHERE status='written-off') as written_off,
    COALESCE(SUM(total_overdue),0) as total_overdue_amount,
    COALESCE(AVG(days_overdue),0) as avg_days_overdue,
    COUNT(*) FILTER(WHERE days_overdue > 90) as over_90_days,
    COUNT(*) FILTER(WHERE next_action_date <= CURRENT_DATE) as action_due
    FROM sales_collection_cases`);
  res.json(r[0] || {});
});

router.post("/sales/collection-cases", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const num = await nextNumber("CLN");
    await db.execute(sql`INSERT INTO sales_collection_cases (case_number, customer_id, customer_name, invoice_refs, total_overdue, days_overdue, status, assigned_collector, last_contact_date, notes, next_action_date)
      VALUES (${num}, ${d.customerId}, ${d.customerName}, ${d.invoiceRefs}, ${d.totalOverdue || 0}, ${d.daysOverdue || 0}, ${d.status || 'active'}, ${d.assignedCollector}, ${d.lastContactDate}, ${d.notes}, ${d.nextActionDate})`);
    res.json({ success: true, case_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/collection-cases/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_collection_cases SET customer_id=${d.customerId}, customer_name=${d.customerName}, invoice_refs=${d.invoiceRefs}, total_overdue=${d.totalOverdue || 0}, days_overdue=${d.daysOverdue || 0}, status=${d.status}, assigned_collector=${d.assignedCollector}, last_contact_date=${d.lastContactDate}, notes=${d.notes}, next_action_date=${d.nextActionDate}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/collection-cases/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_collection_cases WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
