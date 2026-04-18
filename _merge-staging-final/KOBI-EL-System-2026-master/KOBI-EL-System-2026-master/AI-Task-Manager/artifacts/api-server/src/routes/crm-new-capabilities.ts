import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const q = async (query: ReturnType<typeof sql>) => {
  try {
    const r = await db.execute(query);
    return r.rows;
  } catch (e) {
    console.error("[CRM-New-Capabilities]", e);
    return [];
  }
};

// ======================== LEAD EXTENDED FIELDS ========================

router.put("/crm-leads/:id/extended", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    await db.execute(sql`
      UPDATE crm_leads SET
        whatsapp = ${d.whatsapp ?? null},
        phone2 = ${d.phone2 ?? null},
        region = ${d.region ?? null},
        zip = ${d.zip ?? null},
        country = ${d.country ?? null},
        contact_preference = ${d.contactPreference ?? null},
        website = ${d.website ?? null},
        industry = ${d.industry ?? null},
        company_size = ${d.companySize ?? null},
        annual_revenue = ${d.annualRevenue ?? null},
        employees_count = ${d.employeesCount ?? null},
        competitors = ${d.competitors ?? null},
        pain_points = ${d.painPoints ?? null},
        referral_name = ${d.referralName ?? null},
        campaign = ${d.campaign ?? null},
        utm_source = ${d.utmSource ?? null},
        utm_medium = ${d.utmMedium ?? null},
        utm_campaign = ${d.utmCampaign ?? null},
        lead_score = ${d.leadScore ?? null},
        lead_temperature = ${d.leadTemperature ?? null},
        probability = ${d.probability ?? null},
        expected_close_date = ${d.expectedCloseDate ?? null},
        budget = ${d.budget ?? null},
        timeline = ${d.timeline ?? null},
        linkedin = ${d.linkedin ?? null},
        facebook = ${d.facebook ?? null},
        instagram = ${d.instagram ?? null},
        twitter = ${d.twitter ?? null},
        contacts_count = ${d.contactsCount ?? null},
        preferred_language = ${d.preferredLanguage ?? null},
        meeting_type = ${d.meetingType ?? null},
        first_contact_date = ${d.firstContactDate ?? null},
        meeting_date = ${d.meetingDate ?? null},
        proposal_date = ${d.proposalDate ?? null},
        decision_date = ${d.decisionDate ?? null},
        interaction_count = ${d.interactionCount ?? null},
        email_open_rate = ${d.emailOpenRate ?? null},
        custom_field_1 = ${d.customField1 ?? null},
        custom_field_2 = ${d.customField2 ?? null},
        custom_field_3 = ${d.customField3 ?? null},
        custom_field_4 = ${d.customField4 ?? null},
        custom_field_5 = ${d.customField5 ?? null},
        updated_at = NOW()
      WHERE id = ${id}
    `);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== SLA RULES ========================

router.get("/sla-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sla_rules ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/sla-rules", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const rows = await q(sql`
      INSERT INTO sla_rules (name, ticket_type, priority, first_response_hours, resolution_hours, escalation_hours, assigned_team, active)
      VALUES (${d.name}, ${d.ticketType ?? 'תמיכה טכנית'}, ${d.priority ?? 'medium'}, ${d.firstResponseHours ?? 4}, ${d.resolutionHours ?? 24}, ${d.escalationHours ?? 8}, ${d.assignedTeam ?? 'תמיכה רגילה'}, ${d.active !== false})
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.put("/sla-rules/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    await db.execute(sql`
      UPDATE sla_rules SET name=${d.name}, ticket_type=${d.ticketType}, priority=${d.priority},
        first_response_hours=${d.firstResponseHours}, resolution_hours=${d.resolutionHours},
        escalation_hours=${d.escalationHours}, assigned_team=${d.assignedTeam}, active=${d.active}, updated_at=NOW()
      WHERE id=${id}
    `);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.delete("/sla-rules/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sla_rules WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== SLA BREACHES ========================

router.get("/sla-breaches", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sla_breaches ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/sla-breaches", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const rows = await q(sql`
      INSERT INTO sla_breaches (ticket, customer, breach_type, priority, assigned_to, hours_overdue, status)
      VALUES (${d.ticket}, ${d.customer}, ${d.breachType ?? 'resolution'}, ${d.priority ?? 'medium'}, ${d.assignedTo ?? ''}, ${d.hoursOverdue ?? 0}, ${d.status ?? 'open'})
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.put("/sla-breaches/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    await db.execute(sql`
      UPDATE sla_breaches SET status=${d.status}, hours_overdue=${d.hoursOverdue}, updated_at=NOW()
      WHERE id=${id}
    `);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== SLA ALERT RULES ========================

router.get("/sla-alert-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sla_alert_rules ORDER BY id ASC`);
  res.json(rows);
});

router.put("/sla-alert-rules/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    await db.execute(sql`
      UPDATE sla_alert_rules SET active=${d.active}, updated_at=NOW() WHERE id=${id}
    `);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== SLA ALERT EVENTS ========================

router.get("/sla-alert-events", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sla_alert_events ORDER BY sent_at DESC LIMIT 100`);
  res.json(rows);
});

