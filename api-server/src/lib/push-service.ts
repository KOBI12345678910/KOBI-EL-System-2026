import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface SendResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || `mailto:admin@erp.local`;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export async function sendBrowserPush(
  userId: number,
  payload: PushPayload
): Promise<SendResult> {
  const result: SendResult = { success: false, sent: 0, failed: 0, errors: [] };

  const vapid = getVapidKeys();
  if (!vapid) {
    result.errors.push("VAPID keys not configured");
    return result;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(and(
      eq(pushSubscriptionsTable.userId, userId),
      eq(pushSubscriptionsTable.type, "browser"),
      eq(pushSubscriptionsTable.isActive, true)
    ));

  if (subscriptions.length === 0) {
    result.errors.push("No active browser push subscriptions");
    return result;
  }

  let webpush: typeof import("web-push") | null = null;
  try {
    webpush = await import("web-push");
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  } catch {
    result.errors.push("web-push module not available");
    return result;
  }

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon.png",
    badge: payload.badge || "/badge.png",
    tag: payload.tag,
    data: { url: payload.url, ...payload.data },
  });

  for (const sub of subscriptions) {
    if (!sub.endpoint || !sub.keysAuth || !sub.keysP256dh) {
      result.failed++;
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.keysAuth,
            p256dh: sub.keysP256dh,
          },
        },
        notification,
        { TTL: 86400 }
      );
      result.sent++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Push failed";
      result.errors.push(msg);
      result.failed++;

      if (msg.includes("410") || msg.includes("404")) {
        await db
          .update(pushSubscriptionsTable)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(pushSubscriptionsTable.id, sub.id));
      }
    }
  }

  result.success = result.sent > 0;
  return result;
}

export async function sendExpoPush(
  userId: number,
  payload: PushPayload
): Promise<SendResult> {
  const result: SendResult = { success: false, sent: 0, failed: 0, errors: [] };

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(and(
      eq(pushSubscriptionsTable.userId, userId),
      eq(pushSubscriptionsTable.type, "expo"),
      eq(pushSubscriptionsTable.isActive, true)
    ));

  if (subscriptions.length === 0) {
    result.errors.push("No active Expo push subscriptions");
    return result;
  }

  const tokens = subscriptions
    .map(s => s.expoToken)
    .filter(Boolean) as string[];

  if (tokens.length === 0) {
    result.errors.push("No Expo tokens found");
    return result;
  }

  const messages = tokens.map(token => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: { url: payload.url, ...payload.data },
    sound: "default" as const,
    badge: 1,
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json() as {
      data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }>;
    };

    const tickets = data.data || [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "ok") {
        result.sent++;
      } else {
        result.failed++;
        const errorDetail = ticket.details?.error || ticket.message || "Unknown error";
        result.errors.push(errorDetail);

        if (errorDetail === "DeviceNotRegistered" || errorDetail === "InvalidCredentials") {
          const token = tokens[i];
          if (token) {
            await db
              .update(pushSubscriptionsTable)
              .set({ isActive: false, updatedAt: new Date() })
              .where(and(
                eq(pushSubscriptionsTable.userId, userId),
                eq(pushSubscriptionsTable.expoToken, token)
              ));
          }
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Expo push error";
    result.errors.push(msg);
    result.failed = tokens.length;
  }

  result.success = result.sent > 0;
  return result;
}

export async function registerPushSubscription(params: {
  userId: number;
  type: "browser" | "expo";
  endpoint?: string;
  keysAuth?: string;
  keysP256dh?: string;
  expoToken?: string;
  deviceInfo?: Record<string, unknown>;
}): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    if (params.type === "browser") {
      if (!params.endpoint || !params.keysAuth || !params.keysP256dh) {
        return { success: false, error: "Browser push requires endpoint, keysAuth, keysP256dh" };
      }

      const existing = await db
        .select()
        .from(pushSubscriptionsTable)
        .where(and(
          eq(pushSubscriptionsTable.userId, params.userId),
          eq(pushSubscriptionsTable.endpoint, params.endpoint)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptionsTable)
          .set({
            keysAuth: params.keysAuth,
            keysP256dh: params.keysP256dh,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(pushSubscriptionsTable.id, existing[0].id));
        return { success: true, id: existing[0].id };
      }

      const [sub] = await db
        .insert(pushSubscriptionsTable)
        .values({
          userId: params.userId,
          type: "browser",
          endpoint: params.endpoint,
          keysAuth: params.keysAuth,
          keysP256dh: params.keysP256dh,
          deviceInfo: params.deviceInfo ?? null,
          isActive: true,
        })
        .returning();

      return { success: true, id: sub.id };
    } else {
      if (!params.expoToken) {
        return { success: false, error: "Expo push requires expoToken" };
      }

      const existing = await db
        .select()
        .from(pushSubscriptionsTable)
        .where(and(
          eq(pushSubscriptionsTable.userId, params.userId),
          eq(pushSubscriptionsTable.expoToken, params.expoToken)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pushSubscriptionsTable)
          .set({ isActive: true, updatedAt: new Date(), deviceInfo: params.deviceInfo ?? null })
          .where(eq(pushSubscriptionsTable.id, existing[0].id));
        return { success: true, id: existing[0].id };
      }

      const [sub] = await db
        .insert(pushSubscriptionsTable)
        .values({
          userId: params.userId,
          type: "expo",
          endpoint: params.expoToken,
          expoToken: params.expoToken,
          deviceInfo: params.deviceInfo ?? null,
          isActive: true,
        })
        .returning();

      return { success: true, id: sub.id };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}

export async function unregisterPushSubscription(params: {
  userId: number;
  endpoint?: string;
  expoToken?: string;
}): Promise<{ success: boolean }> {
  try {
    if (params.endpoint) {
      await db
        .update(pushSubscriptionsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(pushSubscriptionsTable.userId, params.userId),
          eq(pushSubscriptionsTable.endpoint, params.endpoint)
        ));
    } else if (params.expoToken) {
      await db
        .update(pushSubscriptionsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(pushSubscriptionsTable.userId, params.userId),
          eq(pushSubscriptionsTable.expoToken, params.expoToken)
        ));
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function getUserPushSubscriptions(userId: number): Promise<{
  browserPush: boolean;
  mobilePush: boolean;
  browserCount: number;
  mobileCount: number;
}> {
  const rows = await db.execute(
    sql`SELECT type, COUNT(*)::int as count FROM push_subscriptions
        WHERE user_id = ${userId} AND is_active = TRUE
        GROUP BY type`
  );
  const subs = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<{ type: string; count: number }>;

  const browserCount = subs.find(s => s.type === "browser")?.count || 0;
  const mobileCount = subs.find(s => s.type === "expo")?.count || 0;

  return {
    browserPush: browserCount > 0,
    mobilePush: mobileCount > 0,
    browserCount,
    mobileCount,
  };
}
