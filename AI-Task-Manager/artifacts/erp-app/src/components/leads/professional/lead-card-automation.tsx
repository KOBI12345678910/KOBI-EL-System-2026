import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { entityFilter, entityCreate, entityUpdate } from "@/lib/entity-api";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AutomationRule {
  id: string;
  rule_name: string;
  is_active: boolean;
  trigger: {
    type: string;
    conditions?: Array<{ field: string; operator: string; value: string }>;
    time_config?: { duration_minutes?: number; duration_days?: number };
  };
  actions: Array<{
    type: string;
    config: Record<string, any>;
  }>;
}

interface LeadRecord {
  id: string;
  customer_type: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  sales_status?: string;
  lifecycle_stage?: string;
  last_contacted_at?: string;
  created_date?: string;
  updated_date?: string;
  sla_deadline?: string;
  sla_status?: string;
  next_action?: string;
  notes?: string;
  email?: string;
  owner_user_id?: string;
  sentiment_score?: number;
  budget_range?: string;
  risk_score?: number;
  probability_to_close?: number;
  [key: string]: unknown;
}

interface UserRecord {
  email?: string;
  role?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useLeadCardAutomation(
  lead: LeadRecord | undefined | null,
  user: UserRecord | undefined | null
) {
  const { data: automationRules = [] } = useQuery<AutomationRule[]>({
    queryKey: ["leadCardAutomations"],
    queryFn: () => entityFilter<AutomationRule>("lead-automation-rules", { is_active: true }),
    refetchInterval: 60000,
  });

  const updateLeadMutation = useMutation({
    mutationFn: (updates: Partial<LeadRecord>) =>
      entityUpdate<LeadRecord>("leads", lead!.id, updates),
  });

  const createNotificationMutation = useMutation({
    mutationFn: (notification: Record<string, unknown>) =>
      entityCreate<Record<string, unknown>>("notifications", notification),
  });

  useEffect(() => {
    if (!lead || !user) return;

    const checkAutomations = async () => {
      for (const rule of automationRules) {
        const shouldTrigger = await evaluateRule(rule, lead);
        if (shouldTrigger) {
          await executeActions(rule, lead, user);
        }
      }
    };

    checkAutomations();

    const interval = setInterval(checkAutomations, 30000);
    return () => clearInterval(interval);
  }, [lead, automationRules, user]);

  useEffect(() => {
    if (!lead) return;
    recalculateProbability(lead);
  }, [lead?.last_contacted_at]);

  const evaluateRule = async (rule: AutomationRule, lead: LeadRecord): Promise<boolean> => {
    const { trigger } = rule;

    if (trigger.type === "inactivity_period") {
      const lastActivity = new Date(lead.last_contacted_at || lead.created_date || Date.now());
      const now = new Date();
      const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
      const thresholdMinutes = trigger.time_config?.duration_minutes || 30;

      const conditionsMatch =
        trigger.conditions?.every((condition) => {
          if (condition.field === "sales_status") {
            return condition.operator === "equals" && lead.sales_status === condition.value;
          }
          if (condition.field === "lifecycle_stage") {
            return condition.operator === "equals" && lead.lifecycle_stage === condition.value;
          }
          return true;
        }) ?? true;

      return conditionsMatch && minutesSinceActivity >= thresholdMinutes;
    }

    if (trigger.type === "stage_stagnation") {
      const lastUpdate = new Date(lead.updated_date || Date.now());
      const now = new Date();
      const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      const thresholdDays = trigger.time_config?.duration_days || 3;
      return daysSinceUpdate >= thresholdDays;
    }

    if (trigger.type === "activity_logged") {
      const recentActivities = await entityFilter<Record<string, any>>("lead-interactions", {
        lead_id: lead.id,
      }).then((acts) =>
        acts.sort(
          (a: any, b: any) =>
            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        )
      );

      if (recentActivities.length > 0) {
        const latestActivity = recentActivities[0];
        const activityAge =
          (Date.now() - new Date(latestActivity.created_date).getTime()) / (1000 * 60);
        return activityAge < 5 && !lead.next_action;
      }
      return false;
    }

    if (trigger.type === "sla_breach") {
      if (!lead.sla_deadline) return false;
      const deadline = new Date(lead.sla_deadline);
      const now = new Date();
      return now > deadline && lead.sla_status !== "breached";
    }

    if (trigger.type === "field_changed") {
      return false;
    }

    return false;
  };

  const executeActions = async (rule: AutomationRule, lead: LeadRecord, user: UserRecord) => {
    for (const action of rule.actions) {
      try {
        await executeAction(action, lead, user);
      } catch (error) {
        console.error("Automation action failed:", error);
      }
    }
  };

  const executeAction = async (
    action: { type: string; config: Record<string, any> },
    lead: LeadRecord,
    user: UserRecord
  ) => {
    switch (action.type) {
      case "send_notification":
        await sendNotification(action, lead, user);
        break;
      case "update_field":
        await updateField(action, lead);
        break;
      case "change_status":
        await updateLeadMutation.mutateAsync({
          [action.config.field]: action.config.value,
        });
        break;
      case "assign_to_user":
        await updateLeadMutation.mutateAsync({
          owner_user_id: action.config.user_email,
        });
        break;
      case "create_task":
        await createTask(action, lead, user);
        break;
      case "send_email":
        await sendEmail(action, lead);
        break;
      case "add_tag":
        await addTag(action, lead);
        break;
      default:
        console.warn("Unknown action type:", action.type);
    }
  };

  const sendNotification = async (
    action: { config: Record<string, any> },
    lead: LeadRecord,
    user: UserRecord
  ) => {
    const { config } = action;
    const recipients: string[] = [];

    if (config.send_to?.includes("manager")) {
      const managers = await entityFilter<Record<string, any>>("users", { role: "admin" });
      recipients.push(...managers.map((m: any) => m.email));
    }
    if (config.send_to?.includes("owner")) {
      if (lead.owner_user_id) recipients.push(lead.owner_user_id);
    }

    for (const recipientEmail of recipients) {
      await createNotificationMutation.mutateAsync({
        user_email: recipientEmail,
        title: config.title || "\uD83D\uDD14 \u05D4\u05EA\u05E8\u05D0\u05EA \u05D0\u05D5\u05D8\u05D5\u05DE\u05E6\u05D9\u05D4",
        message:
          config.message_template?.replace("{lead_name}", getLeadName(lead)) || "\u05DC\u05D9\u05D3 \u05D3\u05D5\u05E8\u05E9 \u05D8\u05D9\u05E4\u05D5\u05DC",
        type: "warning",
        priority: "high",
        entity_type: "Lead",
        entity_id: lead.id,
      });
    }

    toast.warning(`\u05E0\u05E9\u05DC\u05D7\u05D5 ${recipients.length} \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA`);
  };

  const updateField = async (action: { config: Record<string, any> }, _lead: LeadRecord) => {
    const updates: Record<string, unknown> = {};
    if (action.config.field === "sla_status") {
      updates.sla_status = action.config.value;
    }
    if (action.config.field === "priority") {
      updates.priority = action.config.value;
    }
    await updateLeadMutation.mutateAsync(updates);
  };

  const createTask = async (
    action: { config: Record<string, any> },
    lead: LeadRecord,
    user: UserRecord
  ) => {
    const { config } = action;
    const dueDate = config.due_days
      ? new Date(Date.now() + config.due_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await entityCreate<Record<string, unknown>>("lead-tasks", {
      lead_id: lead.id,
      title:
        config.title_template?.replace("{lead_name}", getLeadName(lead)) || "\u05DE\u05E9\u05D9\u05DE\u05D4 \u05D7\u05D3\u05E9\u05D4",
      description: config.description_template || "",
      assigned_to: config.assigned_to_role === "owner" ? lead.owner_user_id : user.email,
      status: "pending",
      priority: "high",
      due_date: dueDate,
    });

    toast.info(
      "\u05E0\u05D5\u05E6\u05E8\u05D4 \u05DE\u05E9\u05D9\u05DE\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DC-" +
        (config.due_days ? `+${config.due_days} \u05D9\u05DE\u05D9\u05DD` : "\u05D4\u05D9\u05D5\u05DD")
    );
  };

  const sendEmail = async (action: { config: Record<string, any> }, lead: LeadRecord) => {
    const { config } = action;
    await entityCreate<Record<string, unknown>>("sent-emails", {
      lead_id: lead.id,
      to_email: config.to_email || lead.email,
      subject: config.subject || "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA",
      body: config.body_template || "",
      sent_by: "automation",
      status: "pending",
    });
  };

  const addTag = async (action: { config: Record<string, any> }, lead: LeadRecord) => {
    const { config } = action;
    const currentNotes = lead.notes || "";
    const tag = config.tag || "Risk Lead";

    if (!currentNotes.includes(`[${tag}]`)) {
      await updateLeadMutation.mutateAsync({
        notes: `[${tag}] ${currentNotes}`,
      });
      toast.warning(`\uD83C\uDFF7\uFE0F \u05DC\u05D9\u05D3 \u05E1\u05D5\u05DE\u05DF \u05DB-"${tag}"`);
    }
  };

  const recalculateProbability = async (lead: LeadRecord) => {
    let probability = 50;

    if ((lead.sentiment_score ?? 0) > 0.5) probability += 15;
    if (lead.budget_range && lead.budget_range !== "0-10k") probability += 10;
    if (lead.lifecycle_stage === "qualified") probability += 10;
    if (lead.lifecycle_stage === "proposal") probability += 15;
    if (lead.lifecycle_stage === "negotiation") probability += 20;

    const daysSinceContact = lead.last_contacted_at
      ? (Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    if (daysSinceContact < 1) probability += 10;
    else if (daysSinceContact > 7) probability -= 15;

    if ((lead.risk_score ?? 0) > 50) probability -= 20;
    if (lead.sales_status === "lost") probability = 0;
    if (lead.sales_status === "won") probability = 100;

    probability = Math.max(0, Math.min(100, probability));

    if (Math.abs(probability - (lead.probability_to_close || 0)) > 5) {
      await updateLeadMutation.mutateAsync({ probability_to_close: probability });
    }
  };

  const getLeadName = (lead: LeadRecord): string => {
    if (lead.customer_type === "private") {
      return `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "\u05DC\u05E7\u05D5\u05D7";
    }
    return lead.company_name || "\u05D7\u05D1\u05E8\u05D4";
  };

  return null;
}
