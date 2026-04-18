import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Brain, TrendingUp, AlertCircle } from "lucide-react";

export default function PredictiveAnalytics() {
  const forecastData = [
    { month: "ינואר", actual: 180000, predicted: 175000, target: 200000 },
    { month: "פברואר", actual: 220000, predicted: 215000, target: 200000 },
    { month: "מרץ", actual: null, predicted: 245000, target: 220000 },
    { month: "אפריל", actual: null, predicted: 265000, target: 240000 },
    { month: "מאי", actual: null, predicted: 285000, target: 260000 },
  ];

  const churnRiskDeals = [
    { deal: "Deal A - 50K", churnRisk: 25, reason: "No activity in 2 weeks" },
    { deal: "Deal B - 75K", churnRisk: 60, reason: "Contact unresponsive" },
    { deal: "Deal C - 120K", churnRisk: 15, reason: "Strong engagement" },
  ];

  const dealWinProbability = [
    { stage: "Prospecting", winRate: 5 },
    { stage: "Qualification", winRate: 12 },
    { stage: "Proposal", winRate: 35 },
    { stage: "Negotiation", winRate: 65 },
  ];

  return (
    <div className="space-y-4">
      {/* Revenue Forecast */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Sales Revenue Forecast (AI Predicted)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number | null) =>
                    v ? `${(v / 1000).toFixed(0)}K` : "N/A"
                  }
                />
                <Line type="monotone" dataKey="actual" stroke="#34d399" strokeWidth={2} name="בפועל" />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="חיזוי"
                />
                <Line type="monotone" dataKey="target" stroke="#fbbf24" strokeWidth={2} name="מטרה" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-600 mt-4">
            Forecast accuracy: 94% | Next month projection: 245K (22% above target)
          </p>
        </CardContent>
      </Card>

      {/* Churn Risk Analysis */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Churn Risk Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {churnRiskDeals.map((item, idx) => (
            <div key={idx} className="p-3 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-slate-900">{item.deal}</p>
                <Badge
                  className={
                    item.churnRisk > 50
                      ? "bg-red-100 text-red-700"
                      : item.churnRisk > 25
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                  }
                >
                  {item.churnRisk}% risk
                </Badge>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full ${
                    item.churnRisk > 50
                      ? "bg-red-500"
                      : item.churnRisk > 25
                        ? "bg-amber-500"
                        : "bg-green-500"
                  }`}
                  style={{ width: `${item.churnRisk}%` }}
                />
              </div>
              <p className="text-xs text-slate-600">{item.reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Deal Win Probability by Stage */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-purple-600" />
            Deal Win Probability by Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dealWinProbability}>
                <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: "Win Rate %", angle: -90, position: "insideLeft" }}
                />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="winRate" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-600 mt-4">
            Insight: Moving deals from Proposal to Negotiation increases win rate by 86%
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
