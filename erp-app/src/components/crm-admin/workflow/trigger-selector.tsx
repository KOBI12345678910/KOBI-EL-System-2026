import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, ArrowRight, AlertTriangle, Database, Clock, Calendar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TriggerItem {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: string;
  config?: Record<string, string>;
}

interface TriggerSelectorProps {
  selected: TriggerItem | null;
  onSelect: (trigger: TriggerItem) => void;
}

export default function TriggerSelector({ selected, onSelect }: TriggerSelectorProps) {
  const triggers: TriggerItem[] = [
    {
      type: "lead_created",
      label: "ליד חדש נוצר",
      description: "כאשר ליד חדש נוצר במערכת",
      icon: Plus,
      category: "Lifecycle",
    },
    {
      type: "status_changed",
      label: "סטטוס השתנה",
      description: "כאשר סטטוס הליד משתנה",
      icon: ArrowRight,
      category: "Lifecycle",
      config: { field: "sales_status" },
    },
    {
      type: "field_changed",
      label: "שדה השתנה",
      description: "כאשר שדה מסוים משתנה",
      icon: Database,
      category: "Data",
    },
    {
      type: "sla_breach",
      label: "SLA Breach",
      description: "כאשר ליד עובר את ה-SLA",
      icon: AlertTriangle,
      category: "Time",
    },
    {
      type: "inactivity_period",
      label: "חוסר פעילות",
      description: "כאשר אין פעילות X זמן",
      icon: Clock,
      category: "Time",
    },
    {
      type: "time_based",
      label: "מבוסס זמן",
      description: "בזמן מסוים או תדירות",
      icon: Calendar,
      category: "Time",
    },
  ];

  const categories = [...new Set(triggers.map((t) => t.category))];

  return (
    <div className="space-y-6">
      {categories.map((category) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{category}</h3>
          <div className="grid grid-cols-2 gap-3">
            {triggers
              .filter((t) => t.category === category)
              .map((trigger) => {
                const Icon = trigger.icon;
                const isSelected = selected?.type === trigger.type;
                return (
                  <Card
                    key={trigger.type}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? "ring-2 ring-indigo-500 bg-indigo-50" : ""
                    }`}
                    onClick={() => onSelect(trigger)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                            isSelected ? "bg-indigo-600" : "bg-slate-100"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${
                              isSelected ? "text-white" : "text-slate-600"
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm text-slate-900">{trigger.label}</h4>
                          <p className="text-xs text-slate-600 mt-1">{trigger.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
