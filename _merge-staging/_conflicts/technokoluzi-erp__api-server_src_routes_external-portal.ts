import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  externalUsersTable,
  portalInvitationsTable,
  externalApiKeysTable,
  documentSendHistoryTable,
  webhookConfigsTable,
  webhookLogsTable,
  leaveRequestsTable,
  reimbursementRequestsTable,
  suppliersTable,
  supplierDocumentsTable,
  entityRecordsTable,
  supplierCommunicationsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, gt, ilike, or } from "drizzle-orm";
import {
  createPortalInvitation,
  registerExternalUser,
  loginExternalUser,
  validateExternalSession,
  logoutExternalUser,
  hashApiKey,
  generateApiKey,
} from "../lib/external-auth";
import { validateSession } from "../lib/auth";
import { recordDocumentSend, getSendHistory } from "../lib/document-sender";

const router = Router();

interface ExternalUser {
  id: number;
  email: string;
  fullName: string;
  userType: string;
  linkedEntityId: number | null;
  linkedEntityType: string | null;
  isActive: boolean;
}

interface ExternalAuthRequest extends Request {
  externalUser?: ExternalUser;
}

interface InternalAuthRequest extends Request {
  internalUser?: { id: number; username: string; isSuperAdmin: boolean };
}

async function requireExternalAuth(req: ExternalAuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateExternalSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: result.error || "הסשן פג תוקף" }); return; }
  req.externalUser = result.user as ExternalUser;
  next();
}

async function requireInternalAuth(req: InternalAuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  const user = result.user as any;
  req.internalUser = user;
  if (!user.isSuperAdmin && !req.permissions?.isSuperAdmin && !req.permissions?.builderAccess) {
    const { resolveUserPermissions } = await import("../lib/permission-engine");
    const perms = await resolveUserPermissions(String(user.id));
    if (!perms.isSuperAdmin && !perms.builderAccess) {
      res.status(403).json({ error: "נדרשת הרשאת מנהל מערכת" }); return;
    }
  }
  next();
}

router.post("/portal/auth/register", async (req: Request, res: Response) => {
  try {
    const { inviteToken, password, fullName, phone } = req.body;
    if (!inviteToken || !password || !fullName) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }
    const result = await registerExternalUser({ inviteToken, password, fullName, phone });
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.json({ user: result.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "חסרים שדות חובה" }); return; }
    const result = await loginExternalUser(email, password, req.ip, req.headers["user-agent"]);
    if (result.error) { res.status(401).json({ error: result.error }); return; }
    res.json({ token: result.token, user: result.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/auth/me", requireExternalAuth as any, async (req: Request, res: Response) => {
  const authReq = req as ExternalAuthRequest;
  res.json({ user: authReq.externalUser });
});

router.post("/portal/auth/logout", requireExternalAuth as any, async (req: Request, res: Response) => {
  const token = req.headers.authorization?.substring(7);
  if (token) await logoutExternalUser(token);
  res.json({ success: true });
});

router.get("/portal/invite/validate/:token", async (req: Request, res: Response) => {
  try {
    const [invitation] = await db.select().from(portalInvitationsTable)
      .where(and(
        eq(portalInvitationsTable.inviteToken, req.params.token),
        eq(portalInvitationsTable.isUsed, false),
        gt(portalInvitationsTable.expiresAt, new Date())
      ));
    if (!invitation) { res.status(404).json({ valid: false, error: "הזמנה לא תקינה או פגת תוקף" }); return; }
    res.json({ valid: true, email: invitation.email, userType: invitation.userType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/supplier/dashboard", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "supplier") {
      res.status(403).json({ error: "גישה מותרת לספקים בלבד" }); return;
    }
    const supplierId = authReq.externalUser.linkedEntityId;
    if (!supplierId) { res.json({ supplier: null, purchaseOrders: [], documents: [] }); return; }

    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));

    const poEntityId = await getEntityIdBySlug("purchase_order");
    let purchaseOrders: any[] = [];
    if (poEntityId) {
      purchaseOrders = await db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, poEntityId),
          sql`(${entityRecordsTable.data}->>'supplier_id')::text = ${String(supplierId)}`
        ))
        .orderBy(desc(entityRecordsTable.createdAt)).limit(50);
    }

    const documents = await db.select().from(supplierDocumentsTable)
      .where(eq(supplierDocumentsTable.supplierId, supplierId))
      .orderBy(desc(supplierDocumentsTable.createdAt));

    res.json({ supplier, purchaseOrders, documents });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/supplier/documents", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "supplier") {
      res.status(403).json({ error: "גישה מותרת לספקים בלבד" }); return;
    }
    const supplierId = authReq.externalUser.linkedEntityId;
    if (!supplierId) { res.status(400).json({ error: "לא משויך לספק" }); return; }

    const { documentName, documentType, fileUrl, notes } = req.body;
    const [doc] = await db.insert(supplierDocumentsTable).values({
      supplierId,
      documentName: documentName || "מסמך חדש",
      documentType: documentType || "invoice",
      fileUrl: fileUrl || null,
      notes: notes || null,
    }).returning();
    res.status(201).json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const EMPLOYEE_ENTITY_ID = 34;