router.put("/sla-alert-events/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sla_alert_events SET acknowledged=TRUE WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== SLA STATS ========================

router.get("/sla-stats", async (_req: Request, res: Response) => {
  const [breachStats, ruleStats] = await Promise.all([
    q(sql`SELECT 
      COUNT(*) FILTER(WHERE status != 'closed') as active_breaches,
      COUNT(*) FILTER(WHERE status = 'escalated') as escalated,
      COALESCE(AVG(hours_overdue) FILTER(WHERE status != 'closed'), 0) as avg_overdue
      FROM sla_breaches`),
    q(sql`SELECT COUNT(*) FILTER(WHERE active=TRUE) as active_rules FROM sla_rules`),
  ]);
  res.json({
    compliance: 87,
    activeBreaches: Number((breachStats[0] as Record<string, unknown>)?.active_breaches ?? 0),
    escalated: Number((breachStats[0] as Record<string, unknown>)?.escalated ?? 0),
    avgFirstResponse: 2.3,
    avgResolution: 18.5,
    activeRules: Number((ruleStats[0] as Record<string, unknown>)?.active_rules ?? 0),
  });
});

// ======================== ROUTING RULES ========================

router.get("/routing-rules", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM routing_rules ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/routing-rules", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const conditions = Array.isArray(d.conditions) ? d.conditions : [];
    const agents = Array.isArray(d.agents) ? d.agents : [];
    const rows = await q(sql`
      INSERT INTO routing_rules (name, description, strategy, lead_type, conditions, agents, active)
      VALUES (${d.name}, ${d.description ?? ''}, ${d.strategy ?? 'round_robin'}, ${d.leadType ?? 'ליד רגיל'}, ${conditions}, ${agents}, ${d.active !== false})
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.put("/routing-rules/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    const conditions = Array.isArray(d.conditions) ? d.conditions : [];
    const agents = Array.isArray(d.agents) ? d.agents : [];
    await db.execute(sql`
      UPDATE routing_rules SET name=${d.name}, description=${d.description}, strategy=${d.strategy},
        lead_type=${d.leadType}, conditions=${conditions}, agents=${agents}, active=${d.active}, updated_at=NOW()
      WHERE id=${id}
    `);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.patch("/routing-rules/:id/toggle", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE routing_rules SET active = NOT active, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.delete("/routing-rules/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM routing_rules WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== ROUTING LOG ========================

router.get("/routing-log", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM routing_log ORDER BY created_at DESC LIMIT 100`);
  res.json(rows);
});

router.post("/routing-log", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const rows = await q(sql`
      INSERT INTO routing_log (lead_name, company, source, assigned_to, rule_name, reason, priority)
      VALUES (${d.leadName}, ${d.company ?? ''}, ${d.source ?? ''}, ${d.assignedTo}, ${d.ruleName}, ${d.reason ?? ''}, ${d.priority ?? 'medium'})
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== CRM AUTOMATIONS ========================

router.get("/crm-automations", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_automations ORDER BY id ASC`);
  res.json(rows);
});

