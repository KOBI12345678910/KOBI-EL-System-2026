/**
 * @openapi
 * /api/contracts:
 *   get:
 *     summary: רשימת חוזים — Contract list
 *     description: מחזיר רשימת חוזים עם אפשרות סינון לפי סטטוס וחיפוש טקסט. ניהול חוזים לספקים ולקוחות.
 *     tags: [Contracts & Procurement]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, active, expired, terminated] }
 *         description: סינון לפי סטטוס
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: חיפוש טקסט חופשי
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: רשימת חוזים
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contracts: { type: array }
 *                 total: { type: integer }
 *       401: { description: לא מחובר }
 *   post:
 *     summary: יצירת חוזה חדש — Create contract
 *     description: יוצר חוזה חדש עם ספק או לקוח. כולל מספר חוזה, כותרת, סוג, וסטטוס.
 *     tags: [Contracts & Procurement]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contractNumber, title, contractType, vendor]
 *             properties:
 *               contractNumber: { type: string, description: מספר חוזה }
 *               title: { type: string, description: כותרת }
 *               contractType: { type: string, enum: [vendor, customer, employment, service] }
 *               vendor: { type: string, description: שם ספק/לקוח }
 *               amount: { type: number, description: סכום (ש"ח) }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *     responses:
 *       200:
 *         description: חוזה נוצר בהצלחה
 *       400:
 *         description: שגיאת אימות
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq, desc, and, or, gte, lte, ilike } from "drizzle-orm";
import { sql } from "drizzle-orm";
import path from "path";
import fs from "fs";
import multer from "multer";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "contracts");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const logger = console;

router.post("/contracts", async (req: Request, res: Response) => {
  try {
    const { contractNumber, title, contractType, status, vendor, amount, startDate, endDate } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO contracts (contract_number, title, contract_type, status, vendor, amount, start_date, end_date, created_by, updated_by)
        VALUES (${contractNumber}, ${title}, ${contractType}, ${status || 'draft'}, ${vendor}, ${amount}, ${startDate}, ${endDate}, ${req.user?.email || 'system'}, ${req.user?.email || 'system'})
        RETURNING id, contract_number, title, status`
    );
    
    res.json({ success: true, contract: result.rows[0] });
  } catch (error: any) {
    logger.error("[Contracts] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contracts", async (req: Request, res: Response) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    let query = "SELECT * FROM contracts WHERE 1=1";
    const params: any[] = [];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (search) {
      query += ` AND (contract_number ILIKE $${params.length + 1} OR title ILIKE $${params.length + 1} OR vendor ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit);
    params.push(offset);
    
    const result = await db.execute(sql.raw(query, params));
    res.json({ contracts: result.rows, total: result.rows.length });
  } catch (error: any) {
    logger.error("[Contracts] List failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.execute(
      sql`SELECT * FROM contracts WHERE id = ${parseInt(id)}`
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contract not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    logger.error("[Contracts] Get failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.put("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, vendor, amount, status, startDate, endDate, renewalDate, autoRenewal } = req.body;
    
    const result = await db.execute(
      sql`UPDATE contracts SET 
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        vendor = COALESCE(${vendor}, vendor),
        amount = COALESCE(${amount}, amount),
        status = COALESCE(${status}, status),
        start_date = COALESCE(${startDate}, start_date),
        end_date = COALESCE(${endDate}, end_date),
        renewal_date = COALESCE(${renewalDate}, renewal_date),
        auto_renewal = COALESCE(${autoRenewal}, auto_renewal),
        updated_by = ${req.user?.email || 'system'},
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING id, contract_number, title, status`
    );
    
    res.json({ success: true, contract: result.rows[0] });
  } catch (error: any) {
    logger.error("[Contracts] Update failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contracts/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newStatus, reason } = req.body;
    
    const contract = await db.execute(sql`SELECT status FROM contracts WHERE id = ${parseInt(id)}`);
    if (contract.rows.length === 0) {
      return res.status(404).json({ error: "Contract not found" });
    }
    
    const currentStatus = contract.rows[0].status;
    
    await db.execute(
      sql`UPDATE contracts SET status = ${newStatus}, updated_by = ${req.user?.email || 'system'}, updated_at = NOW() WHERE id = ${parseInt(id)}`
    );
    
    await db.execute(
      sql`INSERT INTO contract_status_history (contract_id, from_status, to_status, reason, changed_by) 
        VALUES (${parseInt(id)}, ${currentStatus}, ${newStatus}, ${reason}, ${req.user?.email || 'system'})`
    );
    
    res.json({ success: true, message: `Contract status changed to ${newStatus}` });
  } catch (error: any) {
    logger.error("[Contracts] Status update failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contracts/:id/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const filePath = `/uploads/contracts/${req.file.filename}`;
    const attachmentData = { name: req.file.originalname, path: filePath, uploadedAt: new Date() };
    
    await db.execute(
      sql`UPDATE contracts SET attachments = jsonb_append(COALESCE(attachments, '[]'::jsonb), ${JSON.stringify([attachmentData])}) WHERE id = ${parseInt(id)}`
    );
    
    res.json({ success: true, attachment: attachmentData });
  } catch (error: any) {
    logger.error("[Contracts] Upload failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contracts/:id/approvers", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.execute(
      sql`SELECT * FROM contract_approvers WHERE contract_id = ${parseInt(id)} ORDER BY sequence_number ASC`
    );
    
    res.json({ approvers: result.rows });
  } catch (error: any) {
    logger.error("[Contracts] Get approvers failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contracts/:id/approvers", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvers } = req.body;
    
    for (const approver of approvers) {
      await db.execute(
        sql`INSERT INTO contract_approvers (contract_id, approver_name, approver_email, approver_role, sequence_number)
          VALUES (${parseInt(id)}, ${approver.name}, ${approver.email}, ${approver.role}, ${approver.sequence})`
      );
    }
    
    res.json({ success: true, message: "Approvers added" });
  } catch (error: any) {
    logger.error("[Contracts] Add approvers failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contracts/:contractId/approvers/:approverId/approve", async (req: Request, res: Response) => {
  try {
    const { contractId, approverId } = req.params;
    const { comments } = req.body;
    
    await db.execute(
      sql`UPDATE contract_approvers SET status = 'approved', comments = ${comments}, approved_at = NOW() WHERE id = ${parseInt(approverId)} AND contract_id = ${parseInt(contractId)}`
    );
    
    res.json({ success: true, message: "Contract approved" });
  } catch (error: any) {
    logger.error("[Contracts] Approve failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contracts/:contractId/approvers/:approverId/reject", async (req: Request, res: Response) => {
  try {
    const { contractId, approverId } = req.params;
    const { comments } = req.body;
    
    await db.execute(
      sql`UPDATE contract_approvers SET status = 'rejected', comments = ${comments}, approved_at = NOW() WHERE id = ${parseInt(approverId)} AND contract_id = ${parseInt(contractId)}`
    );
    
    res.json({ success: true, message: "Contract rejected" });
  } catch (error: any) {
    logger.error("[Contracts] Reject failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contracts/:id/renewal-alerts", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.execute(
      sql`SELECT * FROM contract_renewal_alerts WHERE contract_id = ${parseInt(id)} ORDER BY alert_date DESC`
    );
    
    res.json({ alerts: result.rows });
  } catch (error: any) {
    logger.error("[Contracts] Get alerts failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/contracts/renewal-alerts/check", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const result = await db.execute(
      sql`SELECT id, contract_number, title, renewal_date FROM contracts 
        WHERE renewal_date IS NOT NULL 
        AND renewal_date >= ${today.toISOString().split('T')[0]} 
        AND renewal_date <= ${thirtyDaysFromNow.toISOString().split('T')[0]}
        AND status != 'expired'`
    );
    
    const alerts = result.rows.map((contract: any) => ({
      ...contract,
      daysUntilRenewal: Math.ceil((new Date(contract.renewal_date).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)),
    }));
    
    res.json({ upcomingRenewals: alerts, count: alerts.length });
  } catch (error: any) {
    logger.error("[Contracts] Check renewals failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/contracts/stats/dashboard", async (req: Request, res: Response) => {
  try {
    const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM contracts`);
    const draftResult = await db.execute(sql`SELECT COUNT(*) as count FROM contracts WHERE status = 'draft'`);
    const reviewResult = await db.execute(sql`SELECT COUNT(*) as count FROM contracts WHERE status = 'review'`);
    const signedResult = await db.execute(sql`SELECT COUNT(*) as count FROM contracts WHERE status = 'signed'`);
    const expiredResult = await db.execute(sql`SELECT COUNT(*) as count FROM contracts WHERE status = 'expired'`);
    const totalValueResult = await db.execute(sql`SELECT SUM(amount) as total FROM contracts WHERE status = 'signed'`);
    
    res.json({
      total: totalResult.rows[0]?.count || 0,
      draft: draftResult.rows[0]?.count || 0,
      review: reviewResult.rows[0]?.count || 0,
      signed: signedResult.rows[0]?.count || 0,
      expired: expiredResult.rows[0]?.count || 0,
      totalContractValue: totalValueResult.rows[0]?.total || 0,
    });
  } catch (error: any) {
    logger.error("[Contracts] Stats failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
