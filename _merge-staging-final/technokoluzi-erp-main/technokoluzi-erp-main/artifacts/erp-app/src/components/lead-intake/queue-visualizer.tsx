import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock } from "lucide-react";
import { entityUpdate } from "@/lib/entity-api";

export default function QueueVisualizer({ assignments, leads }) {
  const [actionLoading, setActionLoading] = useState(null);

  const assignmentsWithLeads = assignments.map((assignment) => {
    const lead = leads.find((l) => l.id === assignment.lead_id);
    return { ...assignment, lead };
  });

  const handleAccept = async (assignmentId) => {
    setActionLoading(assignmentId);
    try {
      await entityUpdate<any>("lead-assignments", assignmentId, {
        status: "accepted",
        accepted_at: new Date().toISOString(),
      });
      const assignment = assignments.find((a) => a.id === assignmentId);
      if (assignment) {
        await entityUpdate<any>("leads", assignment.lead_id, {
          owner_id: assignment.assigned_to,
        });
      }
    } catch (error) {
      console.error("Error accepting assignment:", error);
    }
    setActionLoading(null);
  };

  const handleReject = async (assignmentId) => {
    setActionLoading(assignmentId);
    try {
      await entityUpdate<any>("lead-assignments", assignmentId, {
        status: "rejected",
        reason: "Agent rejected",
      });
    } catch (error) {
      console.error("Error rejecting assignment:", error);
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="p-6 text-center">
            <p className="text-slate-600 text-sm">Pending</p>
            <p className="text-3xl font-bold text-amber-600">{assignments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-6 text-center">
            <p className="text-slate-600 text-sm">Avg Wait Time</p>
            <p className="text-2xl font-bold text-slate-900">4h</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-6 text-center">
            <p className="text-slate-600 text-sm">Acceptance Rate</p>
            <p className="text-2xl font-bold text-green-600">78%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Manager Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assignmentsWithLeads.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-600">Queue is empty ✅</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignmentsWithLeads.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-white rounded-lg border-l-4 border-amber-500"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-bold">{item.lead?.full_name || "Unknown"}</p>
                        <Badge className="bg-amber-100 text-amber-900">PENDING</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                        <div>Phone: {item.lead?.phone}</div>
                        <div>Company: {item.lead?.company_name || "N/A"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleAccept(item.id)}
                        disabled={actionLoading === item.id}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Assign
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => handleReject(item.id)}
                        disabled={actionLoading === item.id}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}