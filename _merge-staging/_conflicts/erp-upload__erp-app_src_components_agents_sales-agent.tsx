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
import { DollarSign, Send } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  name: string;
  company?: string;
  status: string;
  product_interest: string;
  notes?: string;
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

interface SalesAgentProps {
  lead: Lead;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SalesAgent({ lead }: SalesAgentProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const createActionMutation = useMutation({
    mutationFn: (data: AgentAction) =>
      entityCreate<AgentAction>("agent-action", data),
    onSuccess: () => {
      toast.success("\u05E4\u05E2\u05D5\u05DC\u05D4 \u05E0\u05D5\u05E6\u05E8\u05D4 \u05D5\u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8");
      queryClient.invalidateQueries({ queryKey: ["agent_actions"] });
    },
  });

  const suggestFollowUp = async () => {
    setLoading(true);
    try {
      const prompt = `\u05D1\u05D4\u05EA\u05D1\u05E1\u05E1 \u05E2\u05DC \u05D4\u05DC\u05D9\u05D3 \u05D4\u05D1\u05D0, \u05D4\u05E6\u05E2 \u05DE\u05E2\u05E7\u05D1 \u05DE\u05DB\u05D9\u05E8\u05D5\u05EA \u05DE\u05EA\u05D0\u05D9\u05DD:
\u05E9\u05DD: ${lead.name}
\u05D7\u05D1\u05E8\u05D4: ${lead.company || "\u05DC\u05D0 \u05E6\u05D5\u05D9\u05DF"}
\u05E1\u05D8\u05D8\u05D5\u05E1: ${lead.status}
\u05EA\u05D7\u05D5\u05DD \u05E2\u05E0\u05D9\u05D9\u05DF: ${lead.product_interest}
\u05D4\u05E2\u05E8\u05D5\u05EA: ${lead.notes || "\u05D0\u05D9\u05DF"}

\u05D4\u05E6\u05E2: 1) \u05EA\u05D5\u05DB\u05DF \u05DE\u05D9\u05D9\u05DC \u05DE\u05E2\u05E7\u05D1 2) \u05EA\u05D6\u05DE\u05D5\u05DF \u05DE\u05D5\u05DE\u05DC\u05E5 3) \u05D4\u05E6\u05E2\u05D5\u05EA \u05DE\u05D7\u05D9\u05E8 \u05D0\u05D5 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05E8\u05DC\u05D5\u05D5\u05E0\u05D8\u05D9\u05D9\u05DD`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              email_content: { type: "string" },
              suggested_timing: { type: "string" },
              products: { type: "array", items: { type: "string" } },
              reasoning: { type: "string" },
            },
          },
        }),
      });
      const response = await res.json();

      await createActionMutation.mutateAsync({
        agent_id: "sales-agent-1",
        agent_name: "Sales Follow-Up Agent",
        action_type: "follow_up",
        status: "pending_approval",
        priority: "normal",
        context: {
          entity_type: "Lead",
          entity_id: lead.id,
          entity_name: lead.name,
        },
        suggested_action: response,
        reasoning: response.reasoning,
        confidence_score: 0.85,
      });
    } catch {
      toast.error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA \u05D4\u05E6\u05E2\u05EA \u05DE\u05E2\u05E7\u05D1");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-indigo-600" />
          <CardTitle className="text-base">Sales Agent</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          {"\u05D4\u05E1\u05D5\u05DB\u05DF \u05D9\u05DB\u05D5\u05DC \u05DC\u05D4\u05E6\u05D9\u05E2 \u05DE\u05E2\u05E7\u05D1 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9, \u05DC\u05E0\u05E1\u05D7 \u05DE\u05D9\u05D9\u05DC\u05D9\u05DD \u05D5\u05DC\u05D4\u05DE\u05DC\u05D9\u05E5 \u05E2\u05DC \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD"}
        </p>
        <Button
          onClick={suggestFollowUp}
          disabled={loading}
          size="sm"
          className="w-full"
        >
          <Send className="w-4 h-4 ml-2" />
          {"\u05D4\u05E6\u05E2 \u05DE\u05E2\u05E7\u05D1"}
        </Button>
      </CardContent>
    </Card>
  );
}
