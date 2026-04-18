import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, TrendingUp, Calendar, DollarSign, type LucideIcon } from "lucide-react";

interface MetricBlockProps {
  config: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

interface MetricItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}

const METRIC_DATA: Record<string, MetricItem[]> = {
  employee_stats: [
    { label: "עובדים בחברה", value: 45, icon: Users, color: "blue" },
    { label: "משרות פתוחות", value: 3, icon: Users, color: "amber" },
    { label: "בחופשה היום", value: 2, icon: Calendar, color: "purple" },
  ],
  sales_stats: [
    { label: "הזמנות חודש זה", value: 23, icon: TrendingUp, color: "emerald" },
    { label: "הכנסות שנתיות", value: "₪2.3M", icon: DollarSign, color: "indigo" },
    { label: "לקוחות פעילים", value: 187, icon: Users, color: "blue" },
  ],
};

const colorMap: Record<string, { bg: string; icon: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600" },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600" },
};

export default function MetricBlock({ config, onUpdate }: MetricBlockProps) {
  const [category, setCategory] = useState<string>((config.category as string) || "employee_stats");
  const metrics = METRIC_DATA[category] || [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-sm">הגדרות מדדים</CardTitle>
          <Select value={category} onValueChange={(val) => { setCategory(val); onUpdate({ ...config, category: val }); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee_stats">סטטיסטיקות עובדים</SelectItem>
              <SelectItem value="sales_stats">סטטיסטיקות מכירות</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3">
          {metrics.map((metric, idx) => {
            const Icon = metric.icon;
            const colors = colorMap[metric.color] || colorMap.blue;
            return (
              <div key={idx} className={`p-4 rounded-lg border border-slate-200 ${colors.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-600">{metric.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{metric.value}</p>
                  </div>
                  <Icon className={`w-8 h-8 ${colors.icon}`} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
