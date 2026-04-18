import { useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Workflow, Zap, X, ArrowRight, Settings,
  Mail, UserPlus, Database, Bell, Webhook,
  Clock, AlertTriangle, Calendar, CheckCircle, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import TriggerSelector from "./workflow/trigger-selector";
import ActionSelector from "./workflow/action-selector";
import ConditionBuilder from "./workflow/condition-builder";

interface TriggerItem {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: string;
  config?: Record<string, string>;
}

interface ActionItem {
  type: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  config?: Record<string, string>;
  fields?: ActionField[];
}

interface ActionField {
  name: string;
  label: string;
  type: string;
  options?: string[];
}

interface ConditionItem {
  field: string;
  operator: string;
  value: string;
}

interface WorkflowData {
  name: string;
  description: string;
  trigger: TriggerItem | null;
  conditions: ConditionItem[];
  actions: ActionItem[];
  isActive: boolean;
}

interface WorkflowBuilderProps {
  workflow?: Record<string, unknown> | null;
  onSave: (data: WorkflowData) => void;
  onClose: () => void;
}

export default function WorkflowBuilder({ workflow, onSave, onClose }: WorkflowBuilderProps) {
  const [workflowData, setWorkflowData] = useState<WorkflowData>(
    (workflow as unknown as WorkflowData) || {
      name: "",
      description: "",
      trigger: null,
      conditions: [],
      actions: [],
      isActive: true,
    }
  );

  const [step, setStep] = useState<"basic" | "trigger" | "conditions" | "actions">("basic");

  const handleSave = () => {
    if (!workflowData.name || !workflowData.trigger || workflowData.actions.length === 0) {
      alert("נא למלא שם, טריגר ולפחות פעולה אחת");
      return;
    }
    onSave(workflowData);
  };

  const handleAddAction = (action: ActionItem) => {
    setWorkflowData({
      ...workflowData,
      actions: [...workflowData.actions, action],
    });
  };

  const handleRemoveAction = (index: number) => {
    setWorkflowData({
      ...workflowData,
      actions: workflowData.actions.filter((_, i) => i !== index),
    });
  };

  const getActionIcon = (type: string): LucideIcon => {
    switch (type) {
      case "send_email": return Mail;
      case "send_notification": return Bell;
      case "assign_to_user": return UserPlus;
      case "update_field": return Database;
      case "create_task": return CheckCircle;
      case "webhook": return Webhook;
      default: return Zap;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Workflow className="w-6 h-6 text-indigo-600" />
            {workflow ? "עריכת Workflow" : "יצירת Workflow חדש"}
          </DialogTitle>
          <DialogDescription>
            בנה אוטומציה מותאמת עם triggers, תנאים ופעולות
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between mb-6">
            {(
              [
                { id: "basic" as const, label: "פרטים בסיסיים", icon: FileText },
                { id: "trigger" as const, label: "Trigger", icon: Zap },
                { id: "conditions" as const, label: "תנאים", icon: Settings },
                { id: "actions" as const, label: "פעולות", icon: CheckCircle },
              ] as const
            ).map((s, idx) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isCompleted =
                (s.id === "basic" && workflowData.name) ||
                (s.id === "trigger" && workflowData.trigger) ||
                (s.id === "actions" && workflowData.actions.length > 0);

              return (
                <Fragment key={s.id}>
                  <button
                    onClick={() => setStep(s.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : isCompleted
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium text-sm">{s.label}</span>
                  </button>
                  {idx < 3 && <ArrowRight className="w-4 h-4 text-slate-300" />}
                </Fragment>
              );
            })}
          </div>

          {step === "basic" && (
            <Card>
              <CardHeader>
                <CardTitle>פרטים בסיסיים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>שם ה-Workflow</Label>
                  <Input
                    placeholder="לדוגמה: התראה על SLA Breach"
                    value={workflowData.name}
                    onChange={(e) =>
                      setWorkflowData({ ...workflowData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>תיאור</Label>
                  <Textarea
                    placeholder="תאר מה ה-workflow עושה..."
                    value={workflowData.description}
                    onChange={(e) =>
                      setWorkflowData({ ...workflowData, description: e.target.value })
                    }
                    rows={3}
                  />
                </div>
                <Button
                  onClick={() => setStep("trigger")}
                  disabled={!workflowData.name}
                  className="w-full"
                >
                  המשך לבחירת Trigger
                  <ArrowRight className="w-4 h-4 mr-2" />
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "trigger" && (
            <Card>
              <CardHeader>
                <CardTitle>בחר Trigger</CardTitle>
                <p className="text-sm text-slate-600 mt-1">מתי ה-workflow יתחיל לרוץ?</p>
              </CardHeader>
              <CardContent>
                <TriggerSelector
                  selected={workflowData.trigger}
                  onSelect={(trigger) => setWorkflowData({ ...workflowData, trigger })}
                />
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep("basic")} className="flex-1">
                    חזור
                  </Button>
                  <Button
                    onClick={() => setStep("conditions")}
                    disabled={!workflowData.trigger}
                    className="flex-1"
                  >
                    המשך לתנאים
                    <ArrowRight className="w-4 h-4 mr-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "conditions" && (
            <Card>
              <CardHeader>
                <CardTitle>תנאים (אופציונלי)</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  הגדר תנאים נוספים למתי ה-workflow ירוץ
                </p>
              </CardHeader>
              <CardContent>
                <ConditionBuilder
                  conditions={workflowData.conditions}
                  onChange={(conditions) => setWorkflowData({ ...workflowData, conditions })}
                />
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep("trigger")} className="flex-1">
                    חזור
                  </Button>
                  <Button onClick={() => setStep("actions")} className="flex-1">
                    המשך לפעולות
                    <ArrowRight className="w-4 h-4 mr-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "actions" && (
            <Card>
              <CardHeader>
                <CardTitle>פעולות</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  מה יקרה כאשר ה-workflow ירוץ?
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {workflowData.actions.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {workflowData.actions.map((action, idx) => {
                      const Icon = getActionIcon(action.type);
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge className="bg-indigo-100 text-indigo-700">{idx + 1}</Badge>
                            <Icon className="w-5 h-5 text-slate-600" />
                            <div>
                              <div className="font-medium text-sm">{action.label}</div>
                              <div className="text-xs text-slate-500 mt-1">{action.type}</div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveAction(idx)}>
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <ActionSelector onSelect={handleAddAction} />

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setStep("conditions")}
                    className="flex-1"
                  >
                    חזור
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={workflowData.actions.length === 0}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 ml-2" />
                    שמור Workflow
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-slate-50">
            <CardHeader>
              <CardTitle className="text-base">תצוגה מקדימה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-slate-500 mt-0.5" />
                  <div>
                    <span className="font-medium">שם:</span> {workflowData.name || "—"}
                  </div>
                </div>
                {workflowData.trigger && (
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-indigo-600 mt-0.5" />
                    <div>
                      <span className="font-medium">Trigger:</span> {workflowData.trigger.label}
                    </div>
                  </div>
                )}
                {workflowData.conditions.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Settings className="w-4 h-4 text-orange-600 mt-0.5" />
                    <div>
                      <span className="font-medium">תנאים:</span>{" "}
                      {workflowData.conditions.length}
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <span className="font-medium">פעולות:</span> {workflowData.actions.length}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
