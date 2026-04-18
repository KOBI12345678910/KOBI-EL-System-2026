import { Router } from "express";
import { validateSession } from "../lib/auth";

const router = Router();

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const host = u.hostname;
    return !BLOCKED_PATTERNS.some(p => p.test(host));
  } catch {
    return false;
  }
}

async function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "לא מחובר" });
  const result = await validateSession(header.slice(7));
  if (result.error || !result.user) return res.status(401).json({ error: "לא מחובר" });
  next();
}

router.post("/n8n/test-connection", requireAuth, async (req, res) => {
  const { url, apiKey } = req.body;
  if (!url || !apiKey) {
    return res.status(400).json({ success: false, error: "נדרשת כתובת URL ומפתח API" });
  }
  if (!isAllowedUrl(url)) {
    return res.status(400).json({ success: false, error: "כתובת URL אינה מותרת" });
  }
  try {
    const baseUrl = url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/v1/workflows`, {
      headers: {
        "X-N8N-API-KEY": apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return res.json({ success: false, error: `N8N החזיר שגיאה: ${response.status} ${response.statusText}` });
    }
    const data = await response.json();
    const workflows = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    const mapped = workflows.map((wf: any) => ({
      id: wf.id,
      name: wf.name,
      status: wf.active ? "active" : "paused",
      lastRun: wf.updatedAt ? new Date(wf.updatedAt).toLocaleDateString("he-IL") : "—",
      runs: 0,
    }));
    return res.json({ success: true, workflowCount: mapped.length, workflows: mapped });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return res.json({ success: false, error: "פסק הזמן עבר — לא ניתן להגיע ל-N8N" });
    }
    return res.json({ success: false, error: `שגיאת חיבור: ${err?.message || "שגיאה לא ידועה"}` });
  }
});

router.post("/n8n/workflows", requireAuth, async (req, res) => {
  const { url, apiKey } = req.body;
  if (!url || !apiKey) return res.json([]);
  if (!isAllowedUrl(url)) return res.status(400).json({ error: "כתובת URL אינה מותרת" });
  try {
    const baseUrl = url.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/v1/workflows`, {
      headers: { "X-N8N-API-KEY": apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return res.json([]);
    const data = await response.json();
    const workflows = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    return res.json(workflows.map((wf: any) => ({
      id: wf.id,
      name: wf.name,
      status: wf.active ? "active" : "paused",
      lastRun: wf.updatedAt ? new Date(wf.updatedAt).toLocaleDateString("he-IL") : "—",
      runs: 0,
    })));
  } catch {
    return res.json([]);
  }
});

router.post("/n8n/webhook", async (req, res) => {
  res.json({ received: true, timestamp: new Date().toISOString() });
});

export default router;