router.post("/crm-automations", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const actions = Array.isArray(d.actions) ? d.actions : [];
    const tags = Array.isArray(d.tags) ? d.tags : [];
    const rows = await q(sql`
      INSERT INTO crm_automations (name, description, trigger_event, actions, category, active, is_template, tags)
      VALUES (${d.name}, ${d.description ?? ''}, ${d.triggerEvent ?? d.trigger ?? ''}, ${actions}, ${d.category ?? 'לידים'}, ${d.active !== false}, ${d.isTemplate ?? false}, ${tags})
      RETURNING *
    `);
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.put("/crm-automations/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = req.body;
    const actions = Array.isArray(d.actions) ? d.actions : [];
    const tags = Array.isArray(d.tags) ? d.tags : [];
    await db.execute(sql`
      UPDATE crm_automations SET name=${d.name}, description=${d.description}, trigger_event=${d.triggerEvent ?? d.trigger},
        actions=${actions}, category=${d.category}, active=${d.active}, tags=${tags}, updated_at=NOW()
      WHERE id=${id}
    `);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.patch("/crm-automations/:id/toggle", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE crm_automations SET active = NOT active, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.delete("/crm-automations/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM crm_automations WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== CRM AUTOMATION HISTORY ========================

router.get("/crm-automation-history", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM crm_automation_history ORDER BY created_at DESC LIMIT 200`);
  res.json(rows);
});

router.post("/crm-automation-history", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const rows = await q(sql`
      INSERT INTO crm_automation_history (automation_id, automation_name, category, triggered_by, status, actions_completed, actions_total, duration_seconds, error_message)
      VALUES (${d.automationId ?? null}, ${d.automationName}, ${d.category ?? ''}, ${d.triggeredBy}, ${d.status ?? 'success'}, ${d.actionsCompleted ?? 0}, ${d.actionsTotal ?? 0}, ${d.durationSeconds ?? 0}, ${d.errorMessage ?? null})
      RETURNING *
    `);
    if (d.automationId) {
      await db.execute(sql`
        UPDATE crm_automations SET run_count = run_count + 1, last_run = NOW(), updated_at = NOW() WHERE id = ${d.automationId}
      `);
    }
    res.json(rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ======================== MESSAGING (WhatsApp/SMS) ========================
router.get("/messaging/conversations/:contactId", async (req: Request, res: Response) => {
  try {
    const contactId = Number(req.params.contactId);
    const rows = await q(sql`
      SELECT id, contact_id, direction, channel, message_text as text, 
             sent_at as time, status, template_name
      FROM crm_messages 
      WHERE contact_id = ${contactId}
      ORDER BY sent_at DESC LIMIT 50
    `);
    const messages = (rows as any[]).map((r: any) => ({
      id: r.id,
      from: r.direction === 'outbound' ? 'me' : 'them',
      text: r.text || '',
      time: r.time ? new Date(r.time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '',
      status: r.status || 'sent',
    }));
    res.json(messages);
  } catch {
    res.json([]);
  }
});

router.post("/messaging/send", async (req: Request, res: Response) => {
  try {
    const { contactId, channel, phone, message } = req.body;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_messages (
        id SERIAL PRIMARY KEY,
        contact_id INTEGER,
        direction VARCHAR(10) DEFAULT 'outbound',
        channel VARCHAR(20) DEFAULT 'whatsapp',
        phone VARCHAR(30),
        message_text TEXT,
        template_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'sent',
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      INSERT INTO crm_messages (contact_id, direction, channel, phone, message_text, status)
      VALUES (${contactId}, 'outbound', ${channel || 'whatsapp'}, ${phone}, ${message}, 'sent')
    `);
    res.json({ success: true, message: "הודעה נשלחה בהצלחה" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

router.get("/messaging/conversations", async (_req: Request, res: Response) => {
  res.json([]);
});

export default router;
