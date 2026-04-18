import { useEffect } from "react";
import { entityFilter, entityCreate } from "@/lib/entity-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  full_name?: string;
  first_name?: string;
  company_name?: string;
  email?: string;
  stage?: string;
  grade?: string;
  win_probability?: number;
  deal_value?: number;
  last_contacted_at?: string;
  updated_date?: string;
}

interface AIInsight {
  id?: string;
  entity_type: string;
  entity_id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence: number;
  recommended_action: string;
  priority: string;
}

interface Task {
  id?: string;
  lead_id: string;
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

export default function ConversionOptimizer() {
  useEffect(() => {
    const interval = setInterval(optimizeConversions, 15 * 60 * 1000);
    optimizeConversions();
    return () => clearInterval(interval);
  }, []);

  const optimizeConversions = async () => {
    try {
      await identifyReadyToConvert();
      await nudgeStuckLeads();
      await reactivateColdLeads();
      await suggestDiscounts();
    } catch (error) {
      console.error("Conversion optimizer error:", error);
    }
  };

  const identifyReadyToConvert = async () => {
    const leads = await entityFilter<Lead>("lead", {
      stage: "negotiation",
      grade: "hot",
    });

    for (const lead of leads) {
      const daysSinceContact = lead.last_contacted_at
        ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86_400_000)
        : 999;

      if (daysSinceContact <= 2 && (lead.win_probability ?? 0) >= 70) {
        await entityCreate<AIInsight>("ai-insight", {
          entity_type: "lead",
          entity_id: lead.id,
          insight_type: "conversion_ready",
          title: "Lead ready to convert!",
          description: `${lead.full_name || lead.company_name} is ready - probability ${lead.win_probability}%`,
          confidence: 85,
          recommended_action: "Send contract for signing",
          priority: "high",
        } as AIInsight);

        await entityCreate<Task>("task", {
          lead_id: lead.id,
          title: "Close deal - lead ready!",
          description: "Lead is in great shape for conversion. Send contract or call to close.",
          priority: "high",
          category: "conversion",
          status: "todo",
          due_date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        } as Task);
      }
    }
  };

  const nudgeStuckLeads = async () => {
    const stuckLeads = await entityFilter<Lead>("lead", { stage: "proposal" });

    for (const lead of stuckLeads) {
      const daysSinceUpdate = lead.updated_date
        ? Math.floor((Date.now() - new Date(lead.updated_date).getTime()) / 86_400_000)
        : 0;

      if (daysSinceUpdate >= 5 && lead.email) {
        // NOTE: SendEmail integration removed. Replace with your own API.
        console.info("[ConversionOptimizer] Would nudge", lead.email);

        await entityCreate<LeadActivity>("lead-activity", {
          lead_id: lead.id,
          type: "email",
          description: "Auto nudge sent - lead stuck at proposal stage",
        } as LeadActivity);
      }
    }
  };

  const reactivateColdLeads = async () => {
    const coldLeads = await entityFilter<Lead>("lead", { grade: "cold" });

    for (const lead of coldLeads) {
      const monthsSinceContact = lead.last_contacted_at
        ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / (86_400_000 * 30))
        : 0;

      if (monthsSinceContact >= 3 && monthsSinceContact <= 6) {
        await entityCreate<Task>("task", {
          lead_id: lead.id,
          title: `Reactivate - ${lead.full_name || lead.company_name}`,
          description: `Cold lead ${monthsSinceContact} months. Try reactivating with a promotion.`,
          priority: "low",
          category: "reactivation",
          status: "todo",
        } as Task);
      }
    }
  };

  const suggestDiscounts = async () => {
    const leads = await entityFilter<Lead>("lead", { stage: "negotiation" });

    for (const lead of leads) {
      const daysSinceNegotiation = lead.updated_date
        ? Math.floor((Date.now() - new Date(lead.updated_date).getTime()) / 86_400_000)
        : 0;

      if (daysSinceNegotiation >= 7 && (lead.deal_value ?? 0) > 20000) {
        await entityCreate<AIInsight>("ai-insight", {
          entity_type: "lead",
          entity_id: lead.id,
          insight_type: "discount_suggestion",
          title: "Consider strategic discount",
          description: `Lead stuck in negotiation ${daysSinceNegotiation} days. A 5-10% discount may close the deal.`,
          confidence: 70,
          recommended_action: "Offer 7% discount",
          priority: "medium",
        } as AIInsight);
      }
    }
  };

  return null;
}
