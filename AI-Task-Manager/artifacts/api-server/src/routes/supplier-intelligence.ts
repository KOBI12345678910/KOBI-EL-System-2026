import { Router, Request, Response, NextFunction } from "express";
import { pool, db } from "@workspace/db";
import {
  suppliersTable,
  purchaseOrdersTable,
  supplierDocumentsTable,
} from "@workspace/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { validateExternalSession } from "../lib/external-auth";
import { ensureObjectAclForOwner } from "./storage";

const router = Router();

interface InternalAuthRequest extends Request {
  internalUser?: { id: number; username: string; isSuperAdmin: boolean };
}

interface ExternalSupplierRequest extends Request {
  supplierId?: number;
  portalUserId?: string;
}

async function requireInternalUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  const result = await validateSession(token);
  if (result.error || !result.user) {
    res.status(401).json({ error: "הסשן פג תוקף" });
    return;
  }
  (req as InternalAuthRequest).internalUser = result.user as { id: number; username: string; isSuperAdmin: boolean };
  next();
}

async function requireSupplierPortalUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  const result = await validateExternalSession(token);
  if (result.error || !result.user) {
    res.status(401).json({ error: "סשן לא תקין" });
    return;
  }
  const user = result.user as { id?: number; userType: string; linkedEntityId: number | null };
  if (user.userType !== "supplier") {
    res.status(403).json({ error: "גישה מותרת לספקים בלבד" });
    return;
  }
  if (!user.linkedEntityId) {
    res.status(400).json({ error: "לא משויך לספק" });
    return;
  }
  (req as ExternalSupplierRequest).supplierId = user.linkedEntityId;
  (req as ExternalSupplierRequest).portalUserId = String(user.id || "");
  next();
}

const STORAGE_OBJECTS_PREFIX = "/api/storage/objects/";

async function verifyStorageFileOwnership(fileUrl: string | null | undefined, portalUserId: string): Promise<boolean> {
  if (!fileUrl?.trim()) return true;

  const normalizedUrl = fileUrl.trim();

  if (!normalizedUrl.startsWith(STORAGE_OBJECTS_PREFIX)) {
    console.warn(`[supplier-intelligence] Rejected non-storage fileUrl: ${normalizedUrl.slice(0, 100)}`);
    return false;
  }

  const wildcardPath = normalizedUrl.slice(STORAGE_OBJECTS_PREFIX.length);
  if (!wildcardPath || wildcardPath.includes("..")) {
    console.warn(`[supplier-intelligence] Rejected malformed storage path: ${wildcardPath.slice(0, 100)}`);
    return false;
  }

  const objectPath = `/objects/${wildcardPath}`;

  const isOwner = await ensureObjectAclForOwner(objectPath, portalUserId);
  if (!isOwner) {
    console.warn(`[supplier-intelligence] Ownership check failed for object ${objectPath}, userId ${portalUserId}`);
  }
  return isOwner;
}

async function safeQuery(q: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const result = await pool.query(q, params);
  return (result.rows || []) as Record<string, unknown>[];
}

interface SupplierKPIs {
  onTimeDeliveryPct: number;
  qualityRejectPct: number;
  priceCompetitivenessScore: number;
  responsivenessScore: number;
  overallScore: number;
}

