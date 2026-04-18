import { useEffect, useState } from "react";
import {
  entityList,
  entityFilter,
  entityUpdate,
  entityCreate,
} from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Zap,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadScoringRule {
  id: string;
  is_active: boolean;
  field: string;
  operator: string;
  value: string;
  points: number;
  weight?: number;
}

interface NextActionRule {
  id: string;
  stage: string;
  is_active: boolean;
  condition: string;
  days_since_contact: number;
  suggested_action: string;
  action_description?: string;
}

interface AssignmentRule {
  id: string;
  entity_type: string;
  is_active: boolean;
  source_filter?: string[];
  assignment_mode: string;
  round_robin_config?: {
    pool: string[];
    current_index: number;
  };
}

interface Lead {
  id: string;
  full_name?: string;
  company_name?: string;
  stage?: string;
  grade?: string;
  lead_score?: number;
  source?: string;
  owner_id?: string;
  last_contacted_at?: string;
  created_date?: string;
  sla_deadline?: string;
  next_action?: string;
  next_action_at?: string;
  assigned_at?: string;
  [key: string]: unknown;
}

interface SLAViolation {
  id: string;
  lead_id: string;
  status: string;
}

interface Task {
  id: string;
  lead_id: string;
  status: string;
  category: string;
}

interface AutomationResult {
  type: "success" | "error" | "warning";
  message: string;
  timestamp: Date;
}

interface Props {
  entityType?: string;
  entityId?: string;
  data?: Lead;
  autoRun?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AIAutomationEngine({
  entityType = "lead",
  entityId,
  data,
  autoRun = true,
}: Props) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<AutomationResult[]>([]);

