// ══════════════════════════════════════════════════════════════════
// MODULE: Crisis Response Planner
// מודול שמפעיל תגובת משבר אוטונומית כשמשהו קורס
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מאזין להתראות קריטיות (level === "critical")
//   2. לכל משבר — מזהה את הסוג (supply / financial / reputation / legal / operational)
//   3. מפעיל playbook מתאים
//   4. יוצר צעדים מיידיים + תוכנית 24 שעות + חקירת שורש
//   5. שומר את כל התגובה לצורכי לימוד עתידי

const CrisisResponsePlannerModule = {
  name: "crisis_response_planner",
  description: "Autonomously plans response to critical situations",

  _playbooks: {
    supply_chain_failure: {
      immediate_steps: [
        "Identify affected open orders",
        "Contact 2 backup suppliers for emergency order",
        "Notify customers of potential delay with honest ETA",
        "Offer 5% discount as goodwill",
      ],
      within_24h: [
        "Sign backup supplier agreement",
        "Update CRM with new supply chain risk flag",
        "Review long-term supplier diversification",
      ],
      root_cause_investigation: [
        "Interview primary supplier",
        "Review original contract clauses",
        "Document failure for future audit",
      ],
    },
    cashflow_critical: {
      immediate_steps: [
        "Pause all non-essential spending",
        "Call top 5 outstanding receivables",
        "Request 30-day extension from top 3 payables",
        "Alert CFO/owner immediately",
      ],
      within_24h: [
        "Emergency LOC application",
        "Draft staff communication (no layoffs yet)",
        "Liquidate slow-moving inventory",
      ],
      root_cause_investigation: [
        "Full AR aging report",
        "Identify over-forecasting in sales",
        "Tighten payment terms going forward",
      ],
    },
    reputation_attack: {
      immediate_steps: [
        "Screenshot the complaint / review",
        "Do NOT delete or hide publicly",
        "Craft empathetic public response within 2 hours",
        "Reach out privately to the affected customer",
      ],
      within_24h: [
        "Resolve the underlying issue or offer full refund",
        "Get the reviewer to update rating",
        "Monitor for piling-on effect on social media",
      ],
      root_cause_investigation: [
        "Review internal process that caused the issue",
        "Update service quality protocols",
      ],
    },
    legal_threat: {
      immediate_steps: [
        "Preserve all related documents (DO NOT delete)",
        "Contact legal counsel within 4 hours",
        "Stop all communication with opposing party",
        "Document everything in a privileged folder",
      ],
      within_24h: [
        "Formal legal response",
        "Assess settlement vs. defend calculus",
        "Notify insurance if applicable",
      ],
      root_cause_investigation: [
        "Full legal audit of the situation",
        "Update contracts to prevent recurrence",
      ],
    },
    operational_outage: {
      immediate_steps: [
        "Identify affected systems / services",
        "Activate backup / manual workaround",
        "Notify affected customers proactively",
        "Escalate to IT / operations lead",
      ],
      within_24h: [
        "Restore primary system",
        "Root cause analysis",
        "Deploy fix to prevent recurrence",
      ],
      root_cause_investigation: [
        "Full post-mortem document",
        "Update runbook with new scenario",
      ],
    },
  },

  _classifyCrisis(alert) {
    const text = `${alert.title} ${alert.message}`.toLowerCase();
    if (/supply|supplier|material|stock|inventory|ספק|חומר|מלאי/i.test(text)) return "supply_chain_failure";
    if (/cash|cashflow|payment|overdue|receivable|חוב|מזומן|תזרים/i.test(text)) return "cashflow_critical";
    if (/review|reputation|social|complaint|ביקורת|רפוטציה|תלונה/i.test(text)) return "reputation_attack";
    if (/legal|lawsuit|subpoena|cease|משפט|תביעה/i.test(text)) return "legal_threat";
    if (/outage|down|error|crash|offline|מושבת|קרס/i.test(text)) return "operational_outage";
    return "operational_outage"; // default
  },

  async run(state, brain, alerts) {
    const unacked = alerts.getUnacknowledged();
    const criticalAlerts = unacked.filter(a => a.level === "critical");
    if (criticalAlerts.length === 0) return;

    for (const alert of criticalAlerts) {
      const crisisType = this._classifyCrisis(alert);
      const playbook = this._playbooks[crisisType];

      // Ask AI to contextualize the playbook to this specific situation
      const contextualized = await brain.analyze(
        {
          alert: { title: alert.title, message: alert.message, data: alert.data },
          crisis_type: crisisType,
          generic_playbook: playbook,
        },
        "התאם את ה-playbook למצב הספציפי. מה צריך להיות שונה? מי צריך להיות מעורב? מה ה-SLA לכל צעד?"
      );

      const response = {
        crisis_id: `crisis_${Date.now()}_${alert.id}`,
        alert_id: alert.id,
        alert_title: alert.title,
        crisis_type: crisisType,
        playbook: playbook,
        contextualized_recommendations: contextualized?.recommendations || [],
        contextualized_insights: contextualized?.insights || [],
        declared_at: new Date().toISOString(),
        status: "active",
      };

      state.addMemory("longTerm", {
        type: "crisis_response",
        crisis_id: response.crisis_id,
        crisis_type: crisisType,
        alert_title: alert.title,
      });

      state.update(`modules.crisis_response_planner.active_crises.${response.crisis_id}`, response);

      alerts.addAlert(
        "critical",
        `CRISIS RESPONSE ACTIVATED — ${crisisType}`,
        `Playbook ${crisisType} activated. First step: ${playbook.immediate_steps[0]}`,
        response
      );

      // Mark the triggering alert as acknowledged — we've responded
      alert.acknowledged = true;
    }
  },
};

module.exports = CrisisResponsePlannerModule;
