/**
 * Advanced Automations - Professional CRM Rules
 *
 * 1. SLA Rules:
 *    - New lead no contact 30 min -> alert manager
 *    - Lead no activity 48 hours -> auto reminder
 *
 * 2. Risk Analysis:
 *    - Lead in "quoted" status > 7 days -> mark as risk
 *
 * 3. Follow-up Automation:
 *    - On Call: update last_contacted_at + create task if no next_action
 */
import {
  entityFilter,
  entityList,
  entityCreate,
  entityUpdate,
} from "@/lib/entity-api";

// ==================== SLA MONITORING ====================

export async function checkSLABreach() {
  const leads = await entityFilter<Record<string, unknown>>("leads", {
    sales_status: "new_lead",
  });

  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  for (const lead of leads) {
    const createdAt = new Date(lead.created_date as string).getTime();
    const timeSinceCreation = now - createdAt;

    // Rule 1: New lead no contact 30 min
    if (timeSinceCreation > thirtyMinutes && !lead.last_contacted_at) {
      console.warn("SLA BREACH: Lead without contact 30+ min:", lead.id);

      // Get manager
      const users = await entityList<Record<string, unknown>>("users");
      const managers = users.filter(
        (u) => u.role === "admin" || u.role === "manager"
      );

      for (const manager of managers) {
        await entityCreate("notifications", {
          user_email: manager.email,
          title: "SLA Breach: ליד ללא יצירת קשר",
          message: `הליד ${lead.first_name || lead.company_name || lead.phone} נוצר לפני ${Math.floor(timeSinceCreation / 60000)} דקות ללא יצירת קשר`,
          type: "warning",
          priority: "critical",
          entity_type: "Lead",
          entity_id: lead.id,
        });
      }

      // Update lead priority
      await entityUpdate("leads", lead.id as string, {
        priority: "urgent",
        priority_reason: "SLA breach - no contact 30+ minutes",
      });
    }
  }
}

export async function checkInactivityRules() {
  const activeLeads = await entityFilter<Record<string, unknown>>("leads", {
    sales_status_nin: "won,lost,not_relevant",
  });

  const now = Date.now();
  const fortyEightHours = 48 * 60 * 60 * 1000;

  for (const lead of activeLeads) {
    const lastActivity =
      (lead.last_contacted_at as string) || (lead.updated_date as string);
    const timeSinceActivity = now - new Date(lastActivity).getTime();

    // Rule 2: No activity 48 hours -> auto reminder
    if (timeSinceActivity > fortyEightHours) {
      console.log("Creating auto-reminder for inactive lead:", lead.id);

      await entityCreate("lead-tasks", {
        lead_id: lead.id,
        title: "תזכורת: יצירת קשר עם ליד",
        description: `הליד ללא פעילות כבר ${Math.floor(timeSinceActivity / (1000 * 60 * 60))} שעות`,
        priority: "high",
        status: "pending",
        due_date: new Date().toISOString(),
        assigned_to: lead.owner_user_id || lead.created_by,
        is_automated: true,
      });

      await entityCreate("notifications", {
        user_email: lead.owner_user_id || lead.created_by,
        title: "ליד דורש התייחסות",
        message: `הליד ${lead.first_name || lead.company_name} ללא פעילות כבר ${Math.floor(timeSinceActivity / (1000 * 60 * 60))} שעות`,
        type: "warning",
        priority: "high",
        entity_type: "Lead",
        entity_id: lead.id,
      });
    }
  }
}

// ==================== RISK ANALYSIS ====================

export async function analyzeLeadRisks() {
  const quotedLeads = await entityFilter<Record<string, unknown>>("leads", {
    sales_status: "quote_sent",
  });

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  for (const lead of quotedLeads) {
    // Find when status changed to quote_sent
    const activities = await entityFilter<Record<string, unknown>>(
      "lead-activities",
      {
        lead_id: lead.id,
        type: "status_change",
      }
    );

    const quoteActivity = activities
      .filter((a) => (a.description as string)?.includes("quote_sent"))
      .sort(
        (a, b) =>
          new Date(b.created_date as string).getTime() -
          new Date(a.created_date as string).getTime()
      )[0];

    if (quoteActivity) {
      const timeSinceQuote =
        now - new Date(quoteActivity.created_date as string).getTime();

      // Rule 3: Quote sent > 7 days -> mark as risk
      if (timeSinceQuote > sevenDays) {
        console.warn("RISK: Quote stagnant > 7 days:", lead.id);

        await entityUpdate("leads", lead.id as string, {
          priority: "urgent",
          priority_reason: "הצעת מחיר ללא מעקב מעל 7 ימים",
          ai_summary: `RISK: הצעת מחיר נשלחה לפני ${Math.floor(timeSinceQuote / (1000 * 60 * 60 * 24))} ימים ללא מעקב`,
        });

        await entityCreate("lead-tasks", {
          lead_id: lead.id,
          title: "דחוף: מעקב הצעת מחיר",
          description: `הצעת מחיר נשלחה לפני ${Math.floor(timeSinceQuote / (1000 * 60 * 60 * 24))} ימים - דורש מעקב מיידי`,
          priority: "critical",
          status: "pending",
          due_date: new Date().toISOString(),
          assigned_to: lead.owner_user_id || lead.created_by,
        });

        await entityCreate("notifications", {
          user_email: lead.owner_user_id || lead.created_by,
          title: "ליד בסיכון גבוה",
          message: `הליד ${lead.first_name || lead.company_name} - הצעת מחיר ללא מעקב ${Math.floor(timeSinceQuote / (1000 * 60 * 60 * 24))} ימים`,
          type: "error",
          priority: "critical",
          entity_type: "Lead",
          entity_id: lead.id,
        });
      }
    }
  }
}

// ==================== FOLLOW-UP AUTOMATION ====================

export async function handleActivityFollowup(
  activity: Record<string, unknown>
) {
  if (activity.type !== "phone_call") return;

  const leads = await entityFilter<Record<string, unknown>>("leads", {
    id: activity.lead_id,
  });
  const lead = leads[0];
  if (!lead) return;

  console.log("Processing call follow-up for lead:", lead.id);

  // Update last_contacted_at
  await entityUpdate("leads", lead.id as string, {
    last_contacted_at: new Date().toISOString(),
  });

  // If no next_action_at -> create task for +2 days
  if (!lead.next_action_at) {
    const twoDaysLater = new Date();
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);

    await entityCreate("lead-tasks", {
      lead_id: lead.id,
      title: "מעקב שיחה",
      description: "יצירת קשר חוזרת עם הליד",
      priority: "medium",
      status: "pending",
      due_date: twoDaysLater.toISOString(),
      assigned_to:
        lead.owner_user_id || activity.performed_by || lead.created_by,
      is_automated: true,
    });

    await entityUpdate("leads", lead.id as string, {
      next_action: "מעקב שיחה",
      next_action_at: twoDaysLater.toISOString(),
    });

    console.log("Auto-created follow-up task for +2 days");
  }
}

// ==================== MASTER AUTOMATION RUNNER ====================

export async function runAllAutomations() {
  console.log("Starting Advanced Automations...");

  try {
    await checkSLABreach();
    await checkInactivityRules();
    await analyzeLeadRisks();
    console.log("Automations completed successfully");
  } catch (error) {
    console.error("Error running automations:", error);
  }
}

// Export for external trigger (e.g., cron job, webhook)
export default {
  checkSLABreach,
  checkInactivityRules,
  analyzeLeadRisks,
  handleActivityFollowup,
  runAllAutomations,
};
