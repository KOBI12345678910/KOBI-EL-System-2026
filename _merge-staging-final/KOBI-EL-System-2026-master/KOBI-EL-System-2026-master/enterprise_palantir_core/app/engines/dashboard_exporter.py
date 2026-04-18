"""
HTML Dashboard Exporter — generates a self-contained HTML document
that visualizes the full command-center snapshot.

The generated HTML:
  - is one file (no external CSS/JS)
  - auto-refreshes every 30s via a small JS fetch
  - renders overall health as a big number with a color gauge
  - shows all 6 module health cards
  - lists the causal hotspots with their ripple-effect downstream
  - lists the AI recommendations
  - lists the top open alerts
  - renders a timeline of the last N critical events
  - is themed dark (Palantir-esque)

Usage:
  GET /command-center/{tenant_id}/dashboard.html → returns the HTML
"""

from __future__ import annotations

import html
import json
from typing import Any, Dict, List


def _fmt_num(v: Any) -> str:
    try:
        n = float(v)
        if n >= 100 or n == int(n):
            return f"{int(n)}"
        return f"{n:.1f}"
    except Exception:
        return str(v)


def _health_color(score: float) -> str:
    if score >= 85:
        return "#22c55e"
    if score >= 65:
        return "#eab308"
    if score >= 45:
        return "#f97316"
    return "#ef4444"


def _severity_color(sev: str) -> str:
    return {
        "info": "#60a5fa",
        "warning": "#eab308",
        "high": "#f97316",
        "critical": "#ef4444",
    }.get(sev, "#94a3b8")


