import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Phone, Mail, Calendar, FileText, MessageSquare, type LucideIcon } from "lucide-react";
import { format } from "date-fns";

interface ActivityItem {
  id: string | number;
  type: string;
  title: string;
  related_name?: string;
  date?: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
}

const activityIcons: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  task: FileText,
  note: MessageSquare,
};

const activityColors: Record<string, string> = {
  call: "bg-blue-100 text-blue-600",
  email: "bg-purple-100 text-purple-600",
  meeting: "bg-green-100 text-green-600",
  task: "bg-orange-100 text-orange-600",
  note: "bg-slate-100 text-slate-600",
};

export default function RecentActivity({ activities = [] }: RecentActivityProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">פעילות אחרונה</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">אין פעילות אחרונה</p>
        ) : (
          activities.slice(0, 5).map((activity) => {
            const Icon = activityIcons[activity.type] || MessageSquare;
            return (
              <div key={activity.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className={`p-2 rounded-lg ${activityColors[activity.type] || "bg-slate-100 text-slate-600"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{activity.title}</p>
                  <p className="text-xs text-slate-500">{activity.related_name}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {activity.date ? format(new Date(activity.date), "dd/MM") : ""}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
