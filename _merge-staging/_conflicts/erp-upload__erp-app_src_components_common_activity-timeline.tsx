import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Edit, UserPlus, FileText, CheckCircle, Clock, type LucideIcon } from "lucide-react";

interface ActivityItem {
  id?: string | number;
  type?: string;
  action: string;
  user_name?: string;
  created_date?: string;
}

interface ActivityTimelineProps {
  activities?: ActivityItem[];
}

const iconMap: Record<string, LucideIcon> = {
  comment: MessageSquare,
  status_change: CheckCircle,
  assignment: UserPlus,
  file_upload: FileText,
  field_update: Edit,
  system: Clock,
};

const colorMap: Record<string, string> = {
  comment: "bg-blue-100 text-blue-600",
  status_change: "bg-green-100 text-green-600",
  assignment: "bg-purple-100 text-purple-600",
  file_upload: "bg-orange-100 text-orange-600",
  field_update: "bg-yellow-100 text-yellow-600",
  system: "bg-slate-100 text-slate-600",
};

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "הרגע";
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export default function ActivityTimeline({ activities = [] }: ActivityTimelineProps) {
  const defaultActivities: ActivityItem[] = [
    { id: "1", type: "status_change", action: 'עודכן הסטטוס ל"בטיפול"', user_name: "דני כהן", created_date: new Date().toISOString() },
    { id: "2", type: "comment", action: 'הוסיף תגובה: "צריך לבדוק עם הלקוח"', user_name: "שרה לוי", created_date: new Date(Date.now() - 3600000).toISOString() },
    { id: "3", type: "assignment", action: "הוקצה למשה כהן", user_name: "מנהל", created_date: new Date(Date.now() - 7200000).toISOString() },
  ];

  const displayActivities = activities.length > 0 ? activities : defaultActivities;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">ציר זמן</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayActivities.map((activity, idx) => {
            const Icon = iconMap[activity.type || "system"] || MessageSquare;
            const colorClass = colorMap[activity.type || "system"] || "bg-slate-100 text-slate-600";
            return (
              <div key={activity.id || idx} className="flex gap-3">
                <div className={`${colorClass} p-2 rounded-lg h-fit`}><Icon className="w-4 h-4" /></div>
                <div className="flex-1 pb-4 border-b last:border-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm">{activity.action}</p>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(activity.created_date)}</span>
                  </div>
                  <div className="text-xs text-slate-500">{activity.user_name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
