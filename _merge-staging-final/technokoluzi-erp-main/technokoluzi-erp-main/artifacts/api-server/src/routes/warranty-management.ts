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

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Warranty query error:", e.message); return []; }
}
const s = (v: any) => v != null && v !== "" ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => (v != null && v !== "" ? Number(v) : 0);

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS warranty_policies (
    id SERIAL PRIMARY KEY,
    policy_code VARCHAR(50) UNIQUE NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    duration_months INTEGER DEFAULT 12,
    coverage_type VARCHAR(50) DEFAULT 'standard',
    product_categories TEXT,
    terms TEXT,
    includes_parts BOOLEAN DEFAULT true,
    includes_labor BOOLEAN DEFAULT true,
    max_claims INTEGER,
    max_claim_amount NUMERIC(18,2),
    deductible NUMERIC(18,2) DEFAULT 0,
    extension_available BOOLEAN DEFAULT false,
    extension_price NUMERIC(18,2),
    extension_months INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS warranty_registrations (
    id SERIAL PRIMARY KEY,
    registration_number VARCHAR(50) UNIQUE NOT NULL,
    policy_id INTEGER REFERENCES warranty_policies(id),
    policy_name VARCHAR(255),
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_address TEXT,
    product_name VARCHAR(255),
    product_category VARCHAR(100),
    product_sku VARCHAR(100),
    serial_number VARCHAR(100),
    purchase_date DATE,
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    extended_end_date DATE,
    invoice_number VARCHAR(100),
    dealer_name VARCHAR(255),
    status VARCHAR(30) DEFAULT 'active',
    claims_count INTEGER DEFAULT 0,
    total_claim_cost NUMERIC(18,2) DEFAULT 0,
    notes TEXT,
    created_by VARCHAR(255),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS warranty_claims (
    id SERIAL PRIMARY KEY,
    claim_number VARCHAR(50) UNIQUE NOT NULL,
    registration_id INTEGER REFERENCES warranty_registrations(id),
    registration_number VARCHAR(50),
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    product_name VARCHAR(255),
    serial_number VARCHAR(100),
    claim_type VARCHAR(50) DEFAULT 'repair',
    issue_description TEXT NOT NULL,
    diagnosis TEXT,
    resolution TEXT,
    priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(30) DEFAULT 'open',
    assigned_to VARCHAR(255),
    repair_cost NUMERIC(18,2) DEFAULT 0,
    parts_cost NUMERIC(18,2) DEFAULT 0,
    labor_cost NUMERIC(18,2) DEFAULT 0,
    replacement_cost NUMERIC(18,2) DEFAULT 0,
    total_cost NUMERIC(18,2) DEFAULT 0,
    covered_amount NUMERIC(18,2) DEFAULT 0,
    customer_charge NUMERIC(18,2) DEFAULT 0,
    claim_date DATE DEFAULT CURRENT_DATE,
    resolved_date DATE,
    technician_name VARCHAR(255),
    technician_notes TEXT,
    approval_notes TEXT,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    notes TEXT,
    created_by VARCHAR(255),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS warranty_extensions (
    id SERIAL PRIMARY KEY,
    extension_number VARCHAR(50) UNIQUE NOT NULL,
    registration_id INTEGER REFERENCES warranty_registrations(id),
    registration_number VARCHAR(50),
    customer_name VARCHAR(255),
    product_name VARCHAR(255),
    extension_months INTEGER DEFAULT 12,
    price NUMERIC(18,2) DEFAULT 0,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    original_end_date DATE,
    new_end_date DATE,
    status VARCHAR(30) DEFAULT 'pending',
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    notes TEXT,
    created_by VARCHAR(255),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
}
ensureTables();

// ========== POLICIES ==========
router.get("/warranty/policies", async (_req, res) => {
  res.json(await q(`SELECT * FROM warranty_policies ORDER BY policy_name`));
});

router.get("/warranty/policies/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM warranty_policies WHERE id=${parseInt(req.params.id)}`);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: "מדיניות לא נמצאה" });
});

router.post("/warranty/policies", async (req, res) => {
  const d = req.body;
  const code = d.policyCode || `WPL-${Date.now()}`;
  await q(`INSERT INTO warranty_policies (policy_code, policy_name, duration_months, coverage_type, product_categories, terms, includes_parts, includes_labor, max_claims, max_claim_amount, deductible, extension_available, extension_price, extension_months, status, notes)
    VALUES (${s(code)}, ${s(d.policyName)}, ${n(d.durationMonths)||12}, ${s(d.coverageType||'standard')}, ${s(d.productCategories)}, ${s(d.terms)}, ${d.includesParts !== false}, ${d.includesLabor !== false}, ${d.maxClaims||'NULL'}, ${d.maxClaimAmount||'NULL'}, ${n(d.deductible)}, ${d.extensionAvailable||false}, ${d.extensionPrice||'NULL'}, ${d.extensionMonths||'NULL'}, ${s(d.status||'active')}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM warranty_policies WHERE policy_code=${s(code)}`))[0]);
});

