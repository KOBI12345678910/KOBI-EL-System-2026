import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp } from "lucide-react";

interface KPIBlockProps {
  config: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

interface KPIMetricDef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const KPI_METRICS: Record<string, KPIMetricDef[]> = {
  sales: [
    { id: "total_revenue", name: "סך הכנסות", icon: "₪", color: "emerald" },
    { id: "orders_count", name: "מספר הזמנות", icon: "#", color: "blue" },
    { id: "avg_order_value", name: "ערך הזמנה ממוצע", icon: "₪", color: "indigo" },
    { id: "orders_pending", name: "הזמנות ממתינות", icon: "⏳", color: "amber" },
  ],
  production: [
    { id: "orders_in_production", name: "בייצור", icon: "⚙", color: "purple" },
    { id: "production_completion", name: "שיעור סיום", icon: "%", color: "emerald" },
    { id: "quality_score", name: "ניקוד איכות", icon: "★", color: "amber" },
    { id: "downtime_hours", name: "שעות עצירה", icon: "⏱", color: "red" },
  ],
  finance: [
    { id: "total_invoices", name: "סך חשבוניות", icon: "📄", color: "slate" },
    { id: "paid_invoices", name: "משולמות", icon: "✓", color: "emerald" },
    { id: "overdue_invoices", name: "באיחור", icon: "⚠", color: "red" },
    { id: "collection_rate", name: "שיעור גביה", icon: "%", color: "blue" },
  ],
  hr: [
    { id: "total_employees", name: "עובדים", icon: "👥", color: "slate" },
    { id: "active_employees", name: "פעילים", icon: "✓", color: "emerald" },
    { id: "on_leave", name: "בחופשה", icon: "🏖", color: "amber" },
    { id: "utilization_rate", name: "שימור", icon: "%", color: "blue" },
  ],
};

export default function KPIBlock({ config, onUpdate }: KPIBlockProps) {
  const [category, setCategory] = useState<string>((config.category as string) || "sales");
  const [metricId, setMetricId] = useState<string>((config.metricId as string) || "total_revenue");
  const showTrend = config.showTrend !== false;

  const metric = KPI_METRICS[category]?.find((m) => m.id === metricId);

  const handleChange = (key: string, value: string) => {
    onUpdate({ ...config, [key]: value });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-sm">הגדרות KPI</CardTitle>
          <Select value={category} onValueChange={(val) => {
            setCategory(val);
            handleChange("category", val);
            setMetricId(KPI_METRICS[val][0].id);
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">מכירות</SelectItem>
              <SelectItem value="production">ייצור</SelectItem>
              <SelectItem value="finance">כספים</SelectItem>
              <SelectItem value="hr">משאבי אנוש</SelectItem>
            </SelectContent>
          </Select>
          <Select value={metricId} onValueChange={(val) => { setMetricId(val); handleChange("metricId", val); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_METRICS[category]?.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {metric && (
          <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border-2 border-dashed border-slate-300">
            <p className="text-sm text-slate-600 mb-2">{metric.name}</p>
            <p className="text-4xl font-bold text-slate-900">2,450</p>
            {showTrend && (
              <div className="flex items-center gap-2 mt-4 text-emerald-600">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">+12.5% מאחרונה</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
