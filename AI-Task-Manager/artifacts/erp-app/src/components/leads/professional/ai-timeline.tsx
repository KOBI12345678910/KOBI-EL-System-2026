import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entityFilter } from "@/lib/entity-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User, Clock, Phone, Mail, MessageCircle, Upload, FileText,
  UserCheck, ArrowRight, Zap, AlertTriangle, CheckCircle2, Bot,
  Calendar, Target, TrendingUp, Activity, LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TimelineItem {
  id: string;
  type: string;
  timestamp: string;
  actor: string;
  details: string;
  metadata: Record<string, unknown>;
}

interface AITimelineProps {
  leadId: string;
}

type FilterKey = "all" | "communication" | "changes" | "automation" | "note";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AITimeline({ leadId }: AITimelineProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: activities = [], isLoading } = useQuery<TimelineItem[]>({
    queryKey: ["leadTimeline", leadId],
    queryFn: async () => {
      const [interactions, events, notes, documents, tasks] = await Promise.all([
        entityFilter<Record<string, any>>("lead-interactions", { lead_id: leadId }),
        entityFilter<Record<string, any>>("lead-events", { lead_id: leadId }),
        entityFilter<Record<string, any>>("lead-notes", { lead_id: leadId }),
        entityFilter<Record<string, any>>("lead-documents", { lead_id: leadId }),
        entityFilter<Record<string, any>>("lead-tasks", { lead_id: leadId }),
      ]);

      const timeline: TimelineItem[] = [
        ...interactions.map((i: any) => ({
          id: i.id,
          type: i.interaction_type,
          timestamp: i.created_date,
          actor: i.performed_by || i.created_by,
          details: i.summary,
          metadata: {
            direction: i.direction,
            outcome: i.outcome,
            duration: i.duration_minutes,
            sentiment: i.sentiment,
          },
        })),
        ...events.map((e: any) => ({
          id: e.id,
          type: e.event_type,
          timestamp: e.event_date || e.created_date,
          actor: e.performed_by || e.created_by,
          details: e.description,
          metadata: {
            old_value: e.old_value,
            new_value: e.new_value,
            field_name: e.field_name,
          },
        })),
        ...notes.map((n: any) => ({
          id: n.id,
          type: "note",
          timestamp: n.created_date,
          actor: n.created_by,
          details: n.note_text,
          metadata: {
            category: n.category,
            pinned: n.pinned,
          },
        })),
        ...documents.map((d: any) => ({
          id: d.id,
          type: "document_upload",
          timestamp: d.created_date,
          actor: d.uploaded_by || d.created_by,
          details: d.file_name,
          metadata: {
            file_url: d.file_url,
            tag: d.tag,
            source: d.source,
          },
        })),
        ...tasks.map((t: any) => ({
          id: t.id,
          type: "task_created",
          timestamp: t.created_date,
          actor: t.created_by,
          details: t.title,
          metadata: {
            status: t.status,
            priority: t.priority,
            due_date: t.due_date,
          },
        })),
      ];

      return timeline.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },
  });

  const getIcon = (type: string): LucideIcon => {
    const icons: Record<string, LucideIcon> = {
      phone_call: Phone,
      email: Mail,
      whatsapp: MessageCircle,
      meeting: Calendar,
      note: FileText,
      document_upload: Upload,
      status_changed: ArrowRight,
      owner_changed: UserCheck,
      stage_changed: TrendingUp,
      automation_executed: Zap,
      sla_breach: AlertTriangle,
      task_created: CheckCircle2,
      ai_action: Bot,
      field_changed: Activity,
    };
    return icons[type] || Activity;
  };

  const getColor = (type: string): string => {
    const colors: Record<string, string> = {
      phone_call: "bg-blue-100 text-blue-700 border-blue-200",
      email: "bg-purple-100 text-purple-700 border-purple-200",
      whatsapp: "bg-green-100 text-green-700 border-green-200",
      meeting: "bg-indigo-100 text-indigo-700 border-indigo-200",
      note: "bg-slate-100 text-slate-700 border-slate-200",
      document_upload: "bg-amber-100 text-amber-700 border-amber-200",
      status_changed: "bg-cyan-100 text-cyan-700 border-cyan-200",
      owner_changed: "bg-violet-100 text-violet-700 border-violet-200",
      stage_changed: "bg-teal-100 text-teal-700 border-teal-200",
      automation_executed: "bg-pink-100 text-pink-700 border-pink-200",
      sla_breach: "bg-red-100 text-red-700 border-red-200",
      task_created: "bg-emerald-100 text-emerald-700 border-emerald-200",
      ai_action: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
    };
    return colors[type] || "bg-slate-100 text-slate-700 border-slate-200";
  };

  const getLabel = (type: string): string => {
    const labels: Record<string, string> = {
      phone_call: "\u05E9\u05D9\u05D7\u05D4",
      email: "\u05DE\u05D9\u05D9\u05DC",
      whatsapp: "\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4",
      meeting: "\u05E4\u05D2\u05D9\u05E9\u05D4",
      note: "\u05D4\u05E2\u05E8\u05D4",
      document_upload: "\u05DE\u05E1\u05DE\u05DA",
      status_changed: "\u05E9\u05D9\u05E0\u05D5\u05D9 \u05E1\u05D8\u05D8\u05D5\u05E1",
      owner_changed: "\u05E9\u05D9\u05E0\u05D5\u05D9 \u05D0\u05D7\u05E8\u05D0\u05D9",
      stage_changed: "\u05E9\u05D9\u05E0\u05D5\u05D9 \u05E9\u05DC\u05D1",
      automation_executed: "\u05D0\u05D5\u05D8\u05D5\u05DE\u05E6\u05D9\u05D4",
      sla_breach: "\u05D7\u05E8\u05D9\u05D2\u05EA SLA",
      task_created: "\u05DE\u05E9\u05D9\u05DE\u05D4 \u05E0\u05D5\u05E6\u05E8\u05D4",
      ai_action: "\u05E4\u05E2\u05D5\u05DC\u05EA AI",
      field_changed: "\u05E2\u05D3\u05DB\u05D5\u05DF \u05E9\u05D3\u05D4",
    };
    return labels[type] || type;
  };

  const filteredActivities = activities.filter((a) => {
    if (filter === "all") return true;
    if (filter === "communication")
      return ["phone_call", "email", "whatsapp", "meeting"].includes(a.type);
    if (filter === "changes")
      return ["status_changed", "owner_changed", "stage_changed", "field_changed"].includes(a.type);
    if (filter === "automation")
      return ["automation_executed", "ai_action", "sla_breach"].includes(a.type);
    return a.type === filter;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          \u05D4\u05DB\u05DC ({activities.length})
        </Button>
        <Button size="sm" variant={filter === "communication" ? "default" : "outline"} onClick={() => setFilter("communication")}>
          \u05EA\u05E7\u05E9\u05D5\u05E8\u05EA
        </Button>
        <Button size="sm" variant={filter === "changes" ? "default" : "outline"} onClick={() => setFilter("changes")}>
          \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD
        </Button>
        <Button size="sm" variant={filter === "automation" ? "default" : "outline"} onClick={() => setFilter("automation")}>
          \u05D0\u05D5\u05D8\u05D5\u05DE\u05E6\u05D9\u05D4
        </Button>
        <Button size="sm" variant={filter === "note" ? "default" : "outline"} onClick={() => setFilter("note")}>
          \u05D4\u05E2\u05E8\u05D5\u05EA
        </Button>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filteredActivities.length === 0 ? (
          <Card className="p-8 text-center">
            <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">\u05D0\u05D9\u05DF \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05DC\u05D4\u05E6\u05D2\u05D4</p>
          </Card>
        ) : (
          filteredActivities.map((activity, index) => {
            const Icon = getIcon(activity.type);
            const isLast = index === filteredActivities.length - 1;

            return (
              <div key={activity.id} className="relative">
                {!isLast && (
                  <div className="absolute right-[21px] top-12 bottom-0 w-0.5 bg-slate-200" />
                )}

                <Card className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex gap-4">
                    <div
                      className={cn(
                        "w-11 h-11 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                        getColor(activity.type)
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cn("border", getColor(activity.type))}>
                            {getLabel(activity.type)}
                          </Badge>
                          {(activity.metadata?.direction as string) && (
                            <Badge variant="outline" className="text-xs">
                              {activity.metadata.direction === "inbound" ? "\u05E0\u05DB\u05E0\u05E1" : "\u05D9\u05D5\u05E6\u05D0"}
                            </Badge>
                          )}
                          {(activity.metadata?.outcome as string) && (
                            <Badge variant="outline" className="text-xs">
                              {activity.metadata.outcome as string}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {format(new Date(activity.timestamp), "dd/MM/yyyy HH:mm", { locale: he })}
                        </div>
                      </div>

                      <p className="text-sm text-slate-700 mb-2 break-words">{activity.details}</p>

                      {activity.metadata && (
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {(activity.metadata.old_value as string) && (activity.metadata.new_value as string) && (
                            <span className="flex items-center gap-1">
                              <span className="line-through">{activity.metadata.old_value as string}</span>
                              <ArrowRight className="w-3 h-3" />
                              <span className="font-medium text-slate-700">
                                {activity.metadata.new_value as string}
                              </span>
                            </span>
                          )}
                          {(activity.metadata.duration as number) && (
                            <span>{activity.metadata.duration as number} \u05D3\u05E7\u05D5\u05EA</span>
                          )}
                          {(activity.metadata.file_url as string) && (
                            <a
                              href={activity.metadata.file_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Upload className="w-3 h-3" />
                              \u05D4\u05D5\u05E8\u05D3 \u05E7\u05D5\u05D1\u05E5
                            </a>
                          )}
                          {(activity.metadata.sentiment as string) && (
                            <Badge variant="outline" className="text-xs">
                              \u05E1\u05E0\u05D8\u05D9\u05DE\u05E0\u05D8: {activity.metadata.sentiment as string}
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
                        <User className="w-3 h-3" />
                        {activity.actor || "\u05DE\u05E2\u05E8\u05DB\u05EA"}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
