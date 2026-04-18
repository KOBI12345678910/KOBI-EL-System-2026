import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

export default function ApprovalCenter() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [processing, setProcessing] = useState(null);

  const currentUser = React.useRef(null);
  React.useEffect(() => {
    authJson("/api/auth/me").then((user) => {
      currentUser.current = user;
    });
  }, []);

  // Fetch pending approval requests
  const { data: pendingRequests = [], refetch } = useQuery({
    queryKey: ["pendingApprovals"],
    queryFn: async () => {
      const requests = await entityFilter<any>("lead-assignment-requests", {
        status: "pending",
        requires_approval: true,
      });

      // Get lead details for each request
      const enriched = await Promise.all(
        requests.map(async (req) => {
          const lead = await entityFilter<any>("leads", { id: req.lead_id });
          const requester = await entityFilter<any>("users", {
            id: req.requested_by,
          });
          return {
            ...req,
            lead: lead[0],
            requester: requester[0],
          };
        })
      );

      return enriched;
    },
    refetchInterval: 5000,
  });

  const handleApprove = async () => {
    if (!selectedRequest || !currentUser.current) return;

    setProcessing("approve");
    try {
      // 1. Update assignment request
      await entityUpdate<any>("lead-assignment-requests", 
        selectedRequest.id,
        {
          status: "approved",
          approved_by: currentUser.current.id,
          approved_at: new Date().toISOString(),
          approval_notes: approvalNotes,
        }
      );

      // 2. Update lead owner
      await entityUpdate<any>("leads", selectedRequest.lead_id, {
        owner_id: selectedRequest.requested_by,
        assigned_at: new Date().toISOString(),
      });

      // 3. Create activity
      await entityCreate<any>("activities", {
        entity_type: "lead",
        entity_id: selectedRequest.lead_id,
        action_type: "assignment",
        description: `אושר על ידי מנהל: ${approvalNotes || "ללא הערות"}`,
        performed_by: currentUser.current.id,
      });

      // 4. Create "First Contact" task
      await entityCreate<any>("tasks", {
        lead_id: selectedRequest.lead_id,
        assigned_to: selectedRequest.requested_by,
        title: "First Contact",
        description: `התקשר או שלח הודעה ל-${selectedRequest.lead.full_name}`,
        status: "todo",
        priority: "high",
        category: "follow_up",
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      setSelectedRequest(null);
      setApprovalNotes("");
      refetch();
    } catch (error) {
      console.error("Approval error:", error);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (reason) => {
    if (!selectedRequest || !currentUser.current) return;

    setProcessing("reject");
    try {
      // 1. Update assignment request
      await entityUpdate<any>("lead-assignment-requests", 
        selectedRequest.id,
        {
          status: "rejected",
          rejected_reason: reason,
          approved_by: currentUser.current.id,
          approved_at: new Date().toISOString(),
        }
      );

      // 2. Create activity
      await entityCreate<any>("activities", {
        entity_type: "lead",
        entity_id: selectedRequest.lead_id,
        action_type: "note",
        description: `בקשת הקצאה דחויה: ${reason}`,
        performed_by: currentUser.current.id,
      });

      setSelectedRequest(null);
      setApprovalNotes("");
      refetch();
    } catch (error) {
      console.error("Rejection error:", error);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <AlertCircle className="w-6 h-6 text-orange-600" />
          מרכז אישורים - Approval Center
        </h2>
        <Badge className="bg-orange-100 text-orange-800">
          {pendingRequests.length} בהמתנה
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Requests List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              בקשות בהמתנה ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.length === 0 ? (
              <p className="text-center text-slate-600 py-8">אין בקשות בהמתנה</p>
            ) : (
              pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                    selectedRequest?.id === req.id
                      ? "border-orange-600 bg-orange-50"
                      : "border-slate-200 bg-white hover:border-orange-300"
                  }`}
                  onClick={() => {
                    setSelectedRequest(req);
                    setApprovalNotes("");
                  }}
                >
                  <p className="font-bold text-slate-900">
                    {req.lead?.full_name}
                  </p>
                  <p className="text-sm text-slate-600">{req.lead?.phone}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {req.requester?.full_name}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {req.assignment_type === "hybrid"
                        ? "משיכה"
                        : "הקצאה"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Approval Panel */}
        {selectedRequest ? (
          <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-50 to-red-50">
            <CardHeader>
              <CardTitle className="text-orange-900">
                אישור בקשה - {selectedRequest.lead?.full_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-white rounded-lg border border-orange-300 space-y-3">
                <div>
                  <p className="text-xs text-slate-600">בקשה מ:</p>
                  <p className="font-semibold">
                    {selectedRequest.requester?.full_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">סוג:</p>
                  <p className="font-semibold">
                    {selectedRequest.assignment_type === "hybrid"
                      ? "משיכה (דורש אישור)"
                      : "בקשת הקצאה"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600">מקור:</p>
                  <p className="font-semibold">{selectedRequest.lead?.source}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  הערות אישור (אופציונלי):
                </label>
                <Textarea
                  placeholder="הערות על ההחלטה..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="border-slate-300"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleApprove}
                  disabled={processing === "approve"}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {processing === "approve" ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      בעיצומו...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      אישור
                    </>
                  )}
                </Button>
                <Button
                  onClick={() =>
                    handleReject("לא מתאים במועד זה")
                  }
                  disabled={processing === "reject"}
                  variant="outline"
                  className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {processing === "reject" ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      בעיצומו...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      דחיה
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-lg bg-slate-50 flex items-center justify-center">
            <CardContent className="text-center py-12 text-slate-600">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>בחר בקשה לאישור</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}