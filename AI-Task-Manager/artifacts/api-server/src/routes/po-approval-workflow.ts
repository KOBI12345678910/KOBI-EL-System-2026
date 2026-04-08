import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { purchaseOrdersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { createNotificationForRole } from "../lib/notification-service";

const router: IRouter = Router();

async function safeExec(query: string): Promise<any[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    console.error(`[po-approval-workflow] query error: ${err.message}`);
    return [];
  }
}

function esc(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}
function escNum(val: number | string | null | undefined): string {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return "0";
  return String(n);
}
function escInt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  const n = Math.floor(Number(val));
  if (isNaN(n)) return "NULL";
  return String(n);
}

async function ensureTables() {
  await safeExec(`CREATE TABLE IF NOT EXISTS po_approval_thresholds (id SERIAL PRIMARY KEY, min_amount NUMERIC(15,2) NOT NULL DEFAULT 0, max_amount NUMERIC(15,2), required_role VARCHAR(200) NOT NULL, approver_level INTEGER NOT NULL DEFAULT 1, label VARCHAR(200), escalation_hours INTEGER DEFAULT 48, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  

  await safeExec(`
    INSERT INTO po_approval_thresholds (min_amount, max_amount, required_role, approver_level, label, escalation_hours)
    SELECT 0, 1000, 'auto', 1, 'אוטומטי (עד ₪1,000)', 0
    WHERE NOT EXISTS (SELECT 1 FROM po_approval_thresholds WHERE min_amount = 0 AND max_amount = 1000)
  `);
  await safeExec(`
    INSERT INTO po_approval_thresholds (min_amount, max_amount, required_role, approver_level, label, escalation_hours)
    SELECT 1000, 10000, 'מנהל רכש', 2, 'מנהל רכש (₪1,000 - ₪10,000)', 48
    WHERE NOT EXISTS (SELECT 1 FROM po_approval_thresholds WHERE min_amount = 1000 AND max_amount = 10000)
  `);
  await safeExec(`
    INSERT INTO po_approval_thresholds (min_amount, max_amount, required_role, approver_level, label, escalation_hours)
    SELECT 10000, 50000, 'מנהל כספים', 3, 'מנהל כספים (₪10,000 - ₪50,000)', 24
    WHERE NOT EXISTS (SELECT 1 FROM po_approval_thresholds WHERE min_amount = 10000 AND max_amount = 50000)
  `);
  await safeExec(`
    INSERT INTO po_approval_thresholds (min_amount, max_amount, required_role, approver_level, label, escalation_hours)
    SELECT 50000, NULL, 'מנהל כספים', 3, 'מנהל כספים (מעל ₪50,000)', 12
    WHERE NOT EXISTS (SELECT 1 FROM po_approval_thresholds WHERE min_amount = 50000 AND max_amount IS NULL AND required_role = 'מנהל כספים')
  `);
  await safeExec(`
    INSERT INTO po_approval_thresholds (min_amount, max_amount, required_role, approver_level, label, escalation_hours)
    SELECT 50000, NULL, 'מנכ"ל', 4, 'מנכ"ל (מעל ₪50,000)', 12
    WHERE NOT EXISTS (SELECT 1 FROM po_approval_thresholds WHERE min_amount = 50000 AND max_amount IS NULL AND required_role = 'מנכ"ל')
  `);

  await safeExec(`CREATE TABLE IF NOT EXISTS po_approval_steps (id SERIAL PRIMARY KEY, po_id INTEGER NOT NULL, step_order INTEGER NOT NULL DEFAULT 1, required_role VARCHAR(200) NOT NULL, approver_level INTEGER NOT NULL DEFAULT 1, status VARCHAR(50) DEFAULT 'waiting', approved_by VARCHAR(255), approved_at TIMESTAMP, rejected_by VARCHAR(255), rejected_at TIMESTAMP, comments TEXT, escalated_at TIMESTAMP, escalation_hours INTEGER DEFAULT 48, notified_at TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
}

ensureTables().catch(console.error);

async function determineApprovalChain(amount: number): Promise<any[]> {
  const matchingThresholds = await safeExec(`
    SELECT * FROM po_approval_thresholds
    WHERE is_active = TRUE
      AND min_amount <= ${escNum(amount)}
      AND (max_amount IS NULL OR ${escNum(amount)} < max_amount)
      AND required_role <> 'auto'
    ORDER BY approver_level ASC
  `);
  return matchingThresholds;
}

async function handleInitiate(req: any, res: any) {
  try {
    const body = z.object({
      poId: z.number().int().positive(),
      amount: z.number().optional(),
    }).parse(req.body);

    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, body.poId));
    if (!po) return res.status(404).json({ message: "הזמנת רכש לא נמצאה" });

    const amount = body.amount ?? parseFloat(po.totalAmount || "0");
    const chain = await determineApprovalChain(amount);

    if (chain.length === 0 || (chain[0]?.required_role === 'auto')) {
      await db.update(purchaseOrdersTable).set({
        status: "מאושר",
        approvedBy: "אוטומטי",
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(purchaseOrdersTable.id, body.poId));
      return res.json({ message: "אושר אוטומטית", autoApproved: true, amount });
    }

    await safeExec(`DELETE FROM po_approval_steps WHERE po_id = ${body.poId}`);

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      await safeExec(`
        INSERT INTO po_approval_steps (po_id, step_order, required_role, approver_level, status, escalation_hours, notified_at)
        VALUES (${body.poId}, ${i + 1}, ${esc(step.required_role)}, ${step.approver_level}, ${i === 0 ? "'ממתין'" : "'ממתין - נעול'"}, ${step.escalation_hours || 48}, ${i === 0 ? "NOW()" : "NULL"})
      `);
    }

    await db.update(purchaseOrdersTable).set({
      status: "ממתין לאישור",
      updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, body.poId));

    if (chain.length > 0) {
      const firstStep = chain[0];
      createNotificationForRole(firstStep.required_role, {
        type: "po_approval_required",
        title: "נדרש אישור הזמנת רכש",
        message: `הזמנת רכש #${body.poId} בסך ${amount.toLocaleString("he-IL")} ₪ ממתינה לאישורך (שלב ${firstStep.approver_level})`,
        priority: "high",
        category: "approval",
        actionUrl: `/procurement/po-approval-workflow`,
        recordId: body.poId,
        dedupeKey: `po_approval_${body.poId}_step_1`,
      }).catch((err: Error) => console.error("[PO Approval] notification error:", err.message));
    }

    res.json({ message: "תהליך אישור הופעל", chain, amount });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

router.post("/po-approval-workflow/initiate", handleInitiate);
router.post("/po-approval-workflow/trigger", handleInitiate);

router.get("/po-approval-workflow/:poId/steps", async (req, res) => {
  try {
    const poId = z.coerce.number().int().positive().parse(req.params.poId);
    const steps = await safeExec(`SELECT * FROM po_approval_steps WHERE po_id = ${poId} ORDER BY step_order`);
    res.json(steps);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/po-approval-workflow/:stepId/approve", async (req, res) => {
  try {
    const stepId = z.coerce.number().int().positive().parse(req.params.stepId);
    const body = z.object({
      comments: z.string().optional(),
    }).parse(req.body);

    const [step] = await safeExec(`SELECT * FROM po_approval_steps WHERE id = ${stepId}`);
    if (!step) return res.status(404).json({ message: "שלב אישור לא נמצא" });

    const approveStatuses = ['ממתין', 'waiting'];
    if (!approveStatuses.includes(step.status)) {
      return res.status(400).json({ message: `לא ניתן לאשר שלב בסטטוס '${step.status}'. ניתן לאשר רק שלבים בסטטוס 'ממתין'` });
    }

    const [activeStep] = await safeExec(`SELECT id FROM po_approval_steps WHERE po_id = ${step.po_id} AND status = 'ממתין' ORDER BY step_order ASC LIMIT 1`);
    if (!activeStep || activeStep.id !== step.id) {
      return res.status(400).json({ message: "ניתן לאשר רק את השלב הפעיל הנוכחי בשרשרת האישור" });
    }

    const requiredRole = step.required_role;
    const userRoles: string[] = (req as any).permissions?.roles || [];
    const isSuperAdmin = (req as any).permissions?.isSuperAdmin || false;
    if (!isSuperAdmin && requiredRole !== 'auto' && !userRoles.includes(requiredRole)) {
      return res.status(403).json({ message: `אין לך הרשאה לאשר שלב זה. נדרשת תפקיד: ${requiredRole}` });
    }

    const principalUserId = (req as any).userId || "";
    const [actorUser] = principalUserId ? await safeExec(`SELECT full_name_he, username FROM users WHERE id = ${escInt(Number(principalUserId))} LIMIT 1`) : [];
    const actorName = actorUser?.full_name_he || actorUser?.username || principalUserId || "מערכת";

    await safeExec(`UPDATE po_approval_steps SET status = 'מאושר', approved_by = ${esc(actorName)}, approved_at = NOW(), comments = ${esc(body.comments)}, updated_at = NOW() WHERE id = ${stepId}`);

    const nextStep = await safeExec(`
      SELECT * FROM po_approval_steps WHERE po_id = ${step.po_id} AND step_order = ${step.step_order + 1}
    `);

    if (nextStep.length > 0) {
      await safeExec(`UPDATE po_approval_steps SET status = 'ממתין', notified_at = NOW(), updated_at = NOW() WHERE id = ${nextStep[0].id}`);
      const ns = nextStep[0];
      createNotificationForRole(ns.required_role, {
        type: "po_approval_required",
        title: "נדרש אישור הזמנת רכש — שלב הבא",
        message: `הזמנת רכש #${step.po_id} עברה לשלב אישור ${ns.approver_level} וממתינה לאישורך`,
        priority: "high",
        category: "approval",
        actionUrl: `/procurement/po-approval-workflow`,
        recordId: step.po_id,
        dedupeKey: `po_approval_${step.po_id}_step_${ns.step_order}`,
      }).catch((err: Error) => console.error("[PO Approval] notification error:", err.message));
    } else {
      const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, step.po_id));
      if (po) {
        await db.update(purchaseOrdersTable).set({
          status: "מאושר",
          approvedBy: actorName,
          approvedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(purchaseOrdersTable.id, step.po_id));
      }
    }

    const updatedSteps = await safeExec(`SELECT * FROM po_approval_steps WHERE po_id = ${step.po_id} ORDER BY step_order`);
    res.json({ message: "אושר בהצלחה", steps: updatedSteps });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/po-approval-workflow/:stepId/reject", async (req, res) => {
  try {
    const stepId = z.coerce.number().int().positive().parse(req.params.stepId);
    const body = z.object({
      comments: z.string().optional(),
    }).parse(req.body);

    const [step] = await safeExec(`SELECT * FROM po_approval_steps WHERE id = ${stepId}`);
    if (!step) return res.status(404).json({ message: "שלב אישור לא נמצא" });

    const activeStatuses = ['ממתין', 'waiting'];
    if (!activeStatuses.includes(step.status)) {
      return res.status(400).json({ message: `לא ניתן לדחות שלב בסטטוס '${step.status}'. ניתן לדחות רק שלבים בסטטוס 'ממתין'` });
    }

    const [activeStep] = await safeExec(`SELECT id FROM po_approval_steps WHERE po_id = ${step.po_id} AND status = 'ממתין' ORDER BY step_order ASC LIMIT 1`);
    if (!activeStep || activeStep.id !== step.id) {
      return res.status(400).json({ message: "ניתן לדחות רק את השלב הפעיל הנוכחי בשרשרת האישור" });
    }

    const requiredRoleR = step.required_role;
    const userRolesR: string[] = (req as any).permissions?.roles || [];
    const isSuperAdminR = (req as any).permissions?.isSuperAdmin || false;
    if (!isSuperAdminR && requiredRoleR !== 'auto' && !userRolesR.includes(requiredRoleR)) {
      return res.status(403).json({ message: `אין לך הרשאה לדחות שלב זה. נדרשת תפקיד: ${requiredRoleR}` });
    }

    const principalUserIdR = (req as any).userId || "";
    const [actorUserR] = principalUserIdR ? await safeExec(`SELECT full_name_he, username FROM users WHERE id = ${escInt(Number(principalUserIdR))} LIMIT 1`) : [];
    const actorNameR = actorUserR?.full_name_he || actorUserR?.username || principalUserIdR || "מערכת";

    await safeExec(`UPDATE po_approval_steps SET status = 'נדחה', rejected_by = ${esc(actorNameR)}, rejected_at = NOW(), comments = ${esc(body.comments)}, updated_at = NOW() WHERE id = ${stepId}`);

    await db.update(purchaseOrdersTable).set({
      status: "בוטל",
      updatedAt: new Date(),
      notes: `נדחה על ידי ${actorNameR}${body.comments ? `: ${body.comments}` : ""}`,
    }).where(eq(purchaseOrdersTable.id, step.po_id));

    res.json({ message: "נדחה" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/po-approval-thresholds", async (_req, res) => {
  try {
    const thresholds = await safeExec(`SELECT * FROM po_approval_thresholds ORDER BY approver_level`);
    res.json(thresholds);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/po-approval-thresholds", async (req, res) => {
  try {
    const body = z.object({
      minAmount: z.number(),
      maxAmount: z.number().optional().nullable(),
      requiredRole: z.string().min(1),
      approverLevel: z.number(),
      label: z.string().optional(),
      escalationHours: z.number().optional(),
    }).parse(req.body);
    const [threshold] = await safeExec(`
      INSERT INTO po_approval_thresholds (min_amount, max_amount, required_role, approver_level, label, escalation_hours)
      VALUES (${escNum(body.minAmount)}, ${body.maxAmount != null ? escNum(body.maxAmount) : "NULL"}, ${esc(body.requiredRole)}, ${body.approverLevel}, ${esc(body.label)}, ${body.escalationHours || 48})
      RETURNING *
    `);
    res.status(201).json(threshold);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/po-approval-thresholds/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      minAmount: z.number().optional(),
      maxAmount: z.number().optional().nullable(),
      requiredRole: z.string().optional(),
      approverLevel: z.number().optional(),
      label: z.string().optional(),
      escalationHours: z.number().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const sets: string[] = ["updated_at = NOW()"];
    if (body.minAmount !== undefined) sets.push(`min_amount = ${escNum(body.minAmount)}`);
    if (body.maxAmount !== undefined) sets.push(`max_amount = ${body.maxAmount != null ? escNum(body.maxAmount) : "NULL"}`);
    if (body.requiredRole !== undefined) sets.push(`required_role = ${esc(body.requiredRole)}`);
    if (body.approverLevel !== undefined) sets.push(`approver_level = ${body.approverLevel}`);
    if (body.label !== undefined) sets.push(`label = ${esc(body.label)}`);
    if (body.escalationHours !== undefined) sets.push(`escalation_hours = ${body.escalationHours}`);
    if (body.isActive !== undefined) sets.push(`is_active = ${body.isActive}`);

    const [threshold] = await safeExec(`UPDATE po_approval_thresholds SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);
    if (!threshold) return res.status(404).json({ message: "Not found" });
    res.json(threshold);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/po-approval-thresholds/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await safeExec(`DELETE FROM po_approval_thresholds WHERE id = ${id}`);
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/po-approval-queue", async (req, res) => {
  try {
    const queue = await safeExec(`
      SELECT
        ps.*,
        po.order_number,
        po.total_amount,
        po.currency,
        po.created_by,
        po.notes,
        po.expected_delivery,
        s.supplier_name
      FROM po_approval_steps ps
      JOIN purchase_orders po ON po.id = ps.po_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE ps.status = 'ממתין'
      ORDER BY ps.created_at ASC
    `);
    res.json(queue);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

async function runEscalationCheck() {
  try {
    const overdueSteps = await safeExec(`
      SELECT ps.*, po.order_number, po.total_amount
      FROM po_approval_steps ps
      JOIN purchase_orders po ON po.id = ps.po_id
      WHERE ps.status = 'ממתין'
        AND ps.escalation_hours > 0
        AND ps.notified_at IS NOT NULL
        AND ps.notified_at + (ps.escalation_hours || ' hours')::interval < NOW()
        AND ps.escalated_at IS NULL
    `);

    for (const step of overdueSteps) {
      await safeExec(`UPDATE po_approval_steps SET escalated_at = NOW(), updated_at = NOW(), status = 'הוסלם' WHERE id = ${step.id}`);

      const [nextLevelStep] = await safeExec(`
        SELECT * FROM po_approval_steps
        WHERE po_id = ${step.po_id} AND step_order > ${step.step_order}
        ORDER BY step_order LIMIT 1
      `);

      if (nextLevelStep) {
        await safeExec(`UPDATE po_approval_steps SET status = 'ממתין', notified_at = NOW(), updated_at = NOW() WHERE id = ${nextLevelStep.id}`);
        createNotificationForRole(nextLevelStep.required_role, {
          type: "po_approval_escalated",
          title: "אישור הזמנת רכש — הסלמה דחופה",
          message: `הזמנת רכש #${step.order_number} (${Number(step.total_amount).toLocaleString("he-IL")} ₪) לא אושרה תוך ${step.escalation_hours} שעות והוסלמה לשלב שלך לאישור מיידי`,
          priority: "critical",
          category: "approval",
          actionUrl: `/procurement/po-approval-workflow`,
          recordId: step.po_id,
          dedupeKey: `po_escalation_${step.id}`,
        }).catch((err: Error) => console.error("[EscalationEngine] notification error:", err.message));
        console.warn(`[EscalationEngine] PO step ${step.id} escalated → step ${nextLevelStep.id} (role: ${nextLevelStep.required_role})`);
      } else {
        createNotificationForRole(step.required_role, {
          type: "po_approval_escalated",
          title: "אישור הזמנת רכש — תזכורת דחופה",
          message: `הזמנת רכש #${step.order_number} (${Number(step.total_amount).toLocaleString("he-IL")} ₪) ממתינה לאישורך כבר ${step.escalation_hours} שעות`,
          priority: "critical",
          category: "approval",
          actionUrl: `/procurement/po-approval-workflow`,
          recordId: step.po_id,
          dedupeKey: `po_escalation_final_${step.id}`,
        }).catch((err: Error) => console.error("[EscalationEngine] notification error:", err.message));
        console.warn(`[EscalationEngine] PO step ${step.id} is final step; notified same role: ${step.required_role}`);
      }
    }

    if (overdueSteps.length > 0) {
      console.log(`[EscalationEngine] Escalated ${overdueSteps.length} overdue approval step(s)`);
    }
  } catch (err: any) {
    console.error(`[EscalationEngine] Error during escalation check: ${err.message}`);
  }
}

const ESCALATION_INTERVAL_MS = 30 * 60 * 1000;
setInterval(runEscalationCheck, ESCALATION_INTERVAL_MS);
runEscalationCheck().catch(console.error);

router.post("/po-approval-workflow/escalation/run", async (_req, res) => {
  try {
    await runEscalationCheck();
    res.json({ message: "Escalation check completed" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/po-approval-workflow/escalation/overdue", async (_req, res) => {
  try {
    const overdue = await safeExec(`
      SELECT ps.*, po.order_number, po.total_amount, s.supplier_name
      FROM po_approval_steps ps
      JOIN purchase_orders po ON po.id = ps.po_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE ps.status = 'ממתין'
        AND ps.escalation_hours > 0
        AND ps.notified_at IS NOT NULL
        AND ps.notified_at + (ps.escalation_hours || ' hours')::interval < NOW()
      ORDER BY ps.notified_at ASC
    `);
    res.json(overdue);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
