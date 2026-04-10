// ══════════════════════════════════════════════════════════════════
// PYTHON PLATFORM BRIDGE
// גשר לפלטפורמת enterprise_palantir_core (Python/FastAPI)
// ══════════════════════════════════════════════════════════════════
//
// Nexus (Node.js) מתקשר עם enterprise_palantir_core (Python) דרך HTTP.
// משתמש בקריאות fetch נטיביות (Node 18+) — אין תלויות חיצוניות.
//
// הפלטפורמה חושפת:
//   GET  /command-center/{tenant}/snapshot      — תמונת מצב
//   GET  /analytics/{tenant}/company-pl         — P&L מלא
//   GET  /analytics/{tenant}/risk-leaderboard   — דירוג סיכון
//   GET  /intelligence/{tenant}/anomalies       — זיהוי חריגות
//   POST /platform/simulate                     — what-if
//   GET  /ai/operator/stats                     — סטטיסטיקות הסוכן הפייתון
//   POST /ai/operator/tick-now                  — הרצת tick ידנית
//
// ה-bridge הזה מאפשר ל-NEXUS לשלוח אלה ולשלב את המידע בהחלטות שלו,
// כך ששני ה"מוחות" (Node.js + Python) משתפים פעולה.

const DEFAULT_BASE = process.env.PALANTIR_BASE_URL || "http://localhost:8000";
const DEFAULT_TENANT = process.env.PALANTIR_TENANT || "techno_kol_uzi";
const FETCH_TIMEOUT_MS = 10_000;

// Polyfill fetch if Node < 18
let fetchImpl;
try {
  fetchImpl = globalThis.fetch || require("node-fetch");
} catch (e) {
  fetchImpl = null;
}

async function fetchJson(url, options = {}) {
  if (!fetchImpl) {
    return { error: "fetch not available — upgrade to Node 18+ or npm install node-fetch" };
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, {
      ...options,
      signal: controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) {
      return { error: `HTTP ${res.status}`, status: res.status };
    }
    return await res.json();
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    return { error: err.message || String(err), unreachable: true };
  }
}

class PalantirBridge {
  constructor(baseUrl = DEFAULT_BASE, tenant = DEFAULT_TENANT) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.tenant = tenant;
  }

  async healthCheck() {
    return fetchJson(`${this.baseUrl}/`);
  }

  // Command Center
  async getSnapshot(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/command-center/${tenant}/snapshot`);
  }

  async getHealth(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/command-center/${tenant}/health`);
  }

  async getHotspots(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/command-center/${tenant}/hotspots`);
  }

  // Analytics
  async getCompanyPL(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/analytics/${tenant}/company-pl`);
  }

  async getCapacity(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/analytics/${tenant}/capacity`);
  }

  async getRiskLeaderboard(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/analytics/${tenant}/risk-leaderboard`);
  }

  async getSLAReport(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/analytics/${tenant}/sla`);
  }

  // Intelligence
  async getAnomalies(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/intelligence/${tenant}/anomalies`);
  }

  async semanticSearch(query, tenant = this.tenant, topK = 10) {
    const q = encodeURIComponent(query);
    return fetchJson(`${this.baseUrl}/intelligence/${tenant}/search?q=${q}&top_k=${topK}`);
  }

  async getDataQuality(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/intelligence/${tenant}/data-quality`);
  }

  // Ingest
  async ingestRecord(record) {
    return fetchJson(`${this.baseUrl}/ingest/record`, {
      method: "POST",
      body: JSON.stringify(record),
    });
  }

  // Simulation
  async simulate(tenantId, changes, maxDepth = 4) {
    return fetchJson(`${this.baseUrl}/platform/simulate`, {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId, changes, max_depth: maxDepth }),
    });
  }

  // AI Operator (the Python autonomous brain)
  async getOperatorStats() {
    return fetchJson(`${this.baseUrl}/ai/operator/stats`);
  }

  async runPythonOperatorTick() {
    return fetchJson(`${this.baseUrl}/ai/operator/tick-now`, { method: "POST" });
  }

  async getExecutiveBriefing(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/ai/briefing/${tenant}`);
  }

  // Causal reasoning
  async buildCausalDAG(tenant = this.tenant) {
    return fetchJson(`${this.baseUrl}/ai/causal/build/${tenant}`, { method: "POST" });
  }

  async causalQuery(tenantId, treatment, outcome) {
    return fetchJson(`${this.baseUrl}/ai/causal/query`, {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId, treatment, outcome }),
    });
  }
}

// ── NEXUS MODULE: sync with Python platform ──
const PalantirSyncModule = {
  name: "palantir_sync",
  description: "Syncs state from the enterprise_palantir_core Python platform",

  async run(state, brain, alerts) {
    const bridge = new PalantirBridge();

    // Health check first
    const health = await bridge.healthCheck();
    if (health.error) {
      // Python platform not reachable — log quietly, don't raise alert every cycle
      state.update("modules.palantir_sync.status", "unreachable");
      state.update("modules.palantir_sync.last_error", health.error);
      return;
    }

    // Get command center snapshot
    const snapshot = await bridge.getSnapshot();
    if (!snapshot.error) {
      state.update("modules.palantir_sync.last_snapshot", {
        overall_health: snapshot.overall_health_score,
        total_objects: snapshot.total_objects,
        at_risk: snapshot.at_risk_entities,
        critical_alerts: (snapshot.top_open_alerts || []).length,
        fetched_at: new Date().toISOString(),
      });

      // Translate critical Python alerts into Nexus alerts
      for (const alert of (snapshot.top_open_alerts || []).slice(0, 3)) {
        if (alert.severity === "critical") {
          alerts.addAlert(
            "critical",
            `[Palantir] ${alert.title}`,
            alert.description || "Critical alert from enterprise_palantir_core",
            { source: "palantir_bridge", alert_id: alert.id }
          );
        }
      }
    }

    // Get Python-side AI operator stats
    const pyOperator = await bridge.getOperatorStats();
    if (!pyOperator.error) {
      state.update("modules.palantir_sync.python_operator", pyOperator);
    }

    state.update("modules.palantir_sync.status", "connected");
  },
};

module.exports = { PalantirBridge, PalantirSyncModule, fetchJson };
