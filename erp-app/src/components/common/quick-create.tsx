import { useState, useEffect } from "react";
import { ClipboardList, CalendarCheck, Bell, AlertTriangle, Clock, ChevronDown, type LucideIcon } from "lucide-react";
import { createPageUrl } from "@/lib/route-map";
import { Link } from "wouter";
import { entityFilter, entityList } from "@/lib/entity-api";
import type { Task as TaskEntity, AlertRule, Meeting } from "@/types/base44-entities";

interface QuickCreateItem {
  label: string;
  icon: LucideIcon;
  page: string;
}

interface Category {
  title: string;
  icon: LucideIcon;
  bgColor: string;
  borderColor: string;
  textColor: string;
  count: number;
  isAlert: boolean;
  alertLabel: string;
  items: QuickCreateItem[];
}

export default function QuickCreate() {
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [counts, setCounts] = useState({ tasks: 0, tasksOverdue: 0, meetings: 0, alerts: 0, reminders: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [tasks, alerts, meetings, reminders] = await Promise.all([
          entityFilter<TaskEntity>("tasks", { status: "pending" }).catch(() => []),
          entityList<AlertRule>("alert-rules").catch(() => []),
          entityFilter<Meeting>("meetings", { status: "scheduled" }).catch(() => []),
          entityList<Record<string, unknown>>("reminders").catch(() => []),
        ]);
        const now = new Date();
        const tasksOverdue = tasks.filter((t) => t.due_date && new Date(t.due_date) < now && t.status !== "done").length;
        setCounts({ tasks: tasks.length, tasksOverdue, meetings: meetings.length, alerts: alerts.length, reminders: reminders.length });
      } catch (err) { console.error("Error fetching counts:", err); }
    };
    fetchCounts();
  }, []);

  const categories: Category[] = [
    {
      title: "משימות", icon: ClipboardList, bgColor: "bg-gradient-to-br from-blue-50 to-blue-100", borderColor: "border-blue-300", textColor: "text-blue-700",
      count: counts.tasks, isAlert: counts.tasksOverdue > 0, alertLabel: counts.tasksOverdue > 0 ? `${counts.tasksOverdue} באיחור` : "",
      items: [{ label: "משימה חדשה", icon: ClipboardList, page: "Tasks" }, { label: "רשימת משימות", icon: ClipboardList, page: "Tasks" }],
    },
    {
      title: "אירועים", icon: CalendarCheck, bgColor: "bg-gradient-to-br from-purple-50 to-purple-100", borderColor: "border-purple-300", textColor: "text-purple-700",
      count: counts.meetings, isAlert: false, alertLabel: "",
      items: [{ label: "פגישה חדשה", icon: CalendarCheck, page: "Meetings" }, { label: "לוח שנה", icon: CalendarCheck, page: "CalendarReminders" }],
    },
    {
      title: "התראות", icon: Bell, bgColor: "bg-gradient-to-br from-orange-50 to-orange-100", borderColor: "border-orange-300", textColor: "text-orange-700",
      count: counts.alerts, isAlert: counts.alerts > 0, alertLabel: "",
      items: [{ label: "התראה חדשה", icon: Bell, page: "AlertBuilder" }, { label: "ניהול התראות", icon: Bell, page: "NotificationRules" }],
    },
    {
      title: "חריגות", icon: AlertTriangle, bgColor: "bg-gradient-to-br from-red-50 to-red-100", borderColor: "border-red-300", textColor: "text-red-700",
      count: 0, isAlert: true, alertLabel: "",
      items: [{ label: "לידים לא מטופלים", icon: AlertTriangle, page: "Leads" }, { label: "הזמנות באיחור", icon: AlertTriangle, page: "SalesOrders" }],
    },
    {
      title: "תזכורות", icon: Clock, bgColor: "bg-gradient-to-br from-green-50 to-green-100", borderColor: "border-green-300", textColor: "text-green-700",
      count: counts.reminders, isAlert: false, alertLabel: "",
      items: [{ label: "תזכורות שלי", icon: Clock, page: "RemindersCalendar" }, { label: "הוסף תזכורת", icon: Clock, page: "CalendarReminders" }],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-3">
        {categories.map((category, catIdx) => {
          const CategoryIcon = category.icon;
          const isExpanded = expandedCategory === catIdx;
          return (
            <div key={catIdx} className="relative">
              <button onClick={() => setExpandedCategory(isExpanded ? null : catIdx)}
                className={`w-full flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${category.bgColor} ${category.borderColor} hover:shadow-lg`}>
                <CategoryIcon className={`w-6 h-6 ${category.textColor}`} />
                <span className={`text-sm font-bold ${category.textColor} text-center mt-2`}>{category.title}</span>
                <div className={`mt-2 px-3 py-1 rounded-full text-lg font-bold text-white ${category.isAlert ? "bg-red-500" : "bg-blue-500"}`}>{category.count}</div>
                {category.alertLabel && <div className="mt-1 px-2 py-0.5 rounded-full text-xs font-bold text-white bg-red-600">{category.alertLabel}</div>}
                <ChevronDown className={`w-4 h-4 ${category.textColor} transition-transform mt-2 ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {isExpanded && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 rounded-xl shadow-xl z-40 p-3 space-y-1 w-60">
                  {category.items.map((item, itemIdx) => {
                    const Icon = item.icon;
                    return (
                      <Link key={itemIdx} href={createPageUrl(item.page)} onClick={() => setExpandedCategory(null)}>
                        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-right">
                          <Icon className="w-4 h-4 text-slate-600" /><span className="text-sm font-medium text-slate-700">{item.label}</span>
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
