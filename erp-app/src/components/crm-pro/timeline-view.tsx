import { useQuery } from "@tanstack/react-query";
import { entityList } from "@/lib/entity-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, User } from "lucide-react";

interface ActivityItem {
  id: number;
  action_type?: string;
  description?: string;
  entity_id?: number;
  performed_by?: string;
  created_date?: string;
}

interface Lead {
  id: number;
  full_name?: string;
}

export default function TimelineView() {
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => entityList<ActivityItem>("activities"),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => entityList<Lead>("leads"),
  });

  const getLead = (entityId?: number) => leads.find((l) => l.id === entityId);

  const actionTypeLabel: Record<string, string> = {
    call: "שיחה",
    email: "אימייל",
    whatsapp: "וואטסאפ",
    meeting: "פגישה",
    note: "הערה",
  };

  const actionColor: Record<string, string> = {
    call: "bg-blue-100 text-blue-800",
    email: "bg-purple-100 text-purple-800",
    whatsapp: "bg-green-100 text-green-800",
    meeting: "bg-orange-100 text-orange-800",
    note: "bg-slate-100 text-slate-800",
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute right-4 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-600 to-slate-300" />
        <div className="space-y-4 pl-12">
          {activities.map((activity) => (
            <Card key={activity.id} className="p-4 border-l-4 border-blue-600 relative">
              <div className="absolute -right-8 top-4 w-5 h-5 rounded-full bg-blue-600 border-4 border-slate-50" />

              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex gap-2 items-center">
                    <Badge className={actionColor[activity.action_type || "note"]}>
                      {actionTypeLabel[activity.action_type || "note"]}
                    </Badge>
                    <span className="text-sm text-slate-600">
                      {getLead(activity.entity_id)?.full_name}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{activity.description}</p>
                  <div className="flex gap-4 mt-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {activity.created_date
                        ? new Date(activity.created_date).toLocaleDateString("he-IL")
                        : ""}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {activity.performed_by}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
