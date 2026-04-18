import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Users, DollarSign, LucideIcon } from "lucide-react";

interface KPI {
  name: string;
  value: number;
  unit: string;
  target: number;
  trend: string;
  status: "on-track" | "at-risk" | "concern";
  icon: LucideIcon;
  description: string;
}

export default function AutoKPIIdentifier() {
  const kpis = useMemo<KPI[]>(
    () => [
      {
        name: "Sales Conversion Rate",
        value: 32,
        unit: "%",
        target: 35,
        trend: "\u2191 2%",
        status: "on-track",
        icon: Target,
        description: "Percentage of leads converted to deals",
      },
      {
        name: "Average Deal Value",
        value: 125000,
        unit: "\u20AA",
        target: 150000,
        trend: "\u2193 5%",
        status: "at-risk",
        icon: DollarSign,
        description: "Mean revenue per closed deal",
      },
      {
        name: "Sales Cycle Duration",
        value: 45,
        unit: "days",
        target: 40,
        trend: "\u2191 3 days",
        status: "concern",
        icon: TrendingUp,
        description: "Average time from first contact to close",
      },
      {
        name: "Customer Retention",
        value: 88,
        unit: "%",
        target: 90,
        trend: "\u2191 1%",
        status: "on-track",
        icon: Users,
        description: "Percentage of customers retained YoY",
      },
      {
        name: "Win Rate",
        value: 42,
        unit: "%",
        target: 45,
        trend: "\u2191 4%",
        status: "on-track",
        icon: Target,
        description: "Percentage of deals won vs lost",
      },
      {
        name: "Customer Lifetime Value",
        value: 450000,
        unit: "\u20AA",
        target: 500000,
        trend: "\u2191 8%",
        status: "on-track",
        icon: DollarSign,
        description: "Total expected revenue from customer",
      },
    ],
    []
  );

  const getStatusColor = (status: string) => {
    return status === "on-track"
      ? "bg-emerald-100 text-emerald-700"
      : status === "at-risk"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-600" />
          AI Auto-KPI Identifier
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          const progress = (kpi.value / kpi.target) * 100;

          return (
            <div
              key={idx}
              className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{kpi.name}</p>
                    <p className="text-xs text-slate-600">{kpi.description}</p>
                  </div>
                </div>
                <Badge className={getStatusColor(kpi.status)}>{kpi.status}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">Current</p>
                  <p className="text-lg font-bold text-slate-900">
                    {kpi.value >= 1000
                      ? `\u20AA${(kpi.value / 1000).toFixed(0)}K`
                      : kpi.value}
                    {kpi.unit}
                  </p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">Target</p>
                  <p className="text-lg font-bold text-indigo-600">
                    {kpi.target >= 1000
                      ? `\u20AA${(kpi.target / 1000).toFixed(0)}K`
                      : kpi.target}
                    {kpi.unit}
                  </p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">Trend</p>
                  <p
                    className={`text-lg font-bold ${
                      kpi.trend.includes("\u2191") ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {kpi.trend}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Progress value={Math.min(progress, 100)} className="flex-1 h-2" />
                <span className="text-xs font-bold text-slate-700">{Math.round(progress)}%</span>
              </div>
            </div>
          );
        })}

        {/* Insights */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs text-emerald-700">
              <strong>Strong Areas:</strong> Customer retention & win rate performing above
              expectations.
            </p>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700">
              <strong>Focus Areas:</strong> Deal value declining - recommend value-based selling
              training.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
