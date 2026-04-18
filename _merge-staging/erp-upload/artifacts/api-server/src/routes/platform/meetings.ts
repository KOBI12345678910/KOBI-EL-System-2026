import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  entityRecordsTable,
  moduleEntitiesTable,
  notificationsTable,
} from "@workspace/db/schema";
import { eq, and, sql, or } from "drizzle-orm";
import { executeAction } from "../../lib/action-executors";
import {
  checkEntityAccess,
  resolveDataScopeRules,
  buildScopeConditions,
  logPermissionDenied,
} from "../../lib/permission-engine";
import { sendWhatsAppMessage } from "./meetings-utils";

const router: IRouter = Router();

async function getMeetingEntityId(): Promise<number | null> {
  const [entity] = await db
    .select({ id: moduleEntitiesTable.id })
    .from(moduleEntitiesTable)
    .where(eq(moduleEntitiesTable.slug, "meeting"));
  return entity?.id ?? null;
}

function checkEntityPermission(req: any, res: any, entityId: number, action: "read" | "update"): boolean {
  const permissions = req.permissions;
  if (!permissions) {
    res.status(403).json({ message: "Access denied: no permissions resolved" });
    return false;
  }
  if (!checkEntityAccess(permissions, String(entityId), action)) {
    logPermissionDenied(req.userId || "", `entity_${action}`, entityId);
    res.status(403).json({ message: `Access denied: no ${action} permission for meetings` });
    return false;
  }
  return true;
}

async function enforceScopeForRecord(
  req: any,
  recordId: number,
  entityId: number,
  action: string,
): Promise<{ denied: boolean }> {
  if (!req.permissions || req.permissions.isSuperAdmin || !req.userId) {
    return { denied: false };
  }
  const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, entityId);
  const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
  if (scope.denyAll) {
    await logPermissionDenied(req.userId, `${action}_scope`, entityId, recordId);
    return { denied: true };
  }
  if (scope.conditions.length > 0) {
    const [scoped] = await db
      .select({ id: entityRecordsTable.id })
      .from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, recordId), or(...scope.conditions)!));
    if (!scoped) {
      await logPermissionDenied(req.userId, `${action}_scope`, entityId, recordId);
      return { denied: true };
    }
  }
  return { denied: false };
}

