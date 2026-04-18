import { useEffect, useState } from "react";
import { entityList } from "@/lib/entity-api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentActivity {
  id: string;
  agent_name: string;
  agent_type: string;
  status: "active" | "busy" | "thinking" | "idle" | "error";
  current_task?: string;
  progress?: number;
  task_category?: string;
  tasks_completed_today?: number;
  uptime_minutes?: number;
  last_activity?: string;
  error_message?: string;
}

const statusConfig: Record<
  string,
  { color: string; icon: string; label: string }
> = {
  active: { color: "bg-green-50 border-green-200", icon: "\uD83D\uDFE2", label: "Active" },
  busy: { color: "bg-blue-50 border-blue-200", icon: "\uD83D\uDD35", label: "Busy" },
  thinking: { color: "bg-yellow-50 border-yellow-200", icon: "\uD83D\uDFE1", label: "Thinking" },
  idle: { color: "bg-gray-50 border-gray-200", icon: "\u26AA", label: "Idle" },
  error: { color: "bg-red-50 border-red-200", icon: "\uD83D\uDD34", label: "Error" },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentMonitor() {
  const [agents, setAgents] = useState<AgentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const data = await entityList<AgentActivity>("agent-activity");
        setAgents(data);
      } catch (error) {
        console.error("Error fetching agents:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, []);

  if (loading) {
    return <div className="text-center py-8">{"\u05D8\u05D5\u05E2\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9 \u05E1\u05D5\u05DB\u05E0\u05D9\u05DD..."}</div>;
  }

  const activeAgents = agents.filter((a) => a.status !== "idle").length;
  const completedToday = agents.reduce(
    (sum, a) => sum + (a.tasks_completed_today || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600">{"\u05E1\u05D5\u05DB\u05E0\u05D9\u05DD \u05E4\u05E2\u05D9\u05DC\u05D9\u05DD"}</p>
              <p className="text-3xl font-bold text-green-600">{activeAgents}</p>
              <p className="text-xs text-slate-500 mt-1">{"\u05DE\u05EA\u05D5\u05DA"} {agents.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600">{"\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05D4\u05D9\u05D5\u05DD"}</p>
              <p className="text-3xl font-bold text-blue-600">{completedToday}</p>
              <p className="text-xs text-slate-500 mt-1">{"\u05D4\u05D5\u05E9\u05DC\u05DE\u05D5 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600">{"\u05D6\u05DE\u05DF \u05DB\u05DC\u05DC\u05D9"}</p>
              <p className="text-3xl font-bold text-purple-600">
                {(
                  agents.reduce((sum, a) => sum + (a.uptime_minutes || 0), 0) /
                  60
                ).toFixed(1)}
                h
              </p>
              <p className="text-xs text-slate-500 mt-1">{"\u05E9\u05E2\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agents List */}
      <div className="space-y-3">
        {agents.map((agent) => {
          const config = statusConfig[agent.status] || statusConfig.idle;
          return (
            <Card key={agent.id} className={`border-2 ${config.color}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{config.icon}</span>
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {agent.agent_name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {agent.agent_type}
                        </p>
                      </div>
                    </div>

                    {agent.current_task && (
                      <div className="mt-2 ml-8">
                        <p className="text-sm text-slate-700 font-medium">
                          {agent.current_task}
                        </p>
                        {agent.progress !== undefined && (
                          <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all duration-300"
                              style={{ width: `${agent.progress}%` }}
                            />
                          </div>
                        )}
                        {agent.progress !== undefined && (
                          <p className="text-xs text-slate-500 mt-1">
                            {agent.progress}% {"\u05D4\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA"}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3 ml-8 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {agent.task_category || "\u05DC\u05DC\u05D0 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {agent.tasks_completed_today || 0} {"\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05D4\u05D9\u05D5\u05DD"}
                      </Badge>
                      {agent.uptime_minutes && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="w-3 h-3 ml-1" />
                          {Math.round(agent.uptime_minutes / 60)} {"\u05E9\u05E2\u05D5\u05EA"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <Badge
                      className={cn(
                        "text-xs",
                        agent.status === "active" && "bg-green-600",
                        agent.status === "busy" && "bg-blue-600",
                        agent.status === "thinking" && "bg-yellow-600",
                        agent.status === "idle" && "bg-gray-600",
                        agent.status === "error" && "bg-red-600",
                      )}
                    >
                      {config.label}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-2">
                      {agent.last_activity
                        ? `\u05E2\u05D3\u05DB\u05D5\u05DF: ${new Date(agent.last_activity).toLocaleTimeString("he-IL")}`
                        : "\u05D0\u05D9\u05DF \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA"}
                    </p>
                  </div>
                </div>

                {agent.error_message && (
                  <div className="mt-3 ml-8 p-2 bg-red-100 rounded text-sm text-red-700 flex gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {agent.error_message}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
