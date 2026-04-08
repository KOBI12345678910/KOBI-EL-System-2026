/**
 * TechnoKoluzi ERP - Metrics Routes
 * נתיבי מטריקות, דשבורד, וניהול קאש
 *
 * Routes:
 * - GET /          Prometheus text format
 * - GET /dashboard JSON dashboard מפורט
 * - GET /cache     סטטיסטיקות קאש
 * - POST /cache/clear            ניקוי קאש מלא
 * - POST /cache/invalidate-queries  ניקוי קאש שאילתות
 */

import { Router, type IRouter } from "express";
import { getPrometheusMetrics, getMetricsDashboard } from "../lib/metrics";
import { getCacheStats, cacheClear, cacheInvalidateByTag } from "../lib/redis-client";
import { getVectorStoreStats } from "../lib/vector-store";
import { getEventStats } from "../lib/redis-event-bus";
import { getWSStats } from "../lib/websocket-server";

const router: IRouter = Router();

// ============== Prometheus Metrics ==============

/**
 * GET / - פלט Prometheus text format
 * לשימוש על ידי Prometheus scraper
 */
router.get("/", async (_req, res) => {
  try {
    const metrics = getPrometheusMetrics();
    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(metrics);
  } catch (error: any) {
    res.status(500).json({ error: "שגיאה בקבלת מטריקות", details: error.message });
  }
});

// ============== Dashboard ==============

/**
 * GET /dashboard - דשבורד JSON מקיף
 * כולל נתוני מטריקות + סטטיסטיקות ממערכות משנה
 */
router.get("/dashboard", async (_req, res) => {
  try {
    const [dashboard, vectorStats, eventStats, wsStats] = await Promise.allSettled([
      Promise.resolve(getMetricsDashboard()),
      getVectorStoreStats(),
      getEventStats(),
      Promise.resolve(getWSStats()),
    ]);

    const result: Record<string, any> = {
      ...(dashboard.status === "fulfilled" ? dashboard.value : {}),
    };

    // הוספת סטטיסטיקות ממערכות משנה
    if (vectorStats.status === "fulfilled") {
      result.vectorStore = vectorStats.value;
    }
    if (eventStats.status === "fulfilled") {
      result.eventBus = eventStats.value;
    }
    if (wsStats.status === "fulfilled") {
      result.websocketDetails = wsStats.value;
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "שגיאה בקבלת דשבורד", details: error.message });
  }
});

// ============== Cache Management ==============

/**
 * GET /cache - סטטיסטיקות קאש
 */
router.get("/cache", (_req, res) => {
  try {
    const stats = getCacheStats();
    res.json({
      success: true,
      cache: stats,
    });
  } catch (error: any) {
    res.status(500).json({ error: "שגיאה בקבלת סטטיסטיקות קאש", details: error.message });
  }
});

/**
 * POST /cache/clear - ניקוי קאש מלא
 * פעולה מסוכנת - דורשת אישור
 */
router.post("/cache/clear", (_req, res) => {
  try {
    cacheClear();
    res.json({
      success: true,
      message: "הקאש נוקה בהצלחה",
    });
  } catch (error: any) {
    res.status(500).json({ error: "שגיאה בניקוי קאש", details: error.message });
  }
});

/**
 * POST /cache/invalidate-queries - ניקוי קאש שאילתות
 * מנקה את כל רשומות הקאש עם תגית 'query'
 */
router.post("/cache/invalidate-queries", (_req, res) => {
  try {
    const count = cacheInvalidateByTag("query");
    res.json({
      success: true,
      message: `נוקו ${count} רשומות קאש שאילתות`,
      invalidated: count,
    });
  } catch (error: any) {
    res.status(500).json({ error: "שגיאה בניקוי קאש שאילתות", details: error.message });
  }
});

export default router;
