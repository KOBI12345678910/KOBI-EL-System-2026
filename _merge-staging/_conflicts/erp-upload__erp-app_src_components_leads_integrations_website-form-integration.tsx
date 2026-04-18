import { entityCreate, entityFilter } from "@/lib/entity-api";

/**
 * Website Form Integration
 * REST API endpoint to receive leads from website contact forms
 *
 * Endpoint: POST /api/lead-intake
 *
 * Example Request:
 * {
 *   "first_name": "\u05D9\u05D5\u05E1\u05D9",
 *   "last_name": "\u05DB\u05D4\u05DF",
 *   "phone": "0501234567",
 *   "email": "yossi@example.com",
 *   "message": "\u05DE\u05E2\u05D5\u05E0\u05D9\u05D9\u05DF \u05D1\u05DE\u05E2\u05E7\u05D4 \u05DC\u05D1\u05D9\u05EA",
 *   "source_page": "/contact",
 *   "utm_source": "google",
 *   "utm_campaign": "summer2026"
 * }
 */

interface FormData {
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone: string;
  email?: string;
  message?: string;
  source_page?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
}

interface Lead {
  id: string;
  customer_type?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  source?: string;
  source_details?: string;
  sales_status?: string;
  lifecycle_stage?: string;
  priority?: string;
  sla_deadline?: string;
  created_date?: string;
}

interface LeadNote {
  id: string;
  lead_id: string;
  note_text: string;
  category: string;
}

interface LeadAssignmentQueue {
  id: string;
  lead_id: string;
  source: string;
  priority: string;
  status: string;
  assignment_method: string;
}

interface EventLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: unknown;
}

interface FormSubmissionResult {
  success: boolean;
  message: string;
  lead_id: string;
}

export async function handleWebsiteFormSubmission(
  formData: FormData
): Promise<FormSubmissionResult> {
  try {
    // Validate required fields
    if (!formData.phone) {
      throw new Error("Phone number is required");
    }

    // Check for duplicate (last 24 hours)
    const existingLeads = await entityFilter<Lead>("leads", {
      phone: formData.phone,
    });

    const recentDuplicate = existingLeads.find((lead) => {
      const hoursSinceCreation =
        (Date.now() - new Date(lead.created_date || "").getTime()) /
        (1000 * 60 * 60);
      return hoursSinceCreation < 24;
    });

    if (recentDuplicate) {
      // Add note instead of creating duplicate
      await entityCreate<LeadNote>("lead-notes", {
        lead_id: recentDuplicate.id,
        note_text: `\u05E4\u05E0\u05D9\u05D9\u05D4 \u05D7\u05D5\u05D6\u05E8\u05EA \u05DE\u05D4\u05D0\u05EA\u05E8: ${formData.message}`,
        category: "\u05DB\u05DC\u05DC\u05D9",
      });

      return {
        success: true,
        message: "Lead already exists, note added",
        lead_id: recentDuplicate.id,
      };
    }

    // Create new lead
    const newLead = await entityCreate<Lead>("leads", {
      customer_type: formData.company_name ? "business" : "private",
      first_name: formData.first_name,
      last_name: formData.last_name,
      company_name: formData.company_name,
      phone: formData.phone,
      email: formData.email,
      notes: formData.message,
      source: "website",
      source_details: JSON.stringify({
        page: formData.source_page,
        utm_source: formData.utm_source,
        utm_campaign: formData.utm_campaign,
        utm_medium: formData.utm_medium,
      }),
      sales_status: "new_lead",
      lifecycle_stage: "new",
      priority: "normal",
      sla_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes SLA
    });

    // Add initial note if message exists
    if (formData.message) {
      await entityCreate<LeadNote>("lead-notes", {
        lead_id: newLead.id,
        note_text: formData.message,
        category: "\u05DB\u05DC\u05DC\u05D9",
      });
    }

    // Trigger auto-assignment
    await entityCreate<LeadAssignmentQueue>("lead-assignment-queues", {
      lead_id: newLead.id,
      source: "website",
      priority: "high", // Website leads are usually hot
      status: "pending",
      assignment_method: "auto_rules",
    });

    // Send to Telegram
    await entityCreate<EventLog>("event-logs", {
      event_type: "lead.telegram.notify_requested",
      entity_type: "Lead",
      entity_id: newLead.id,
      payload: {
        message: `\u{1F310} \u05DC\u05D9\u05D3 \u05D7\u05D3\u05E9 \u05DE\u05D4\u05D0\u05EA\u05E8!\n\n${formData.first_name} ${formData.last_name}\n${formData.phone}`,
      },
    });

    return {
      success: true,
      message: "Lead created successfully",
      lead_id: newLead.id,
    };
  } catch (error) {
    console.error("Website form submission error:", error);
    throw error;
  }
}

/**
 * Generate embed code for website
 */
export function generateWebsiteFormEmbedCode(apiKey: string): string {
  return `
<form id="metalpro-lead-form">
  <input type="text" name="first_name" placeholder="\u05E9\u05DD \u05E4\u05E8\u05D8\u05D9" required>
  <input type="text" name="last_name" placeholder="\u05E9\u05DD \u05DE\u05E9\u05E4\u05D7\u05D4" required>
  <input type="tel" name="phone" placeholder="\u05D8\u05DC\u05E4\u05D5\u05DF" required>
  <input type="email" name="email" placeholder="\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC">
  <textarea name="message" placeholder="\u05D4\u05D5\u05D3\u05E2\u05D4"></textarea>
  <button type="submit">\u05E9\u05DC\u05D7</button>
</form>

<script>
document.getElementById('metalpro-lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  await fetch('https://yourapp.com/api/lead-intake', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': '${apiKey}'
    },
    body: JSON.stringify(data)
  });

  alert('\u05EA\u05D5\u05D3\u05D4! \u05E0\u05D9\u05E6\u05D5\u05E8 \u05D0\u05D9\u05EA\u05DA \u05E7\u05E9\u05E8 \u05D1\u05E7\u05E8\u05D5\u05D1');
  e.target.reset();
});
</script>
  `.trim();
}
