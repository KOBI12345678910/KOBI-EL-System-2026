import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail, Bell, UserPlus, Database, CheckCircle, Webhook, Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ActionField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
}

interface ActionDefinition {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  fields: ActionField[];
}

interface ActionSelectorProps {
  onSelect: (action: ActionDefinition & { config: Record<string, string> }) => void;
}

export default function ActionSelector({ onSelect }: ActionSelectorProps) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionDefinition | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  const actions: ActionDefinition[] = [
    {
      type: "send_email",
      label: "שלח אימייל",
      description: "שלח אימייל למשתמש או ללקוח",
      icon: Mail,
      fields: [
        { name: "to", label: "אל", type: "select", options: ["lead_owner", "manager", "custom"] },
        { name: "subject", label: "נושא", type: "text" },
        { name: "body", label: "תוכן", type: "textarea" },
      ],
    },
    {
      type: "send_notification",
      label: "שלח התראה",
      description: "שלח התראה במערכת",
      icon: Bell,
      fields: [
        { name: "to", label: "אל", type: "select", options: ["lead_owner", "manager", "team"] },
        { name: "message", label: "הודעה", type: "text" },
      ],
    },
    {
      type: "assign_to_user",
      label: "הקצה למשתמש",
      description: "שנה את בעל הליד",
      icon: UserPlus,
      fields: [
        { name: "user", label: "משתמש", type: "select", options: ["round_robin", "specific_user", "manager"] },
      ],
    },
    {
      type: "update_field",
      label: "עדכן שדה",
      description: "עדכן שדה בליד",
      icon: Database,
      fields: [
        { name: "field", label: "שדה", type: "select", options: ["status", "priority", "custom"] },
        { name: "value", label: "ערך חדש", type: "text" },
      ],
    },
    {
      type: "create_task",
      label: "צור משימה",
      description: "צור משימה חדשה",
      icon: CheckCircle,
      fields: [
        { name: "title", label: "כותרת", type: "text" },
        { name: "assigned_to", label: "מוקצה ל", type: "select", options: ["lead_owner", "manager"] },
        { name: "due_date", label: "תאריך יעד", type: "text" },
      ],
    },
    {
      type: "webhook",
      label: "קרא ל-Webhook",
      description: "שלח נתונים ל-API חיצוני",
      icon: Webhook,
      fields: [
        { name: "url", label: "URL", type: "text" },
        { name: "method", label: "Method", type: "select", options: ["POST", "GET", "PUT"] },
        { name: "headers", label: "Headers (JSON)", type: "textarea" },
        { name: "body", label: "Body (JSON)", type: "textarea" },
      ],
    },
  ];

  const handleSelectAction = (action: ActionDefinition) => {
    setSelectedAction(action);
    setConfig({});
    setIsConfigOpen(true);
  };

  const handleSaveConfig = () => {
    if (!selectedAction) return;
    onSelect({
      ...selectedAction,
      config,
    });
    setIsConfigOpen(false);
    setSelectedAction(null);
    setConfig({});
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Card
              key={action.type}
              className="cursor-pointer transition-all hover:shadow-md hover:border-indigo-300"
              onClick={() => handleSelectAction(action)}
            >
              <CardContent className="p-4 text-center">
                <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center mx-auto mb-2">
                  <Icon className="w-6 h-6 text-slate-600" />
                </div>
                <h4 className="font-medium text-sm text-slate-900 mb-1">{action.label}</h4>
                <p className="text-xs text-slate-600">{action.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isConfigOpen && selectedAction && (
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>הגדרות: {selectedAction.label}</DialogTitle>
              <DialogDescription>הגדר את הפרמטרים של הפעולה</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {selectedAction.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label>{field.label}</Label>
                  {field.type === "text" && (
                    <Input
                      value={config[field.name] || ""}
                      onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                      placeholder={field.label}
                    />
                  )}
                  {field.type === "textarea" && (
                    <Textarea
                      value={config[field.name] || ""}
                      onChange={(e) => setConfig({ ...config, [field.name]: e.target.value })}
                      placeholder={field.label}
                      rows={4}
                    />
                  )}
                  {field.type === "select" && (
                    <Select
                      value={config[field.name] || ""}
                      onValueChange={(value) => setConfig({ ...config, [field.name]: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחר..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
                ביטול
              </Button>
              <Button onClick={handleSaveConfig}>
                <Plus className="w-4 h-4 ml-2" />
                הוסף פעולה
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
