import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, type LucideIcon } from "lucide-react";

interface ListBlockProps {
  config: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

interface ListItem {
  id: number;
  title?: string;
  name?: string;
  description?: string;
  person?: string;
  employees?: number;
  severity?: string;
  status?: string;
  icon?: LucideIcon;
}

const LIST_DATA: Record<string, ListItem[]> = {
  alerts: [
    { id: 1, title: "מלאי נמוך", description: "חומר B1 במלאי נמוך", severity: "high", icon: AlertTriangle },
    { id: 2, title: "תקלה בקו ייצור", description: "עצירה בתחנת הריתוך", severity: "critical", icon: AlertTriangle },
    { id: 3, title: "חשבונית באיחור", description: "3 חשבוניות מאחרות", severity: "medium", icon: Clock },
  ],
  tasks_pending: [
    { id: 1, title: "בדיקה איכות סדרה A", person: "דוד", status: "בתהליך" },
    { id: 2, title: "אישור תשלום ספק", person: "מרים", status: "ממתין" },
    { id: 3, title: "הכנת דוח חודשי", person: "יוסי", status: "בתהליך" },
  ],
  departments: [
    { id: 1, name: "מכירות", employees: 5, status: "active" },
    { id: 2, name: "ייצור", employees: 12, status: "active" },
    { id: 3, name: "כספים", employees: 3, status: "active" },
  ],
};

export default function ListBlock({ config, onUpdate }: ListBlockProps) {
  const [listType, setListType] = useState<string>((config.listType as string) || "alerts");
  const items = LIST_DATA[listType] || [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-sm">הגדרות רשימה</CardTitle>
          <Select value={listType} onValueChange={(val) => { setListType(val); onUpdate({ ...config, listType: val }); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alerts">התראות</SelectItem>
              <SelectItem value="tasks_pending">משימות ממתינות</SelectItem>
              <SelectItem value="departments">מחלקות</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="p-3 bg-slate-50 rounded border border-slate-200 hover:border-slate-300">
                <div className="flex items-start gap-3">
                  {Icon && <Icon className={`w-4 h-4 mt-0.5 ${
                    item.severity === "critical" ? "text-red-600" :
                    item.severity === "high" ? "text-orange-600" : "text-blue-600"
                  }`} />}
                  <div className="flex-1">
                    <p className="font-medium text-sm text-slate-900">{item.title || item.name}</p>
                    <p className="text-xs text-slate-600 mt-1">{item.description || item.person || `${item.employees} עובדים`}</p>
                  </div>
                  <div className="text-right">
                    {item.status && (
                      <span className={`inline-block px-2 py-1 text-xs rounded ${
                        item.status === "active" || item.status === "בתהליך" ? "bg-emerald-100 text-emerald-700" :
                        item.status === "inactive" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-700"
                      }`}>{item.status}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
