import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { entityList } from "@/lib/entity-api";

interface MetricsWidgetProps {
  title: string;
  entity: string;
  filter?: Record<string, unknown>;
  metric: "count" | "sum" | "average";
}

export default function MetricsWidget({ title, entity, filter, metric }: MetricsWidgetProps) {
  const [value, setValue] = useState(0);
  const [previousValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetric();
  }, [entity, filter, metric]);

  const loadMetric = async () => {
    try {
      setLoading(true);
      const data = await entityList<Record<string, unknown>>(entity);
      let filtered = data;

      if (filter) {
        filtered = data.filter((item) =>
          Object.entries(filter).every(([key, val]) => item[key] === val)
        );
      }

      let computed = 0;
      switch (metric) {
        case "count":
          computed = filtered.length;
          break;
        case "sum":
          computed = filtered.reduce((sum, item) => sum + ((item.amount as number) || (item.value as number) || 0), 0);
          break;
        case "average":
          computed = filtered.length > 0
            ? filtered.reduce((sum, item) => sum + ((item.amount as number) || 0), 0) / filtered.length
            : 0;
          break;
      }

      setValue(computed);
    } catch (error) {
      console.error("Error loading metric:", error);
    } finally {
      setLoading(false);
    }
  };

  const trend = value >= previousValue ? "up" : "down";
  const trendPercent = previousValue ? Math.round(((value - previousValue) / previousValue) * 100) : 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-600 mb-1">{title}</p>
            <h3 className="text-3xl font-bold text-slate-900">{loading ? "-" : value.toLocaleString()}</h3>
            <div className={`flex items-center gap-1 mt-2 text-sm ${trend === "up" ? "text-green-600" : "text-red-600"}`}>
              {trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(trendPercent)}% from last period</span>
            </div>
          </div>
          {loading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        </div>
      </CardContent>
    </Card>
  );
}