async function computeSupplierKPIs(supplierId: number): Promise<SupplierKPIs> {
  const totalOrdersRows = await safeQuery(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE
         WHEN expected_delivery IS NOT NULL
          AND received_date IS NOT NULL
          AND received_date::date <= expected_delivery::date THEN 1
         ELSE 0
       END) AS on_time
     FROM purchase_orders
     WHERE supplier_id = $1
       AND status NOT IN ('draft','ביטול','cancelled','טיוטה')`,
    [supplierId]
  );

  const orderTotal = Number(totalOrdersRows[0]?.total ?? 0);
  const orderOnTime = Number(totalOrdersRows[0]?.on_time ?? 0);
  const onTimeDeliveryPct =
    orderTotal > 0 ? Math.round((orderOnTime / orderTotal) * 100) : 75;

  const rejectRows = await safeQuery(
    `SELECT
       COALESCE(SUM(CASE
         WHEN gri.notes ILIKE '%דחוי%'
           OR gri.notes ILIKE '%rejected%'
           OR gri.notes ILIKE '%פסול%' THEN 1
         ELSE 0
       END), 0) AS rejected,
       COUNT(*) AS total
     FROM goods_receipt_items gri
     JOIN goods_receipts gr ON gr.id = gri.receipt_id
     WHERE gr.supplier_id = $1`,
    [supplierId]
  );
  const totalItems = Number(rejectRows[0]?.total ?? 0);
  const rejectedItems = Number(rejectRows[0]?.rejected ?? 0);
  const qualityRejectPct =
    totalItems > 0 ? Math.round((rejectedItems / totalItems) * 100) : 5;

  const priceRows = await safeQuery(
    `SELECT
       AVG(sph.price::numeric) AS avg_price,
       (SELECT AVG(price::numeric)
        FROM supplier_price_history
        WHERE material_id IN (
          SELECT DISTINCT material_id FROM supplier_price_history WHERE supplier_id = $1
        )
       ) AS market_avg
     FROM supplier_price_history sph
     WHERE sph.supplier_id = $1`,
    [supplierId]
  );
  const avgPrice = Number(priceRows[0]?.avg_price ?? 0);
  const marketAvg = Number(priceRows[0]?.market_avg ?? 0);
  let priceCompetitivenessScore = 75;
  if (avgPrice > 0 && marketAvg > 0) {
    const ratio = avgPrice / marketAvg;
    priceCompetitivenessScore = Math.max(0, Math.min(100, Math.round(100 - (ratio - 1) * 100)));
  }

  const ackRows = await safeQuery(
    `SELECT
       COUNT(*) AS total_po,
       AVG(
         EXTRACT(EPOCH FROM (
           COALESCE(approved_at, updated_at) - created_at
         )) / 86400.0
       ) AS avg_days_to_ack
     FROM purchase_orders
     WHERE supplier_id = $1
       AND status NOT IN ('draft','טיוטה','cancelled','ביטול')
       AND created_at >= NOW() - INTERVAL '12 months'`,
    [supplierId]
  );
  const avgDaysToAck = Number(ackRows[0]?.avg_days_to_ack ?? 0);
  let responsivenessScore: number;
  if (Number(ackRows[0]?.total_po ?? 0) === 0) {
    responsivenessScore = 70;
  } else if (avgDaysToAck <= 1) {
    responsivenessScore = 100;
  } else if (avgDaysToAck <= 2) {
    responsivenessScore = 85;
  } else if (avgDaysToAck <= 5) {
    responsivenessScore = 70;
  } else if (avgDaysToAck <= 10) {
    responsivenessScore = 50;
  } else {
    responsivenessScore = Math.max(10, Math.round(100 - avgDaysToAck * 5));
  }

  const overallScore = Math.round(
    onTimeDeliveryPct * 0.35 +
    (100 - qualityRejectPct) * 0.3 +
    priceCompetitivenessScore * 0.2 +
    responsivenessScore * 0.15
  );

  return {
    onTimeDeliveryPct,
    qualityRejectPct,
    priceCompetitivenessScore,
    responsivenessScore,
    overallScore,
  };
}

router.get(
  "/supplier-performance-scores",
  requireInternalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const suppliers = await db
        .select({
          id: suppliersTable.id,
          supplierName: suppliersTable.supplierName,
          supplierNumber: suppliersTable.supplierNumber,
          category: suppliersTable.category,
          status: suppliersTable.status,
          country: suppliersTable.country,
          city: suppliersTable.city,
          onTimeDeliveryPct: suppliersTable.onTimeDeliveryPct,
          qualityRating: suppliersTable.qualityRating,
          deliveryRating: suppliersTable.deliveryRating,
          priceRating: suppliersTable.priceRating,
          rating: suppliersTable.rating,
        })
        .from(suppliersTable)
        .where(sql`${suppliersTable.status} != 'inactive'`)
        .limit(200);

      const scores = await Promise.all(
        suppliers.map(async (s) => {
          const kpis = await computeSupplierKPIs(s.id);
          const scoreStatus =
            kpis.overallScore >= 80
              ? "מצוין"
              : kpis.overallScore >= 65
              ? "טוב"
              : kpis.overallScore >= 50
              ? "בינוני"
              : "חלש";
          return { ...s, ...kpis, scoreStatus, computedAt: new Date().toISOString() };
        })
      );

      res.json(scores);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.get(
  "/supplier-performance-scores/:id",
  requireInternalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = parseInt(req.params.id, 10);
      const [supplier] = await db
        .select()
        .from(suppliersTable)
        .where(eq(suppliersTable.id, supplierId));
      if (!supplier) {
        res.status(404).json({ message: "ספק לא נמצא" });
        return;
      }

      const kpis = await computeSupplierKPIs(supplierId);

      const history = await safeQuery(
        `SELECT quality_rating, availability_rating, price_rating, service_rating,
                reliability_rating, delay_percentage, evaluation_date
         FROM supplier_performance
         WHERE supplier_id = $1
         ORDER BY evaluation_date DESC
         LIMIT 12`,
        [supplierId]
      );

      const evalHistory = await safeQuery(
        `SELECT overall_score, delivery_score, quality_score, pricing_score,
                service_score, evaluation_date, recommendation
         FROM supplier_evaluations
         WHERE supplier_id = $1
         ORDER BY evaluation_date DESC
         LIMIT 12`,
        [supplierId]
      );

      res.json({ supplier, kpis, performanceHistory: history, evaluationHistory: evalHistory });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.post(
  "/supplier-performance-scores/:id/recalculate",
  requireInternalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const supplierId = parseInt(req.params.id, 10);
      const kpis = await computeSupplierKPIs(supplierId);

      await db
        .update(suppliersTable)
        .set({
          onTimeDeliveryPct: String(kpis.onTimeDeliveryPct),
          qualityRating: String(Math.min(5, kpis.overallScore / 20).toFixed(2)),
          deliveryRating: String(Math.min(5, kpis.onTimeDeliveryPct / 20).toFixed(2)),
          priceRating: String(Math.min(5, kpis.priceCompetitivenessScore / 20).toFixed(2)),
          rating: Math.round(kpis.overallScore / 20),
          updatedAt: new Date(),
        })
        .where(eq(suppliersTable.id, supplierId));

      res.json({ success: true, kpis });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.get(
  "/supplier-risk-monitoring",
  requireInternalUser,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const suppliers = await db
        .select({
          id: suppliersTable.id,
          supplierName: suppliersTable.supplierName,
          supplierNumber: suppliersTable.supplierNumber,
          category: suppliersTable.category,
          status: suppliersTable.status,
          country: suppliersTable.country,
          city: suppliersTable.city,
          rating: suppliersTable.rating,
          blacklisted: suppliersTable.blacklisted,
          blacklistReason: suppliersTable.blacklistReason,
          supplierTier: suppliersTable.supplierTier,
          annualSpend: suppliersTable.annualSpend,
        })
        .from(suppliersTable)
        .where(sql`${suppliersTable.status} = 'active'`);

      const singleSourceSuppliers = await safeQuery(
        `SELECT DISTINCT supplier_id
         FROM supplier_price_history
         WHERE material_id IN (
           SELECT material_id
           FROM supplier_price_history
           GROUP BY material_id
           HAVING COUNT(DISTINCT supplier_id) = 1
         )`
      );
      const singleSourceIds = new Set(singleSourceSuppliers.map((r) => r.supplier_id));

      const singleSourceMaterialCount = await safeQuery(
        `SELECT COUNT(*) AS cnt
         FROM (
           SELECT material_id FROM supplier_price_history
           GROUP BY material_id HAVING COUNT(DISTINCT supplier_id) = 1
         ) sub`
      );
      const totalSingleSource = Number(singleSourceMaterialCount[0]?.cnt ?? 0);

      const countryGroups: Record<string, number> = {};
      for (const s of suppliers) {
        const c = s.country || "לא ידוע";
        countryGroups[c] = (countryGroups[c] || 0) + 1;
      }
      const totalSuppliers = suppliers.length;
      const highConcThreshold = Math.max(3, Math.ceil(totalSuppliers * 0.5));
      const highConcentrationCountries = Object.entries(countryGroups)
        .filter(([, count]) => count >= highConcThreshold)
        .map(([country, count]) => ({ country, count }));

      const poSpendBySupplier = await safeQuery(
        `SELECT supplier_id, SUM(total_amount::numeric) AS total_spend, COUNT(*) AS order_count
         FROM purchase_orders
         WHERE created_at >= NOW() - INTERVAL '12 months'
           AND status NOT IN ('cancelled','ביטול','draft','טיוטה')
         GROUP BY supplier_id`
      );
      const totalSpend = poSpendBySupplier.reduce(
        (s, r) => s + Number(r.total_spend ?? 0),
        0
      );

      const contractAlerts = await safeQuery(
        `SELECT c.id, c.contract_number, c.title, c.supplier_id, c.end_date, c.status,
                EXTRACT(DAY FROM (c.end_date::date - CURRENT_DATE))::int AS days_until_expiry
         FROM supplier_contracts c
         WHERE c.end_date IS NOT NULL
           AND c.end_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
           AND c.status NOT IN ('בוטל','הסתיים')
         ORDER BY c.end_date ASC`
      );

      const paymentBehavior = await safeQuery(
        `SELECT
           ap.supplier_id,
           COUNT(*) AS total_invoices,
           SUM(CASE WHEN ap.status = 'overdue' OR (ap.due_date < CURRENT_DATE AND ap.status != 'paid') THEN 1 ELSE 0 END) AS overdue_count,
           AVG(CASE WHEN ap.status = 'paid' AND ap.paid_date IS NOT NULL AND ap.due_date IS NOT NULL
                    THEN EXTRACT(DAY FROM (ap.paid_date::date - ap.due_date::date)) ELSE 0 END) AS avg_days_late,
           SUM(ap.balance_due::numeric) AS total_outstanding
         FROM accounts_payable ap
         WHERE ap.supplier_id IS NOT NULL
           AND ap.created_at >= NOW() - INTERVAL '12 months'
         GROUP BY ap.supplier_id`
      );
      const paymentMap = new Map(paymentBehavior.map((r) => [r.supplier_id as number, r]));

      const riskScores = suppliers.map((s) => {
        let riskScore = 0;
        const risks: string[] = [];

        if (singleSourceIds.has(s.id)) {
          riskScore += 30;
          risks.push("ספק יחיד לחומרים");
        }

        const spendData = poSpendBySupplier.find((r) => r.supplier_id === s.id);
        if (spendData && totalSpend > 0) {
          const pct = (Number(spendData.total_spend) / totalSpend) * 100;
          if (pct >= 40) {
            riskScore += 25;
            risks.push("תלות תקציבית גבוהה (>40%)");
          } else if (pct >= 30) {
            riskScore += 15;
            risks.push("תלות תקציבית בינונית (>30%)");
          }
        }

        const payment = paymentMap.get(s.id);
        if (payment) {
          const overdueCount = Number(payment.overdue_count ?? 0);
          const totalInvoices = Number(payment.total_invoices ?? 0);
          const avgDaysLate = Number(payment.avg_days_late ?? 0);
          const overdueRate = totalInvoices > 0 ? overdueCount / totalInvoices : 0;
          if (overdueRate >= 0.3 || avgDaysLate > 30) {
            riskScore += 20;
            risks.push("בעיות תשלום חוזרות");
          } else if (overdueRate >= 0.1 || avgDaysLate > 14) {
            riskScore += 10;
            risks.push("עיכובי תשלום");
          }
        }

        if (s.blacklisted) {
          riskScore += 40;
          risks.push("ברשימה שחורה");
        }

        if (!s.rating || Number(s.rating) < 2) {
          riskScore += 15;
          risks.push("דירוג נמוך");
        }

        const country = s.country || "";
        if (country && (countryGroups[country] || 0) >= highConcThreshold) {
          riskScore += 10;
          risks.push(`ריכוז גיאוגרפי (${country})`);
        }

        const riskLevel =
          riskScore >= 60 ? "גבוה" : riskScore >= 30 ? "בינוני" : "נמוך";
        return { ...s, riskScore: Math.min(100, riskScore), riskLevel, risks };
      });

      riskScores.sort((a, b) => b.riskScore - a.riskScore);

      const highDependencySupplierCount = poSpendBySupplier.filter((r) => {
        const pct = totalSpend > 0 ? (Number(r.total_spend) / totalSpend) * 100 : 0;
        return pct >= 30;
      }).length;

      res.json({
        suppliers: riskScores,
        summary: {
          totalSuppliers: suppliers.length,
          highRiskCount: riskScores.filter((s) => s.riskLevel === "גבוה").length,
          mediumRiskCount: riskScores.filter((s) => s.riskLevel === "בינוני").length,
          lowRiskCount: riskScores.filter((s) => s.riskLevel === "נמוך").length,
          singleSourceMaterialCount: totalSingleSource,
          highConcentrationCountries,
          highDependencySupplierCount,
          contractExpiringCount: contractAlerts.length,
        },
        contractAlerts,
        geographicDistribution: Object.entries(countryGroups).map(([country, count]) => ({
          country,
          count,
        })),
      });
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.get(
  "/supplier-contract-alerts",
  requireInternalUser,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const alerts = await safeQuery(
        `SELECT c.id, c.contract_number, c.title, c.supplier_id, c.end_date, c.status,
                c.contract_value, c.currency, s.supplier_name, s.contact_person, s.email,
                EXTRACT(DAY FROM (c.end_date::date - CURRENT_DATE))::int AS days_until_expiry,
                CASE
                  WHEN c.end_date::date < CURRENT_DATE THEN 'פג תוקף'
                  WHEN c.end_date::date <= CURRENT_DATE + INTERVAL '30 days' THEN 'קריטי'
                  WHEN c.end_date::date <= CURRENT_DATE + INTERVAL '60 days' THEN 'אזהרה'
                  ELSE 'שים לב'
                END AS alert_level
         FROM supplier_contracts c
         LEFT JOIN suppliers s ON s.id = c.supplier_id
         WHERE c.end_date IS NOT NULL
           AND c.end_date::date <= CURRENT_DATE + INTERVAL '90 days'
           AND c.status NOT IN ('בוטל','הסתיים')
         ORDER BY c.end_date ASC
         LIMIT 50`
      );
      res.json(alerts);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.get(
  "/portal/supplier/purchase-orders",
  requireSupplierPortalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req as ExternalSupplierRequest;
      if (!supplierId) {
        res.status(400).json({ error: "ספק לא מזוהה" });
        return;
      }
      const orders = await db
        .select()
        .from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.supplierId, supplierId))
        .orderBy(desc(purchaseOrdersTable.createdAt))
        .limit(100);
      res.json(orders);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.post(
  "/portal/supplier/invoices",
  requireSupplierPortalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req as ExternalSupplierRequest;
      if (!supplierId) {
        res.status(400).json({ error: "ספק לא מזוהה" });
        return;
      }

      const { invoiceNumber, amount, currency, dueDate, poId, notes, fileUrl } = req.body as {
        invoiceNumber?: string;
        amount?: string;
        currency?: string;
        dueDate?: string;
        poId?: string;
        notes?: string;
        fileUrl?: string;
      };

      if (!invoiceNumber?.trim() || !amount) {
        res.status(400).json({ error: "מספר חשבונית וסכום הם שדות חובה" });
        return;
      }

      if (fileUrl?.trim()) {
        const { portalUserId } = req as ExternalSupplierRequest;
        const isOwner = await verifyStorageFileOwnership(fileUrl, portalUserId || "");
        if (!isOwner) {
          res.status(403).json({ error: "אין הרשאה להשתמש בקובץ זה" });
          return;
        }
      }

      const poRef = poId ? `הזמנה: ${poId}` : "";
      const noteParts = [`מספר: ${invoiceNumber}`, `סכום: ${amount} ${currency || "ILS"}`];
      if (dueDate) noteParts.push(`פירעון: ${dueDate}`);
      if (poRef) noteParts.push(poRef);
      if (notes?.trim()) noteParts.push(notes.trim());

      const [doc] = await db
        .insert(supplierDocumentsTable)
        .values({
          supplierId,
          documentName: `חשבונית ${invoiceNumber}`,
          documentType: "invoice",
          fileUrl: fileUrl?.trim() || null,
          notes: noteParts.join(" | "),
        })
        .returning();

      await safeQuery(
        `INSERT INTO accounts_payable
           (supplier_id, supplier_name, invoice_number, amount, currency, paid_amount,
            balance_due, due_date, invoice_date, status, description, category)
         SELECT $1, supplier_name, $2, $3::numeric, $4, 0, $3::numeric,
                $5::date, CURRENT_DATE, 'open',
                'חשבונית ' || $2 || ' מספק פורטל', 'ספק-פורטל'
         FROM suppliers WHERE id = $1
         ON CONFLICT DO NOTHING`,
        [
          supplierId,
          invoiceNumber,
          amount,
          currency || "ILS",
          dueDate || null,
        ]
      );

      res.status(201).json(doc);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.post(
  "/portal/supplier/delivery-update",
  requireSupplierPortalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req as ExternalSupplierRequest;
      if (!supplierId) {
        res.status(400).json({ error: "ספק לא מזוהה" });
        return;
      }

      const { poId, newEta, status, trackingNumber, notes } = req.body as {
        poId?: string;
        newEta?: string;
        status?: string;
        trackingNumber?: string;
        notes?: string;
      };

      if (!poId) {
        res.status(400).json({ error: "מזהה הזמנה נדרש" });
        return;
      }

      const ALLOWED_SUPPLIER_DELIVERY_STATUSES = new Set([
        "בהכנה", "נשלח", "בדרך", "בשגר", "עיכוב",
        "in_transit", "shipped", "preparing", "delayed",
      ]);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (newEta) updateData.expectedDelivery = newEta;
      if (trackingNumber?.trim()) updateData.referenceNumber = trackingNumber.trim();
      if (status?.trim()) {
        if (!ALLOWED_SUPPLIER_DELIVERY_STATUSES.has(status.trim())) {
          res.status(400).json({ error: `סטטוס לא חוקי. ערכים מותרים: ${[...ALLOWED_SUPPLIER_DELIVERY_STATUSES].join(", ")}` });
          return;
        }
        updateData.status = status.trim();
      }

      const [updated] = await db
        .update(purchaseOrdersTable)
        .set(updateData)
        .where(
          and(
            eq(purchaseOrdersTable.id, parseInt(poId, 10)),
            eq(purchaseOrdersTable.supplierId, supplierId)
          )
        )
        .returning();

      if (!updated) {
        res.status(404).json({ error: "הזמנה לא נמצאה או אינה שייכת לספק זה" });
        return;
      }

      await safeQuery(
        `INSERT INTO supplier_notes (supplier_id, note_text, note_type, created_at, updated_at)
         VALUES ($1, $2, 'delivery_update', NOW(), NOW())`,
        [
          supplierId,
          `עדכון אספקה להזמנה ${poId}: ETA=${newEta || "-"}, סטטוס=${status || "-"}, מעקב=${trackingNumber || "-"}. ${notes?.trim() || ""}`.trim(),
        ]
      );

      res.json({ success: true, order: updated });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.post(
  "/portal/supplier/certifications",
  requireSupplierPortalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req as ExternalSupplierRequest;
      if (!supplierId) {
        res.status(400).json({ error: "ספק לא מזוהה" });
        return;
      }

      const { certificationName, certificationNumber, expiryDate, issuingBody, fileUrl, notes } =
        req.body as {
          certificationName?: string;
          certificationNumber?: string;
          expiryDate?: string;
          issuingBody?: string;
          fileUrl?: string;
          notes?: string;
        };

      if (!certificationName?.trim()) {
        res.status(400).json({ error: "שם התעודה נדרש" });
        return;
      }

      if (fileUrl?.trim()) {
        const { portalUserId } = req as ExternalSupplierRequest;
        const isOwner = await verifyStorageFileOwnership(fileUrl, portalUserId || "");
        if (!isOwner) {
          res.status(403).json({ error: "אין הרשאה להשתמש בקובץ זה" });
          return;
        }
      }

      const noteParts = [`מספר: ${certificationNumber || "-"}`, `גוף מנפיק: ${issuingBody || "-"}`];
      if (notes?.trim()) noteParts.push(notes.trim());

      const [doc] = await db
        .insert(supplierDocumentsTable)
        .values({
          supplierId,
          documentName: certificationName.trim(),
          documentType: "certificate",
          fileUrl: fileUrl?.trim() || null,
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          notes: noteParts.join(" | "),
        })
        .returning();

      if (expiryDate) {
        await db
          .update(suppliersTable)
          .set({
            insuranceCertificate: certificationName.trim(),
            insuranceExpiry: expiryDate,
            updatedAt: new Date(),
          })
          .where(eq(suppliersTable.id, supplierId));
      }

      res.status(201).json(doc);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.get(
  "/portal/supplier/certifications",
  requireSupplierPortalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req as ExternalSupplierRequest;
      if (!supplierId) {
        res.status(400).json({ error: "ספק לא מזוהה" });
        return;
      }

      const certs = await db
        .select()
        .from(supplierDocumentsTable)
        .where(
          and(
            eq(supplierDocumentsTable.supplierId, supplierId),
            eq(supplierDocumentsTable.documentType, "certificate")
          )
        )
        .orderBy(desc(supplierDocumentsTable.createdAt));

      res.json(certs);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.post(
  "/supplier-performance-scores/event/goods-receipt-complete",
  requireInternalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req.body as { supplierId?: number };
      if (!supplierId) {
        res.status(400).json({ error: "supplierId נדרש" });
        return;
      }
      const kpis = await computeSupplierKPIs(supplierId);
      await db
        .update(suppliersTable)
        .set({
          onTimeDeliveryPct: String(kpis.onTimeDeliveryPct),
          qualityRating: String(Math.min(5, kpis.overallScore / 20).toFixed(2)),
          deliveryRating: String(Math.min(5, kpis.onTimeDeliveryPct / 20).toFixed(2)),
          priceRating: String(Math.min(5, kpis.priceCompetitivenessScore / 20).toFixed(2)),
          rating: Math.round(kpis.overallScore / 20),
          updatedAt: new Date(),
        })
        .where(eq(suppliersTable.id, supplierId));
      res.json({ success: true, kpis, supplierId, triggeredBy: "goods_receipt_complete" });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

router.post(
  "/supplier-performance-scores/event/po-acknowledged",
  requireInternalUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { supplierId } = req.body as { supplierId?: number };
      if (!supplierId) {
        res.status(400).json({ error: "supplierId נדרש" });
        return;
      }
      const kpis = await computeSupplierKPIs(supplierId);
      await db
        .update(suppliersTable)
        .set({
          rating: Math.round(kpis.overallScore / 20),
          updatedAt: new Date(),
        })
        .where(eq(suppliersTable.id, supplierId));
      res.json({ success: true, kpis, supplierId, triggeredBy: "po_acknowledged" });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
);

export async function triggerSupplierKpiRecalculation(supplierId: number): Promise<void> {
  try {
    const kpis = await computeSupplierKPIs(supplierId);
    await db
      .update(suppliersTable)
      .set({
        onTimeDeliveryPct: String(kpis.onTimeDeliveryPct),
        qualityRating: String(Math.min(5, kpis.overallScore / 20).toFixed(2)),
        deliveryRating: String(Math.min(5, kpis.onTimeDeliveryPct / 20).toFixed(2)),
        priceRating: String(Math.min(5, kpis.priceCompetitivenessScore / 20).toFixed(2)),
        rating: Math.round(kpis.overallScore / 20),
        updatedAt: new Date(),
      })
      .where(eq(suppliersTable.id, supplierId));
  } catch (err: unknown) {
    console.error("[supplier-intelligence] KPI recalculate error:", err instanceof Error ? err.message : err);
  }
}

export default router;
