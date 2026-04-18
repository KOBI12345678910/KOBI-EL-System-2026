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
import { ShoppingCart, FileText } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProcurementItem {
  name: string;
  quantity: number;
}

interface AgentAction {
  agent_id: string;
  agent_name: string;
  action_type: string;
  status: string;
  priority: string;
  suggested_action: unknown;
  reasoning: string;
  confidence_score: number;
}

interface ProcurementAgentProps {
  items: ProcurementItem[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProcurementAgent({ items }: ProcurementAgentProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const createActionMutation = useMutation({
    mutationFn: (data: AgentAction) =>
      entityCreate<AgentAction>("agent-action", data),
    onSuccess: () => {
      toast.success("\u05D8\u05D9\u05D5\u05D8\u05EA RFQ \u05E0\u05D5\u05E6\u05E8\u05D4 \u05D5\u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8");
      queryClient.invalidateQueries({ queryKey: ["agent_actions"] });
    },
  });

  const draftRFQ = async () => {
    setLoading(true);
    try {
      const prompt = `\u05E6\u05D5\u05E8 \u05D8\u05D9\u05D5\u05D8\u05EA \u05D1\u05E7\u05E9\u05EA \u05D4\u05E6\u05E2\u05EA \u05DE\u05D7\u05D9\u05E8 (RFQ) \u05E2\u05D1\u05D5\u05E8 \u05D4\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05D4\u05D1\u05D0\u05D9\u05DD:
${items.map((i) => `- ${i.name}: \u05DB\u05DE\u05D5\u05EA ${i.quantity}`).join("\n")}

\u05DB\u05DC\u05D5\u05DC: 1) \u05EA\u05D9\u05D0\u05D5\u05E8 \u05DE\u05E4\u05D5\u05E8\u05D8 2) \u05DE\u05E4\u05E8\u05D8 \u05D8\u05DB\u05E0\u05D9 3) \u05EA\u05E0\u05D0\u05D9 \u05D0\u05E1\u05E4\u05E7\u05D4 4) \u05EA\u05D0\u05E8\u05D9\u05DA \u05D9\u05E2\u05D3`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              technical_specs: { type: "string" },
              delivery_terms: { type: "string" },
              target_date: { type: "string" },
            },
          },
        }),
      });
      const response = await res.json();

      await createActionMutation.mutateAsync({
        agent_id: "procurement-agent-1",
        agent_name: "Procurement Agent",
        action_type: "create_rfq",
        status: "pending_approval",
        priority: "normal",
        suggested_action: response,
        reasoning: "\u05D8\u05D9\u05D5\u05D8\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05D1\u05D4\u05EA\u05D1\u05E1\u05E1 \u05E2\u05DC \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05E0\u05D3\u05E8\u05E9\u05D9\u05DD",
        confidence_score: 0.78,
      });
    } catch {
      toast.error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA \u05D8\u05D9\u05D5\u05D8\u05D4");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-green-600" />
          <CardTitle className="text-base">Procurement Agent</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          {"\u05D4\u05E1\u05D5\u05DB\u05DF \u05D9\u05DB\u05D5\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D8\u05D9\u05D5\u05D8\u05D5\u05EA RFQ \u05D5-PO \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05D5\u05EA"}
        </p>
        <Button
          onClick={draftRFQ}
          disabled={loading || !items?.length}
          size="sm"
          className="w-full"
        >
          <FileText className="w-4 h-4 ml-2" />
          {"\u05E6\u05D5\u05E8 \u05D8\u05D9\u05D5\u05D8\u05EA RFQ"}
        </Button>
      </CardContent>
    </Card>
  );
}