router.post("/platform/meetings/:recordId/send-whatsapp", async (req, res) => {
  try {
    const recordId = Number(req.params.recordId);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return res.status(400).json({ message: "Invalid record ID" });
    }
    const entityId = await getMeetingEntityId();
    if (!entityId) return res.status(404).json({ message: "Meeting entity not found" });

    if (!checkEntityPermission(req, res, entityId, "update")) return;

    const scopeCheck = await enforceScopeForRecord(req, recordId, entityId, "send_whatsapp");
    if (scopeCheck.denied) {
      return res.status(403).json({ message: "Access denied: record is outside your data scope" });
    }

    const [record] = await db
      .select({ id: entityRecordsTable.id, entityId: entityRecordsTable.entityId, data: entityRecordsTable.data, status: entityRecordsTable.status })
      .from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, recordId), eq(entityRecordsTable.entityId, entityId)));
    if (!record) return res.status(404).json({ message: "Meeting record not found" });

    const data = record.data as Record<string, any>;
    const phone = data.participant_phone;
    if (!phone) return res.status(400).json({ message: "No participant phone number" });

    const startDate = data.start_datetime
      ? new Date(data.start_datetime).toLocaleString("he-IL", {
          dateStyle: "full",
          timeStyle: "short",
        })
      : "לא צוין";

    const messageBody = [
      `📅 *הזמנה לפגישה*`,
      ``,
      `*${data.title || "פגישה"}*`,
      `🕐 ${startDate}`,
      data.location ? `📍 ${data.location}` : "",
      data.video_link ? `🔗 ${data.video_link}` : "",
      data.subject ? `📋 ${data.subject}` : "",
      ``,
      `נשמח לראותך!`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await sendWhatsAppMessage(phone, messageBody);
    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }

    await db
      .update(entityRecordsTable)
      .set({
        data: { ...data, whatsapp_sent: "yes" },
        updatedAt: new Date(),
      })
      .where(eq(entityRecordsTable.id, recordId));

    await db.insert(notificationsTable).values({
      type: "meeting_whatsapp",
      title: `WhatsApp הזמנה נשלחה`,
      message: `הזמנה לפגישה "${data.title}" נשלחה ל-${phone}`,
      recordId,
    });

    res.json({ success: true, message: "WhatsApp invitation sent", phone: phone.replace(/[^0-9]/g, "") });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/meetings/:recordId/send-email", async (req, res) => {
  try {
    const recordId = Number(req.params.recordId);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return res.status(400).json({ message: "Invalid record ID" });
    }
    const entityId = await getMeetingEntityId();
    if (!entityId) return res.status(404).json({ message: "Meeting entity not found" });

    if (!checkEntityPermission(req, res, entityId, "update")) return;

    const scopeCheck = await enforceScopeForRecord(req, recordId, entityId, "send_email");
    if (scopeCheck.denied) {
      return res.status(403).json({ message: "Access denied: record is outside your data scope" });
    }

    const [record] = await db
      .select({ id: entityRecordsTable.id, entityId: entityRecordsTable.entityId, data: entityRecordsTable.data, status: entityRecordsTable.status })
      .from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, recordId), eq(entityRecordsTable.entityId, entityId)));
    if (!record) return res.status(404).json({ message: "Meeting record not found" });

    const data = record.data as Record<string, any>;
    const email = data.participant_email;
    if (!email) return res.status(400).json({ message: "No participant email address" });

    const startDate = data.start_datetime
      ? new Date(data.start_datetime).toLocaleString("he-IL", {
          dateStyle: "full",
          timeStyle: "short",
        })
      : "לא צוין";
    const endDate = data.end_datetime
      ? new Date(data.end_datetime).toLocaleString("he-IL", {
          dateStyle: "full",
          timeStyle: "short",
        })
      : "";

    const htmlBody = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8B5CF6, #6366F1); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">📅 הזמנה לפגישה</h1>
        </div>
        <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e9ecef; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1a1a2e; margin-top: 0;">${data.title || "פגישה"}</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 120px;">🕐 תאריך ושעה:</td>
              <td style="padding: 8px 0; font-weight: bold;">${startDate}</td>
            </tr>
            ${endDate ? `<tr><td style="padding: 8px 0; color: #666;">🏁 סיום:</td><td style="padding: 8px 0;">${endDate}</td></tr>` : ""}
            ${data.location ? `<tr><td style="padding: 8px 0; color: #666;">📍 מיקום:</td><td style="padding: 8px 0;">${data.location}</td></tr>` : ""}
            ${data.video_link ? `<tr><td style="padding: 8px 0; color: #666;">🔗 קישור:</td><td style="padding: 8px 0;"><a href="${data.video_link}" style="color: #6366F1;">${data.video_link}</a></td></tr>` : ""}
            ${data.subject ? `<tr><td style="padding: 8px 0; color: #666;">📋 נושא:</td><td style="padding: 8px 0;">${data.subject}</td></tr>` : ""}
            ${data.participants ? `<tr><td style="padding: 8px 0; color: #666;">👥 משתתפים:</td><td style="padding: 8px 0;">${data.participants}</td></tr>` : ""}
          </table>
          ${data.description ? `<div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e9ecef;"><p style="margin: 0; color: #444;">${data.description}</p></div>` : ""}
          <p style="margin-top: 20px; color: #666; font-size: 14px;">נשמח לראותכם!</p>
        </div>
      </div>
    `;

    const actionResult = await executeAction(
      {
        type: "send_email",
        config: {
          to: email,
          subject: `הזמנה לפגישה: ${data.title || "פגישה"} - ${startDate}`,
          body: htmlBody,
        },
      },
      {
        entityId,
        recordId,
        data,
      },
    );

    if (!actionResult.success) {
      return res.status(400).json({ message: actionResult.error || "Failed to send email" });
    }

    await db
      .update(entityRecordsTable)
      .set({
        data: { ...data, email_sent: "yes" },
        updatedAt: new Date(),
      })
      .where(eq(entityRecordsTable.id, recordId));

    res.json({ success: true, message: "Email invitation sent", email, method: actionResult.details?.method });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/meetings/upcoming", async (req, res) => {
  try {
    const entityId = await getMeetingEntityId();
    if (!entityId) return res.json({ meetings: [] });

    if (!checkEntityPermission(req, res, entityId, "read")) return;

    const now = new Date();
    const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const conditions: any[] = [
      eq(entityRecordsTable.entityId, entityId),
      sql`${entityRecordsTable.status} IN ('planned', 'confirmed')`,
      sql`(${entityRecordsTable.data}->>'start_datetime')::timestamp >= ${now.toISOString()}`,
      sql`(${entityRecordsTable.data}->>'start_datetime')::timestamp <= ${futureLimit.toISOString()}`,
    ];

    if (req.permissions && !req.permissions.isSuperAdmin && req.userId) {
      const scopeRules = await resolveDataScopeRules(req.permissions.roleIds, entityId);
      const scope = buildScopeConditions(scopeRules, req.userId, req.permissions?.department);
      if (scope.denyAll) {
        return res.json({ meetings: [] });
      }
      if (scope.conditions.length > 0) {
        conditions.push(or(...scope.conditions)!);
      }
    }

    const records = await db
      .select({ id: entityRecordsTable.id, entityId: entityRecordsTable.entityId, data: entityRecordsTable.data, status: entityRecordsTable.status, createdAt: entityRecordsTable.createdAt, updatedAt: entityRecordsTable.updatedAt })
      .from(entityRecordsTable)
      .where(and(...conditions))
      .orderBy(sql`(${entityRecordsTable.data}->>'start_datetime')::timestamp ASC`)
      .limit(100);

    res.json({ meetings: records });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
