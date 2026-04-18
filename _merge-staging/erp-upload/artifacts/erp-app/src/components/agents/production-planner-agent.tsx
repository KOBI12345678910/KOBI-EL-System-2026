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
import { Factory, Calendar } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProductionOrder {
  product_name: string;
  quantity: number;
  priority: string;
  due_date: string;
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

interface ProductionPlannerAgentProps {
  orders: ProductionOrder[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductionPlannerAgent({
  orders,
}: ProductionPlannerAgentProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const createActionMutation = useMutation({
    mutationFn: (data: AgentAction) =>
      entityCreate<AgentAction>("agent-action", data),
    onSuccess: () => {
      toast.success("\u05D4\u05E6\u05E2\u05EA \u05DC\u05D5\u05D7 \u05D6\u05DE\u05E0\u05D9\u05DD \u05E0\u05D5\u05E6\u05E8\u05D4 \u05D5\u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8");
      queryClient.invalidateQueries({ queryKey: ["agent_actions"] });
    },
  });

  const suggestSchedule = async () => {
    setLoading(true);
    try {
      const prompt = `\u05EA\u05DB\u05E0\u05DF \u05DC\u05D5\u05D7 \u05D6\u05DE\u05E0\u05D9\u05DD \u05D0\u05D5\u05E4\u05D8\u05D9\u05DE\u05DC\u05D9 \u05DC\u05E4\u05E7\u05D5\u05D3\u05D5\u05EA \u05D4\u05D9\u05D9\u05E6\u05D5\u05E8 \u05D4\u05D1\u05D0\u05D5\u05EA:
${orders.map((o) => `- ${o.product_name}: \u05DB\u05DE\u05D5\u05EA ${o.quantity}, \u05E2\u05D3\u05D9\u05E4\u05D5\u05EA ${o.priority}, \u05D9\u05E2\u05D3 ${o.due_date}`).join("\n")}

\u05D4\u05EA\u05D7\u05E9\u05D1 \u05D1: 1) \u05E2\u05D3\u05D9\u05E4\u05D5\u05D9\u05D5\u05EA 2) \u05EA\u05DC\u05D5\u05D9\u05D5\u05EA 3) \u05D6\u05DE\u05E0\u05D9 \u05D9\u05D9\u05E6\u05D5\u05E8 \u05DE\u05E9\u05D5\u05E2\u05E8\u05D9\u05DD 4) \u05DE\u05D2\u05D1\u05DC\u05D5\u05EA \u05DE\u05E9\u05D0\u05D1\u05D9\u05DD`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              schedule: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    order_id: { type: "string" },
                    start_date: { type: "string" },
                    end_date: { type: "string" },
                    workstation: { type: "string" },
                    notes: { type: "string" },
                  },
                },
              },
              reasoning: { type: "string" },
              bottlenecks: { type: "array", items: { type: "string" } },
            },
          },
        }),
      });
      const response = await res.json();

      await createActionMutation.mutateAsync({
        agent_id: "production-planner-1",
        agent_name: "Production Planner Agent",
        action_type: "schedule_production",
        status: "pending_approval",
        priority: "high",
        suggested_action: response,
        reasoning: response.reasoning,
        confidence_score: 0.72,
      });
    } catch {
      toast.error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D9\u05E6\u05D9\u05E8\u05EA \u05DC\u05D5\u05D7 \u05D6\u05DE\u05E0\u05D9\u05DD");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Factory className="w-5 h-5 text-orange-600" />
          <CardTitle className="text-base">
            Production Planner Agent
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          {"\u05D4\u05E1\u05D5\u05DB\u05DF \u05D9\u05DB\u05D5\u05DC \u05DC\u05D4\u05E6\u05D9\u05E2 \u05DC\u05D5\u05D7 \u05D6\u05DE\u05E0\u05D9\u05DD \u05D0\u05D5\u05E4\u05D8\u05D9\u05DE\u05DC\u05D9 \u05DC\u05D9\u05D9\u05E6\u05D5\u05E8"}
        </p>
        <Button
          onClick={suggestSchedule}
          disabled={loading || !orders?.length}
          size="sm"
          className="w-full"
        >
          <Calendar className="w-4 h-4 ml-2" />
          {"\u05D4\u05E6\u05E2 \u05DC\u05D5\u05D7 \u05D6\u05DE\u05E0\u05D9\u05DD"}
        </Button>
      </CardContent>
    </Card>
  );
}