def build_dashboard_html(snapshot: Dict[str, Any], tenant_id: str) -> str:
    overall = float(snapshot.get("overall_health_score", 0) or 0)
    overall_color = _health_color(overall)
    modules = snapshot.get("module_health", [])
    hotspots = snapshot.get("causal_hotspots", [])
    recs = snapshot.get("ai_recommendations", [])
    alerts = snapshot.get("top_open_alerts", [])
    recent = snapshot.get("recent_critical_events", [])
    by_type = snapshot.get("by_entity_type", {})

    module_cards = "\n".join(
        f"""
        <div class="card module">
          <div class="label">{html.escape(m.get('module', ''))}</div>
          <div class="big" style="color:{_health_color(float(m.get('health_score', 0)))}">{_fmt_num(m.get('health_score', 0))}</div>
          <div class="status status-{html.escape(m.get('status', ''))}">{html.escape(m.get('status', ''))}</div>
          <div class="meta">
            entities: {m.get('entity_count', 0)} ·
            at_risk: <b>{m.get('at_risk_count', 0)}</b> ·
            blocked: {m.get('blocked_count', 0)} ·
            alerts: {m.get('open_alerts_count', 0)}
          </div>
        </div>
        """
        for m in modules
    )

    hotspot_items = "\n".join(
        f"""
        <div class="hotspot sev-{html.escape(h.get('severity', 'info'))}">
          <div class="hs-head">
            <span class="sev">{html.escape(h.get('severity', ''))}</span>
            <span class="type">{html.escape(h.get('entity_type', ''))}</span>
            <span class="name">{html.escape(h.get('name', '') or h.get('entity_id', ''))}</span>
          </div>
          <div class="hs-meta">
            risk_score: <b>{_fmt_num(h.get('risk_score', 0))}</b> ·
            downstream_impact: <b>{h.get('downstream_count', 0)}</b>
          </div>
          <div class="hs-downstream">
            {'<br>'.join(
                f'→ <span class="ds-type">[{html.escape(d.get("type") or "?")}]</span> {html.escape(d.get("name") or d.get("entity_id", ""))} <span class="ds-via">via {html.escape(d.get("via", ""))}</span>'
                for d in (h.get('downstream_sample', []) or [])[:5]
            )}
          </div>
        </div>
        """
        for h in hotspots
    )

    rec_items = "\n".join(
        f"""
        <div class="rec sev-{html.escape(r.get('severity', 'info'))}">
          <div class="rec-head">
            <span class="sev">{html.escape(r.get('severity', ''))}</span>
            <span class="title">{html.escape(r.get('title', ''))}</span>
            <span class="conf">conf {_fmt_num((r.get('confidence', 0) or 0) * 100)}%</span>
          </div>
          <div class="rec-body">{html.escape(r.get('reasoning', ''))}</div>
          <div class="rec-action">→ {html.escape(r.get('suggested_action', '') or '')}</div>
        </div>
        """
        for r in recs
    )

    alert_items = "\n".join(
        f"""
        <div class="alert sev-{html.escape(a.get('severity', 'info'))}">
          <span class="sev">{html.escape(a.get('severity', ''))}</span>
          <span class="title">{html.escape(a.get('title', ''))}</span>
          <div class="body">{html.escape(a.get('description', '') or '')}</div>
        </div>
        """
        for a in alerts
    )

    timeline_items = "\n".join(
        f"""
        <div class="event sev-{html.escape(e.get('severity', 'info'))}">
          <span class="ts">{html.escape(str(e.get('created_at', ''))[:19])}</span>
          <span class="type">{html.escape(e.get('type', ''))}</span>
          <span class="ent">{html.escape(e.get('entity_type', ''))}:{html.escape(e.get('entity_id', '') or '')}</span>
        </div>
        """
        for e in recent
    )

    by_type_items = "\n".join(
        f'<li><span class="k">{html.escape(k)}</span><span class="v">{v}</span></li>'
        for k, v in by_type.items()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Command Center — {html.escape(tenant_id)}</title>
  <style>
    :root {{
      --bg: #0a0e1a;
      --panel: #0f1420;
      --panel-2: #141b2d;
      --border: #1f2937;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #06b6d4;
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
      --blue: #60a5fa;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; padding: 24px; background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
    }}
    h1 {{ font-size: 18px; font-weight: 600; margin: 0 0 4px; }}
    h2 {{ font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 32px 0 12px; }}
    .header {{ display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }}
    .header .sub {{ color: var(--muted); font-size: 12px; }}
    .overall {{ display: grid; grid-template-columns: 280px 1fr; gap: 24px; }}
    .gauge {{
      background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
      padding: 24px; text-align: center;
    }}
    .gauge .num {{ font-size: 72px; font-weight: 700; line-height: 1; color: {overall_color}; }}
    .gauge .label {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 8px; }}
    .gauge .stats {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; font-size: 12px; }}
    .gauge .stats div {{ text-align: left; color: var(--muted); }}
    .gauge .stats b {{ color: var(--text); font-size: 16px; display: block; }}
    .modules {{
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;
    }}
    .card.module {{
      background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
      padding: 16px;
    }}
    .card.module .label {{ color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }}
    .card.module .big {{ font-size: 36px; font-weight: 700; margin: 4px 0; }}
    .card.module .status {{ font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }}
    .card.module .status-healthy {{ color: var(--green); }}
    .card.module .status-warning {{ color: var(--yellow); }}
    .card.module .status-critical {{ color: var(--red); }}
    .card.module .meta {{ color: var(--muted); font-size: 11px; }}
    .hotspot, .rec, .alert, .event {{
      background: var(--panel); border-left: 4px solid var(--muted); border-radius: 4px;
      padding: 12px 16px; margin-bottom: 8px;
    }}
    .hotspot.sev-critical, .rec.sev-critical, .alert.sev-critical {{ border-left-color: var(--red); }}
    .hotspot.sev-high, .rec.sev-high, .alert.sev-high {{ border-left-color: var(--orange); }}
    .hotspot.sev-warning, .rec.sev-warning, .alert.sev-warning {{ border-left-color: var(--yellow); }}
    .hotspot.sev-info, .rec.sev-info, .alert.sev-info {{ border-left-color: var(--blue); }}
    .hs-head, .rec-head {{ display: flex; gap: 12px; align-items: baseline; margin-bottom: 4px; }}
    .sev {{ text-transform: uppercase; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 3px; background: var(--panel-2); }}
    .hs-head .type {{ color: var(--muted); font-size: 12px; }}
    .hs-head .name, .rec-head .title {{ font-weight: 600; flex: 1; }}
    .rec-head .conf {{ color: var(--muted); font-size: 11px; }}
    .hs-meta {{ color: var(--muted); font-size: 11px; margin-bottom: 4px; }}
    .hs-downstream {{ color: var(--text); font-size: 12px; line-height: 1.8; }}
    .hs-downstream .ds-type {{ color: var(--accent); }}
    .hs-downstream .ds-via {{ color: var(--muted); font-size: 11px; }}
    .rec-body {{ color: var(--muted); font-size: 12px; margin: 4px 0; line-height: 1.5; }}
    .rec-action {{ color: var(--accent); font-size: 12px; font-weight: 500; }}
    .alert .title {{ font-weight: 600; }}
    .alert .body {{ color: var(--muted); font-size: 12px; margin-top: 4px; }}
    .event {{ display: flex; gap: 16px; padding: 8px 16px; font-size: 12px; }}
    .event .ts {{ color: var(--muted); font-family: monospace; }}
    .event .type {{ font-weight: 600; color: var(--accent); }}
    .event .ent {{ color: var(--muted); margin-left: auto; font-family: monospace; }}
    .by-type {{ list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }}
    .by-type li {{
      background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
      padding: 10px 14px; display: flex; justify-content: space-between;
    }}
    .by-type .k {{ color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }}
    .by-type .v {{ font-weight: 700; }}
    .empty {{ color: var(--muted); font-size: 12px; padding: 12px; font-style: italic; }}
    footer {{ margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; text-align: center; }}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Command Center · {html.escape(tenant_id)}</h1>
      <div class="sub">Generated at {html.escape(str(snapshot.get('generated_at', '')))}</div>
    </div>
    <div class="sub">Palantir-style Enterprise Core · {_fmt_num(overall)}/100</div>
  </div>

  <div class="overall">
    <div class="gauge">
      <div class="num">{_fmt_num(overall)}</div>
      <div class="label">Overall Health Score</div>
      <div class="stats">
        <div><b>{snapshot.get('total_objects', 0)}</b>objects</div>
        <div><b>{snapshot.get('at_risk_entities', 0)}</b>at risk</div>
        <div><b>{snapshot.get('blocked_entities', 0)}</b>blocked</div>
        <div><b>{snapshot.get('total_alerts', 0)}</b>alerts</div>
        <div><b>{snapshot.get('active_workflows', 0)}</b>workflows</div>
        <div><b>{snapshot.get('stalled_workflows', 0)}</b>stalled</div>
      </div>
    </div>

    <div>
      <h2>Module Health</h2>
      <div class="modules">
        {module_cards or '<div class="empty">No modules configured.</div>'}
      </div>
    </div>
  </div>

  <h2>Causal Hotspots ({len(hotspots)})</h2>
  {hotspot_items or '<div class="empty">No hotspots detected.</div>'}

  <h2>AI Recommendations ({len(recs)})</h2>
  {rec_items or '<div class="empty">No recommendations.</div>'}

  <h2>Top Open Alerts ({len(alerts)})</h2>
  {alert_items or '<div class="empty">No open alerts.</div>'}

  <h2>Recent Critical Events ({len(recent)})</h2>
  {timeline_items or '<div class="empty">No critical events.</div>'}

  <h2>Entity Breakdown</h2>
  <ul class="by-type">
    {by_type_items or '<li class="empty">No entities.</li>'}
  </ul>

  <footer>
    Command Center · Enterprise Palantir-style Core · Auto-refresh every 30s
  </footer>

  <script>
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
"""