const ATTENDANCE_ENTITY_ID = 35;

router.get("/portal/contractor/dashboard", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "contractor") {
      res.status(403).json({ error: "גישה מותרת לקבלנים בלבד" }); return;
    }
    const contractorId = authReq.externalUser.linkedEntityId;
    if (!contractorId) { res.json({ contractor: null, agreements: [], payments: [] }); return; }

    const [contractor] = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.id, contractorId),
        eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)
      ));

    const agreementEntityId = await getEntityIdBySlug("contractor_agreement");
    let agreements: any[] = [];
    if (agreementEntityId) {
      agreements = await db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, agreementEntityId),
          sql`(${entityRecordsTable.data}->>'contractor_id')::text = ${String(contractorId)}`
        ))
        .orderBy(desc(entityRecordsTable.createdAt));
    }

    const payslipEntityId = await getEntityIdBySlug("payslip");
    let payments: any[] = [];
    if (payslipEntityId) {
      payments = await db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, payslipEntityId),
          sql`(${entityRecordsTable.data}->>'employee_id')::text = ${String(contractorId)}`
        ))
        .orderBy(desc(entityRecordsTable.createdAt)).limit(24);
    }

    res.json({ contractor, agreements, payments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/contractor/reports", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "contractor") {
      res.status(403).json({ error: "גישה מותרת לקבלנים בלבד" }); return;
    }
    const contractorId = authReq.externalUser.linkedEntityId;
    if (!contractorId) { res.status(400).json({ error: "לא משויך לקבלן" }); return; }

    const reportEntityId = await getEntityIdBySlug("contractor_report");
    if (!reportEntityId) {
      res.status(400).json({ error: "יש להגדיר ישות דוחות קבלן במערכת" }); return;
    }

    const { data } = req.body;
    const [record] = await db.insert(entityRecordsTable).values({
      entityId: reportEntityId,
      status: "submitted",
      data: { ...data, contractor_id: String(contractorId), submitted_at: new Date().toISOString() },
    }).returning();
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/employee/dashboard", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "employee") {
      res.status(403).json({ error: "גישה מותרת לעובדים בלבד" }); return;
    }
    const employeeId = authReq.externalUser.linkedEntityId;
    if (!employeeId) { res.json({ employee: null, payslips: [], attendance: [], leaveRequests: [], reimbursements: [] }); return; }

    const [employee] = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.id, employeeId),
        eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)
      ));

    const payslipEntityId = await getEntityIdBySlug("payslip");
    let payslips: any[] = [];
    if (payslipEntityId) {
      payslips = await db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, payslipEntityId),
          sql`(${entityRecordsTable.data}->>'employee_id')::text = ${String(employeeId)}`
        ))
        .orderBy(desc(entityRecordsTable.createdAt)).limit(24);
    }

    const attendance = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, ATTENDANCE_ENTITY_ID),
        sql`(${entityRecordsTable.data}->>'employee_id')::text = ${String(employeeId)}`
      ))
      .orderBy(sql`${entityRecordsTable.data}->>'date' DESC NULLS LAST`).limit(30);

    const leaveRequests = await db.select().from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employeeId, employeeId))
      .orderBy(desc(leaveRequestsTable.createdAt));

    const reimbursements = await db.select().from(reimbursementRequestsTable)
      .where(eq(reimbursementRequestsTable.employeeId, employeeId))
      .orderBy(desc(reimbursementRequestsTable.createdAt));

    res.json({ employee, payslips, attendance, leaveRequests, reimbursements });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/employee/leave-request", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "employee") {
      res.status(403).json({ error: "גישה מותרת לעובדים בלבד" }); return;
    }
    const employeeId = authReq.externalUser.linkedEntityId;
    if (!employeeId) { res.status(400).json({ error: "לא משויך לעובד" }); return; }

    const { leaveType, startDate, endDate, totalDays, reason } = req.body;
    if (!leaveType || !startDate || !endDate || !totalDays) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }

    const [request] = await db.insert(leaveRequestsTable).values({
      employeeId,
      externalUserId: authReq.externalUser.id,
      leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalDays: Number(totalDays),
      reason: reason || null,
    }).returning();
    res.status(201).json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/employee/reimbursement", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "employee") {
      res.status(403).json({ error: "גישה מותרת לעובדים בלבד" }); return;
    }
    const employeeId = authReq.externalUser.linkedEntityId;
    if (!employeeId) { res.status(400).json({ error: "לא משויך לעובד" }); return; }

    const { category, amount, currency, description, receiptUrl, expenseDate } = req.body;
    if (!category || !amount) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }

    const [request] = await db.insert(reimbursementRequestsTable).values({
      employeeId,
      externalUserId: authReq.externalUser.id,
      category,
      amount: String(amount),
      currency: currency || "ILS",
      description: description || null,
      receiptUrl: receiptUrl || null,
      expenseDate: expenseDate ? new Date(expenseDate) : null,
    }).returning();
    res.status(201).json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/management/invite", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const { email, userType, linkedEntityId, linkedEntityType } = req.body;
    if (!email || !userType) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }
    if (!["supplier", "contractor", "employee"].includes(userType)) {
      res.status(400).json({ error: "סוג משתמש לא תקין" }); return;
    }
    const result = await createPortalInvitation({
      email,
      userType,
      linkedEntityId,
      linkedEntityType,
      invitedBy: authReq.internalUser!.id,
    });
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.json({ invitation: result.invitation, inviteToken: result.inviteToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/users", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const { userType, search } = req.query;
    const conditions: any[] = [];
    if (userType && typeof userType === "string") {
      conditions.push(eq(externalUsersTable.userType, userType));
    }
    if (search && typeof search === "string" && search.trim()) {
      conditions.push(or(
        ilike(externalUsersTable.fullName, `%${search}%`),
        ilike(externalUsersTable.email, `%${search}%`)
      ));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const users = await db.select({
      id: externalUsersTable.id,
      email: externalUsersTable.email,
      fullName: externalUsersTable.fullName,
      phone: externalUsersTable.phone,
      userType: externalUsersTable.userType,
      linkedEntityId: externalUsersTable.linkedEntityId,
      linkedEntityType: externalUsersTable.linkedEntityType,
      isActive: externalUsersTable.isActive,
      lastLoginAt: externalUsersTable.lastLoginAt,
      loginCount: externalUsersTable.loginCount,
      createdAt: externalUsersTable.createdAt,
    }).from(externalUsersTable).where(whereClause).orderBy(desc(externalUsersTable.createdAt));
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/portal/management/users/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { isActive, linkedEntityId, linkedEntityType } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (isActive !== undefined) updates.isActive = isActive;
    if (linkedEntityId !== undefined) updates.linkedEntityId = linkedEntityId;
    if (linkedEntityType !== undefined) updates.linkedEntityType = linkedEntityType;
    const [user] = await db.update(externalUsersTable).set(updates).where(eq(externalUsersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/portal/management/users/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(externalUsersTable).where(eq(externalUsersTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "משתמש לא נמצא" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/invitations", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const invitations = await db.select().from(portalInvitationsTable)
      .orderBy(desc(portalInvitationsTable.createdAt)).limit(100);
    res.json(invitations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/management/api-keys", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const { name, ownerType, ownerId, permissions, expiresAt } = req.body;
    if (!name || !ownerType) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }
    const { key, prefix } = generateApiKey();
    const keyHash = hashApiKey(key);
    const [apiKey] = await db.insert(externalApiKeysTable).values({
      name,
      keyHash,
      keyPrefix: prefix,
      ownerType,
      ownerId: ownerId || null,
      permissions: permissions || {},
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: authReq.internalUser!.id,
    }).returning();
    res.json({ ...apiKey, key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/api-keys", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const keys = await db.select({
      id: externalApiKeysTable.id,
      name: externalApiKeysTable.name,
      keyPrefix: externalApiKeysTable.keyPrefix,
      ownerType: externalApiKeysTable.ownerType,
      ownerId: externalApiKeysTable.ownerId,
      permissions: externalApiKeysTable.permissions,
      isActive: externalApiKeysTable.isActive,
      lastUsedAt: externalApiKeysTable.lastUsedAt,
      usageCount: externalApiKeysTable.usageCount,
      expiresAt: externalApiKeysTable.expiresAt,
      createdAt: externalApiKeysTable.createdAt,
    }).from(externalApiKeysTable).orderBy(desc(externalApiKeysTable.createdAt));
    res.json(keys);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/portal/management/api-keys/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { isActive, name, permissions } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (isActive !== undefined) updates.isActive = isActive;
    if (name !== undefined) updates.name = name;
    if (permissions !== undefined) updates.permissions = permissions;
    const [key] = await db.update(externalApiKeysTable).set(updates).where(eq(externalApiKeysTable.id, id)).returning();
    if (!key) { res.status(404).json({ error: "מפתח לא נמצא" }); return; }
    res.json(key);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/portal/management/api-keys/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(externalApiKeysTable).where(eq(externalApiKeysTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "מפתח לא נמצא" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/management/webhooks", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const { name, url, events, secret, ownerType, ownerId, headers } = req.body;
    if (!name || !url) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }
    const [webhook] = await db.insert(webhookConfigsTable).values({
      name,
      url,
      events: events || [],
      secret: secret || null,
      ownerType: ownerType || null,
      ownerId: ownerId || null,
      headers: headers || {},
      createdBy: authReq.internalUser!.id,
    }).returning();
    res.json(webhook);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/webhooks", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const webhooks = await db.select().from(webhookConfigsTable)
      .orderBy(desc(webhookConfigsTable.createdAt));
    res.json(webhooks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/portal/management/webhooks/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, url, events, secret, isActive, headers } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (events !== undefined) updates.events = events;
    if (secret !== undefined) updates.secret = secret;
    if (isActive !== undefined) updates.isActive = isActive;
    if (headers !== undefined) updates.headers = headers;
    const [webhook] = await db.update(webhookConfigsTable).set(updates).where(eq(webhookConfigsTable.id, id)).returning();
    if (!webhook) { res.status(404).json({ error: "Webhook לא נמצא" }); return; }
    res.json(webhook);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/portal/management/webhooks/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(webhookConfigsTable).where(eq(webhookConfigsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Webhook לא נמצא" }); return; }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/management/send-document", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const { documentType, documentId, documentTitle, recipientType, recipientId, recipientName, recipientEmail, recipientPhone, channel, messageContent } = req.body;

    if (!documentType || !recipientType || !channel) {
      res.status(400).json({ error: "חסרים שדות חובה" }); return;
    }

    const record = await recordDocumentSend({
      documentType,
      documentId,
      documentTitle,
      recipientType,
      recipientId,
      recipientName,
      recipientEmail,
      recipientPhone,
      channel,
      messageContent,
      sentBy: authReq.internalUser!.id,
      status: "sent",
    });

    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/management/send-bulk", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const { documents } = req.body;
    if (!Array.isArray(documents) || documents.length === 0) {
      res.status(400).json({ error: "רשימת מסמכים ריקה" }); return;
    }

    const results = [];
    for (const doc of documents) {
      const record = await recordDocumentSend({
        ...doc,
        sentBy: authReq.internalUser!.id,
        status: "sent",
      });
      results.push(record);
    }
    res.json({ sent: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/send-history", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const { documentType, recipientType, channel, limit, offset } = req.query;
    const result = await getSendHistory({
      documentType: documentType as string,
      recipientType: recipientType as string,
      channel: channel as string,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/dashboard", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const [
      externalUsers,
      invitations,
      apiKeys,
      webhooks,
      sendHistory,
      leaveRequests,
      reimbursements,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(externalUsersTable),
      db.select({ count: sql<number>`count(*)::int` }).from(portalInvitationsTable).where(eq(portalInvitationsTable.isUsed, false)),
      db.select({ count: sql<number>`count(*)::int` }).from(externalApiKeysTable).where(eq(externalApiKeysTable.isActive, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(webhookConfigsTable).where(eq(webhookConfigsTable.isActive, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(documentSendHistoryTable),
      db.select({ count: sql<number>`count(*)::int` }).from(leaveRequestsTable).where(eq(leaveRequestsTable.status, "pending")),
      db.select({ count: sql<number>`count(*)::int` }).from(reimbursementRequestsTable).where(eq(reimbursementRequestsTable.status, "pending")),
    ]);

    const supplierCount = await db.select({ count: sql<number>`count(*)::int` }).from(externalUsersTable).where(eq(externalUsersTable.userType, "supplier"));
    const contractorCount = await db.select({ count: sql<number>`count(*)::int` }).from(externalUsersTable).where(eq(externalUsersTable.userType, "contractor"));
    const employeeCount = await db.select({ count: sql<number>`count(*)::int` }).from(externalUsersTable).where(eq(externalUsersTable.userType, "employee"));

    const recentSends = await db.select().from(documentSendHistoryTable)
      .orderBy(desc(documentSendHistoryTable.sentAt)).limit(10);

    res.json({
      stats: {
        totalExternalUsers: externalUsers[0]?.count || 0,
        pendingInvitations: invitations[0]?.count || 0,
        activeApiKeys: apiKeys[0]?.count || 0,
        activeWebhooks: webhooks[0]?.count || 0,
        totalDocumentsSent: sendHistory[0]?.count || 0,
        pendingLeaveRequests: leaveRequests[0]?.count || 0,
        pendingReimbursements: reimbursements[0]?.count || 0,
        supplierUsers: supplierCount[0]?.count || 0,
        contractorUsers: contractorCount[0]?.count || 0,
        employeeUsers: employeeCount[0]?.count || 0,
      },
      recentSends,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/leave-requests", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const conditions: any[] = [];
    if (status && typeof status === "string") {
      conditions.push(eq(leaveRequestsTable.status, status));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const requests = await db.select().from(leaveRequestsTable)
      .where(whereClause)
      .orderBy(desc(leaveRequestsTable.createdAt));
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/portal/management/leave-requests/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const id = Number(req.params.id);
    const { status, rejectionReason } = req.body;
    const updates: Record<string, any> = { status, updatedAt: new Date() };
    if (status === "approved") {
      updates.approvedBy = authReq.internalUser!.id;
      updates.approvedAt = new Date();
    }
    if (rejectionReason) updates.rejectionReason = rejectionReason;
    const [request] = await db.update(leaveRequestsTable).set(updates).where(eq(leaveRequestsTable.id, id)).returning();
    if (!request) { res.status(404).json({ error: "בקשה לא נמצאה" }); return; }
    res.json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/management/reimbursements", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const conditions: any[] = [];
    if (status && typeof status === "string") {
      conditions.push(eq(reimbursementRequestsTable.status, status));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const requests = await db.select().from(reimbursementRequestsTable)
      .where(whereClause)
      .orderBy(desc(reimbursementRequestsTable.createdAt));
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/portal/management/reimbursements/:id", requireInternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as InternalAuthRequest;
    const id = Number(req.params.id);
    const { status, rejectionReason } = req.body;
    const updates: Record<string, any> = { status, updatedAt: new Date() };
    if (status === "approved") {
      updates.approvedBy = authReq.internalUser!.id;
      updates.approvedAt = new Date();
    }
    if (rejectionReason) updates.rejectionReason = rejectionReason;
    const [request] = await db.update(reimbursementRequestsTable).set(updates).where(eq(reimbursementRequestsTable.id, id)).returning();
    if (!request) { res.status(404).json({ error: "בקשה לא נמצאה" }); return; }
    res.json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/supplier/shipments", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "supplier") {
      res.status(403).json({ error: "גישה מותרת לספקים בלבד" }); return;
    }
    const supplierId = authReq.externalUser.linkedEntityId;
    if (!supplierId) { res.json([]); return; }

    const poEntityId = await getEntityIdBySlug("purchase_order");
    let shipments: any[] = [];
    if (poEntityId) {
      const orders = await db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, poEntityId),
          sql`(${entityRecordsTable.data}->>'supplier_id')::text = ${String(supplierId)}`
        ))
        .orderBy(desc(entityRecordsTable.createdAt)).limit(50);

      shipments = orders.map((po: any) => ({
        id: po.id,
        poNumber: po.data?.po_number || `PO-${String(po.id).padStart(3, "0")}`,
        status: po.data?.shipment_status || po.data?.delivery_status || "בהכנה",
        carrier: po.data?.carrier || po.data?.shipping_method || null,
        trackingNumber: po.data?.tracking_number || null,
        estimatedDelivery: po.data?.expected_delivery || po.data?.delivery_date || null,
        createdAt: po.createdAt,
      }));
    }

    res.json(shipments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/portal/supplier/messages", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "supplier") {
      res.status(403).json({ error: "גישה מותרת לספקים בלבד" }); return;
    }
    const supplierId = authReq.externalUser.linkedEntityId;
    if (!supplierId) { res.json([]); return; }

    const messages = await db.select().from(supplierCommunicationsTable)
      .where(eq(supplierCommunicationsTable.supplierId, supplierId))
      .orderBy(desc(supplierCommunicationsTable.createdAt))
      .limit(50);

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/portal/supplier/messages", requireExternalAuth as any, async (req: Request, res: Response) => {
  try {
    const authReq = req as ExternalAuthRequest;
    if (authReq.externalUser?.userType !== "supplier") {
      res.status(403).json({ error: "גישה מותרת לספקים בלבד" }); return;
    }
    const supplierId = authReq.externalUser.linkedEntityId;
    if (!supplierId) { res.status(400).json({ error: "לא משויך לספק" }); return; }

    const { subject, content } = req.body;
    if (!subject || !content) { res.status(400).json({ error: "חסרים שדות חובה" }); return; }
    if (typeof subject !== "string" || subject.length > 500) { res.status(400).json({ error: "נושא ההודעה ארוך מדי (מקסימום 500 תווים)" }); return; }
    if (typeof content !== "string" || content.length > 5000) { res.status(400).json({ error: "תוכן ההודעה ארוך מדי (מקסימום 5000 תווים)" }); return; }

    const [msg] = await db.insert(supplierCommunicationsTable).values({
      supplierId,
      subject,
      content,
      direction: "incoming",
      status: "unread",
      type: "portal_message",
      sentBy: authReq.externalUser.fullName,
      sentAt: new Date(),
    }).returning();

    res.status(201).json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function getEntityIdBySlug(slug: string): Promise<number | null> {
  try {
    const { moduleEntitiesTable } = await import("@workspace/db/schema");
    const [entity] = await db.select({ id: moduleEntitiesTable.id })
      .from(moduleEntitiesTable).where(eq(moduleEntitiesTable.slug, slug));
    return entity?.id || null;
  } catch {
    return null;
  }
}

export default router;