router.put("/warranty/policies/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE warranty_policies SET policy_name=${s(d.policyName)}, duration_months=${n(d.durationMonths)}, coverage_type=${s(d.coverageType)}, product_categories=${s(d.productCategories)}, terms=${s(d.terms)}, includes_parts=${d.includesParts||false}, includes_labor=${d.includesLabor||false}, max_claims=${d.maxClaims||'NULL'}, max_claim_amount=${d.maxClaimAmount||'NULL'}, deductible=${n(d.deductible)}, extension_available=${d.extensionAvailable||false}, extension_price=${d.extensionPrice||'NULL'}, extension_months=${d.extensionMonths||'NULL'}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM warranty_policies WHERE id=${id}`))[0]);
});

router.delete("/warranty/policies/:id", async (req, res) => {
  await q(`DELETE FROM warranty_policies WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== REGISTRATIONS ==========
router.get("/warranty/registrations", async (_req, res) => {
  res.json(await q(`SELECT r.*, p.coverage_type, p.duration_months as policy_duration FROM warranty_registrations r LEFT JOIN warranty_policies p ON r.policy_id = p.id ORDER BY r.created_at DESC`));
});

router.get("/warranty/registrations/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM warranty_registrations WHERE id=${parseInt(req.params.id)}`);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: "רישום אחריות לא נמצא" });
});

router.post("/warranty/registrations", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const num = await nextNum("WRG-", "warranty_registrations", "registration_number");
  const startDate = d.startDate || d.purchaseDate || new Date().toISOString().slice(0, 10);
  // Calculate end date based on policy duration
  let endDate = d.endDate;
  if (!endDate && d.durationMonths) {
    const sd = new Date(startDate);
    sd.setMonth(sd.getMonth() + parseInt(d.durationMonths));
    endDate = sd.toISOString().slice(0, 10);
  }
  await q(`INSERT INTO warranty_registrations (registration_number, policy_id, policy_name, customer_name, customer_email, customer_phone, customer_address, product_name, product_category, product_sku, serial_number, purchase_date, start_date, end_date, invoice_number, dealer_name, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${d.policyId||'NULL'}, ${s(d.policyName)}, ${s(d.customerName)}, ${s(d.customerEmail)}, ${s(d.customerPhone)}, ${s(d.customerAddress)}, ${s(d.productName)}, ${s(d.productCategory)}, ${s(d.productSku)}, ${s(d.serialNumber)}, ${s(d.purchaseDate)}, ${s(startDate)}, ${s(endDate)}, ${s(d.invoiceNumber)}, ${s(d.dealerName)}, ${s(d.status||'active')}, ${s(d.notes)}, ${s(user?.id)}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM warranty_registrations WHERE registration_number='${num}'`))[0]);
});

router.put("/warranty/registrations/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE warranty_registrations SET policy_id=${d.policyId||'NULL'}, policy_name=${s(d.policyName)}, customer_name=${s(d.customerName)}, customer_email=${s(d.customerEmail)}, customer_phone=${s(d.customerPhone)}, customer_address=${s(d.customerAddress)}, product_name=${s(d.productName)}, product_category=${s(d.productCategory)}, product_sku=${s(d.productSku)}, serial_number=${s(d.serialNumber)}, purchase_date=${s(d.purchaseDate)}, start_date=${s(d.startDate)}, end_date=${s(d.endDate)}, invoice_number=${s(d.invoiceNumber)}, dealer_name=${s(d.dealerName)}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM warranty_registrations WHERE id=${id}`))[0]);
});

