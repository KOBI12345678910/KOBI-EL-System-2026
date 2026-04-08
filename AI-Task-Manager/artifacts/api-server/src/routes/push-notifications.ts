import { Router, type IRouter } from "express";
import {
  registerPushSubscription,
  unregisterPushSubscription,
  getVapidPublicKey,
  getUserPushSubscriptions,
  sendBrowserPush,
  sendExpoPush,
} from "../lib/push-service";

const router: IRouter = Router();

function getUserId(req: any): number | null {
  const uid = req.userId;
  if (!uid) return null;
  const num = Number(uid);
  return isNaN(num) || num === 0 ? null : num;
}

router.get("/push/vapid-public-key", async (_req, res) => {
  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    return res.json({ available: false, publicKey: null });
  }
  res.json({ available: true, publicKey });
});

router.get("/push/subscriptions", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });
  const status = await getUserPushSubscriptions(userId);
  res.json(status);
});

router.post("/push/subscribe", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { endpoint, keys, deviceInfo } = req.body;
  if (!endpoint || !keys?.auth || !keys?.p256dh) {
    return res.status(400).json({ message: "endpoint, keys.auth, and keys.p256dh are required" });
  }

  const result = await registerPushSubscription({
    userId,
    type: "browser",
    endpoint,
    keysAuth: keys.auth,
    keysP256dh: keys.p256dh,
    deviceInfo,
  });

  if (!result.success) {
    return res.status(400).json({ message: result.error });
  }

  res.json({ success: true, id: result.id });
});

router.delete("/push/subscribe", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ message: "endpoint is required" });

  await unregisterPushSubscription({ userId, endpoint });
  res.json({ success: true });
});

router.post("/push/mobile-token", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { token, deviceInfo } = req.body;
  if (!token) return res.status(400).json({ message: "token is required" });

  const result = await registerPushSubscription({
    userId,
    type: "expo",
    endpoint: token,
    expoToken: token,
    deviceInfo,
  });

  if (!result.success) {
    return res.status(400).json({ message: result.error });
  }

  res.json({ success: true, id: result.id });
});

router.delete("/push/mobile-token", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { token } = req.body;
  if (!token) return res.status(400).json({ message: "token is required" });

  await unregisterPushSubscription({ userId, expoToken: token });
  res.json({ success: true });
});

router.post("/push-tokens", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ message: "token is required" });

  const result = await registerPushSubscription({
    userId,
    type: "expo",
    endpoint: token,
    expoToken: token,
    deviceInfo: { platform: platform || "unknown" },
  });

  if (!result.success) {
    return res.status(400).json({ message: result.error });
  }

  res.json({ success: true, id: result.id });
});

router.post("/push/dispatch", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });

  const {
    category,
    title,
    body,
    targetUserIds,
    data,
    channel = "expo",
  } = req.body as {
    category: string;
    title: string;
    body: string;
    targetUserIds?: number[];
    data?: Record<string, unknown>;
    channel?: string;
  };

  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required" });
  }

  const isAdmin = req.permissions?.isSuperAdmin === true;

  if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
    const hasCrossUserTarget = targetUserIds.some((id) => id !== userId);
    if (hasCrossUserTarget && !isAdmin) {
      return res.status(403).json({ message: "Only administrators can send notifications to other users" });
    }
  }

  const ALLOWED_CATEGORIES = ["approvals", "production", "delivery", "kpi", "hr", "finance", "system"];
  const ALLOWED_CHANNELS = ["expo", "browser"];

  if (category && !ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(", ")}` });
  }
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return res.status(400).json({ message: `Invalid channel. Must be one of: ${ALLOWED_CHANNELS.join(", ")}` });
  }

  const recipients: number[] = Array.isArray(targetUserIds) && targetUserIds.length > 0
    ? targetUserIds
    : [userId];

  const payload = {
    title,
    body,
    data: { category, ...data },
    url: data?.screen ? `/${data.screen}` : "/notifications",
  };

  const results = await Promise.all(
    recipients.map((uid) =>
      channel === "browser"
        ? sendBrowserPush(uid, payload)
        : sendExpoPush(uid, payload)
    )
  );

  const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
  const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
  const allErrors = results.flatMap((r) => r.errors);

  res.json({
    success: totalSent > 0,
    sent: totalSent,
    failed: totalFailed,
    errors: allErrors.length > 0 ? allErrors : undefined,
  });
});

router.post("/push/test", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required" });
  if (req.permissions && !req.permissions.isSuperAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { channel = "browser", targetUserId } = req.body;
  const target = targetUserId ? Number(targetUserId) : userId;

  const payload = {
    title: "בדיקת התראה",
    body: "זוהי הודעת בדיקה מהמערכת",
    url: "/notifications",
  };

  let result;
  if (channel === "expo" || channel === "mobile") {
    result = await sendExpoPush(target, payload);
  } else {
    result = await sendBrowserPush(target, payload);
  }

  res.json(result);
});

export default router;
