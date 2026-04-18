import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { VAT_RATE } from "../constants";

const router = Router();

// Blanket authentication guard for all write (POST/PUT/DELETE) endpoints on this router.
// The global attachPermissions middleware sets req.userId for all /api routes — this enforces it.
router.use((req: Request, res: Response, next: () => void) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method) && !(req as any).userId) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  next();
});

const q = async (query: any): Promise<any[]> => {
  try {
    const r = await db.execute(query);
    return (r.rows as any[]) || [];
  } catch (e: any) {
    console.error("[QuoteBuilder]", e.message);
    return [];
  }
};

// ======================== SETTINGS HELPERS ========================
// Read a setting from platform_settings; returns defaultValue if not found
async function getSetting(key: string, defaultValue: string): Promise<string> {
  const rows = await q(sql`SELECT value FROM platform_settings WHERE key=${key} LIMIT 1`);
  const val = (rows[0] as any)?.value;
  return val !== null && val !== undefined && val !== "" ? String(val) : defaultValue;
}

// Resolve all company branding settings at once
async function getCompanyBranding() {
  const [name, address, phone, email, logoUrl] = await Promise.all([
    getSetting("company.name", "Our Company"),
    getSetting("company.address", "Tel Aviv, Israel"),
    getSetting("company.phone", "03-1234567"),
    getSetting("company.email", "info@company.co.il"),
    getSetting("company.logo_url", ""),
  ]);
  return { name, address, phone, email, logoUrl };
}

// Get the configured discount approval threshold (defaults to 15%)
async function getDiscountThreshold(): Promise<number> {
  const val = await getSetting("quote.discount_approval_threshold", "15");
  const n = parseFloat(val);
  return isNaN(n) ? 15 : n;
}

// ======================== PRICE RESOLUTION ENGINE ========================
// Helper: look up base list price for a product
async function getBaseListPrice(productName: string, productCode: string | undefined, today: string): Promise<number | null> {
  const plRows = await db.execute(sql`
    SELECT items_json FROM price_lists_ent
    WHERE status = 'active'
    AND (valid_from IS NULL OR valid_from <= ${today})
    AND (valid_to IS NULL OR valid_to >= ${today})
    ORDER BY updated_at DESC LIMIT 1
  `).then(r => (r.rows as any[]) || []).catch(() => []);
  if (!plRows[0]) return null;
  const items = Array.isArray(plRows[0].items_json) ? plRows[0].items_json : [];
  const item = items.find((i: any) =>
    i.name?.toLowerCase() === productName?.toLowerCase() ||
    i.product_name?.toLowerCase() === productName?.toLowerCase() ||
    (productCode && i.code === productCode)
  );
  return item?.price ? Number(item.price) : null;
}

