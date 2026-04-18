/**
 * Lead Conversion Engine
 *
 * When Stage = WON:
 * 1. Create Customer record
 * 2. Transfer: Documents, Notes, Activities
 * 3. Create Project (if relevant)
 * 4. Lock Lead (archived=true)
 * 5. Create conversion record
 */
import {
  entityFilter,
  entityList,
  entityCreate,
  entityUpdate,
} from "@/lib/entity-api";

interface Lead {
  id: string | number;
  customer_type?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  company_id_number?: string;
  phone?: string;
  phone_secondary?: string;
  email?: string;
  city?: string;
  address?: string;
  contact_person?: string;
  contact_role?: string;
  source?: string;
  owner_user_id?: string;
  notes?: string;
  approved_price?: number;
  estimated_price?: number;
  created_date?: string;
  sales_status?: string;
  work_type?: string[];
  material?: string;
  dimensions?: string;
  quantity?: number;
  color?: string;
  finish?: string;
  standard_required?: boolean;
  work_start_date?: string;
  work_end_date?: string;
  site_type?: string;
  site_access_notes?: string;
  requires_crane?: boolean;
  requires_safety_coordination?: boolean;
  priority?: string;
  [key: string]: unknown;
}

interface ConversionData {
  amount?: number;
  createProject?: boolean;
  projectName?: string;
  notes?: string;
}

