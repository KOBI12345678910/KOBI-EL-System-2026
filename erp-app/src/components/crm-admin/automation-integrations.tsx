import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Zap, Plug, CheckCircle2, XCircle, AlertCircle,
  Settings, Play, Pause, ExternalLink, Plus, Workflow,
} from "lucide-react";
import WorkflowBuilder from "./workflow-builder";

interface Automation {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused";
  trigger: string;
  action: string;
  runs: number;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  status: "connected" | "disconnected" | "error";
  lastSync: string | null;
  provider: string;
}

interface WebhookItem {
  id: string;
  event: string;
  url: string;
  status: "active" | "inactive";
  calls: number;
}

interface AutomationIntegrationsProps {
  onChangeDetected?: () => void;
}

export default function AutomationIntegrations({ onChangeDetected }: AutomationIntegrationsProps) {
  const [activeTab, setActiveTab] = useState("automations");
  const [isWorkflowBuilderOpen, setIsWorkflowBuilderOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Automation | null>(null);

  const automations: Automation[] = [
    {
      id: "1",
      name: "SLA Breach Alert",
      description: "התראה אוטומטית כאשר ליד עובר את SLA",
      status: "active",
      trigger: "sla_breach",
      action: "notify_manager",
      runs: 234,
    },
    {
      id: "2",
      name: "Auto Lead Assignment",
      description: "הקצאה אוטומטית של לידים חדשים",
      status: "active",
      trigger: "lead_created",
      action: "assign_to_user",
      runs: 1205,
    },
    {
      id: "3",
      name: "Stagnant Lead Reminder",
      description: "תזכורת על לידים ללא פעילות",
      status: "paused",
      trigger: "inactivity_period",
      action: "send_email",
      runs: 89,
    },
  ];

  const integrations: Integration[] = [
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: "סנכרון הודעות WhatsApp",
      status: "connected",
      lastSync: "2026-02-11 10:30",
      provider: "Twilio",
    },
    {
      id: "gmail",
      name: "Gmail",
      description: "סנכרון אימיילים",
      status: "connected",
      lastSync: "2026-02-11 11:15",
      provider: "Google",
    },
    {
      id: "telegram",
      name: "Telegram",
      description: "התראות דרך Telegram",
      status: "disconnected",
      lastSync: null,
      provider: "Telegram Bot",
    },
    {
      id: "n8n",
      name: "N8N",
      description: "אוטומציות מתקדמות",
      status: "connected",
      lastSync: "2026-02-11 09:45",
      provider: "N8N Cloud",
    },
  ];

  const webhooks: WebhookItem[] = [
    {
      id: "1",
      event: "lead.created",
      url: "https://hooks.zapier.com/xxx",
      status: "active",
      calls: 1203,
    },
    {
      id: "2",
      event: "lead.status_changed",
      url: "https://n8n.company.com/webhook/xxx",
      status: "active",
      calls: 456,
    },
  ];

  const handleToggleAutomation = (_id: string) => {
    if (onChangeDetected) onChangeDetected();
  };

  const handleTestIntegration = (id: string) => {
    alert(`בודק חיבור ל-${id}...`);
  };

  const handleConfigureIntegration = (_id: string) => {
    if (onChangeDetected) onChangeDetected();
  };

  const handleCreateWorkflow = () => {
    setEditingWorkflow(null);
    setIsWorkflowBuilderOpen(true);
  };

  const handleEditWorkflow = (workflow: Automation) => {
    setEditingWorkflow(workflow);
    setIsWorkflowBuilderOpen(true);
  };

  const handleSaveWorkflow = (_workflowData: Record<string, unknown>) => {
    setIsWorkflowBuilderOpen(false);
    if (onChangeDetected) onChangeDetected();
  };

  return (
    <div className="space-y-6">
      {isWorkflowBuilderOpen && (
        <WorkflowBuilder
          workflow={editingWorkflow}
          onSave={handleSaveWorkflow}
          onClose={() => setIsWorkflowBuilderOpen(false)}
        />
      )}

      <div className="flex gap-3">
        <Button
          variant={activeTab === "automations" ? "default" : "outline"}
          onClick={() => setActiveTab("automations")}
        >
          <Zap className="w-4 h-4 ml-2" />
          אוטומציות
        </Button>
        <Button
          variant={activeTab === "integrations" ? "default" : "outline"}
          onClick={() => setActiveTab("integrations")}
        >
          <Plug className="w-4 h-4 ml-2" />
          אינטגרציות
        </Button>
        <Button
          variant={activeTab === "webhooks" ? "default" : "outline"}
          onClick={() => setActiveTab("webhooks")}
        >
          <ExternalLink className="w-4 h-4 ml-2" />
          Webhooks
        </Button>
      </div>

      {activeTab === "automations" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                אוטומציות פעילות
              </CardTitle>
              <Button onClick={handleCreateWorkflow} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 ml-2" />
                Workflow חדש
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {automations.map((auto) => (
              <div
                key={auto.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Switch
                    checked={auto.status === "active"}
                    onCheckedChange={() => handleToggleAutomation(auto.id)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{auto.name}</div>
                    <div className="text-sm text-slate-600 mt-1">{auto.description}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span>
                        Trigger: <code className="bg-slate-200 px-1 rounded">{auto.trigger}</code>
                      </span>
                      <span>•</span>
                      <span>
                        Action: <code className="bg-slate-200 px-1 rounded">{auto.action}</code>
                      </span>
                      <span>•</span>
                      <span>{auto.runs} ביצועים</span>
                    </div>
                  </div>
                  <Badge
                    variant={auto.status === "active" ? "default" : "outline"}
                    className={auto.status === "active" ? "bg-green-600" : ""}
                  >
                    {auto.status === "active" ? (
                      <Play className="w-3 h-3 ml-1" />
                    ) : (
                      <Pause className="w-3 h-3 ml-1" />
                    )}
                    {auto.status === "active" ? "פעיל" : "מושהה"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditWorkflow(auto)}>
                    <Workflow className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "integrations" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="w-5 h-5" />
              אינטגרציות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
              >
                <div className="flex items-center gap-4 flex-1">
                  {integration.status === "connected" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : integration.status === "error" ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-400" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{integration.name}</div>
                    <div className="text-sm text-slate-600 mt-1">{integration.description}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      Provider: {integration.provider}
                      {integration.lastSync && <> • סנכרון אחרון: {integration.lastSync}</>}
                    </div>
                  </div>
                  <Badge
                    variant={integration.status === "connected" ? "default" : "outline"}
                    className={
                      integration.status === "connected"
                        ? "bg-green-600"
                        : integration.status === "error"
                          ? "bg-red-100 text-red-700"
                          : ""
                    }
                  >
                    {integration.status === "connected"
                      ? "מחובר"
                      : integration.status === "error"
                        ? "שגיאה"
                        : "מנותק"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestIntegration(integration.id)}
                  >
                    בדיקה
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleConfigureIntegration(integration.id)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === "webhooks" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <code className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm font-mono">
                      {webhook.event}
                    </code>
                    <Badge
                      variant={webhook.status === "active" ? "default" : "outline"}
                      className={webhook.status === "active" ? "bg-green-600" : ""}
                    >
                      {webhook.status === "active" ? "פעיל" : "כבוי"}
                    </Badge>
                  </div>
                  <div className="text-sm text-slate-600 mb-1">{webhook.url}</div>
                  <div className="text-xs text-slate-500">{webhook.calls} קריאות</div>
                </div>
                <Button variant="ghost" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