router.delete("/warranty/registrations/:id", async (req, res) => {
  await q(`DELETE FROM warranty_registrations WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== CLAIMS ==========
router.get("/warranty/claims", async (_req, res) => {
  res.json(await q(`SELECT c.*, r.product_name as reg_product, r.serial_number as reg_serial, r.end_date as warranty_end FROM warranty_claims c LEFT JOIN warranty_registrations r ON c.registration_id = r.id ORDER BY c.claim_date DESC, c.id DESC`));
});

router.get("/warranty/claims/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM warranty_claims WHERE id=${parseInt(req.params.id)}`);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: "תביעה לא נמצאה" });
});

router.post("/warranty/claims", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const num = await nextNum("WCL-", "warranty_claims", "claim_number");
  const repair = n(d.repairCost); const parts = n(d.partsCost); const labor = n(d.laborCost); const replacement = n(d.replacementCost);
  const total = repair + parts + labor + replacement;
  await q(`INSERT INTO warranty_claims (claim_number, registration_id, registration_number, customer_name, customer_phone, product_name, serial_number, claim_type, issue_description, diagnosis, priority, status, assigned_to, repair_cost, parts_cost, labor_cost, replacement_cost, total_cost, claim_date, notes, created_by, created_by_name)
    VALUES ('${num}', ${d.registrationId||'NULL'}, ${s(d.registrationNumber)}, ${s(d.customerName)}, ${s(d.customerPhone)}, ${s(d.productName)}, ${s(d.serialNumber)}, ${s(d.claimType||'repair')}, ${s(d.issueDescription)}, ${s(d.diagnosis)}, ${s(d.priority||'normal')}, 'open', ${s(d.assignedTo)}, ${repair}, ${parts}, ${labor}, ${replacement}, ${total}, ${s(d.claimDate||new Date().toISOString().slice(0,10))}, ${s(d.notes)}, ${s(user?.id)}, ${s(user?.fullName)})`);
  // Update registration claims count
  if (d.registrationId) {
    await q(`UPDATE warranty_registrations SET claims_count = claims_count + 1, updated_at=NOW() WHERE id=${d.registrationId}`);
  }
  res.json((await q(`SELECT * FROM warranty_claims WHERE claim_number='${num}'`))[0]);
});

router.put("/warranty/claims/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  const repair = n(d.repairCost); const parts = n(d.partsCost); const labor = n(d.laborCost); const replacement = n(d.replacementCost);
  const total = repair + parts + labor + replacement;
  await q(`UPDATE warranty_claims SET claim_type=${s(d.claimType)}, issue_description=${s(d.issueDescription)}, diagnosis=${s(d.diagnosis)}, resolution=${s(d.resolution)}, priority=${s(d.priority)}, status=${s(d.status)}, assigned_to=${s(d.assignedTo)}, repair_cost=${repair}, parts_cost=${parts}, labor_cost=${labor}, replacement_cost=${replacement}, total_cost=${total}, covered_amount=${n(d.coveredAmount)}, customer_charge=${n(d.customerCharge)}, resolved_date=${s(d.resolvedDate)}, technician_name=${s(d.technicianName)}, technician_notes=${s(d.technicianNotes)}, approval_notes=${s(d.approvalNotes)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  // Update total claim cost in registration
  const claim = (await q(`SELECT registration_id FROM warranty_claims WHERE id=${id}`))[0] as any;
  if (claim?.registration_id) {
    await q(`UPDATE warranty_registrations SET total_claim_cost = COALESCE((SELECT SUM(total_cost) FROM warranty_claims WHERE registration_id=${claim.registration_id}), 0), updated_at=NOW() WHERE id=${claim.registration_id}`);
  }
  res.json((await q(`SELECT * FROM warranty_claims WHERE id=${id}`))[0]);
});

router.post("/warranty/claims/:id/process", async (req, res) => {
  const id = parseInt(req.params.id); const d = req.body; const user = (req as any).user;
  const newStatus = d.approved ? "approved" : "denied";
  await q(`UPDATE warranty_claims SET status='${newStatus}', approval_notes=${s(d.approvalNotes)}, approved_by=${s(user?.fullName)}, approved_at=NOW(), covered_amount=${n(d.coveredAmount)}, customer_charge=${n(d.customerCharge)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM warranty_claims WHERE id=${id}`))[0]);
});

router.delete("/warranty/claims/:id", async (req, res) => {
  await q(`DELETE FROM warranty_claims WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== EXTENSIONS ==========
router.get("/warranty/extensions", async (_req, res) => {
  res.json(await q(`SELECT * FROM warranty_extensions ORDER BY created_at DESC`));
});

router.post("/warranty/extensions", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const num = await nextNum("WEX-", "warranty_extensions", "extension_number");
  await q(`INSERT INTO warranty_extensions (extension_number, registration_id, registration_number, customer_name, product_name, extension_months, price, payment_method, payment_reference, original_end_date, new_end_date, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${d.registrationId||'NULL'}, ${s(d.registrationNumber)}, ${s(d.customerName)}, ${s(d.productName)}, ${n(d.extensionMonths)||12}, ${n(d.price)}, ${s(d.paymentMethod)}, ${s(d.paymentReference)}, ${s(d.originalEndDate)}, ${s(d.newEndDate)}, ${s(d.status||'pending')}, ${s(d.notes)}, ${s(user?.id)}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM warranty_extensions WHERE extension_number='${num}'`))[0]);
});

