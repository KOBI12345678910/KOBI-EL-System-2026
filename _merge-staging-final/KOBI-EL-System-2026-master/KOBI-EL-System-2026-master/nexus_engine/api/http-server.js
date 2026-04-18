// ══════════════════════════════════════════════════════════════════
// HTTP API SERVER — ממשק REST חיצוני למנוע NEXUS
// ══════════════════════════════════════════════════════════════════
//
// Endpoints:
//   GET  /                      — health + stats
//   GET  /state                 — full state snapshot (careful, can be large)
//   GET  /state/:key            — get state at key (dot-notation)
//   GET  /goals                 — list goals
//   POST /goals/:id/update      — { current: number }
//   GET  /memory/:type          — short-term / long-term / patterns / mistakes / successes
//   GET  /alerts                — list alerts
//   GET  /alerts/unacknowledged — list unacked alerts
//   POST /cycle/run-now         — force run a cycle synchronously
//   GET  /modules               — list registered modules + health
//   POST /decisions/simulate    — { situation, options } → decision
//   GET  /dashboard.html        — self-contained HTML dashboard
//
// Zero external deps — uses Node.js built-in http module only.

const http = require("http");
const url = require("url");
const fs = require("fs");

function buildDashboardHTML(state, modules, alerts, goals) {
  const cycles = state.get?.("totalCycles") ?? 0;
  const decisions = state.get?.("totalDecisions") ?? 0;
  const improvements = state.get?.("totalImprovements") ?? 0;
  const phase = state.get?.("currentPhase") || "unknown";
  const startedAt = state.get?.("startedAt") || "unknown";
  const lastCycle = state.get?.("lastCycleAt") || "never";

  const patterns = state.get?.("memory.patterns") || [];
  const mistakes = state.get?.("memory.mistakes") || [];
  const successes = state.get?.("memory.successes") || [];
  const shortTerm = state.get?.("memory.shortTerm") || [];

  const moduleList = Array.from(modules?.modules?.keys() || []);

  const unacked = alerts?.getUnacknowledged?.() || [];
  const goalList = goals?.goals || [];

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>NEXUS Engine Dashboard</title>
<style>
  body { background: #0a0e1a; color: #e5e7eb; font-family: -apple-system, Segoe UI, Arial; padding: 24px; margin: 0; }
  h1 { font-size: 24px; margin: 0 0 4px 0; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin: 32px 0 12px 0; }
  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; border-bottom: 1px solid #1f2937; margin-bottom: 24px; }
  .sub { color: #94a3b8; font-size: 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .kpi { background: #0f1420; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; }
  .kpi .label { color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .kpi .num { font-size: 36px; font-weight: 700; margin-top: 4px; color: #06b6d4; }
  .kpi .sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .card { background: #0f1420; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #141b2d; }
  .chip.critical { color: #ef4444; }
  .chip.warning { color: #eab308; }
  .chip.info { color: #60a5fa; }
  .chip.success { color: #22c55e; }
  .goal-bar { height: 6px; background: #1f2937; border-radius: 3px; margin-top: 6px; overflow: hidden; }
  .goal-bar .fill { height: 100%; background: #06b6d4; }
  .muted { color: #6b7280; font-size: 11px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 6px 0; border-bottom: 1px solid #141b2d; font-size: 12px; }
  .empty { color: #6b7280; font-style: italic; padding: 12px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #1f2937; text-align: center; color: #6b7280; font-size: 11px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>NEXUS Autonomous Engine</h1>
    <div class="sub">Phase: <b>${phase}</b> • Started: ${startedAt}</div>
  </div>
  <div class="sub">Last cycle: ${lastCycle}</div>
</div>

<h2>Key Metrics</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="label">Total Cycles</div><div class="num">${cycles}</div></div>
  <div class="kpi"><div class="label">Total Decisions</div><div class="num">${decisions}</div></div>
  <div class="kpi"><div class="label">Self Improvements</div><div class="num">${improvements}</div></div>
  <div class="kpi"><div class="label">Patterns Discovered</div><div class="num">${patterns.length}</div></div>
  <div class="kpi"><div class="label">Mistakes Learned</div><div class="num">${mistakes.length}</div></div>
  <div class="kpi"><div class="label">Successes Replicated</div><div class="num">${successes.length}</div></div>
  <div class="kpi"><div class="label">Modules Running</div><div class="num">${moduleList.length}</div></div>
  <div class="kpi"><div class="label">Unacked Alerts</div><div class="num">${unacked.length}</div></div>
</div>

<h2>Goals (${goalList.length})</h2>
${goalList.length === 0 ? '<div class="empty">No goals configured</div>' : ''}
${goalList.map(g => {
  const pct = Math.min(100, (g.current / g.target) * 100);
  return `
<div class="card">
  <div>${g.title} <span class="chip ${g.priority || 'info'}">${g.priority || ''}</span></div>
  <div class="muted">${g.current} / ${g.target} ${g.unit}</div>
  <div class="goal-bar"><div class="fill" style="width: ${pct}%;"></div></div>
</div>`;
}).join('')}

<h2>Modules (${moduleList.length})</h2>
<div class="card">
<ul>
${moduleList.map(m => `<li><b>${m}</b></li>`).join('') || '<li class="empty">no modules</li>'}
</ul>
</div>

<h2>Recent Alerts (${unacked.length} unacked)</h2>
<div class="card">
${unacked.length === 0 ? '<div class="empty">no unacked alerts</div>' : ''}
${unacked.slice(0, 10).map(a => `
<div style="padding: 8px 0; border-bottom: 1px solid #141b2d;">
  <span class="chip ${a.level}">${a.level}</span>
  <b>${a.title}</b>
  <div class="muted">${a.message}</div>
</div>
`).join('')}
</div>

<h2>Recent Activity (${shortTerm.length} items)</h2>
<div class="card">
<ul>
${shortTerm.slice(-10).reverse().map(m => `<li>${m.type || 'event'} — <span class="muted">${m.timestamp}</span></li>`).join('') || '<li class="empty">no activity</li>'}
</ul>
</div>

<footer>NEXUS Autonomous Engine • auto-refresh every 10s</footer>
<script>setTimeout(() => location.reload(), 10000);</script>
</body>
</html>`;
}

function createHttpServer(engine) {
  return http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const method = req.method.toUpperCase();

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    function json(status, obj) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj, null, 2));
    }

    function html(status, body) {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
    }

    async function parseBody() {
      return new Promise(resolve => {
        let data = "";
        req.on("data", chunk => (data += chunk));
        req.on("end", () => {
          try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); }
        });
      });
    }

    try {
      // GET /
      if (pathname === "/" && method === "GET") {
        return json(200, {
          app: "NEXUS Autonomous Engine",
          version: "1.0.0",
          status: "running",
          phase: engine.state.get("currentPhase"),
          total_cycles: engine.state.get("totalCycles") ?? 0,
          total_decisions: engine.state.get("totalDecisions") ?? 0,
          total_improvements: engine.state.get("totalImprovements") ?? 0,
          uptime_ms: Date.now() - new Date(engine.state.get("startedAt") || Date.now()).getTime(),
          modules_registered: Array.from(engine.modules.modules.keys()),
          goals_active: engine.goals.goals.filter(g => g.status === "active").length,
          alerts_unacked: engine.alerts.getUnacknowledged().length,
        });
      }

      // GET /dashboard.html
      if (pathname === "/dashboard.html" && method === "GET") {
        return html(200, buildDashboardHTML(engine.state, engine.modules, engine.alerts, engine.goals));
      }

      // GET /state
      if (pathname === "/state" && method === "GET") {
        return json(200, engine.state.state);
      }

      // GET /state/:key
      if (pathname.startsWith("/state/") && method === "GET") {
        const key = decodeURIComponent(pathname.replace("/state/", ""));
        const value = engine.state.get(key);
        return json(200, { key, value });
      }

      // GET /goals
      if (pathname === "/goals" && method === "GET") {
        return json(200, engine.goals.goals);
      }

      // POST /goals/:id/update
      const goalMatch = pathname.match(/^\/goals\/([^/]+)\/update$/);
      if (goalMatch && method === "POST") {
        const body = await parseBody();
        engine.goals.updateGoal(goalMatch[1], body.current);
        const goal = engine.goals.goals.find(g => g.id === goalMatch[1]);
        return json(200, { ok: true, goal });
      }

      // GET /memory/:type
      const memMatch = pathname.match(/^\/memory\/([^/]+)$/);
      if (memMatch && method === "GET") {
        const type = memMatch[1];
        const limit = parseInt(parsed.query.limit) || 50;
        const memories = engine.state.get(`memory.${type}`) || [];
        return json(200, { type, count: memories.length, items: memories.slice(-limit) });
      }

      // GET /alerts
      if (pathname === "/alerts" && method === "GET") {
        return json(200, engine.alerts.alerts);
      }

      // GET /alerts/unacknowledged
      if (pathname === "/alerts/unacknowledged" && method === "GET") {
        return json(200, engine.alerts.getUnacknowledged());
      }

      // POST /cycle/run-now
      if (pathname === "/cycle/run-now" && method === "POST") {
        await engine.runCycle();
        return json(200, {
          ok: true,
          cycle: engine.state.get("totalCycles"),
          decisions: engine.state.get("totalDecisions"),
          alerts_unacked: engine.alerts.getUnacknowledged().length,
        });
      }

      // GET /modules
      if (pathname === "/modules" && method === "GET") {
        const modules = {};
        for (const name of engine.modules.modules.keys()) {
          modules[name] = engine.state.get(`modules.${name}`);
        }
        return json(200, modules);
      }

      // POST /decisions/simulate
      if (pathname === "/decisions/simulate" && method === "POST") {
        const body = await parseBody();
        const decision = await engine.brain.makeDecision(
          body.situation || {},
          body.options || ["continue", "stop"],
          body.context || {}
        );
        return json(200, decision || { error: "no decision" });
      }

      // 404
      return json(404, { error: "not found", path: pathname });
    } catch (err) {
      return json(500, { error: err.message, stack: err.stack });
    }
  });
}

function startHttpServer(engine, port = 3030) {
  const server = createHttpServer(engine);
  server.listen(port, () => {
    console.log(`\n[NEXUS API] HTTP server listening on http://localhost:${port}`);
    console.log(`[NEXUS API] Dashboard: http://localhost:${port}/dashboard.html`);
    console.log(`[NEXUS API] State: http://localhost:${port}/state`);
  });
  return server;
}

module.exports = { createHttpServer, startHttpServer, buildDashboardHTML };
