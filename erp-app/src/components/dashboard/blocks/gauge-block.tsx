import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

interface GaugeBlockProps {
  config: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

interface GaugeMetric {
  name: string;
  value: number;
  unit: string;
  color: string;
}

const GAUGE_METRICS: Record<string, GaugeMetric> = {
  pipeline_health: { name: "בריאות צנרת", value: 78, unit: "%", color: "#4f46e5" },
  production_efficiency: { name: "יעילות ייצור", value: 85, unit: "%", color: "#10b981" },
  cash_position: { name: "מצב מזומנים", value: 62, unit: "%", color: "#f59e0b" },
  customer_satisfaction: { name: "שביעות לקוח", value: 92, unit: "%", color: "#06b6d4" },
  delivery_on_time: { name: "משלוח בזמן", value: 88, unit: "%", color: "#8b5cf6" },
  quality_score: { name: "ניקוד איכות", value: 96, unit: "%", color: "#ec4899" },
};

export default function GaugeBlock({ config, onUpdate }: GaugeBlockProps) {
  const [metric, setMetric] = useState<string>((config.metric as string) || "pipeline_health");
  const gaugeData = GAUGE_METRICS[metric];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-sm">הגדרות מטר</CardTitle>
          <Select value={metric} onValueChange={(val) => { setMetric(val); onUpdate({ ...config, metric: val }); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(GAUGE_METRICS).map(([key, data]) => (
                <SelectItem key={key} value={key}>{data.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-3xl font-bold" style={{ color: gaugeData.color }}>{gaugeData.value}{gaugeData.unit}</p>
            <p className="text-sm font-semibold text-slate-700 mt-2">{gaugeData.name}</p>
          </div>
          <Progress value={gaugeData.value} className="h-3" />
          <p className="text-xs text-slate-500 text-center">מצב נוכחי טוב</p>
        </div>
      </CardContent>
    </Card>
  );
}