export async function convertLeadToCustomer(
  lead: Lead,
  conversionData: ConversionData = {}
) {
  console.log("Starting lead conversion:", lead.id);

  try {
    // Step 1: Create Customer
    const customer = await createCustomerFromLead(lead);
    console.log("Customer created:", customer.id);

    // Step 2: Transfer Documents
    await transferDocuments(lead.id, customer.id);
    console.log("Documents transferred");

    // Step 3: Transfer Notes
    await transferNotes(lead.id, customer.id);
    console.log("Notes transferred");

    // Step 4: Transfer Activities
    await transferActivities(lead.id, customer.id);
    console.log("Activities transferred");

    // Step 5: Create Project (if relevant)
    let project: Record<string, unknown> | null = null;
    if (conversionData.createProject) {
      project = await createProjectFromLead(lead, customer.id);
      console.log("Project created:", project?.id);
    }

    // Step 6: Create Deal record
    const deal = await entityCreate<Record<string, unknown>>("deals", {
      customer_id: customer.id,
      lead_id: lead.id,
      project_id: project?.id,
      title: `עסקה - ${customer.full_name || customer.company_name}`,
      amount:
        conversionData.amount || lead.approved_price || lead.estimated_price || 0,
      status: "won",
      close_date: new Date().toISOString(),
      owner_user_id: lead.owner_user_id,
    });
    console.log("Deal created:", deal.id);

    // Step 7: Create Conversion Record
    const timeToDays = Math.floor(
      (Date.now() - new Date(lead.created_date || "").getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const interactions = await entityFilter<Record<string, unknown>>(
      "lead-interactions",
      { lead_id: lead.id }
    );
    const activities = await entityFilter<Record<string, unknown>>(
      "lead-activities",
      { lead_id: lead.id }
    );

    await entityCreate("lead-conversions", {
      lead_id: lead.id,
      customer_id: customer.id,
      deal_id: deal.id,
      converted_by: lead.owner_user_id,
      conversion_date: new Date().toISOString(),
      time_to_conversion_days: timeToDays,
      conversion_value:
        conversionData.amount || lead.approved_price || 0,
      touchpoints_count: interactions.length,
      activities_count: activities.length,
      conversion_source: lead.source,
      notes:
        conversionData.notes || `המרה אוטומטית מליד ${lead.id}`,
    });
    console.log("Conversion record created");

    // Step 8: Lock Lead
    await entityUpdate("leads", lead.id, {
      sales_status: "won",
      lifecycle_stage: "closed_won",
      archived: true,
      ops_status: "project_opened",
      notes:
        (lead.notes || "") +
        `\n\n[${new Date().toLocaleDateString("he-IL")}] הומר ללקוח ID: ${customer.id}`,
    });
    console.log("Lead locked");

    // Step 9: Notify stakeholders
    await notifyConversion(lead, customer, deal);
    console.log("Notifications sent");

    // Step 10: Create Event Log
    await entityCreate("event-logs", {
      event_type: "lead.status_changed",
      entity_type: "Lead",
      entity_id: lead.id,
      payload: {
        from_status: lead.sales_status,
        to_status: "won",
        customer_id: customer.id,
        deal_id: deal.id,
      },
    });

    return {
      success: true,
      customer,
      deal,
      project,
    };
  } catch (error) {
    console.error("Conversion failed:", error);
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

async function createCustomerFromLead(lead: Lead) {
  const customerData = {
    customer_type: lead.customer_type,
    first_name: lead.first_name,
    last_name: lead.last_name,
    full_name:
      lead.customer_type === "private"
        ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
        : lead.company_name,
    company_name: lead.company_name,
    company_id_number: lead.company_id_number,
    phone: lead.phone,
    phone_secondary: lead.phone_secondary,
    email: lead.email,
    city: lead.city,
    address: lead.address,
    contact_person: lead.contact_person,
    contact_role: lead.contact_role,
    source: lead.source,
    owner_user_id: lead.owner_user_id,
    status: "active",
    lifecycle_stage: "customer",
    converted_from_lead_id: lead.id,
    notes: lead.notes,
  };

  return await entityCreate<Record<string, unknown>>("customers", customerData);
}

async function transferDocuments(
  leadId: string | number,
  customerId: string | number
) {
  const documents = await entityFilter<Record<string, unknown>>(
    "lead-documents",
    { lead_id: leadId }
  );

  for (const doc of documents) {
    await entityCreate("documents", {
      entity_type: "Customer",
      entity_id: customerId,
      file_url: doc.file_url,
      file_name: doc.file_name,
      file_type: doc.file_type,
      tag: doc.tag,
      source: "lead_conversion",
      notes: `מועבר מליד ${leadId}`,
    });
  }

  return documents.length;
}

async function transferNotes(
  leadId: string | number,
  customerId: string | number
) {
  const notes = await entityFilter<Record<string, unknown>>("lead-notes", {
    lead_id: leadId,
  });

  for (const note of notes) {
    await entityCreate("crm-notes", {
      entity_type: "Customer",
      entity_id: customerId,
      note_text: note.note_text,
      category: note.category,
      pinned: note.pinned,
      created_by: note.created_by,
    });
  }

  return notes.length;
}

async function transferActivities(
  leadId: string | number,
  customerId: string | number
) {
  const activities = await entityFilter<Record<string, unknown>>(
    "lead-activities",
    { lead_id: leadId }
  );

  for (const activity of activities) {
    await entityCreate("activities", {
      entity_type: "Customer",
      entity_id: customerId,
      activity_type: activity.type,
      description: activity.description,
      outcome: activity.outcome,
      notes: `מועבר מליד ${leadId}`,
      created_by: activity.created_by,
    });
  }

  return activities.length;
}

async function createProjectFromLead(
  lead: Lead,
  customerId: string | number
) {
  const projectData = {
    project_name: `פרויקט - ${lead.first_name || lead.company_name}`,
    customer_id: customerId,
    project_type: lead.work_type?.[0] || "general",
    status: "planning",
    priority: lead.priority,
    owner_user_id: lead.owner_user_id,
    start_date: lead.work_start_date || new Date().toISOString(),
    target_end_date: lead.work_end_date,
    budget: lead.approved_price || lead.estimated_price,
    site_address: lead.address,
    site_city: lead.city,
    site_type: lead.site_type,
    site_access_notes: lead.site_access_notes,
    requires_crane: lead.requires_crane,
    requires_safety_coordination: lead.requires_safety_coordination,
    description: `
פרויקט שמקורו מליד ${lead.id}

סוג עבודה: ${lead.work_type?.join(", ")}
חומר: ${lead.material}
מידות: ${lead.dimensions}
כמות: ${lead.quantity}
צבע: ${lead.color}
גימור: ${lead.finish}
תקן נדרש: ${lead.standard_required ? "כן" : "לא"}
    `.trim(),
  };

  return await entityCreate<Record<string, unknown>>("projects", projectData);
}

async function notifyConversion(
  lead: Lead,
  customer: Record<string, unknown>,
  deal: Record<string, unknown>
) {
  // Notify owner
  await entityCreate("notifications", {
    user_email: lead.owner_user_id,
    title: "ליד הומר ללקוח!",
    message: `הליד ${lead.first_name || lead.company_name} הומר בהצלחה ללקוח`,
    type: "success",
    priority: "high",
    entity_type: "Customer",
    entity_id: customer.id,
  });

  // Notify managers
  const users = await entityList<Record<string, unknown>>("users");
  const managers = users.filter(
    (u) => u.role === "admin" || u.role === "manager"
  );

  for (const manager of managers) {
    await entityCreate("notifications", {
      user_email: manager.email,
      title: "המרה חדשה!",
      message: `${lead.owner_user_id} המיר ליד ללקוח - ערך: ${deal.amount || 0}`,
      type: "success",
      entity_type: "Deal",
      entity_id: deal.id,
    });
  }
}

export default convertLeadToCustomer;
