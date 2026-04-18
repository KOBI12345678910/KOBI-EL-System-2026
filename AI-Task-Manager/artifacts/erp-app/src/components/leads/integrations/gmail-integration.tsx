import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  last_contacted_at?: string;
}

interface LeadInteraction {
  id: string;
  lead_id: string;
  interaction_type: string;
  direction: string;
  summary: string;
  performed_by?: string;
  next_steps?: string;
}

interface EventLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: unknown;
}

interface EmailData {
  to: string;
  subject: string;
  body: string;
}

interface GmailIntegrationProps {
  lead: Lead;
}

interface AuthUser {
  email: string;
}

/**
 * Gmail Integration Component
 * Sends emails from lead card and syncs incoming emails to timeline
 */
export default function GmailIntegration({ lead }: GmailIntegrationProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState<EmailData>({
    to: lead.email || "",
    subject: "",
    body: "",
  });
  const queryClient = useQueryClient();

  const sendEmailMutation = useMutation({
    mutationFn: async (emailData: EmailData) => {
      // Send email via Gmail API
      // Note: base44.integrations.Core.SendEmail replaced with a direct API call
      await fetch("/api/integrations/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailData.to,
          subject: emailData.subject,
          body: emailData.body,
        }),
      });

      // Log as activity
      const user = await authJson<AuthUser>("/api/auth/me");
      await entityCreate<LeadInteraction>("lead-interactions", {
        lead_id: lead.id,
        interaction_type: "email",
        direction: "outbound",
        summary: `\u05E0\u05E9\u05DC\u05D7: ${emailData.subject}`,
        performed_by: user.email,
      });

      // Create event log for webhook
      await entityCreate<EventLog>("event-logs", {
        event_type: "lead.email.send_requested",
        entity_type: "Lead",
        entity_id: lead.id,
        payload: emailData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadInteractions", lead.id] });
      toast.success("\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC \u05E0\u05E9\u05DC\u05D7 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4");
      setDialogOpen(false);
      setEmail({ to: lead.email || "", subject: "", body: "" });
    },
  });

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Mail className="w-4 h-4" />
          {"\u05E9\u05DC\u05D7 Gmail"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{"\u05E9\u05DC\u05D9\u05D7\u05EA \u05D0\u05D9\u05DE\u05D9\u05D9\u05DC \u05D3\u05E8\u05DA Gmail"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label>{"\u05D0\u05DC"}</Label>
            <Input
              value={email.to}
              onChange={(e) => setEmail({ ...email, to: e.target.value })}
              placeholder="email@example.com"
            />
          </div>
          <div>
            <Label>{"\u05E0\u05D5\u05E9\u05D0"}</Label>
            <Input
              value={email.subject}
              onChange={(e) => setEmail({ ...email, subject: e.target.value })}
              placeholder={"\u05E0\u05D5\u05E9\u05D0 \u05D4\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC"}
            />
          </div>
          <div>
            <Label>{"\u05EA\u05D5\u05DB\u05DF"}</Label>
            <Textarea
              value={email.body}
              onChange={(e) => setEmail({ ...email, body: e.target.value })}
              rows={8}
              placeholder={"\u05DB\u05EA\u05D5\u05D1 \u05D0\u05EA \u05EA\u05D5\u05DB\u05DF \u05D4\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC..."}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {"\u05D1\u05D9\u05D8\u05D5\u05DC"}
            </Button>
            <Button
              onClick={() => sendEmailMutation.mutate(email)}
              disabled={sendEmailMutation.isPending}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              {"\u05E9\u05DC\u05D7"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gmail Webhook Receiver
 * Endpoint: POST /api/gmail-webhook
 * Receives incoming emails and logs them as activities
 */
interface GmailWebhookPayload {
  from: string;
  to: string;
  subject: string;
  body: string;
  lead_email: string;
}

export async function handleGmailWebhook(payload: GmailWebhookPayload): Promise<void> {
  const { from, subject, body, lead_email } = payload;

  // Find lead by email
  const leads = await entityFilter<Lead>("leads", { email: lead_email });
  if (leads.length === 0) return;

  const lead = leads[0];

  // Create interaction
  await entityCreate<LeadInteraction>("lead-interactions", {
    lead_id: lead.id,
    interaction_type: "email",
    direction: "inbound",
    summary: `\u05D4\u05EA\u05E7\u05D1\u05DC: ${subject}`,
    next_steps: body,
  });

  // Update last_contacted_at
  await entityUpdate<Lead>("leads", lead.id, {
    last_contacted_at: new Date().toISOString(),
  });

  // Create event log
  await entityCreate<EventLog>("event-logs", {
    event_type: "lead.email.received",
    entity_type: "Lead",
    entity_id: lead.id,
    payload: { from, subject, body },
  });
}
