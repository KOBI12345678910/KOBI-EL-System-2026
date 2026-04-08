import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { approvalRequestsTable, usersTable, userSessionsTable } from "@workspace/db/schema";
import { eq, and, desc, gt } from "drizzle-orm";
import { z } from "zod/v4";
import { resumeWorkflowAfterApproval } from "../../lib/workflow-engine";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const ResolveApprovalBody = z.object({
  comments: z.string().optional(),
});

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "Authentication required" }); return; }

  const [session] = await db.select().from(userSessionsTable)
    .where(and(
      eq(userSessionsTable.token, token),
      eq(userSessionsTable.isActive, true),
      gt(userSessionsTable.expiresAt, new Date())
    ));
  if (!session) { res.status(401).json({ error: "Invalid or expired session" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.isActive) { res.status(401).json({ error: "User inactive" }); return; }

  const { passwordHash: _, ...safeUser } = user;
  (req as any).user = safeUser;
  next();
}

router.get("/platform/approval-requests", requireAuth as any, async (req: any, res) => {
  try {
    const { status, workflowId, entityId } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;

    const conditions: any[] = [];

    if (status) {
      conditions.push(eq(approvalRequestsTable.status, String(status)));
    }
    if (workflowId) {
      conditions.push(eq(approvalRequestsTable.workflowId, Number(workflowId)));
    }
    if (entityId) {
      conditions.push(eq(approvalRequestsTable.entityId, Number(entityId)));
    }

    const requests = await db.select().from(approvalRequestsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(approvalRequestsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/approval-requests/:id", requireAuth as any, async (req: any, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [request] = await db.select().from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.id, id));
    if (!request) return res.status(404).json({ message: "Approval request not found" });
    res.json(request);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

function canUserApprove(user: any, request: any): { allowed: boolean; reason?: string } {
  if (user.isSuperAdmin) return { allowed: true };

  if (request.approverEmail && request.approverEmail !== user.email) {
    if (!request.approverRole) {
      return { allowed: false, reason: `Only ${request.approverEmail} can resolve this request` };
    }
  }

  if (request.approverRole) {
    const userRole = user.department || user.jobTitle || "";
    const roleMatch = userRole.toLowerCase().includes(request.approverRole.toLowerCase()) ||
                      request.approverRole.toLowerCase() === "any";
    const emailMatch = request.approverEmail ? request.approverEmail === user.email : false;

    if (!roleMatch && !emailMatch) {
      return { allowed: false, reason: `Not authorized: requires role '${request.approverRole}'` };
    }
  }

  return { allowed: true };
}

router.post("/platform/approval-requests/:id/approve", requireAuth as any, async (req: any, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = ResolveApprovalBody.parse(req.body);
    const user = req.user;

    const [pendingRequest] = await db.select().from(approvalRequestsTable)
      .where(and(
        eq(approvalRequestsTable.id, id),
        eq(approvalRequestsTable.status, "pending"),
      ));

    if (!pendingRequest) {
      return res.status(404).json({ message: "Approval request not found or already resolved" });
    }

    const authCheck = canUserApprove(user, pendingRequest);
    if (!authCheck.allowed) {
      return res.status(403).json({ message: authCheck.reason });
    }

    const approverIdentity = user.email || user.username || `user:${user.id}`;
    await resumeWorkflowAfterApproval(id, true, approverIdentity, body.comments);

    const [updated] = await db.select().from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.id, id));

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.post("/platform/approval-requests/:id/reject", requireAuth as any, async (req: any, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = ResolveApprovalBody.parse(req.body);
    const user = req.user;

    const [pendingRequest] = await db.select().from(approvalRequestsTable)
      .where(and(
        eq(approvalRequestsTable.id, id),
        eq(approvalRequestsTable.status, "pending"),
      ));

    if (!pendingRequest) {
      return res.status(404).json({ message: "Approval request not found or already resolved" });
    }

    const authCheck = canUserApprove(user, pendingRequest);
    if (!authCheck.allowed) {
      return res.status(403).json({ message: authCheck.reason });
    }

    const approverIdentity = user.email || user.username || `user:${user.id}`;
    await resumeWorkflowAfterApproval(id, false, approverIdentity, body.comments);

    const [updated] = await db.select().from(approvalRequestsTable)
      .where(eq(approvalRequestsTable.id, id));

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
