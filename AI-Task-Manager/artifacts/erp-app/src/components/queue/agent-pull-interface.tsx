import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Hand } from "lucide-react";
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

export default function AgentPullInterface() {
  const [pulling, setPulling] = useState(null);
  const currentUser = React.useRef(null);

  // Get current user
  React.useEffect(() => {
    authJson("/api/auth/me").then((user) => {
      currentUser.current = user;
    });
  }, []);

  // Fetch available queue leads
  const { data: availableLeads = [], refetch } = useQuery({
    queryKey: ["availableQueueLeads"],
    queryFn: async () => {
      // Get all pending assignment requests
      const requests = await entityFilter<any>("lead-assignment-requests", {
        status: "pending",
        assignment_type: ["agent_pull", "hybrid"],
      });

      // Get leads for these requests
      const leadIds = requests.map((r) => r.lead_id);
      const leads = await Promise.all(
        leadIds.map((id) =>
          entityFilter<any>("leads", { id }).then((l) => l[0])
        )
      );

      return leads.filter(Boolean).map((lead) => ({
        ...lead,
        request: requests.find((r) => r.lead_id === lead.id),
      }));
    },
    refetchInterval: 5000,
  });

  const handlePullLead = async (lead) => {
    if (!currentUser.current) return;

    setPulling(lead.id);
    try {
      const requiresApproval = lead.request?.requires_approval || false;

      if (requiresApproval) {
        // 1. Create approval request
        const request = await entityCreate<any>("lead-assignment-requests", {
          lead_id: lead.id,
          requested_by: currentUser.current.id,
          assignment_type: "hybrid",
          status: "pending",
          requires_approval: true,
        });

        // 2. Create notification for manager (optional)
        // In real implementation, would notify manager

        return {
          type: "pending_approval",
          message: `בקשה נשלחה למנהל - בהמתנה לאישור`,
          request_id: request.id,
        };
      } else {
        // Auto-approve (no manager needed)
        await entityCreate<any>("lead-assignment-requests", {
          lead_id: lead.id,
          requested_by: currentUser.current.id,
          assignment_type: "agent_pull",
          status: "approved",
          approved_by: currentUser.current.id,
          approved_at: new Date().toISOString(),
        });

        // Update lead owner
        await entityUpdate<any>("leads", lead.id, {
          owner_id: currentUser.current.id,
          assigned_at: new Date().toISOString(),
        });

        // Create activity
        await entityCreate<any>("activities", {
          entity_type: "lead",
          entity_id: lead.id,
          action_type: "assignment",
          description: `${currentUser.current.full_name} משך ליד מהתור`,
          performed_by: currentUser.current.id,
        });

        // Create "First Contact" task
        await entityCreate<any>("tasks", {
          lead_id: lead.id,
          assigned_to: currentUser.current.id,
          title: "First Contact",
          description: `התקשר או שלח הודעה ל-${lead.full_name}`,
          status: "todo",
          priority: "high",
          category: "follow_up",
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

        refetch();
        return {
          type: "success",
          message: `ליד הוקצה לך בהצלחה!`,
        };
      }
    } catch (error) {
      console.error("Pull error:", error);
      return { type: "error", message: "שגיאה במשיכת הליד" };
    } finally {
      setPulling(null);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hand className="w-5 h-5 text-blue-600" />
          משוך לידים מהתור
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableLeads.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-600">אין לידים זמינים בתור</p>
          </div>
        ) : (
          <div className="space-y-3">
            {availableLeads.map((lead) => (
              <div
                key={lead.id}
                className="p-4 rounded-lg border border-slate-200 bg-white hover:shadow-md transition space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{lead.full_name}</p>
                    <p className="text-sm text-slate-600">{lead.phone}</p>
                    {lead.email && (
                      <p className="text-xs text-slate-500">{lead.email}</p>
                    )}
                  </div>
                  <Badge variant="outline">{lead.source}</Badge>
                </div>

                {lead.company_name && (
                  <p className="text-xs text-slate-600 px-4 py-1 bg-slate-50 rounded w-fit">
                    {lead.company_name}
                  </p>
                )}

                {lead.request?.requires_approval && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-300">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm text-yellow-700">
                      דרוש אישור מנהל
                    </span>
                  </div>
                )}

                <Button
                  onClick={() => handlePullLead(lead)}
                  disabled={pulling === lead.id}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {pulling === lead.id ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      בעיצומו...
                    </>
                  ) : (
                    <>
                      <Hand className="w-4 h-4 mr-2" />
                      משוך ליד
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}