import { entityCreate } from "@/lib/entity-api";

/**
 * Facebook Lead Ads Integration
 * Webhook endpoint to receive leads from Facebook campaigns
 *
 * Setup:
 * 1. Create webhook in Facebook Business Manager
 * 2. Point to: https://yourapp.com/api/facebook-leads
 * 3. Subscribe to 'leadgen' events
 */

interface FacebookLeadData {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  campaign_name: string;
}

interface FacebookWebhookEntry {
  changes?: Array<{
    field: string;
    value: {
      leadgen_id: string;
    };
  }>;
}

interface FacebookWebhookPayload {
  entry: FacebookWebhookEntry[];
}

interface Lead {
  id: string;
  customer_type: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  source: string;
  source_details: string;
  sales_status: string;
  lifecycle_stage: string;
  priority: string;
}

interface EventLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: unknown;
}

interface LeadAssignmentQueue {
  id: string;
  lead_id: string;
  source: string;
  priority: string;
  status: string;
  assignment_method: string;
}

export async function handleFacebookLeadWebhook(payload: FacebookWebhookPayload): Promise<void> {
  const { entry } = payload;

  for (const item of entry) {
    const changes = item.changes || [];

    for (const change of changes) {
      if (change.field === "leadgen") {
        const leadgenId = change.value.leadgen_id;

        // Fetch lead data from Facebook Graph API
        // (would require Facebook API token and additional setup)
        const leadData = await fetchFacebookLead(leadgenId);

        // Create lead in system
        const newLead = await entityCreate<Lead>("leads", {
          customer_type: "private",
          first_name: leadData.first_name,
          last_name: leadData.last_name,
          phone: leadData.phone_number,
          email: leadData.email,
          source: "facebook",
          source_details: `Campaign: ${leadData.campaign_name}`,
          sales_status: "new_lead",
          lifecycle_stage: "new",
          priority: "normal",
        });

        // Log event
        await entityCreate<EventLog>("event-logs", {
          event_type: "lead.facebook.imported",
          entity_type: "Lead",
          entity_id: newLead.id,
          payload: leadData,
        });

        // Trigger auto-assignment
        await entityCreate<LeadAssignmentQueue>("lead-assignment-queues", {
          lead_id: newLead.id,
          source: "facebook",
          priority: "medium",
          status: "pending",
          assignment_method: "auto_round_robin",
        });
      }
    }
  }
}

async function fetchFacebookLead(_leadgenId: string): Promise<FacebookLeadData> {
  // Mock implementation - would connect to Facebook Graph API
  return {
    first_name: "\u05D3\u05D5\u05D2\u05DE\u05D4",
    last_name: "\u05DE\u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7",
    phone_number: "0501234567",
    email: "example@facebook.com",
    campaign_name: "Summer Campaign 2026",
  };
}

/**
 * Verification endpoint for Facebook webhook
 */
export function verifyFacebookWebhook(
  mode: string,
  token: string,
  challenge: string
): string | null {
  const VERIFY_TOKEN =
    process.env.FACEBOOK_VERIFY_TOKEN || "metalpro_verify_123";

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return challenge;
  }

  return null;
}