router.post("/warranty/extensions/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id); const user = (req as any).user;
  const ext = (await q(`SELECT * FROM warranty_extensions WHERE id=${id}`))[0] as any;
  if (!ext) { res.status(404).json({ error: "הרחבה לא נמצאה" }); return; }
  await q(`UPDATE warranty_extensions SET status='approved', approved_by=${s(user?.fullName)}, approved_at=NOW(), updated_at=NOW() WHERE id=${id}`);
  // Update registration end date
  if (ext.registration_id && ext.new_end_date) {
    await q(`UPDATE warranty_registrations SET extended_end_date=${s(ext.new_end_date)}, updated_at=NOW() WHERE id=${ext.registration_id}`);
  }
  res.json((await q(`SELECT * FROM warranty_extensions WHERE id=${id}`))[0]);
});

// ========== DASHBOARD / STATS ==========
router.get("/warranty/dashboard", async (_req, res) => {
  const stats = await q(`SELECT
    (SELECT COUNT(*) FROM warranty_registrations WHERE status='active') as active_warranties,
    (SELECT COUNT(*) FROM warranty_registrations WHERE status='active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_soon,
    (SELECT COUNT(*) FROM warranty_claims WHERE status IN ('open','in_progress')) as open_claims,
    (SELECT COUNT(*) FROM warranty_claims) as total_claims,
    (SELECT COUNT(*) FROM warranty_claims WHERE status IN ('approved','completed')) as resolved_claims,
    (SELECT COALESCE(SUM(total_cost), 0) FROM warranty_claims WHERE status IN ('approved','completed')) as total_claim_cost,
    (SELECT COUNT(*) FROM warranty_policies WHERE status='active') as active_policies,
    (SELECT COUNT(*) FROM warranty_extensions WHERE status='pending') as pending_extensions
  `);
  const claimsByType = await q(`SELECT claim_type, COUNT(*) as count, COALESCE(SUM(total_cost),0) as cost FROM warranty_claims GROUP BY claim_type`);
  const claimsByStatus = await q(`SELECT status, COUNT(*) as count FROM warranty_claims GROUP BY status`);
  const expiringWarranties = await q(`SELECT * FROM warranty_registrations WHERE status='active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days' ORDER BY end_date ASC LIMIT 20`);

  const s0 = stats[0] as any || {};
  const totalC = Number(s0.total_claims) || 0;
  const resolvedC = Number(s0.resolved_claims) || 0;
  const resolutionRate = totalC > 0 ? Math.round((resolvedC / totalC) * 100) : 0;

  res.json({ ...s0, resolution_rate: resolutionRate, claimsByType, claimsByStatus, expiringWarranties });
});

router.get("/warranty/expiry-alerts", async (_req, res) => {
  res.json(await q(`SELECT * FROM warranty_registrations WHERE status='active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days' ORDER BY end_date ASC`));
});

export default router;
