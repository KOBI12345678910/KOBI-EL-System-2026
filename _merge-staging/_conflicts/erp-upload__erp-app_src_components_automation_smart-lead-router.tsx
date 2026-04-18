import { useEffect } from "react";
import {
  entityFilter,
  entityCreate,
  entityUpdate,
} from "@/lib/entity-api";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  full_name?: string;
  first_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  source?: string;
  grade?: string;
  budget?: number;
  owner_id?: string;
  lead_score?: number;
  assigned_at?: string;
}

interface AssignmentRule {
  id: string;
  entity_type: string;
  is_active: boolean;
  source_filter?: string[];
  assignment_mode: string;
  round_robin_config?: {
    pool: string[];
    current_index: number;
  };
}

interface Task {
  id?: string;
  lead_id: string;
  assigned_to?: string | null;
  title: string;
  description: string;
  priority: string;
  category: string;
  status: string;
  due_date?: string;
}

interface LeadActivity {
  id?: string;
  lead_id: string;
  type: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function SmartLeadRouter() {
  useEffect(() => {
    // NOTE: base44 real-time subscription removed.
    // Replace with your own WebSocket / polling approach to detect new leads.
    const interval = setInterval(async () => {
      try {
        const newLeads = await entityFilter<Lead>("lead", { stage: "new" });
        for (const lead of newLeads) {
          if (!lead.owner_id) {
            await routeNewLead(lead);
          }
        }
      } catch (error) {
        console.error("Lead polling error:", error);
      }
    }, 60_000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routeNewLead = async (lead: Lead) => {
    try {
      console.log("Smart Router: New lead detected", lead.id);

      const score = await calculateLeadScore(lead);
      const assignedAgent = await assignToOptimalAgent(lead, score);
      await createInitialTask(lead, assignedAgent);

      if (lead.email && lead.source === "website") {
        await sendWelcomeEmail(lead);
      }

      if (assignedAgent) {
        toast.success(
          `New lead assigned to you: ${lead.full_name || lead.company_name}`,
          { duration: 7000 }
        );
      }
    } catch (error) {
      console.error("Lead routing error:", error);
    }
  };

  const calculateLeadScore = async (lead: Lead): Promise<number> => {
    let score = 50;
    if (lead.source === "referral") score += 20;
    if (lead.source === "website") score += 10;
    if (lead.budget) score += 15;
    if (lead.email) score += 10;
    if (lead.phone) score += 10;
    if (lead.company_name) score += 15;

    await entityUpdate<Lead>("lead", lead.id, {
      lead_score: Math.min(100, score),
    } as Partial<Lead>);
    return score;
  };

  const assignToOptimalAgent = async (
    lead: Lead,
    _score: number
  ): Promise<string | null> => {
    const rules = await entityFilter<AssignmentRule>("assignment-rule", {
      entity_type: "lead",
      is_active: true,
    });

    for (const rule of rules) {
      if (rule.source_filter && rule.source_filter.length > 0) {
        if (!rule.source_filter.includes(lead.source!)) continue;
      }

      if (rule.assignment_mode === "round_robin" && rule.round_robin_config) {
        const pool = rule.round_robin_config.pool || [];
        if (pool.length === 0) continue;

        const currentIndex = rule.round_robin_config.current_index || 0;
        const assignTo = pool[currentIndex % pool.length];

        await entityUpdate<Lead>("lead", lead.id, {
          owner_id: assignTo,
          assigned_at: new Date().toISOString(),
        } as Partial<Lead>);

        await entityUpdate<AssignmentRule>("assignment-rule", rule.id, {
          round_robin_config: {
            ...rule.round_robin_config,
            current_index: currentIndex + 1,
          },
        } as Partial<AssignmentRule>);

        return assignTo;
      }

      if (rule.assignment_mode === "by_load") {
        const agents = rule.round_robin_config?.pool || [];
        const workloads = await Promise.all(
          agents.map(async (agentId) => {
            const leads = await entityFilter<Lead>("lead", { owner_id: agentId });
            return { agentId, count: leads.length };
          })
        );

        workloads.sort((a, b) => a.count - b.count);
        const assignTo = workloads[0]?.agentId;

        if (assignTo) {
          await entityUpdate<Lead>("lead", lead.id, {
            owner_id: assignTo,
            assigned_at: new Date().toISOString(),
          } as Partial<Lead>);
          return assignTo;
        }
      }
    }

    return null;
  };

  const createInitialTask = async (lead: Lead, assignedTo: string | null) => {
    await entityCreate<Task>("task", {
      lead_id: lead.id,
      assigned_to: assignedTo,
      title: `Initial contact - ${lead.full_name || lead.company_name}`,
      description: `New lead from ${lead.source}. Contact within 24 hours.`,
      priority: lead.grade === "hot" ? "high" : "medium",
      category: "follow_up",
      status: "todo",
      due_date: new Date(Date.now() + 86_400_000).toISOString(),
    } as Task);
  };

  const sendWelcomeEmail = async (lead: Lead) => {
    try {
      if (!lead.email || !lead.email.includes("@")) return;

      // NOTE: SendEmail integration removed. Replace with your own API.
      console.info("[SmartLeadRouter] Would send welcome email to", lead.email);

      await entityCreate<LeadActivity>("lead-activity", {
        lead_id: lead.id,
        type: "email",
        description: "Automatic welcome email sent",
      } as LeadActivity);
    } catch (error) {
      console.error("Email send error:", error);
    }
  };

  return null;
}
