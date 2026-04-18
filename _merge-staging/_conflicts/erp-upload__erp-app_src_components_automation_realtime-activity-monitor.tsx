import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Users,
  ShoppingCart,
  Factory,
  TrendingUp,
  Clock,
  Zap,
  LucideIcon,
} from "lucide-react";
import { format } from "date-fns";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActivityItem {
  type: "lead" | "order" | "production" | "task";
  action: "create" | "update" | "delete";
  data?: Record<string, unknown>;
  timestamp: Date;
}

interface Stats {
  activeUsers: number;
  actionsPerMinute: number;
  systemLoad: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RealtimeActivityMonitor() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<Stats>({
    activeUsers: 0,
    actionsPerMinute: 0,
    systemLoad: 0,
  });

  const addActivity = useCallback((activity: ActivityItem) => {
    setActivities((prev) => [activity, ...prev.slice(0, 19)]);
  }, []);

  useEffect(() => {
    // NOTE: base44 real-time subscriptions removed.
    // Replace with your own WebSocket / SSE implementation.
    // Example placeholder that simulates periodic activity:
    const demoInterval = setInterval(() => {
      const types: ActivityItem["type"][] = ["lead", "order", "production", "task"];
      const actions: ActivityItem["action"][] = ["create", "update"];
      addActivity({
        type: types[Math.floor(Math.random() * types.length)],
        action: actions[Math.floor(Math.random() * actions.length)],
        data: { title: "Demo item" },
        timestamp: new Date(),
      });
    }, 10_000);

    const statsInterval = setInterval(() => {
      setStats({
        activeUsers: Math.floor(Math.random() * 15) + 5,
        actionsPerMinute: activities.filter(
          (a) => Date.now() - a.timestamp.getTime() < 60_000
        ).length,
        systemLoad: Math.floor(Math.random() * 40) + 30,
      });
    }, 5000);

    return () => {
      clearInterval(demoInterval);
      clearInterval(statsInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addActivity]);

  const iconMap: Record<string, LucideIcon> = {
    lead: Users,
    order: ShoppingCart,
    production: Factory,
    task: Activity,
  };

  const colorMap: Record<string, string> = {
    create: "text-green-600 bg-green-50",
    update: "text-blue-600 bg-blue-50",
    delete: "text-red-600 bg-red-50",
  };

  const labelMap: Record<string, Record<string, string>> = {
    lead: { create: "New lead created", update: "Lead updated", delete: "Lead deleted" },
    order: { create: "New order", update: "Order updated", delete: "Order cancelled" },
    production: { create: "New production", update: "Production updated", delete: "Production cancelled" },
    task: { create: "Task created", update: "Task updated", delete: "Task completed" },
  };

  return (
    <Card className="border-0 shadow-xl bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 text-white">
      <CardHeader className="border-b border-white/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            Real-time Activity Monitor
            <Badge className="bg-green-500 text-white animate-pulse">
              <div className="w-2 h-2 rounded-full bg-white animate-ping absolute" />
              <div className="w-2 h-2 rounded-full bg-white mr-1" />
              LIVE
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{stats.activeUsers} active users</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              <span>{stats.actionsPerMinute} actions/min</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Load: {stats.systemLoad}%</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Waiting for activity...</p>
            </div>
          ) : (
            activities.map((activity, idx) => {
              const Icon = iconMap[activity.type] || Activity;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 hover:bg-white/10 transition-all"
                >
                  <div
                    className={`w-8 h-8 rounded-lg ${colorMap[activity.action] || "text-slate-600 bg-slate-50"} flex items-center justify-center`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {labelMap[activity.type]?.[activity.action] || `${activity.type} ${activity.action}`}
                    </p>
                    <p className="text-xs text-white/60 truncate">
                      {(activity.data?.full_name as string) ||
                        (activity.data?.title as string) ||
                        (activity.data?.order_number as string) ||
                        "Item"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-white/70 border-white/20">
                    <Clock className="w-2.5 h-2.5 ml-0.5" />
                    {format(activity.timestamp, "HH:mm:ss")}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
