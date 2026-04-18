import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  phone?: string;
  email?: string;
  last_contacted_at?: string;
}

interface EventLog {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: unknown;
}

interface LeadInteraction {
  id: string;
  lead_id: string;
  interaction_type: string;
  direction: string;
  summary: string;
  sentiment?: string;
}

interface WhatsAppIntegrationProps {
  lead: Lead;
}

interface WhatsAppWebhookPayload {
  from: string;
  message: string;
  timestamp?: string;
}

/**
 * WhatsApp Business Integration
 * Send and receive messages directly from lead card
 */
export default function WhatsAppIntegration({ lead }: WhatsAppIntegrationProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();

  const sendWhatsAppMutation = useMutation({
    mutationFn: async (messageText: string) => {
      // Send via WhatsApp Business API (through n8n webhook)
      await entityCreate<EventLog>("event-logs", {
        event_type: "lead.whatsapp.send_requested",
        entity_type: "Lead",
        entity_id: lead.id,
        payload: {
          to: lead.phone,
          message: messageText,
        },
      });

      // Log as activity
      await entityCreate<LeadInteraction>("lead-interactions", {
        lead_id: lead.id,
        interaction_type: "whatsapp",
        direction: "outbound",
        summary: messageText.substring(0, 100),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadInteractions", lead.id] });
      toast.success("\u05D4\u05D5\u05D3\u05E2\u05EA WhatsApp \u05E0\u05E9\u05DC\u05D7\u05D4");
      setDialogOpen(false);
      setMessage("");
    },
  });

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{"\u05E9\u05DC\u05D9\u05D7\u05EA \u05D4\u05D5\u05D3\u05E2\u05EA WhatsApp"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              {lead.phone}
            </p>
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder={"\u05DB\u05EA\u05D5\u05D1 \u05D4\u05D5\u05D3\u05E2\u05D4..."}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {"\u05D1\u05D9\u05D8\u05D5\u05DC"}
            </Button>
            <Button
              onClick={() => sendWhatsAppMutation.mutate(message)}
              disabled={sendWhatsAppMutation.isPending || !message}
              className="gap-2 bg-green-600 hover:bg-green-700"
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
 * WhatsApp Webhook Receiver
 * Endpoint: POST /api/whatsapp-webhook
 * Receives incoming messages and logs them
 */
export async function handleWhatsAppWebhook(
  payload: WhatsAppWebhookPayload
): Promise<void> {
  const { from, message, timestamp } = payload;

  // Find lead by phone
  const leads = await entityFilter<Lead>("leads", { phone: from });
  if (leads.length === 0) return;

  const lead = leads[0];

  // Create interaction
  await entityCreate<LeadInteraction>("lead-interactions", {
    lead_id: lead.id,
    interaction_type: "whatsapp",
    direction: "inbound",
    summary: message.substring(0, 100),
    sentiment: "neutral", // Can be analyzed with AI
  });

  // Update last contact
  await entityUpdate<Lead>("leads", lead.id, {
    last_contacted_at: timestamp || new Date().toISOString(),
  });

  // Event log
  await entityCreate<EventLog>("event-logs", {
    event_type: "lead.whatsapp.received",
    entity_type: "Lead",
    entity_id: lead.id,
    payload: { from, message },
  });
}
