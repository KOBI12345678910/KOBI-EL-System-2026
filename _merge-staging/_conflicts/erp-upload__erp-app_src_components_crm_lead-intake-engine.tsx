import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  entityList,
  entityCreate,
  entityUpdate,
  entityFilter,
} from "@/lib/entity-api";
import { toast } from "sonner";

interface IncomingLead {
  phone?: string;
  email?: string;
  source?: string;
  first_name?: string;
  company_name?: string;
  urgency?: string;
  estimated_price?: number;
  [key: string]: unknown;
}

/**
 * Lead Intake Engine
 *
 * Roles:
 * 1. Receive leads from all sources (phone, WhatsApp, website, Facebook)
 * 2. Check duplicates
 * 3. Enrich data
 * 4. Route to assignment
 */
export function useLeadIntakeEngine() {
  const queryClient = useQueryClient();

  const processMutation = useMutation({
    mutationFn: async (incomingLead: IncomingLead) => {
      console.log("Lead Intake Engine - Starting process", incomingLead);

      // Step 1: Validate required fields
      if (!incomingLead.phone && !incomingLead.email) {
        throw new Error("נדרש לפחות טלפון או מייל");
      }

      // Step 2: Check for duplicates
      const existingLeads = await entityList<Record<string, unknown>>("leads");
      const duplicate = existingLeads.find(
        (l) =>
          (l.phone && l.phone === incomingLead.phone) ||
          (l.email && l.email === incomingLead.email)
      );

      if (duplicate) {
        console.log("Duplicate lead found:", duplicate.id);

        // Update existing lead with new info
        await entityUpdate("leads", duplicate.id as string, {
          ...incomingLead,
          notes: `${(duplicate.notes as string) || ""}\n\n[${new Date().toLocaleString()}] ליד כפול - עדכון אוטומטי מ-${incomingLead.source}`,
        });

        // Create interaction record
        await entityCreate("lead-interactions", {
          lead_id: duplicate.id,
          interaction_type: "follow_up",
          direction: "inbound",
          summary: `ליד חזר דרך ${incomingLead.source}`,
          performed_by: "system",
        });

        return { lead: duplicate, isDuplicate: true };
      }

      // Step 3: Enrich data
      const enrichedLead = {
        ...incomingLead,
        sales_status: "new_lead",
        lifecycle_stage: "new",
        priority: incomingLead.urgency || "normal",
        created_date: new Date().toISOString(),
        ai_summary: `ליד חדש מ-${incomingLead.source}. ממתין לטיפול.`,
      };

      // Step 4: Create lead
      const newLead = await entityCreate<Record<string, unknown>>("leads", enrichedLead);
      console.log("New lead created:", newLead.id);

      // Step 5: Route to assignment queue
      const { autoAssignLead } = await import("./auto-assignment-engine");
      const assignmentResult = await autoAssignLead(
        newLead,
        incomingLead.source || ""
      );

      if (assignmentResult?.assigned_to) {
        // Auto-assigned
        await entityUpdate("leads", newLead.id as string, {
          owner_user_id: assignmentResult.assigned_to,
          assignment_reason: assignmentResult.method,
        });

        await entityCreate("notifications", {
          user_email: assignmentResult.assigned_to,
          title: "ליד חדש הוקצה אליך",
          message: `ליד מ-${incomingLead.source}`,
          type: "info",
          entity_type: "Lead",
          entity_id: newLead.id,
        });
      } else {
        // Manager queue
        await entityCreate("lead-assignment-queues", {
          lead_id: newLead.id,
          source: incomingLead.source,
          priority: getPriority(incomingLead),
          status: "pending",
          assignment_method: "manager_assignment",
        });
      }

      // Step 6: Trigger automations
      await triggerWelcomeAutomation(newLead);

      // Step 7: Create event log
      await entityCreate("event-logs", {
        event_type: "lead.created",
        entity_type: "Lead",
        entity_id: newLead.id,
        payload: {
          source: incomingLead.source,
          method: "auto_intake",
        },
      });

      return { lead: newLead, isDuplicate: false };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-assignment-queue"] });

      if (data.isDuplicate) {
        toast.info("ליד קיים עודכן עם מידע חדש");
      } else {
        toast.success("ליד חדש נוצר בהצלחה");
      }
    },
    onError: (error) => {
      console.error("Lead Intake Error:", error);
      toast.error("שגיאה בקליטת ליד");
    },
  });

  return {
    processIncomingLead: processMutation.mutate,
    isProcessing: processMutation.isPending,
  };
}

// Helper functions
function getPriority(lead: IncomingLead): string {
  if (lead.urgency === "critical") return "urgent";
  if ((lead.estimated_price || 0) > 50000) return "high";
  if (lead.source === "referral") return "high";
  return "medium";
}

async function triggerWelcomeAutomation(lead: Record<string, unknown>) {
  // Send welcome message based on source
  if (
    lead.phone &&
    (lead.source === "whatsapp" || lead.source === "phone_call")
  ) {
    await entityCreate("event-logs", {
      event_type: "lead.whatsapp.send_requested",
      entity_type: "Lead",
      entity_id: lead.id,
      payload: {
        to: lead.phone,
        message: `שלום ${lead.first_name || ""},\n\nקיבלנו את פנייתך ונחזור אליך בהקדם.\n\nצוות המכירות`,
      },
    });
  }

  // Create initial task
  await entityCreate("lead-tasks", {
    lead_id: lead.id,
    title: "יצירת קשר ראשוני",
    description: "לצור קשר עם הליד בהקדם האפשרי",
    priority: "high",
    status: "pending",
    due_date: new Date(Date.now() + 30 * 60000).toISOString(), // 30 minutes
  });
}

export default function LeadIntakeEngine() {
  return null; // Background service
}
