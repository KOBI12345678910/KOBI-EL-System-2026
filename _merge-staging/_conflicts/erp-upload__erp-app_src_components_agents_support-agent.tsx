import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityCreate } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Headphones, MessageSquare } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
}

interface AgentAction {
  agent_id: string;
  agent_name: string;
  action_type: string;
  status: string;
  priority: string;
  context?: {
    entity_type: string;
    entity_id: string;
    entity_name: string;
  };
  suggested_action: unknown;
  reasoning: string;
  confidence_score: number;
}

interface SupportAgentProps {
  ticket: SupportTicket;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SupportAgent({ ticket }: SupportAgentProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const createActionMutation = useMutation({
    mutationFn: (data: AgentAction) =>
      entityCreate<AgentAction>("agent-action", data),
    onSuccess: () => {
      toast.success("\u05D8\u05D9\u05D5\u05D8\u05EA \u05EA\u05E9\u05D5\u05D1\u05D4 \u05E0\u05D5\u05E6\u05E8\u05D4 \u05D5\u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8");
      queryClient.invalidateQueries({ queryKey: ["agent_actions"] });
    },
  });

  const draftReply = async () => {
    setLoading(true);
    try {
      const prompt = `\u05E0\u05E1\u05D7 \u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05E7\u05E6\u05D5\u05E2\u05D9\u05EA \u05D5\u05D0\u05DE\u05E4\u05EA\u05D9\u05EA \u05DC\u05D8\u05D9\u05E7\u05D8 \u05D4\u05EA\u05DE\u05D9\u05DB\u05D4 \u05D4\u05D1\u05D0:
\u05E0\u05D5\u05E9\u05D0: ${ticket.subject}
\u05EA\u05D9\u05D0\u05D5\u05E8: ${ticket.description}
\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4: ${ticket.category}
\u05E2\u05D3\u05D9\u05E4\u05D5\u05EA: ${ticket.priority}

\u05DB\u05DC\u05D5\u05DC: 1) \u05D4\u05D1\u05E0\u05EA \u05D4\u05D1\u05E2\u05D9\u05D4 2) \u05E4\u05EA\u05E8\u05D5\u05DF \u05DE\u05D5\u05E6\u05E2 3) \u05E6\u05E2\u05D3\u05D9\u05DD \u05E0\u05D5\u05E1\u05E4\u05D9\u05DD \u05D0\u05DD \u05E0\u05D3\u05E8\u05E9 4) \u05D8\u05D5\u05DF \u05DE\u05E7\u05E6\u05D5\u05E2\u05D9 \u05D5\u05D0\u05DE\u05E4\u05EA\u05D9`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              reply_content: { type: "string" },
              solution_steps: {
                type: "array",
                items: { type: "string" },
              },
              escalate: { type: "boolean" },
              estimated_resolution_time: { type: "string" },
            },
          },
        }),
      });
      const response = await res.json();

      await createActionMutation.mutateAsync({
        agent_id: "support-agent-1",
        agent_name: "Support Agent",
        action_type: "draft_reply",
        status: "pending_approval",
        priority: ticket.priority,
        context: {
          entity_type: "SupportTicket",
          entity_id: ticket.id,
          entity_name: ticket.subject,
        },
        suggested_action: response,
        reasoning: "\u05DE\u05E2\u05E0\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9 \u05DE\u05D1\u05D5\u05E1\u05E1 AI",
        confidence_score: 0.81,
      });
    } catch {
      toast.error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA \u05EA\u05E9\u05D5\u05D1\u05D4");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-purple-600" />
          <CardTitle className="text-base">Support Agent</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          {"\u05D4\u05E1\u05D5\u05DB\u05DF \u05D9\u05DB\u05D5\u05DC \u05DC\u05E0\u05E1\u05D7 \u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05D5\u05EA \u05DC\u05D8\u05D9\u05E7\u05D8\u05D9 \u05EA\u05DE\u05D9\u05DB\u05D4"}
        </p>
        <Button
          onClick={draftReply}
          disabled={loading}
          size="sm"
          className="w-full"
        >
          <MessageSquare className="w-4 h-4 ml-2" />
          {"\u05E0\u05E1\u05D7 \u05EA\u05E9\u05D5\u05D1\u05D4"}
        </Button>
      </CardContent>
    </Card>
  );
}