router.post("/quote-builder/resolve-price", async (req: Request, res: Response) => {
  try {
    const { productName, productCode, customerId, quantity } = req.body;
    const qty = Number(quantity) || 1;
    const today = new Date().toISOString().slice(0, 10);

    let resolvedPrice: number | null = null;
    let appliedRule = "";
    let ruleType = "";

    // 1. Customer-specific price — highest priority, always a fixed price
    // Match by customerId (numeric) OR by customer name (text) to cover both entry paths
    if (customerId) {
      // First try by numeric ID
      const custRows = await q(sql`
        SELECT price FROM customer_specific_prices
        WHERE customer_id = ${Number(customerId)}
        AND product_name ILIKE ${productName}
        AND (valid_from IS NULL OR valid_from <= ${today})
        AND (valid_until IS NULL OR valid_until >= ${today})
        ORDER BY created_at DESC LIMIT 1
      `);
      if (custRows[0]) {
        resolvedPrice = Number(custRows[0].price);
        appliedRule = "מחיר ספציפי ללקוח";
        ruleType = "customer_specific";
      } else {
        // Fallback: resolve customer name from id and match by name
        const nameRows = await q(sql`SELECT name FROM sales_customers WHERE id=${Number(customerId)} LIMIT 1`);
        if (nameRows[0]) {
          const custName = String(nameRows[0].name);
          const custRowsByName = await q(sql`
            SELECT price FROM customer_specific_prices
            WHERE customer_name ILIKE ${custName}
            AND product_name ILIKE ${productName}
            AND (valid_from IS NULL OR valid_from <= ${today})
            AND (valid_until IS NULL OR valid_until >= ${today})
            ORDER BY created_at DESC LIMIT 1
          `);
          if (custRowsByName[0]) {
            resolvedPrice = Number(custRowsByName[0].price);
            appliedRule = "מחיר ספציפי ללקוח";
            ruleType = "customer_specific";
          }
        }
      }
    }

    // 2. Active promotion — can be fixed price or % discount applied to base list price
    if (resolvedPrice === null) {
      const promoRows = await q(sql`
        SELECT discount_percent, fixed_price FROM promotional_pricing
        WHERE (product_name IS NULL OR product_name ILIKE ${productName})
        AND is_active = true
        AND valid_from <= ${today}
        AND valid_until >= ${today}
        ORDER BY priority DESC, discount_percent DESC LIMIT 1
      `);
      if (promoRows[0]) {
        const promo = promoRows[0];
        if (promo.fixed_price) {
          resolvedPrice = Number(promo.fixed_price);
          appliedRule = "מחיר מבצע קבוע";
          ruleType = "promotion";
        } else if (Number(promo.discount_percent) > 0) {
          const basePrice = await getBaseListPrice(productName, productCode, today);
          if (basePrice !== null) {
            resolvedPrice = basePrice * (1 - Number(promo.discount_percent) / 100);
            appliedRule = `הנחת מבצע: ${promo.discount_percent}%`;
            ruleType = "promotion";
          }
        }
      }
    }

    // 3. Volume discount tier — can be fixed price or % discount applied to base list price
    if (resolvedPrice === null) {
      const volRows = await q(sql`
        SELECT discount_percent, fixed_price FROM volume_discount_tiers
        WHERE (product_name IS NULL OR product_name ILIKE ${productName})
        AND min_quantity <= ${qty}
        AND (max_quantity IS NULL OR max_quantity >= ${qty})
        ORDER BY min_quantity DESC LIMIT 1
      `);
      if (volRows[0]) {
        const vol = volRows[0];
        if (vol.fixed_price) {
          resolvedPrice = Number(vol.fixed_price);
          appliedRule = `מחיר נפח קבוע (כמות: ${qty})`;
          ruleType = "volume_discount";
        } else if (Number(vol.discount_percent) > 0) {
          const basePrice = await getBaseListPrice(productName, productCode, today);
          if (basePrice !== null) {
            resolvedPrice = basePrice * (1 - Number(vol.discount_percent) / 100);
            appliedRule = `הנחת נפח: ${vol.discount_percent}% (כמות: ${qty})`;
            ruleType = "volume_discount";
          }
        }
      }
    }

    // 4. Standard price list — fallback
    if (resolvedPrice === null) {
      const basePrice = await getBaseListPrice(productName, productCode, today);
      if (basePrice !== null) {
        resolvedPrice = basePrice;
        appliedRule = "מחיר מחירון רגיל";
        ruleType = "price_list";
      }
    }

    res.json({
      productName,
      quantity: qty,
      resolvedPrice,
      appliedRule: appliedRule || "לא נמצא מחיר",
      ruleType: ruleType || "none",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== SETTINGS API ========================
router.get("/quote-builder/settings", async (_req: Request, res: Response) => {
  try {
    const threshold = await getDiscountThreshold();
    const branding = await getCompanyBranding();
    res.json({ discountApprovalThreshold: threshold, company: branding });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/quote-builder/settings", async (req: Request, res: Response) => {
  try {
    if (!(await requireManagerAuth(req, res))) return;
    const { discountApprovalThreshold, company } = req.body;
    if (discountApprovalThreshold !== undefined) {
      const v = parseFloat(String(discountApprovalThreshold));
      if (!isNaN(v) && v >= 0 && v <= 100) {
        await db.execute(sql`UPDATE platform_settings SET value=${String(v)}, updated_at=NOW() WHERE key='quote.discount_approval_threshold'`);
      }
    }
    if (company) {
      for (const [field, settingKey] of [
        ["name", "company.name"],
        ["address", "company.address"],
        ["phone", "company.phone"],
        ["email", "company.email"],
        ["logoUrl", "company.logo_url"],
      ] as [string, string][]) {
        if (company[field] !== undefined) {
          await db.execute(sql`UPDATE platform_settings SET value=${String(company[field])}, updated_at=NOW() WHERE key=${settingKey}`);
        }
      }
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== PRODUCT SEARCH ========================
// Returns a combined product list from price lists, raw materials, and pricing tables
// Used by the quote line item picker to populate the datalist/autocomplete
router.get("/quote-builder/products", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.q || "").trim();
    const limit = 30;
    const products: Array<{ name: string; code: string; defaultPrice: number | null; unit: string }> = [];
    const seen = new Set<string>();

    const add = (name: string, code: string, price: number | null, unit: string) => {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        products.push({ name, code, defaultPrice: price, unit });
      }
    };

    // 1. Products from active price list items_json
    const today = new Date().toISOString().slice(0, 10);
    const plRows = await q(sql`
      SELECT items_json FROM price_lists_ent
      WHERE status = 'active'
      AND (valid_from IS NULL OR valid_from <= ${today})
      AND (valid_to IS NULL OR valid_to >= ${today})
      ORDER BY updated_at DESC LIMIT 5
    `);
    for (const pl of plRows) {
      try {
        const items = Array.isArray(pl.items_json) ? pl.items_json : JSON.parse(String(pl.items_json || "[]"));
        for (const item of items) {
          const name = String(item.name || item.product_name || item.productName || "");
          if (!name) continue;
          if (search && !name.toLowerCase().includes(search.toLowerCase())) continue;
          add(name, String(item.code || item.product_code || item.sku || ""), Number(item.price || item.unitPrice || 0) || null, String(item.unit || "יחידה"));
          if (products.length >= limit) break;
        }
      } catch {}
    }

    // 2. Products from raw_materials (inventory) — search by name
    if (products.length < limit) {
      const remaining = limit - products.length;
      const matRows = search
        ? await q(sql`
            SELECT material_name, sku, unit_price, unit FROM raw_materials
            WHERE status IN ('פעיל','active')
            AND material_name ILIKE ${`%${search}%`}
            ORDER BY material_name LIMIT ${remaining}
          `)
        : await q(sql`
            SELECT material_name, sku, unit_price, unit FROM raw_materials
            WHERE status IN ('פעיל','active')
            ORDER BY material_name LIMIT ${remaining}
          `);
      for (const m of matRows as any[]) {
        add(String(m.material_name), String(m.sku || ""), Number(m.unit_price) || null, String(m.unit || "יחידה"));
      }
    }

    // 3. Products from customer_specific_prices
    if (products.length < limit) {
      const cspPattern = search ? `%${search}%` : "%";
      const cspRows = await q(sql`
        SELECT DISTINCT product_name, product_code FROM customer_specific_prices
        WHERE product_name IS NOT NULL AND product_name ILIKE ${cspPattern}
        ORDER BY product_name LIMIT ${limit - products.length}
      `);
      for (const r of cspRows as any[]) {
        add(String(r.product_name), String(r.product_code || ""), null, "יחידה");
      }
    }

    // 4. Products from promotional_pricing
    if (products.length < limit) {
      const promoPattern = search ? `%${search}%` : "%";
      const promoRows = await q(sql`
        SELECT DISTINCT product_name, product_code FROM promotional_pricing
        WHERE product_name IS NOT NULL AND product_name ILIKE ${promoPattern}
        LIMIT ${limit - products.length}
      `);
      for (const r of promoRows as any[]) {
        add(String(r.product_name), String(r.product_code || ""), null, "יחידה");
      }
    }

    res.json(products.slice(0, limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== DISCOUNT APPROVALS ========================
router.get("/quote-builder/discount-approvals", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM quote_discount_approvals ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/quote-builder/discount-approvals", async (req: Request, res: Response) => {
  try {
    const { quoteId, quoteNumber, customerName, discountPercent, thresholdPercent, requestedBy } = req.body;
    await db.execute(sql`
      INSERT INTO quote_discount_approvals (quote_id, quote_number, customer_name, discount_percent, threshold_percent, status, requested_by)
      VALUES (${Number(quoteId)}, ${quoteNumber}, ${customerName}, ${Number(discountPercent)}, ${Number(thresholdPercent) || 15}, 'pending', ${requestedBy || null})
    `);
    await db.execute(sql`UPDATE sales_quotations SET status='pending_approval', updated_at=NOW() WHERE id=${Number(quoteId)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Authorization guard: only admin or manager-role users can approve or reject discounts
// Manager roles: isSuperAdmin, or role name contains 'מנהל'/'manager'/'admin' (case-insensitive)
async function requireManagerAuth(req: Request, res: Response): Promise<boolean> {
  // 1. Check permissions/user fields populated by platform middleware
  if ((req as any).permissions?.isSuperAdmin) return true;
  const user = (req as any).user as any;
  if (user?.isSuperAdmin) return true;
  // Check user roles array (populated by auth middleware)
  if (Array.isArray(user?.roles)) {
    const managerPattern = /מנהל|manager|admin/i;
    if (user.roles.some((r: any) => managerPattern.test(String(r?.name || r || "")))) return true;
  }
  // Check single role field
  if (user?.role && /מנהל|manager|admin/i.test(String(user.role))) return true;

  // 2. Fallback: verify JWT and check roles/isSuperAdmin from token payload
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const { verifyToken } = await import("../lib/auth.js");
      const payload = verifyToken(token) as any;
      if (payload?.isSuperAdmin) return true;
      if (payload?.role && /מנהל|manager|admin/i.test(String(payload.role))) return true;
      if (Array.isArray(payload?.roles)) {
        const managerPattern = /מנהל|manager|admin/i;
        if (payload.roles.some((r: any) => managerPattern.test(String(r?.name || r || "")))) return true;
      }
      // 3. Last resort: look up user in DB to confirm they have a manager role
      if (payload?.userId || payload?.id) {
        const userId = payload.userId || payload.id;
        const dbUser = await q(sql`SELECT is_super_admin, role FROM users WHERE id=${Number(userId)} LIMIT 1`);
        if (dbUser[0]) {
          const u = dbUser[0] as any;
          if (u.is_super_admin) return true;
          if (u.role && /מנהל|manager|admin/i.test(String(u.role))) return true;
        }
      }
    } catch {}
  }
  res.status(403).json({ error: "אין הרשאה — נדרשת הרשאת מנהל או מנהל מכירות לפעולה זו" });
  return false;
}

router.post("/quote-builder/discount-approvals/:id/approve", async (req: Request, res: Response) => {
  try {
    if (!(await requireManagerAuth(req, res))) return;
    const id = Number(req.params.id);
    const { approvedBy, notes } = req.body;
    const approval = await q(sql`SELECT * FROM quote_discount_approvals WHERE id=${id}`);
    if (!approval[0]) { res.status(404).json({ error: "לא נמצא" }); return; }
    const approverName = approvedBy || (req as any).user?.fullNameHe || (req as any).user?.username || "מנהל";
    await db.execute(sql`
      UPDATE quote_discount_approvals SET status='approved', approved_by=${approverName}, approval_notes=${notes || null}, decided_at=NOW(), updated_at=NOW() WHERE id=${id}
    `);
    // On approval: quote moves to 'approved' status — it may now be sent/converted
    await db.execute(sql`UPDATE sales_quotations SET status='approved', updated_at=NOW() WHERE id=${approval[0].quote_id} AND status='pending_approval'`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/quote-builder/discount-approvals/:id/reject", async (req: Request, res: Response) => {
  try {
    if (!(await requireManagerAuth(req, res))) return;
    const id = Number(req.params.id);
    const { rejectedBy, reason } = req.body;
    const approval = await q(sql`SELECT * FROM quote_discount_approvals WHERE id=${id}`);
    if (!approval[0]) { res.status(404).json({ error: "לא נמצא" }); return; }
    const rejectorName = rejectedBy || (req as any).user?.fullNameHe || (req as any).user?.username || "מנהל";
    await db.execute(sql`
      UPDATE quote_discount_approvals SET status='rejected', rejected_by=${rejectorName}, rejection_reason=${reason || null}, decided_at=NOW(), updated_at=NOW() WHERE id=${id}
    `);
    // On rejection: quote moves to 'approval_rejected' — cannot be converted until discount is reduced
    await db.execute(sql`UPDATE sales_quotations SET status='approval_rejected', updated_at=NOW() WHERE id=${approval[0].quote_id} AND status='pending_approval'`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== PDF GENERATION ========================
router.get("/quote-builder/pdf/:quoteId", async (req: Request, res: Response) => {
  try {
    const quoteId = Number(req.params.quoteId);
    const [quoteRows, branding] = await Promise.all([
      q(sql`SELECT * FROM sales_quotations WHERE id = ${quoteId}`),
      getCompanyBranding(),
    ]);
    if (!quoteRows[0]) { res.status(404).json({ error: "הצעה לא נמצאה" }); return; }
    const quote = quoteRows[0] as any;
    const lines = await q(sql`SELECT * FROM sales_quotation_lines WHERE quotation_id = ${quoteId} ORDER BY sort_order`);

    const subtotal = Number(quote.subtotal) || 0;
    const vat = Number(quote.tax_amount) || subtotal * VAT_RATE;
    const total = Number(quote.total) || subtotal + vat;

    const fmtC = (n: number) => `ILS ${new Intl.NumberFormat("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;
    const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(n);
    const safe = (v: any) => String(v || "");

    const statusLabel: Record<string, string> = { draft: "Teyotet", sent: "NishlaH", accepted: "Hitkabal", rejected: "NidHa", expired: "Pag Tokef" };

    // Embed company logo if configured as a base64 data URI (HTTP URLs rejected to prevent SSRF)
    let logoBuffer: Buffer | null = null;
    if (branding.logoUrl) {
      try {
        // Only base64 data URIs are accepted — external HTTP(S) URLs are rejected
        // to prevent SSRF attacks (logo must be uploaded and stored as base64).
        if (branding.logoUrl.startsWith("data:image/") && branding.logoUrl.includes(";base64,")) {
          const base64Data = branding.logoUrl.replace(/^data:[^;]+;base64,/, "");
          logoBuffer = Buffer.from(base64Data, "base64");
        }
        // HTTP/HTTPS URLs are silently ignored — only embedded data URIs are accepted
      } catch {
        logoBuffer = null; // non-fatal: fall back to text-only branding
      }
    }

    // Generate PDF with pdfkit (LTR layout for Hebrew display in PDF — Hebrew glyphs are bidi in PDF)
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Quote ${safe(quote.quote_number)}` } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="quote-${safe(quote.quote_number)}.pdf"`);
    doc.pipe(res);

    const W = 515; // usable width
    const blue = "#1a56db";
    const gray = "#6b7280";
    const dark = "#111827";
    const light = "#f3f4f6";

    // Header bar with company branding
    doc.rect(40, 40, W, 70).fill(blue);
    let headerTextX = 50;
    if (logoBuffer) {
      // Embed logo in top-right corner of the header bar (48×48 px)
      try {
        doc.image(logoBuffer, 475, 47, { width: 56, height: 56 });
      } catch {
        // ignore if image format not supported
      }
    }
    doc.fillColor("white").fontSize(20).font("Helvetica-Bold").text("QUOTE / HATZA'AT MECHIR", headerTextX, 52, { width: W - 80, align: "left" });
    doc.fontSize(11).font("Helvetica").text(`No: ${safe(quote.quote_number)}`, headerTextX, 76, { width: W - 80, align: "left" });

    doc.fillColor(dark).fontSize(10).font("Helvetica").moveDown(4);
    let y = 125;

    // Company & Quote info row — sourced from platform_settings
    doc.fillColor(gray).fontSize(9).text("FROM:", 40, y);
    doc.fillColor(dark).fontSize(10).font("Helvetica-Bold").text(safe(branding.name), 40, y + 12);
    const contactLine = [branding.address, branding.phone, branding.email].filter(Boolean).join(" | ");
    doc.fillColor(gray).fontSize(9).font("Helvetica").text(contactLine, 40, y + 25);

    doc.fillColor(gray).fontSize(9).text("DATE:", 370, y);
    doc.fillColor(dark).fontSize(10).font("Helvetica-Bold").text(safe(quote.quote_date?.slice(0, 10)), 370, y + 12);
    if (quote.valid_until) {
      doc.fillColor(gray).fontSize(9).font("Helvetica").text(`Valid Until: ${safe(quote.valid_until.slice(0, 10))}`, 370, y + 25);
    }

    y = 185;
    doc.fillColor(gray).fontSize(9).text("TO:", 40, y);
    doc.fillColor(dark).fontSize(11).font("Helvetica-Bold").text(safe(quote.customer_name), 40, y + 12);
    doc.fillColor(gray).fontSize(9).font("Helvetica").text(`Status: ${statusLabel[quote.status] || safe(quote.status)}`, 40, y + 26);

    y = 235;
    doc.moveTo(40, y).lineTo(555, y).strokeColor(blue).lineWidth(2).stroke();
    y += 10;

    // Table header
    doc.rect(40, y, W, 20).fill(blue);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold");
    const cols = [40, 90, 255, 315, 380, 440, 495];
    const hdr = ["#", "Product / Metzar", "Description", "Qty", "Unit Price", "Disc%", "Total"];
    hdr.forEach((h, i) => doc.text(h, cols[i], y + 5, { width: cols[i + 1] ? cols[i + 1] - cols[i] - 4 : 60, align: i === 0 ? "center" : "left" }));
    y += 20;

    // Table rows
    (lines as any[]).forEach((l, i) => {
      const rowH = 18;
      doc.rect(40, y, W, rowH).fill(i % 2 === 0 ? light : "white");
      doc.fillColor(dark).fontSize(8).font("Helvetica");
      doc.text(String(i + 1), cols[0], y + 4, { width: 45, align: "center" });
      doc.text(safe(l.product_name).slice(0, 30), cols[1], y + 4, { width: 160 });
      doc.text(safe(l.description).slice(0, 30), cols[2], y + 4, { width: 55 });
      doc.text(fmtN(Number(l.quantity) || 0), cols[3], y + 4, { width: 60 });
      doc.text(fmtC(Number(l.unit_price) || 0), cols[4], y + 4, { width: 55 });
      doc.text(`${Number(l.discount_percent) || 0}%`, cols[5], y + 4, { width: 50 });
      doc.text(fmtC(Number(l.line_total) || 0), cols[6], y + 4, { width: 60 });
      y += rowH;
    });

    y += 10;
    doc.moveTo(40, y).lineTo(555, y).strokeColor("#e5e7eb").lineWidth(1).stroke();
    y += 10;

    // Totals
    const totals = [
      ["Subtotal / Lifney Maam:", fmtC(subtotal)],
      ["VAT 17% / Maam:", fmtC(vat)],
      ["TOTAL / Sach HaKol:", fmtC(total)],
    ];
    totals.forEach(([label, val], i) => {
      const isFinal = i === totals.length - 1;
      if (isFinal) {
        doc.rect(350, y - 2, 205, 20).fill(blue);
        doc.fillColor("white").font("Helvetica-Bold").fontSize(11);
      } else {
        doc.fillColor(gray).font("Helvetica").fontSize(9);
      }
      doc.text(label, 355, y + (isFinal ? 3 : 1), { width: 105 });
      doc.text(val, 460, y + (isFinal ? 3 : 1), { width: 90, align: "right" });
      y += 22;
    });

    y += 10;
    if (quote.notes) {
      doc.fillColor(dark).font("Helvetica-Bold").fontSize(9).text("Notes / He'arot:", 40, y);
      doc.fillColor(gray).font("Helvetica").fontSize(8).text(safe(quote.notes), 40, y + 12, { width: W });
      y += 30 + Math.ceil(safe(quote.notes).length / 80) * 10;
    }

    y += 5;
    doc.fillColor(gray).font("Helvetica").fontSize(8);
    doc.text("1. This quote is valid until the date specified above.", 40, y);
    doc.text("2. Prices include VAT as stated.", 40, y + 12);
    doc.text("3. Payment terms: Net 30 days.", 40, y + 24);

    // Footer
    const footerY = 770;
    doc.moveTo(40, footerY).lineTo(555, footerY).strokeColor("#e5e7eb").lineWidth(1).stroke();
    doc.fillColor(gray).fontSize(7).text(`Quote ${safe(quote.quote_number)} | Generated ${new Date().toLocaleDateString("he-IL")} | ERP System`, 40, footerY + 5, { width: W, align: "center" });

    doc.end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== CREDIT CHECK ========================
router.post("/quote-builder/credit-check", async (req: Request, res: Response) => {
  try {
    const { customerId, orderAmount } = req.body;
    const amount = Number(orderAmount) || 0;

    const customerRows = await q(sql`SELECT credit_limit, name FROM sales_customers WHERE id=${Number(customerId)}`);
    if (!customerRows[0]) {
      res.json({ approved: true, reason: "לקוח לא נמצא — אין מגבלת אשראי" });
      return;
    }

    const customer = customerRows[0] as any;
    const creditLimit = Number(customer.credit_limit) || 0;

    if (creditLimit === 0) {
      res.json({ approved: true, creditLimit: 0, orderAmount: amount, reason: "אין מגבלת אשראי ללקוח" });
      return;
    }

    const openOrdersRows = await q(sql`
      SELECT COALESCE(SUM(total), 0) as open_total
      FROM sales_orders
      WHERE customer_id = ${Number(customerId)}
      AND status NOT IN ('delivered', 'cancelled')
      AND payment_status = 'unpaid'
    `);

    const openTotal = Number((openOrdersRows[0] as any)?.open_total) || 0;
    const available = creditLimit - openTotal;
    const approved = (openTotal + amount) <= creditLimit;

    res.json({
      approved,
      creditLimit,
      openTotal,
      available,
      orderAmount: amount,
      customerName: customer.name,
      reason: approved
        ? `אשראי זמין: ${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(available)}`
        : `חריגת אשראי: ₪${new Intl.NumberFormat("he-IL").format(openTotal + amount - creditLimit)} מעל המגבלה`
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== INVENTORY RESERVATION ========================
router.post("/quote-builder/reserve-inventory", async (req: Request, res: Response) => {
  try {
    const { orderId, lines } = req.body;
    const reservations: any[] = [];
    const warnings: string[] = [];

    for (const line of (lines || []) as any[]) {
      const qty = Number(line.quantity) || 0;
      if (!line.productName || qty <= 0) continue;

      const invRows = await q(sql`
        SELECT id, name, current_stock
        FROM raw_materials
        WHERE name ILIKE ${line.productName}
        AND status IN ('פעיל', 'active')
        LIMIT 1
      `);

      if (!invRows[0]) {
        warnings.push(`${line.productName}: לא נמצא במלאי`);
        continue;
      }

      const inv = invRows[0] as any;
      const available = Number(inv.current_stock) || 0;

      if (available < qty) {
        warnings.push(`${line.productName}: מלאי לא מספיק (${available} זמין, ${qty} נדרש)`);
        continue;
      }

      await db.execute(sql`
        INSERT INTO inventory_reservations (order_id, product_name, quantity_reserved, status)
        VALUES (${Number(orderId)}, ${line.productName}, ${qty}, 'reserved')
      `);

      await db.execute(sql`
        UPDATE raw_materials SET current_stock = GREATEST(0, CAST(current_stock AS numeric) - ${qty})::text
        WHERE id = ${inv.id}
      `);

      reservations.push({ productName: line.productName, quantity: qty, status: "reserved" });
    }

    res.json({ success: true, reservations, warnings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/quote-builder/reservations/:orderId", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM inventory_reservations WHERE order_id=${Number(req.params.orderId)} ORDER BY id DESC`);
  res.json(rows);
});

// ======================== CUSTOMER-SPECIFIC PRICES ========================
router.get("/quote-builder/customer-prices", async (req: Request, res: Response) => {
  const { customerId } = req.query;
  if (customerId) {
    const rows = await q(sql`SELECT * FROM customer_specific_prices WHERE customer_id=${Number(customerId)} ORDER BY updated_at DESC`);
    res.json(rows);
  } else {
    const rows = await q(sql`SELECT * FROM customer_specific_prices ORDER BY updated_at DESC`);
    res.json(rows);
  }
});

router.post("/quote-builder/customer-prices", async (req: Request, res: Response) => {
  try {
    const { customerId, customerName, productName, productCode, price, currency, validFrom, validUntil, notes } = req.body;
    // Auto-resolve customerId from customer name if not provided
    let resolvedCustomerId = customerId ? Number(customerId) : null;
    let resolvedCustomerName = customerName || null;
    if (!resolvedCustomerId && resolvedCustomerName) {
      const custRows = await q(sql`SELECT id, name FROM sales_customers WHERE name ILIKE ${resolvedCustomerName} LIMIT 1`);
      if (custRows[0]) {
        resolvedCustomerId = Number(custRows[0].id);
        resolvedCustomerName = String(custRows[0].name);
      }
    }
    await db.execute(sql`
      INSERT INTO customer_specific_prices (customer_id, customer_name, product_name, product_code, price, currency, valid_from, valid_until, notes)
      VALUES (${resolvedCustomerId}, ${resolvedCustomerName}, ${productName}, ${productCode || null}, ${Number(price)}, ${currency || 'ILS'}, ${validFrom || null}, ${validUntil || null}, ${notes || null})
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/quote-builder/customer-prices/:id", async (req: Request, res: Response) => {
  try {
    const { productName, productCode, price, currency, validFrom, validUntil, notes } = req.body;
    await db.execute(sql`
      UPDATE customer_specific_prices SET product_name=${productName}, product_code=${productCode || null}, price=${Number(price)}, currency=${currency || 'ILS'}, valid_from=${validFrom || null}, valid_until=${validUntil || null}, notes=${notes || null}, updated_at=NOW()
      WHERE id=${Number(req.params.id)}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/quote-builder/customer-prices/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM customer_specific_prices WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== VOLUME DISCOUNT TIERS ========================
router.get("/quote-builder/volume-tiers", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM volume_discount_tiers ORDER BY product_name, min_quantity`);
  res.json(rows);
});

router.post("/quote-builder/volume-tiers", async (req: Request, res: Response) => {
  try {
    const { priceListId, productName, productCode, minQuantity, maxQuantity, discountPercent, fixedPrice, currency, notes } = req.body;
    await db.execute(sql`
      INSERT INTO volume_discount_tiers (price_list_id, product_name, product_code, min_quantity, max_quantity, discount_percent, fixed_price, currency, notes)
      VALUES (${priceListId ? Number(priceListId) : null}, ${productName || null}, ${productCode || null}, ${Number(minQuantity)}, ${maxQuantity ? Number(maxQuantity) : null}, ${Number(discountPercent) || 0}, ${fixedPrice ? Number(fixedPrice) : null}, ${currency || 'ILS'}, ${notes || null})
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/quote-builder/volume-tiers/:id", async (req: Request, res: Response) => {
  try {
    const { productName, productCode, minQuantity, maxQuantity, discountPercent, fixedPrice, notes } = req.body;
    await db.execute(sql`
      UPDATE volume_discount_tiers SET product_name=${productName || null}, product_code=${productCode || null}, min_quantity=${Number(minQuantity)}, max_quantity=${maxQuantity ? Number(maxQuantity) : null}, discount_percent=${Number(discountPercent) || 0}, fixed_price=${fixedPrice ? Number(fixedPrice) : null}, notes=${notes || null}, updated_at=NOW()
      WHERE id=${Number(req.params.id)}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/quote-builder/volume-tiers/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM volume_discount_tiers WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== PROMOTIONAL PRICING ========================
router.get("/quote-builder/promotions", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM promotional_pricing ORDER BY valid_from DESC`);
  res.json(rows);
});

router.post("/quote-builder/promotions", async (req: Request, res: Response) => {
  try {
    const { name, productName, productCode, customerCategory, discountPercent, fixedPrice, currency, validFrom, validUntil, priority, notes } = req.body;
    await db.execute(sql`
      INSERT INTO promotional_pricing (name, product_name, product_code, customer_category, discount_percent, fixed_price, currency, valid_from, valid_until, priority, notes)
      VALUES (${name}, ${productName || null}, ${productCode || null}, ${customerCategory || null}, ${Number(discountPercent) || 0}, ${fixedPrice ? Number(fixedPrice) : null}, ${currency || 'ILS'}, ${validFrom}, ${validUntil}, ${Number(priority) || 0}, ${notes || null})
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/quote-builder/promotions/:id", async (req: Request, res: Response) => {
  try {
    const { name, productName, discountPercent, fixedPrice, validFrom, validUntil, isActive, priority, notes } = req.body;
    await db.execute(sql`
      UPDATE promotional_pricing SET name=${name}, product_name=${productName || null}, discount_percent=${Number(discountPercent) || 0}, fixed_price=${fixedPrice ? Number(fixedPrice) : null}, valid_from=${validFrom}, valid_until=${validUntil}, is_active=${isActive !== false}, priority=${Number(priority) || 0}, notes=${notes || null}, updated_at=NOW()
      WHERE id=${Number(req.params.id)}
    `);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/quote-builder/promotions/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM promotional_pricing WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
