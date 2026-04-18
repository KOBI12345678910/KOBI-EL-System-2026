import { Router, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { VAT_RATE } from "../constants";
import { clearKpiCache } from "./dashboard-kpi";

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

function normalizeCustomer(d: any) {
  const get = (snakeKey: string, camelKey: string) =>
    d[snakeKey] !== undefined && d[snakeKey] !== null ? d[snakeKey] : (d[camelKey] !== undefined ? d[camelKey] : null);
  return {
    name: d.name,
    customer_type: get("customer_type", "customerType"),
    email: d.email,
    phone: d.phone,
    mobile: d.mobile,
    fax: d.fax,
    website: d.website,
    address: d.address,
    city: d.city,
    country: d.country,
    postal_code: get("postal_code", "postalCode"),
    billing_address: get("billing_address", "billingAddress"),
    shipping_address: get("shipping_address", "shippingAddress"),
    credit_limit: get("credit_limit", "creditLimit"),
    payment_terms: get("payment_terms", "paymentTerms"),
    credit_terms_days: get("credit_terms_days", "creditTermsDays"),
    currency: d.currency,
    discount_percent: get("discount_percent", "discountPercent"),
    assigned_rep: get("assigned_rep", "assignedRep"),
    salesperson_id: get("salesperson_id", "salespersonId"),
    status: d.status,
    tags: d.tags,
    contact_person: get("contact_person", "contactPerson"),
    tax_id: get("tax_id", "taxId"),
    notes: d.notes,
    industry: d.industry,
    category: d.category,
    source: d.source,
    region: d.region,
    vat_exempt: get("vat_exempt", "vatExempt"),
    withholding_tax_rate: get("withholding_tax_rate", "withholdingTaxRate"),
    bank_name: get("bank_name", "bankName"),
    bank_branch: get("bank_branch", "bankBranch"),
    bank_account: get("bank_account", "bankAccount"),
    secondary_contact: get("secondary_contact", "secondaryContact"),
    secondary_phone: get("secondary_phone", "secondaryPhone"),
    secondary_email: get("secondary_email", "secondaryEmail"),
    payment_method: get("payment_method", "paymentMethod"),
    price_list_id: get("price_list_id", "priceListId"),
    language_pref: get("language_pref", "languagePref"),
    communication_pref: get("communication_pref", "communicationPref"),
    internal_notes: get("internal_notes", "internalNotes"),
    preferred_delivery: get("preferred_delivery", "preferredDelivery"),
    company_size: get("company_size", "companySize"),
    acquisition_source: get("acquisition_source", "acquisitionSource"),
    customer_since: get("customer_since", "customerSince"),
  };
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
    const d = normalizeCustomer(clean(req.body));
    if (!d.name || !String(d.name).trim()) {
      return res.status(400).json({ error: "שדה חובה — יש להזין שם לקוח" });
    }
    if (!String(d.phone || "").trim() && !String(d.email || "").trim()) {
      return res.status(400).json({ error: "יש להזין טלפון או אימייל" });
    }
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
      ${num}, ${d.name || ''}, ${d.customer_type || 'company'}, ${d.email || null}, ${d.phone || null},
      ${d.mobile || null}, ${d.fax || null}, ${d.website || null},
      ${d.address || null}, ${d.city || null}, ${d.country || 'ישראל'}, ${d.postal_code || null},
      ${d.billing_address || null}, ${d.shipping_address || null},
      ${Number(d.credit_limit) || 0}, ${d.payment_terms || 'שוטף 30'}, ${Number(d.credit_terms_days) || 30},
      ${d.currency || 'ILS'}, ${Number(d.discount_percent) || 0},
      ${d.assigned_rep || null}, ${d.salesperson_id ? Number(d.salesperson_id) : null},
      ${d.status || 'active'}, ${d.tags || null}, ${d.contact_person || null}, ${d.tax_id || null}, ${d.notes || null},
      ${d.industry || null}, ${d.category || 'רגיל'}, ${d.source || null}, ${d.region || null},
      ${d.vat_exempt === true || d.vat_exempt === 'true'}, ${Number(d.withholding_tax_rate) || 0},
      ${d.bank_name || null}, ${d.bank_branch || null}, ${d.bank_account || null},
      ${d.secondary_contact || null}, ${d.secondary_phone || null}, ${d.secondary_email || null},
      ${d.payment_method || null}, ${d.price_list_id ? Number(d.price_list_id) : null},
      ${d.language_pref || 'he'}, ${d.communication_pref || 'phone'}, ${d.internal_notes || null},
      ${d.preferred_delivery || null}, ${d.company_size || null}, ${d.acquisition_source || null},
      ${d.customer_since || null}
    )`);
    clearKpiCache();
    res.json({ success: true, customer_number: num });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/customers/:id", async (req: Request, res: Response) => {
  try {
    const d = normalizeCustomer(clean(req.body));
    if (!d.name || !String(d.name).trim()) {
      return res.status(400).json({ error: "שדה חובה — יש להזין שם לקוח" });
    }
    if (!String(d.phone || "").trim() && !String(d.email || "").trim()) {
      return res.status(400).json({ error: "יש להזין טלפון או אימייל" });
    }
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sales_customers SET
      name=${d.name}, customer_type=${d.customer_type}, email=${d.email}, phone=${d.phone},
      mobile=${d.mobile}, fax=${d.fax}, website=${d.website},
      address=${d.address}, city=${d.city}, country=${d.country}, postal_code=${d.postal_code},
      billing_address=${d.billing_address}, shipping_address=${d.shipping_address},
      credit_limit=${Number(d.credit_limit) || 0}, payment_terms=${d.payment_terms},
      credit_terms_days=${Number(d.credit_terms_days) || 30}, currency=${d.currency || 'ILS'},
      discount_percent=${Number(d.discount_percent) || 0},
      assigned_rep=${d.assigned_rep}, salesperson_id=${d.salesperson_id ? Number(d.salesperson_id) : null},
      status=${d.status}, tags=${d.tags}, contact_person=${d.contact_person}, tax_id=${d.tax_id}, notes=${d.notes},
      industry=${d.industry}, category=${d.category}, source=${d.source}, region=${d.region},
      vat_exempt=${d.vat_exempt === true || d.vat_exempt === 'true'},
      withholding_tax_rate=${Number(d.withholding_tax_rate) || 0},
      bank_name=${d.bank_name}, bank_branch=${d.bank_branch}, bank_account=${d.bank_account},
      secondary_contact=${d.secondary_contact}, secondary_phone=${d.secondary_phone}, secondary_email=${d.secondary_email},
      payment_method=${d.payment_method}, price_list_id=${d.price_list_id ? Number(d.price_list_id) : null},
      language_pref=${d.language_pref}, communication_pref=${d.communication_pref},
      internal_notes=${d.internal_notes}, preferred_delivery=${d.preferred_delivery},
      company_size=${d.company_size}, acquisition_source=${d.acquisition_source},
      customer_since=${d.customer_since || null},
      updated_at=NOW() WHERE id=${id}`);
    clearKpiCache();
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales/customers/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sales_customers WHERE id=${Number(req.params.id)}`);
    clearKpiCache();
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/customers/:id/follow-up", async (req: Request, res: Response) => {
  try {
    const customerId = Number(req.params.id);
    const { followUpDate, note } = req.body;
    if (!customerId || isNaN(customerId)) return res.status(400).json({ error: "מזהה לקוח לא תקין" });
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sales_customer_follow_ups (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        follow_up_date DATE,
        note TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      INSERT INTO sales_customer_follow_ups (customer_id, follow_up_date, note, status)
      VALUES (${customerId}, ${followUpDate || null}, ${note || null}, 'pending')
    `);
    res.json({ success: true });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/sales/customers/:id/follow-ups", async (req: Request, res: Response) => {
  try {
    const customerId = Number(req.params.id);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sales_customer_follow_ups (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        follow_up_date DATE,
        note TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const rows = await q(sql`SELECT * FROM sales_customer_follow_ups WHERE customer_id = ${customerId} ORDER BY follow_up_date ASC`);
    res.json(rows);
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/sales/follow-ups", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sales_customer_follow_ups (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        follow_up_date DATE,
        note TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const rows = await q(sql`
      SELECT f.*, COALESCE(sc.name, 'לקוח ' || f.customer_id) as customer_name
      FROM sales_customer_follow_ups f
      LEFT JOIN sales_customers sc ON sc.id = f.customer_id
      ORDER BY f.follow_up_date ASC, f.created_at DESC
    `);
    res.json(rows);
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SALES ORDERS ========================
router.get("/sales/orders", async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const conditions: ReturnType<typeof sql>[] = [];
  if (search) { const s = `%${String(search)}%`; conditions.push(sql`(order_number ILIKE ${s} OR customer_name ILIKE ${s})`); }
  if (status) conditions.push(sql`status = ${String(status)}`);
  conditions.unshift(sql`deleted_at IS NULL`);
  const whereClause = sql.join([sql`WHERE`, sql.join(conditions, sql` AND `)], sql` `);
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
    FROM sales_orders WHERE deleted_at IS NULL`);
  res.json(r[0] || {});
});

router.get("/sales/orders/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const order = await q(sql`SELECT * FROM sales_orders WHERE id = ${id} AND deleted_at IS NULL`);
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
    const taxAmt = Number(d.taxAmount) || (subtotal - discountAmt) * VAT_RATE;
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
    const taxAmt = Number(d.taxAmount) || (subtotal - discountAmt) * VAT_RATE;
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
    await db.execute(sql`UPDATE sales_orders SET deleted_at = NOW() WHERE id=${Number(req.params.id)}`);
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

    // Enforce discount approval threshold server-side on creation.
    // If any line exceeds threshold, override status to 'pending_approval' regardless of what the client sent.
    const thresholdRows = await q(sql`SELECT value FROM platform_settings WHERE key='quote.discount_approval_threshold' LIMIT 1`);
    const threshold = parseFloat(String((thresholdRows[0] as any)?.value || "15")) || 15;
    const maxDiscount = lines.reduce((m: number, l: any) => Math.max(m, Number(l.discountPercent) || 0), 0);
    const requestedStatus = String(d.status || "draft");

    // If client requests 'sent' but discount exceeds threshold — block it entirely
    if (requestedStatus === "sent" && maxDiscount > threshold) {
      res.status(400).json({
        error: `לא ניתן לשלוח הצעה עם הנחה של ${maxDiscount}% ללא אישור מנהל (סף: ${threshold}%). יש להגיש בקשת אישור תחילה.`,
        approvalRequired: true,
      });
      return;
    }

    // Auto-determine effective status: over-threshold → pending_approval (approval record created below)
    const needsApproval = maxDiscount > threshold;
    const effectiveStatus = needsApproval ? "pending_approval" : requestedStatus;

    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    const taxAmt = Number(d.taxAmount) || subtotal * VAT_RATE;
    const total = subtotal + taxAmt;
    const result = await db.execute(sql`INSERT INTO sales_quotations (quote_number, customer_id, customer_name, quote_date, valid_until, status, notes, subtotal, tax_amount, total, created_by)
      VALUES (${num}, ${d.customerId}, ${d.customerName}, ${d.quoteDate || new Date().toISOString().slice(0,10)}, ${d.validUntil}, ${effectiveStatus}, ${d.notes}, ${subtotal}, ${taxAmt}, ${total}, ${d.createdBy}) RETURNING id`);

    const quoteId = (result.rows as any[])[0]?.id;
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_quotation_lines (quotation_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${quoteId}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }

    // Atomically create approval record server-side so the workflow is never split across two client calls
    if (needsApproval) {
      await db.execute(sql`
        INSERT INTO quote_discount_approvals (quote_id, quote_number, customer_name, discount_percent, threshold_percent, status, requested_by)
        VALUES (${quoteId}, ${num}, ${d.customerName || ""}, ${maxDiscount}, ${threshold}, 'pending', ${d.createdBy || null})
      `);
    }

    // GPS location verification for sales agents — if agent coordinates provided, store verification record.
    // All customer data (address, coordinates) resolved server-side from the DB — never trust client payload.
    let locationVerification: Record<string, unknown> | null = null;
    const agentLat = d.agentLatitude != null ? Number(d.agentLatitude) : null;
    const agentLng = d.agentLongitude != null ? Number(d.agentLongitude) : null;
    if (agentLat !== null && !Number.isNaN(agentLat) && agentLng !== null && !Number.isNaN(agentLng) && (req as any).userId) {
      try {
        let dbCustomerLat: number | null = null;
        let dbCustomerLng: number | null = null;
        let dbCustomerAddress: string | null = null;
        if (d.customerId) {
          const custRow = await pool.query(
            `SELECT address, city, latitude, longitude FROM customers WHERE id = $1`,
            [d.customerId]
          );
          const cust = custRow.rows[0];
          if (cust) {
            dbCustomerAddress = [cust.address, cust.city].filter(Boolean).join(", ") || null;
            dbCustomerLat = cust.latitude != null ? Number(cust.latitude) : null;
            dbCustomerLng = cust.longitude != null ? Number(cust.longitude) : null;
          }
        }

        // Compute Haversine distance if customer coordinates exist in DB; null = undetermined
        const THRESHOLD_METERS = 500;
        let distanceMeters: number | null = null;
        let isVerified: boolean | null = null;
        if (dbCustomerLat !== null && dbCustomerLng !== null) {
          const R = 6371000;
          const lat1 = agentLat * Math.PI / 180;
          const lat2 = dbCustomerLat * Math.PI / 180;
          const dLat = (dbCustomerLat - agentLat) * Math.PI / 180;
          const dLon = (dbCustomerLng - agentLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
          distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          isVerified = distanceMeters <= THRESHOLD_METERS;
        }

        const verResult = await pool.query(
          `INSERT INTO quote_location_verifications
             (quote_id, agent_user_id, agent_latitude, agent_longitude, customer_latitude, customer_longitude, customer_name, customer_address, is_verified, distance_meters, verification_threshold_meters)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [quoteId, (req as any).userId, agentLat, agentLng, dbCustomerLat, dbCustomerLng, d.customerName || null, dbCustomerAddress, isVerified, distanceMeters, THRESHOLD_METERS]
        );
        locationVerification = verResult.rows[0] as Record<string, unknown>;
      } catch (verErr: any) {
        console.error("[QuoteLocation] Verification error:", verErr.message);
      }
    }

    res.json({ success: true, quote_number: num, id: quoteId, approvalRequired: needsApproval, locationVerification });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales/quotations/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    const lines = d.lines || [];
    delete d.lines;

    const thresholdRows = await q(sql`SELECT value FROM platform_settings WHERE key='quote.discount_approval_threshold' LIMIT 1`);
    const threshold = parseFloat(String((thresholdRows[0] as any)?.value || "15")) || 15;
    const maxDiscount = lines.reduce((m: number, l: any) => Math.max(m, Number(l.discountPercent) || 0), 0);
    const requestedStatus = String(d.status || "draft");

    // Read current status to enforce legal transitions
    const current = await q(sql`SELECT status, customer_name, quote_number FROM sales_quotations WHERE id=${id} LIMIT 1`);
    const currentStatus = String((current[0] as any)?.status || "draft");

    // Attempting to send a quote that is approval_rejected — blocked
    if (currentStatus === "approval_rejected" && requestedStatus === "sent") {
      res.status(400).json({ error: "לא ניתן לשלוח הצעה שהנחתה נדחתה — יש להפחית את ההנחה תחילה", approvalRejected: true });
      return;
    }
    // Attempting to send a quote that is pending_approval — blocked
    if (currentStatus === "pending_approval" && requestedStatus === "sent") {
      res.status(400).json({ error: "לא ניתן לשלוח הצעה שממתינה לאישור הנחה", approvalRequired: true });
      return;
    }
    // Attempting to send a quote with over-threshold discount without a valid approval — blocked.
    // Validation: the most recent approved record must cover a discount_percent >= current maxDiscount,
    // so stale approvals for lower discounts do not silently authorize a larger discount.
    if (requestedStatus === "sent" && maxDiscount > threshold) {
      const approvedRow = await q(sql`
        SELECT discount_percent FROM quote_discount_approvals
        WHERE quote_id=${id} AND status='approved'
        ORDER BY decided_at DESC LIMIT 1
      `);
      const approvedDiscount = approvedRow[0] ? Number((approvedRow[0] as any).discount_percent) : null;
      if (approvedDiscount === null || approvedDiscount < maxDiscount) {
        res.status(400).json({
          error: `לא ניתן לשלוח הצעה עם הנחה של ${maxDiscount}% ללא אישור מנהל תואם (סף: ${threshold}%). יש להגיש בקשת אישור מחודשת.`,
          approvalRequired: true,
        });
        return;
      }
    }

    // Determine effective status: over-threshold save → auto pending_approval (atomic with approval record below)
    const needsApproval = maxDiscount > threshold && requestedStatus !== "sent";
    const effectiveStatus = needsApproval ? "pending_approval" : requestedStatus;

    const subtotal = lines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0);
    const taxAmt = Number(d.taxAmount) || subtotal * VAT_RATE;
    const total = subtotal + taxAmt;
    await db.execute(sql`UPDATE sales_quotations SET customer_id=${d.customerId}, customer_name=${d.customerName}, quote_date=${d.quoteDate}, valid_until=${d.validUntil}, status=${effectiveStatus}, notes=${d.notes}, subtotal=${subtotal}, tax_amount=${taxAmt}, total=${total}, updated_at=NOW() WHERE id=${id}`);
    await db.execute(sql`DELETE FROM sales_quotation_lines WHERE quotation_id = ${id}`);
    for (const l of lines) {
      await db.execute(sql`INSERT INTO sales_quotation_lines (quotation_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
        VALUES (${id}, ${l.productName}, ${l.description}, ${l.quantity || 1}, ${l.unitPrice || 0}, ${l.discountPercent || 0}, ${l.lineTotal || 0}, ${l.sortOrder || 0})`);
    }

    // Atomically ensure approval record exists for over-threshold discounts (no duplicate pending records)
    if (needsApproval) {
      const existingPending = await q(sql`SELECT id FROM quote_discount_approvals WHERE quote_id=${id} AND status='pending' LIMIT 1`);
      if (!existingPending[0]) {
        const qNum = String((current[0] as any)?.quote_number || "");
        const cName = String(d.customerName || (current[0] as any)?.customer_name || "");
        await db.execute(sql`
          INSERT INTO quote_discount_approvals (quote_id, quote_number, customer_name, discount_percent, threshold_percent, status, requested_by)
          VALUES (${id}, ${qNum}, ${cName}, ${maxDiscount}, ${threshold}, 'pending', ${(d as any).createdBy || null})
        `);
      }
    }

    res.json({ success: true, approvalRequired: needsApproval });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales/quotations/:id/convert", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { deliveryDate } = req.body || {};
    const quote = await q(sql`SELECT * FROM sales_quotations WHERE id = ${id}`);
    if (!quote[0]) { res.status(404).json({ error: "הצעה לא נמצאה" }); return; }
    const qd = quote[0] as any;

    // Discount approval gate — block conversion for pending/rejected approval quotes
    if (qd.status === 'pending_approval') {
      res.status(400).json({
        error: "לא ניתן להמיר הצעה שממתינה לאישור הנחה — יש להמתין לאישור מנהל",
        approvalRequired: true,
      });
      return;
    }
    if (qd.status === 'approval_rejected') {
      res.status(400).json({
        error: "לא ניתן להמיר הצעה שהנחתה נדחתה — יש להפחית את ההנחה ולשמור מחדש",
        approvalRejected: true,
      });
      return;
    }
    // Defense-in-depth: re-check that the current line discounts are covered by a valid approval
    {
      const thresholdRows = await q(sql`SELECT value FROM platform_settings WHERE key='quote.discount_approval_threshold' LIMIT 1`);
      const threshold = parseFloat(String((thresholdRows[0] as any)?.value || "15")) || 15;
      const lineRows = await q(sql`SELECT discount_percent FROM sales_quotation_lines WHERE quotation_id=${id}`);
      const maxDiscount = lineRows.reduce((m: number, l: any) => Math.max(m, Number(l.discount_percent) || 0), 0);
      if (maxDiscount > threshold) {
        const approvedRow = await q(sql`
          SELECT discount_percent FROM quote_discount_approvals
          WHERE quote_id=${id} AND status='approved'
          ORDER BY decided_at DESC LIMIT 1
        `);
        const approvedDiscount = approvedRow[0] ? Number((approvedRow[0] as any).discount_percent) : null;
        if (approvedDiscount === null || approvedDiscount < maxDiscount) {
          res.status(400).json({
            error: `לא ניתן להמיר הצעה עם הנחה של ${maxDiscount}% ללא אישור מנהל תואם (סף: ${threshold}%).`,
            approvalRequired: true,
          });
          return;
        }
      }
    }

    // Credit check — mandatory, cannot be bypassed
    if (qd.customer_id) {
      const custRows = await q(sql`SELECT credit_limit FROM sales_customers WHERE id=${Number(qd.customer_id)}`);
      const creditLimit = Number(custRows[0]?.credit_limit) || 0;
      if (creditLimit > 0) {
        const openRows = await q(sql`SELECT COALESCE(SUM(total),0) as open_total FROM sales_orders WHERE customer_id=${Number(qd.customer_id)} AND status NOT IN ('delivered','cancelled') AND payment_status='unpaid'`);
        const openTotal = Number((openRows[0] as any)?.open_total) || 0;
        const orderTotal = Number(qd.total) || 0;
        if ((openTotal + orderTotal) > creditLimit) {
          res.status(400).json({
            error: `חריגת אשראי: סה"כ ${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(openTotal + orderTotal)} חורג ממגבלת ${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(creditLimit)}`,
            creditBlocked: true,
            creditLimit,
            openTotal,
            orderTotal,
          });
          return;
        }
      }
    }

    const lines = await q(sql`SELECT * FROM sales_quotation_lines WHERE quotation_id = ${id} ORDER BY sort_order`);
    const orderNum = await nextNumber("SO");
    const reservationWarnings: string[] = [];

    // Wrap order creation, line inserts, inventory reservation, and quote status update in a single
    // transaction so partial failures cannot leave inconsistent state.
    let orderId: number;
    await db.transaction(async (tx) => {
      const result = await tx.execute(sql`INSERT INTO sales_orders (order_number, customer_id, customer_name, order_date, delivery_date, status, notes, subtotal, discount_amount, tax_amount, total)
        VALUES (${orderNum}, ${qd.customer_id}, ${qd.customer_name}, ${new Date().toISOString().slice(0,10)}, ${deliveryDate || null}, 'draft', ${qd.notes}, ${qd.subtotal}, 0, ${qd.tax_amount}, ${qd.total}) RETURNING id`);
      orderId = (result.rows as any[])[0]?.id;

      for (const l of lines as any[]) {
        await tx.execute(sql`INSERT INTO sales_order_lines (order_id, product_name, description, quantity, unit_price, discount_percent, line_total, sort_order)
          VALUES (${orderId}, ${l.product_name}, ${l.description}, ${l.quantity}, ${l.unit_price}, ${l.discount_percent}, ${l.line_total}, ${l.sort_order})`);

        // Inventory reservation — errors surfaced as warnings; partial inventory failures still commit
        // (reservation is best-effort to avoid blocking the order, but warnings are returned to client)
        const qty = Number(l.quantity) || 0;
        if (l.product_name && qty > 0) {
          let reservationError: string | null = null;
          try {
            const invRows = (await tx.execute(sql`SELECT id, current_stock FROM raw_materials WHERE material_name ILIKE ${l.product_name} AND status IN ('פעיל','active') LIMIT 1`)).rows as any[];
            if (!invRows[0]) {
              reservationError = `${l.product_name}: לא נמצא במלאי`;
            } else {
              const inv = invRows[0];
              const available = Number(inv.current_stock) || 0;
              if (available < qty) {
                reservationError = `${l.product_name}: מלאי לא מספיק (${available} זמין, ${qty} נדרש)`;
              } else {
                await tx.execute(sql`INSERT INTO inventory_reservations (order_id, product_name, quantity_reserved, status) VALUES (${orderId}, ${l.product_name}, ${qty}, 'reserved')`);
                await tx.execute(sql`UPDATE raw_materials SET current_stock = GREATEST(0, CAST(current_stock AS numeric) - ${qty})::text WHERE id = ${inv.id}`);
              }
            }
          } catch (invErr: any) {
            reservationError = `${l.product_name}: שגיאה בהזמנת מלאי — ${invErr.message}`;
          }
          if (reservationError) reservationWarnings.push(reservationError);
        }
      }

      await tx.execute(sql`UPDATE sales_quotations SET status='accepted', converted_order_id=${orderId}, updated_at=NOW() WHERE id=${id}`);
    });

    res.json({ success: true, order_id: orderId!, order_number: orderNum, reservationWarnings });
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
    const discountAmt = Number(d.discountAmount) || 0;
    const taxAmt = Number(d.taxAmount) || (subtotal - discountAmt) * VAT_RATE;
    const total = subtotal - discountAmt + taxAmt;
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
    const discountAmt = Number(d.discountAmount) || 0;
    const taxAmt = Number(d.taxAmount) || (subtotal - discountAmt) * VAT_RATE;
    const total = subtotal - discountAmt + taxAmt;
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
