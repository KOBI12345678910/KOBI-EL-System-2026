import { useEffect } from "react";
import { entityFilter, entityCreate, entityUpdate } from "@/lib/entity-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  full_name?: string;
  first_name?: string;
  email?: string;
  phone?: string;
  stage?: string;
  source?: string;
}

interface LeadActivity {
  id: string;
  lead_id: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  Component (background)                                             */
/* ------------------------------------------------------------------ */

export default function AutoEmailResponder() {
  useEffect(() => {
    const interval = setInterval(checkNewLeads, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkNewLeads = async () => {
    try {
      const newLeads = await entityFilter<Lead>("lead", {
        stage: "new",
        source: "website",
      });

      for (const lead of newLeads) {
        const activities = await entityFilter<LeadActivity>("lead-activity", {
          lead_id: lead.id,
          type: "email",
        });
        if (activities.length > 0) continue;
        if (!lead.email) continue;

        const emailContent = generateAutoResponseEmail(lead);

        // NOTE: SendEmail integration removed in migration.
        // Replace with your own email-sending API call.
        console.info("[AutoEmailResponder] Would send email to", lead.email, emailContent);

        await entityCreate<LeadActivity>("lead-activity", {
          lead_id: lead.id,
          type: "email",
          description: `Auto-email sent: ${emailContent.subject}`,
        } as unknown as LeadActivity);

        await entityUpdate<Lead>("lead", lead.id, {
          stage: "contacted",
          first_contact_date: new Date().toISOString(),
        } as Partial<Lead>);
      }
    } catch (error) {
      console.error("Auto email error:", error);
    }
  };

  const generateAutoResponseEmail = (lead: Lead) => {
    const firstName =
      lead.first_name || lead.full_name?.split(" ")[0] || "Dear Customer";

    return {
      subject: "Thank you for your inquiry - MetalPro",
      body: `Hello ${firstName},

Thank you for reaching out!

We have received your inquiry and a representative will get back to you as soon as possible (usually within a few hours).

In the meantime, you are welcome to:
- Visit our website to see our projects
- Send us additional questions by replying to this email
- Contact us by phone: ${lead.phone || ""}

We look forward to helping you!

Best regards,
MetalPro Team`.trim(),
    };
  };

  return null;
}
