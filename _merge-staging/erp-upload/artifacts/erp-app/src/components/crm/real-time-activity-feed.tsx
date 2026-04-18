import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface ActivityItem {
  id: number;
  type: string;
  user: string;
  contact: string;
  title: string;
  time: Date;
  status: string;
  icon: LucideIcon;
}

export default function RealTimeActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const mockActivities: ActivityItem[] = [
      {
        id: 1,
        type: "call",
        user: "דור בן אור",
        contact: "משה כהן",
        title: "שיחה עם לקוח",
        time: new Date(Date.now() - 5 * 60000),
        status: "completed",
        icon: Phone,
      },
      {
        id: 2,
        type: "email",
        user: "שרה לוי",
        contact: "דינה רוזנברג",
        title: "שלחה הצעת מחיר",
        time: new Date(Date.now() - 15 * 60000),
        status: "sent",
        icon: Mail,
      },
      {
        id: 3,
        type: "deal",
        user: "אלי ישראלי",
        contact: "חברת ABC",
        title: "עסקה זכתה - 150K",
        time: new Date(Date.now() - 30 * 60000),
        status: "closed_won",
        icon: CheckCircle2,
      },
      {
        id: 4,
        type: "note",
        user: "מרים בר",
        contact: "יוסי גולדמן",
        title: "הוספת הערה למשא ומתן",
        time: new Date(Date.now() - 45 * 60000),
        status: "pending",
        icon: FileText,
      },
      {
        id: 5,
        type: "alert",
        user: "System",
        contact: "ליד חם",
        title: "ליד יוצא מהעדכון - דרוש פעולה",
        time: new Date(Date.now() - 60 * 60000),
        status: "alert",
        icon: AlertCircle,
      },
    ];
    setActivities(mockActivities);
  }, []);

  const getActivityColor = (status: string) => {
    const colors: Record<string, string> = {
      completed: "text-emerald-600",
      sent: "text-blue-600",
      closed_won: "text-green-600",
      pending: "text-amber-600",
      alert: "text-red-600",
    };
    return colors[status] || "text-slate-600";
  };

  const getActivityBg = (status: string) => {
    const bg: Record<string, string> = {
      completed: "bg-emerald-50",
      sent: "bg-blue-50",
      closed_won: "bg-green-50",
      pending: "bg-amber-50",
      alert: "bg-red-50",
    };
    return bg[status] || "bg-slate-50";
  };

  const filteredActivities =
    filter === "all" ? activities : activities.filter((a) => a.type === filter);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-indigo-600" />
            פעילות בזמן אמת
          </CardTitle>
          <div className="flex gap-2">
            {["all", "call", "email", "deal"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f === "all"
                  ? "הכל"
                  : f === "call"
                    ? "שיחות"
                    : f === "email"
                      ? "מיילים"
                      : "עסקאות"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {filteredActivities.length === 0 ? (
            <p className="text-center text-slate-500 py-8 text-sm">
              אין פעילויות בקטגוריה זו
            </p>
          ) : (
            filteredActivities.map((activity) => {
              const Icon = activity.icon;
              return (
                <div
                  key={activity.id}
                  className={`p-4 rounded-lg border border-slate-200 ${getActivityBg(activity.status)} hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-full ${getActivityBg(activity.status)} flex items-center justify-center`}
                    >
                      <Icon className={`w-5 h-5 ${getActivityColor(activity.status)}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-slate-900 text-sm">
                          {activity.title}
                        </p>
                        <Badge variant="outline" className="text-xs">
                          {format(activity.time, "HH:mm", { locale: he })}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600">
                        <span className="font-medium">{activity.user}</span> -{" "}
                        {activity.contact}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
