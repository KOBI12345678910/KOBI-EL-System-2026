import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityFilter, entityCreate, entityUpdate, entityDelete } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Zap, Trash2, Clock, Bell } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AutomationRule {
  id: string;
  rule_name: string;
  description: string;
  rule_type: string;
  is_active: boolean;
  priority: string;
  trigger: {
    type: string;
    conditions?: Array<{ field: string; operator: string; value: string }>;
    time_config?: { duration_minutes?: number; duration_days?: number };
  };
  actions: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
}

interface LeadPermissions {
  isManager: boolean;
  canEditLead: boolean;
  canChangeStage: boolean;
  canChangeSource: boolean;
  canDelete: string | boolean;
  canChangeOwnership: boolean;
  canEditSensitiveFields: boolean;
  canAddModules: boolean;
  userRole: string | null;
  isOwner?: boolean;
  isAdmin?: boolean;
}

interface AutomationRulesManagerProps {
  permissions: LeadPermissions;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AutomationRulesManager({ permissions }: AutomationRulesManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const queryClient = useQueryClient();

  const { data: rules = [] } = useQuery<AutomationRule[]>({
    queryKey: ["leadCardAutomations"],
    queryFn: () => entityFilter<AutomationRule>("lead-automation-rules", {}),
  });

  const createRuleMutation = useMutation({
    mutationFn: (rule: Omit<AutomationRule, "id">) =>
      entityCreate<AutomationRule>("lead-automation-rules", rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadCardAutomations"] });
      toast.success("\u05DB\u05DC\u05DC \u05E0\u05D5\u05E1\u05E3 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4");
      setDialogOpen(false);
      setEditingRule(null);
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AutomationRule> }) =>
      entityUpdate<AutomationRule>("lead-automation-rules", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadCardAutomations"] });
      toast.success("\u05DB\u05DC\u05DC \u05E2\u05D5\u05D3\u05DB\u05DF");
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => entityDelete("lead-automation-rules", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadCardAutomations"] });
      toast.success("\u05DB\u05DC\u05DC \u05E0\u05DE\u05D7\u05E7");
    },
  });

  const addDefaultRule = () => {
    createRuleMutation.mutate({
      rule_name: "\u05DC\u05D9\u05D3 \u05D7\u05D3\u05E9 \u05DC\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA - 30 \u05D3\u05E7\u05D5\u05EA",
      description: "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05DC\u05DE\u05E0\u05D4\u05DC \u05DB\u05D0\u05E9\u05E8 \u05DC\u05D9\u05D3 \u05D7\u05D3\u05E9 \u05DC\u05D0 \u05D8\u05D5\u05E4\u05DC \u05EA\u05D5\u05DA 30 \u05D3\u05E7\u05D5\u05EA",
      rule_type: "anti_stagnation",
      is_active: true,
      priority: "high",
      trigger: {
        type: "inactivity_period",
        conditions: [{ field: "sales_status", operator: "equals", value: "new_lead" }],
        time_config: { duration_minutes: 30 },
      },
      actions: [
        {
          type: "send_notification",
          config: {
            send_to: ["manager"],
            title: "\u26A0\uFE0F \u05DC\u05D9\u05D3 \u05D7\u05D3\u05E9 \u05DC\u05DC\u05D0 \u05D8\u05D9\u05E4\u05D5\u05DC",
            message_template: "\u05D4\u05DC\u05D9\u05D3 {lead_name} \u05DC\u05D0 \u05D8\u05D5\u05E4\u05DC \u05D1\u05DE\u05E9\u05DA 30 \u05D3\u05E7\u05D5\u05EA",
          },
        },
        { type: "update_field", config: { field: "sla_status", value: "breached" } },
        { type: "update_field", config: { field: "priority", value: "urgent" } },
      ],
    } as any);
  };

  const addStagnationRule = () => {
    createRuleMutation.mutate({
      rule_name: "\u05E9\u05DC\u05D1 \u05DC\u05DC\u05D0 \u05E9\u05D9\u05E0\u05D5\u05D9 - 3 \u05D9\u05DE\u05D9\u05DD",
      description: "\u05D9\u05E6\u05D9\u05E8\u05EA \u05DE\u05E9\u05D9\u05DE\u05EA \u05DE\u05E2\u05E7\u05D1 \u05D5\u05E1\u05D9\u05DE\u05D5\u05DF \u05DB\u05DC\u05D9\u05D3 \u05D1\u05E1\u05D9\u05DB\u05D5\u05DF \u05DB\u05D0\u05E9\u05E8 \u05D4\u05E9\u05DC\u05D1 \u05DC\u05D0 \u05D4\u05E9\u05EA\u05E0\u05D4 3 \u05D9\u05DE\u05D9\u05DD",
      rule_type: "anti_stagnation",
      is_active: true,
      priority: "medium",
      trigger: {
        type: "stage_stagnation",
        time_config: { duration_days: 3 },
      },
      actions: [
        {
          type: "create_task",
          config: {
            title_template: "\uD83D\uDCDE \u05DE\u05E2\u05E7\u05D1 \u05DC\u05D9\u05D3 {lead_name}",
            description_template:
              "\u05DC\u05D9\u05D3 \u05D6\u05D4 \u05E0\u05DE\u05E6\u05D0 \u05D1\u05D0\u05D5\u05EA\u05D5 \u05E9\u05DC\u05D1 \u05DB\u05D1\u05E8 3 \u05D9\u05DE\u05D9\u05DD. \u05D9\u05E9 \u05DC\u05D1\u05E6\u05E2 \u05DE\u05E2\u05E7\u05D1 \u05D5\u05DC\u05D4\u05D6\u05D9\u05D6 \u05E7\u05D3\u05D9\u05DE\u05D4.",
            assigned_to_role: "owner",
          },
        },
        { type: "add_tag", config: { tag: "Risk Lead" } },
        {
          type: "send_notification",
          config: {
            send_to: ["owner", "manager"],
            title: "\uD83D\uDEA8 \u05DC\u05D9\u05D3 \u05D1\u05E1\u05D8\u05D2\u05E0\u05E6\u05D9\u05D4",
            message_template: "\u05D4\u05DC\u05D9\u05D3 {lead_name} \u05EA\u05E7\u05D5\u05E2 \u05D1\u05D0\u05D5\u05EA\u05D5 \u05E9\u05DC\u05D1 \u05DB\u05D1\u05E8 3 \u05D9\u05DE\u05D9\u05DD",
          },
        },
      ],
    } as any);
  };

  const addCallLoggedRule = () => {
    createRuleMutation.mutate({
      rule_name: "\u05E9\u05D9\u05D7\u05D4 \u05DC\u05DC\u05D0 \u05D4\u05DE\u05E9\u05DA - \u05D9\u05E6\u05D9\u05E8\u05EA \u05DE\u05E9\u05D9\u05DE\u05D4",
      description:
        "\u05D9\u05E6\u05D9\u05E8\u05EA \u05DE\u05E9\u05D9\u05DE\u05EA \u05DE\u05E2\u05E7\u05D1 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DC-2 \u05D9\u05DE\u05D9\u05DD \u05DB\u05D0\u05E9\u05E8 \u05E0\u05E8\u05E9\u05DE\u05D4 \u05E9\u05D9\u05D7\u05D4 \u05DC\u05DC\u05D0 \u05E4\u05E2\u05D5\u05DC\u05D4 \u05D4\u05D1\u05D0\u05D4",
      rule_type: "task_enforcement",
      is_active: true,
      priority: "medium",
      trigger: { type: "activity_logged" },
      actions: [
        {
          type: "create_task",
          config: {
            title_template: "\uD83D\uDCDE \u05DE\u05E2\u05E7\u05D1 \u05DC\u05D0\u05D7\u05E8 \u05E9\u05D9\u05D7\u05D4 - {lead_name}",
            description_template:
              "\u05E0\u05E8\u05E9\u05DE\u05D4 \u05E9\u05D9\u05D7\u05D4 \u05DC\u05DC\u05D0 \u05D4\u05D2\u05D3\u05E8\u05EA \u05E4\u05E2\u05D5\u05DC\u05D4 \u05D4\u05D1\u05D0\u05D4. \u05D9\u05E9 \u05DC\u05D1\u05E6\u05E2 \u05DE\u05E2\u05E7\u05D1.",
            assigned_to_role: "owner",
            due_days: 2,
          },
        },
      ],
    } as any);
  };

  const toggleActive = (rule: AutomationRule) => {
    updateRuleMutation.mutate({ id: rule.id, data: { is_active: !rule.is_active } });
  };

  if (!permissions.isManager) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-600" />
          \u05E0\u05D9\u05D4\u05D5\u05DC \u05D0\u05D5\u05D8\u05D5\u05DE\u05E6\u05D9\u05D5\u05EA
        </CardTitle>
        <div className="flex gap-2">
          <Button onClick={addDefaultRule} variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            30 \u05D3\u05E7\u05D5\u05EA
          </Button>
          <Button onClick={addStagnationRule} variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            3 \u05D9\u05DE\u05D9\u05DD
          </Button>
          <Button onClick={addCallLoggedRule} variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            \u05E9\u05D9\u05D7\u05D4
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-slate-900">{rule.rule_name}</h4>
                  {rule.is_active ? (
                    <Badge className="bg-green-100 text-green-800">\u05E4\u05E2\u05D9\u05DC</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600">\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC</Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {rule.priority}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">{rule.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {rule.trigger?.time_config?.duration_minutes || 0} \u05D3\u05E7\u05D5\u05EA
                  </span>
                  <span className="flex items-center gap-1">
                    <Bell className="w-3 h-3" />
                    {rule.actions?.length || 0} \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-600"
                  onClick={() => deleteRuleMutation.mutate(rule.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {rules.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <p>\u05D0\u05D9\u05DF \u05DB\u05DC\u05DC\u05D9 \u05D0\u05D5\u05D8\u05D5\u05DE\u05E6\u05D9\u05D4 \u05DE\u05D5\u05D2\u05D3\u05E8\u05D9\u05DD</p>
              <p className="text-sm mt-2">
                \u05DC\u05D7\u05E5 \u05E2\u05DC &quot;\u05D4\u05D5\u05E1\u05E3 \u05DB\u05DC\u05DC \u05D1\u05E8\u05D9\u05E8\u05EA \u05DE\u05D7\u05D3\u05DC&quot; \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