  useEffect(() => {
    if (autoRun && entityId && data) {
      runAutomations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, data, autoRun]);

  const addResult = (type: AutomationResult["type"], message: string) => {
    setResults((prev) => [...prev, { type, message, timestamp: new Date() }]);
  };

  /* ---------- automations ---------- */

  const runAutomations = async () => {
    if (running || !data) return;
    setRunning(true);
    setResults([]);

    try {
      if (entityType === "lead") {
        await runLeadScoring(data);
        await predictNextAction(data);
        await checkSLA(data);
        if (!data.owner_id) await autoAssignLead(data);
        await scheduleFollowUp(data);
      }
    } catch (error) {
      console.error("Automation error:", error);
    } finally {
      setRunning(false);
    }
  };

  const runLeadScoring = async (lead: Lead) => {
    try {
      const rules = await entityList<LeadScoringRule>("lead-scoring-rule");
      let score = 0;

      for (const rule of rules) {
        if (!rule.is_active) continue;
        const fieldValue = lead[rule.field];
        let match = false;

        if (rule.operator === "equals" && fieldValue === rule.value) match = true;
        if (rule.operator === "contains" && (fieldValue as string)?.includes(rule.value)) match = true;
        if (rule.operator === "greater_than" && (fieldValue as number) > parseFloat(rule.value)) match = true;
        if (rule.operator === "in" && rule.value?.split(",").includes(fieldValue as string)) match = true;

        if (match) score += rule.points * (rule.weight || 1);
      }

      await entityUpdate<Lead>("lead", lead.id, {
        lead_score: Math.min(100, Math.max(0, score)),
      } as Partial<Lead>);
      addResult("success", `Lead Score calculated: ${score}`);
    } catch {
      addResult("error", "Error calculating Lead Score");
    }
  };

  const predictNextAction = async (lead: Lead) => {
    try {
      const rules = await entityFilter<NextActionRule>("next-action-rule", {
        stage: lead.stage,
        is_active: true,
      });
      if (rules.length === 0) return;

      const lastContact = lead.last_contacted_at
        ? new Date(lead.last_contacted_at)
        : new Date(lead.created_date!);
      const daysSinceContact = Math.floor(
        (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );

      for (const rule of rules) {
        let shouldTrigger = false;
        if (rule.condition === "greater_than" && daysSinceContact > rule.days_since_contact) shouldTrigger = true;
        else if (rule.condition === "equals" && daysSinceContact === rule.days_since_contact) shouldTrigger = true;

        if (shouldTrigger) {
          await entityUpdate<Lead>("lead", lead.id, {
            next_action: rule.suggested_action,
            next_action_at: new Date(Date.now() + 86_400_000).toISOString(),
          } as Partial<Lead>);

          if (["send_follow_up_message", "make_call", "send_email"].includes(rule.suggested_action)) {
            await entityCreate<Task>("task", {
              lead_id: lead.id,
              title: rule.action_description || rule.suggested_action,
              priority: "high",
              category: "follow_up",
              status: "todo",
              due_date: new Date(Date.now() + 86_400_000).toISOString(),
            } as unknown as Task);
          }

          addResult("success", `Next action set: ${rule.suggested_action}`);
          break;
        }
      }
    } catch {
      addResult("error", "Error predicting next action");
    }
  };

  const checkSLA = async (lead: Lead) => {
    try {
      const slaDeadline = lead.sla_deadline ? new Date(lead.sla_deadline) : null;
      if (!slaDeadline) return;

      const hoursOverdue = (Date.now() - slaDeadline.getTime()) / (1000 * 60 * 60);
      if (hoursOverdue <= 0) return;

      const existing = await entityFilter<SLAViolation>("sla-violation", {
        lead_id: lead.id,
        status: "open",
      });

      if (existing.length === 0) {
        await entityCreate("sla-violation", {
          lead_id: lead.id,
          lead_name: lead.full_name || lead.company_name,
          lead_owner_id: lead.owner_id,
          violation_type: "no_first_contact",
          sla_deadline: slaDeadline.toISOString(),
          hours_overdue: hoursOverdue,
          last_activity: lead.last_contacted_at,
          severity: hoursOverdue > 48 ? "critical" : hoursOverdue > 24 ? "high" : "medium",
          status: "open",
        });
        addResult("warning", `SLA Violation created: ${hoursOverdue.toFixed(1)} hours overdue`);
      }
    } catch {
      addResult("error", "Error checking SLA");
    }
  };

  const autoAssignLead = async (lead: Lead) => {
    try {
      const rules = await entityFilter<AssignmentRule>("assignment-rule", {
        entity_type: "lead",
        is_active: true,
      });

      for (const rule of rules) {
        if (rule.source_filter && !rule.source_filter.includes(lead.source!)) continue;

        if (rule.assignment_mode === "round_robin" && rule.round_robin_config) {
          const pool = rule.round_robin_config.pool || [];
          const currentIndex = rule.round_robin_config.current_index || 0;
          const assignTo = pool[currentIndex % pool.length];

          await entityUpdate<Lead>("lead", lead.id, {
            owner_id: assignTo,
            assigned_at: new Date().toISOString(),
          } as Partial<Lead>);

          await entityUpdate<AssignmentRule>("assignment-rule", rule.id, {
            round_robin_config: {
              ...rule.round_robin_config,
              current_index: currentIndex + 1,
            },
          } as Partial<AssignmentRule>);

          addResult("success", `Lead assigned to ${assignTo} (Round Robin)`);
          break;
        }
      }
    } catch {
      addResult("error", "Error in auto-assignment");
    }
  };

  const scheduleFollowUp = async (lead: Lead) => {
    try {
      const existingTasks = await entityFilter<Task>("task", {
        lead_id: lead.id,
        status: "todo",
        category: "follow_up",
      });
      if (existingTasks.length > 0) return;

      const lastContact = lead.last_contacted_at
        ? new Date(lead.last_contacted_at)
        : new Date(lead.created_date!);
      const daysSince = Math.floor(
        (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince >= 3 && lead.stage !== "won" && lead.stage !== "lost") {
        await entityCreate<Task>("task", {
          lead_id: lead.id,
          title: `Follow-up - ${lead.full_name || lead.company_name}`,
          description: `${daysSince} days since last contact`,
          priority: daysSince >= 7 ? "high" : "medium",
          category: "follow_up",
          status: "todo",
          due_date: new Date(Date.now() + 86_400_000).toISOString(),
        } as unknown as Task);

        addResult("success", "Automatic follow-up task created");
      }
    } catch {
      addResult("error", "Error scheduling follow-up");
    }
  };

  /* ---------- render ---------- */

  if (!autoRun) return null;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-lg">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Brain className={running ? "w-4 h-4 text-white animate-pulse" : "w-4 h-4 text-white"} />
          </div>
          AI Automation Engine
          {running && (
            <Badge className="bg-indigo-500 text-white animate-pulse">Running...</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-xs text-slate-500">Waiting for automations...</p>
          ) : (
            results.map((result, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs">
                {result.type === "success" && <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />}
                {result.type === "error" && <AlertTriangle className="w-3 h-3 text-red-600 flex-shrink-0 mt-0.5" />}
                {result.type === "warning" && <AlertTriangle className="w-3 h-3 text-orange-600 flex-shrink-0 mt-0.5" />}
                <span
                  className={
                    result.type === "success"
                      ? "text-green-700"
                      : result.type === "error"
                        ? "text-red-700"
                        : "text-orange-700"
                  }
                >
                  {result.message}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 pt-4 border-t flex gap-2">
          <Button size="sm" variant="outline" onClick={runAutomations} disabled={running}>
            <Zap className="w-3 h-3 ml-1" />
            Re-run
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
