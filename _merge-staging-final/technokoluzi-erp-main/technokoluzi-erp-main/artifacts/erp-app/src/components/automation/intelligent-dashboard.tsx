import { useState, useEffect } from "react";
import { entityList } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle2,
  Eye,
  LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  stage?: string;
  grade?: string;
  deal_value?: number;
  last_contacted_at?: string;
  created_date?: string;
}

interface Task {
  id: string;
  status?: string;
  due_date?: string;
  completed_at?: string;
}

interface Deal {
  id: string;
  stage?: string;
  amount?: number;
}

interface Insight {
  type: "error" | "warning" | "success" | "info";
  icon: LucideIcon;
  title: string;
  message: string;
  action: string;
  priority: string;
  impact?: string;
  metric?: string;
  count?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntelligentDashboard() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    generateInsights();
    const interval = setInterval(generateInsights, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const generateInsights = async () => {
    setLoading(true);
    try {
      const [leads, tasks, deals] = await Promise.all([
        entityList<Lead>("lead"),
        entityList<Task>("task"),
        entityList<Deal>("deal"),
      ]);

      const newInsights: Insight[] = [];

      // Hot leads with no activity
      const hotLeadsNoActivity = leads.filter((l) => {
        if (l.grade !== "hot") return false;
        const lastContact = l.last_contacted_at
          ? new Date(l.last_contacted_at)
          : new Date(l.created_date!);
        const days = Math.floor((Date.now() - lastContact.getTime()) / 86_400_000);
        return days >= 3;
      });

      if (hotLeadsNoActivity.length > 0) {
        newInsights.push({
          type: "warning",
          icon: AlertTriangle,
          title: "Hot leads with no activity",
          message: `${hotLeadsNoActivity.length} hot leads haven't been handled in 3 days`,
          action: "Contact immediately",
          priority: "high",
          impact:
            "Potential loss of " +
            hotLeadsNoActivity
              .reduce((sum, l) => sum + (l.deal_value || 25000), 0)
              .toLocaleString(),
        });
      }

      // Conversion rate
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const thisWeekLeads = leads.filter((l) => new Date(l.created_date!) > weekAgo);
      const thisWeekWon = thisWeekLeads.filter((l) => l.stage === "won").length;
      const conversionRate =
        thisWeekLeads.length > 0
          ? ((thisWeekWon / thisWeekLeads.length) * 100).toFixed(1)
          : "0";

      newInsights.push({
        type: Number(conversionRate) >= 20 ? "success" : "info",
        icon: TrendingUp,
        title: "Weekly conversion rate",
        message: `${conversionRate}% of this week's leads converted to customers`,
        action: Number(conversionRate) < 20 ? "Improve sales process" : "Keep it up!",
        priority: Number(conversionRate) < 15 ? "medium" : "low",
        metric: `${thisWeekWon}/${thisWeekLeads.length}`,
      });

      // Overdue tasks
      const overdueTasks = tasks.filter(
        (t) => t.status === "todo" && t.due_date && new Date(t.due_date) < new Date()
      );

      if (overdueTasks.length > 0) {
        newInsights.push({
          type: "error",
          icon: AlertTriangle,
          title: "Overdue tasks",
          message: `${overdueTasks.length} tasks past their deadline`,
          action: "Handle now",
          priority: "high",
          count: overdueTasks.length,
        });
      }

      // Pipeline value
      const pipelineValue = deals
        .filter((d) => !["closed_won", "closed_lost"].includes(d.stage ?? ""))
        .reduce((sum, d) => sum + (d.amount || 0), 0);

      newInsights.push({
        type: "info",
        icon: Target,
        title: "Deal pipeline value",
        message: `${pipelineValue.toLocaleString()} in active deals`,
        action: "Review deals",
        priority: "low",
        metric: `${deals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage ?? "")).length} deals`,
      });

      // Tasks completed today
      const completedTasksToday = tasks.filter((t) => {
        if (t.status !== "done") return false;
        const completed = t.completed_at ? new Date(t.completed_at) : null;
        if (!completed) return false;
        return completed.toDateString() === new Date().toDateString();
      });

      newInsights.push({
        type: "success",
        icon: CheckCircle2,
        title: "Tasks completed today",
        message: `${completedTasksToday.length} tasks completed successfully`,
        action: "Great job!",
        priority: "low",
        count: completedTasksToday.length,
      });

      setInsights(newInsights);
    } catch (error) {
      console.error("Insights generation error:", error);
    } finally {
      setLoading(false);
    }
  };

  const colors: Record<string, string> = {
    error: "border-red-200 bg-red-50",
    warning: "border-orange-200 bg-orange-50",
    success: "border-green-200 bg-green-50",
    info: "border-blue-200 bg-blue-50",
  };
  const iconColors: Record<string, string> = {
    error: "text-red-600",
    warning: "text-orange-600",
    success: "text-green-600",
    info: "text-blue-600",
  };
  const bgColors: Record<string, string> = {
    error: "bg-red-100",
    warning: "bg-orange-100",
    success: "bg-green-100",
    info: "bg-blue-100",
  };

  return (
    <Card className="border-0 shadow-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <CardHeader className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Brain className="w-5 h-5 animate-pulse" />
          </div>
          AI Smart Insights
          <Badge className="bg-white/20 text-white border-white/30 mr-auto">
            <Eye className="w-3 h-3 ml-1" />
            Live Analysis
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <div className="text-center py-8">
            <Brain className="w-12 h-12 mx-auto animate-pulse text-indigo-600" />
            <p className="text-sm text-slate-600 mt-2">Analyzing data...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, idx) => {
              const Icon = insight.icon;
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border ${colors[insight.type]} hover:shadow-lg transition-all`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg ${bgColors[insight.type]} flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className={`w-5 h-5 ${iconColors[insight.type]}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm text-slate-900">
                          {insight.title}
                        </h4>
                        {insight.priority === "high" && (
                          <Badge className="bg-red-500 text-white text-[10px]">
                            Urgent
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{insight.message}</p>
                      {insight.impact && (
                        <p className="text-xs font-semibold text-red-700 mt-2">
                          {insight.impact}
                        </p>
                      )}
                      {insight.metric && (
                        <p className="text-xs text-slate-500 mt-1">{insight.metric}</p>
                      )}
                      <Button size="sm" variant="outline" className="mt-3 text-xs h-7">
                        {insight.action}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
