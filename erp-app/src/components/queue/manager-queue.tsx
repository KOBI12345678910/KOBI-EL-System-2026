import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Zap, CheckCircle2, Clock } from "lucide-react";
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

export default function ManagerQueue() {
  const [selectedLead, setSelectedLead] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [filter, setFilter] = useState("all");

  // Fetch queue leads (leads in pending assignment)
  const { data: queueLeads = [], refetch: refetchQueue } = useQuery({
    queryKey: ["managerQueue", filter],
    queryFn: async () => {
      const assignments = await entityFilter<any>("lead-assignment-requests", {
        status: filter === "all" ? undefined : filter,
      });

      const leadIds = assignments.map((a) => a.lead_id);
      const leads = await Promise.all(
        leadIds.map((id) => entityFilter<any>("leads", { id }))
      );

      return leads
        .flat()
        .map((lead) => ({
          ...lead,
          assignment: assignments.find((a) => a.lead_id === lead.id),
        }));
    },
    refetchInterval: 5000,
  });

  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => entityFilter<any>("users", { role: "user" }),
  });

  const handleAssign = async () => {
    if (!selectedLead || !selectedAgent) {
      alert("בחר ליד וסוכן");
      return;
    }

    try {
      // 1. Create/Update assignment request
      await entityCreate<any>("lead-assignment-requests", {
        lead_id: selectedLead.id,
        requested_by: (await authJson("/api/auth/me")).id,
        assignment_type: "manager_assign",
        target_agent_id: selectedAgent,
        status: "approved",
        approved_by: (await authJson("/api/auth/me")).id,
        approved_at: new Date().toISOString(),
      });

      // 2. Update lead owner
      await entityUpdate<any>("leads", selectedLead.id, {
        owner_id: selectedAgent,
        assigned_at: new Date().toISOString(),
      });

      // 3. Create activity
      const agent = agents.find((a) => a.id === selectedAgent);
      await entityCreate<any>("activities", {
        entity_type: "lead",
        entity_id: selectedLead.id,
        action_type: "assignment",
        description: `הוקצה ל-${agent?.full_name} על ידי מנהל`,
        performed_by: (await authJson("/api/auth/me")).id,
      });

      // 4. Create "First Contact" task
      await entityCreate<any>("tasks", {
        lead_id: selectedLead.id,
        assigned_to: selectedAgent,
        title: "First Contact",
        description: `התקשר או שלח הודעה ל-${selectedLead.full_name}`,
        status: "todo",
        priority: "high",
        category: "follow_up",
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      setSelectedLead(null);
      setSelectedAgent("");
      refetchQueue();
    } catch (error) {
      console.error("Assignment error:", error);
    }
  };

  const getQueueCount = (status) => {
    if (status === "all") return queueLeads.length;
    return queueLeads.filter((l) => l.assignment?.status === status).length;
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100">
          <CardContent className="pt-6">
            <p className="text-slate-600 text-sm">סה"כ בתור</p>
            <p className="text-4xl font-bold text-indigo-600">{queueLeads.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-amber-100">
          <CardContent className="pt-6">
            <p className="text-slate-600 text-sm">בהמתנה</p>
            <p className="text-4xl font-bold text-amber-600">
              {getQueueCount("pending")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-100">
          <CardContent className="pt-6">
            <p className="text-slate-600 text-sm">מאושרים</p>
            <p className="text-4xl font-bold text-green-600">
              {getQueueCount("approved")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "pending", "approved"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            onClick={() => setFilter(status)}
            className={filter === status ? "bg-indigo-600" : ""}
          >
            {status === "all" && "הכל"}
            {status === "pending" && "בהמתנה"}
            {status === "approved" && "מאושרים"}
          </Button>
        ))}
      </div>

      {/* Queue List */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            תור הלידים ({queueLeads.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {queueLeads.length === 0 ? (
            <p className="text-center text-slate-600 py-8">אין לידים בתור</p>
          ) : (
            queueLeads.map((lead) => (
              <div
                key={lead.id}
                className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                  selectedLead?.id === lead.id
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
                onClick={() => setSelectedLead(lead)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{lead.full_name}</p>
                    <p className="text-sm text-slate-600">{lead.phone}</p>
                    {lead.company_name && (
                      <p className="text-xs text-slate-500">{lead.company_name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      className={
                        lead.assignment?.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                      }
                    >
                      {lead.assignment?.status === "pending" ? (
                        <>
                          <Clock className="w-3 h-3 ml-1" />
                          בהמתנה
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3 ml-1" />
                          מאושר
                        </>
                      )}
                    </Badge>
                    <span className="text-xs text-slate-600">
                      {lead.source}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Assignment Panel */}
      {selectedLead && (
        <Card className="border-0 shadow-lg bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              הקצה: {selectedLead.full_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">בחר סוכן:</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="border-slate-300">
                  <SelectValue placeholder="בחר סוכן" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleAssign}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                הקצה
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedLead(null)}
              >
                ביטול
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}