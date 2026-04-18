import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Settings, Play, Save, Copy } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TriggerItem {
  type: string;
  conditions: unknown[];
}

interface ActionItem {
  type: string;
  step_order: number;
  conditions: unknown[];
}

interface WorkflowData {
  name?: string;
  category?: string;
  triggers?: TriggerItem[];
  actions?: ActionItem[];
  conditions?: unknown[];
}

interface Props {
  workflow?: WorkflowData;
  onSave?: (data: WorkflowData) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WorkflowBuilder({ workflow, onSave: _onSave }: Props) {
  const [triggers, setTriggers] = useState<TriggerItem[]>(
    workflow?.triggers || []
  );
  const [actions, setActions] = useState<ActionItem[]>(workflow?.actions || []);
  const [workflowName, setWorkflowName] = useState(workflow?.name || "");
  const [workflowCategory, setWorkflowCategory] = useState(
    workflow?.category || "general"
  );

  const triggerTypes = [
    { value: "record_created", label: "New record created" },
    { value: "record_updated", label: "Record updated" },
    { value: "record_deleted", label: "Record deleted" },
    { value: "status_changed", label: "Status changed" },
    { value: "scheduled", label: "Scheduled" },
    { value: "webhook", label: "Webhook" },
    { value: "manual", label: "Manual" },
  ];

  const actionTypes = [
    { value: "create_record", label: "Create record" },
    { value: "update_record", label: "Update record" },
    { value: "delete_record", label: "Delete record" },
    { value: "send_email", label: "Send email" },
    { value: "send_notification", label: "Send notification" },
    { value: "create_approval", label: "Create approval" },
    { value: "update_status", label: "Update status" },
    { value: "assign_task", label: "Assign task" },
    { value: "api_call", label: "API call" },
    { value: "delay", label: "Delay" },
  ];

  const addTrigger = () => {
    setTriggers([...triggers, { type: "record_created", conditions: [] }]);
  };

  const addAction = () => {
    setActions([
      ...actions,
      { type: "send_email", step_order: actions.length + 1, conditions: [] },
    ]);
  };

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index));
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateTrigger = (index: number, field: string, value: string) => {
    const newTriggers = [...triggers];
    newTriggers[index] = { ...newTriggers[index], [field]: value };
    setTriggers(newTriggers);
  };

  const updateAction = (index: number, field: string, value: string) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], [field]: value };
    setActions(newActions);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-semibold">Workflow Name</label>
            <Input
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Enter workflow name"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-semibold">Category</label>
            <Select value={workflowCategory} onValueChange={setWorkflowCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Triggers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Triggers (Start workflow)</CardTitle>
            <Button onClick={addTrigger} size="sm" variant="outline">
              <Plus className="w-4 h-4 ml-1" />
              Add trigger
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {triggers.length === 0 ? (
            <p className="text-slate-500">No triggers. Click to add the first trigger.</p>
          ) : (
            triggers.map((trigger, idx) => (
              <div key={idx} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Badge>Trigger {idx + 1}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTrigger(idx)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-sm font-semibold">Trigger type</label>
                  <Select
                    value={trigger.type}
                    onValueChange={(val) => updateTrigger(idx, "type", val)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {triggerTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-slate-600">
            Define conditions that must be met for the workflow to start
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            Example: If inventory is below 10 units, send an alert
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Actions / Steps</CardTitle>
            <Button onClick={addAction} size="sm" variant="outline">
              <Plus className="w-4 h-4 ml-1" />
              Add action
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.length === 0 ? (
            <p className="text-slate-500">No actions. Click to add the first action.</p>
          ) : (
            actions.map((action, idx) => (
              <div key={idx} className="p-4 border rounded-lg space-y-3 relative">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">Step {idx + 1}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAction(idx)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div>
                  <label className="text-sm font-semibold">Action type</label>
                  <Select
                    value={action.type}
                    onValueChange={(val) => updateAction(idx, "type", val)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionTypes.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Actions Bar */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline">
          <Copy className="w-4 h-4 ml-2" />
          Duplicate
        </Button>
        <Button variant="outline">
          <Settings className="w-4 h-4 ml-2" />
          More settings
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 ml-2" />
          Save
        </Button>
        <Button className="bg-green-600 hover:bg-green-700">
          <Play className="w-4 h-4 ml-2" />
          Run now
        </Button>
      </div>
    </div>
  );
}
