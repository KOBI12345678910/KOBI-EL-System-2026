import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface HistoricalPoint {
  month: string;
  actual?: number;
  trend?: number;
  predicted?: number;
  confidence?: number;
  lower?: number;
  upper?: number;
}

export default function SalesTrendPredictor() {
  const historicalData: HistoricalPoint[] = [
    { month: "Oct 2025", actual: 380000, trend: 380000 },
    { month: "Nov 2025", actual: 420000, trend: 395000 },
    { month: "Dec 2025", actual: 480000, trend: 420000 },
    { month: "Jan 2026", actual: 450000, trend: 450000 },
    { month: "Feb 2026", actual: 520000, trend: 490000 },
  ];

  const predictions: HistoricalPoint[] = [
    { month: "Mar 2026", predicted: 560000, confidence: 92, lower: 520000, upper: 600000 },
    { month: "Apr 2026", predicted: 610000, confidence: 88, lower: 560000, upper: 660000 },
    { month: "May 2026", predicted: 680000, confidence: 82, lower: 610000, upper: 750000 },
    { month: "Jun 2026", predicted: 750000, confidence: 78, lower: 680000, upper: 820000 },
  ];

  const chartData = [...historicalData, ...predictions];

  const growthRate = useMemo(() => {
    const recent = historicalData[historicalData.length - 1];
    const previous = historicalData[historicalData.length - 2];
    return Math.round(
      (((recent.actual || 0) - (previous.actual || 0)) / (previous.actual || 1)) * 100
    );
  }, []);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          AI Sales Trend Predictor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <p className="text-xs text-emerald-600 font-semibold">Growth Rate</p>
            <p className="text-2xl font-bold text-emerald-700">{growthRate}%</p>
            <p className="text-xs text-emerald-600 mt-1">Month-over-month</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-600 font-semibold">Q2 2026 Forecast</p>
            <p className="text-2xl font-bold text-blue-700">\u20AA2.04M</p>
            <p className="text-xs text-blue-600 mt-1">3-month total</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-xs text-purple-600 font-semibold">Confidence Level</p>
            <p className="text-2xl font-bold text-purple-700">86%</p>
            <p className="text-xs text-purple-600 mt-1">Average accuracy</p>
          </div>
        </div>

        {/* Chart */}
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value: number) => `\u20AA${(value / 1000).toFixed(0)}K`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#10b981"
                name="Historical"
                strokeWidth={2}
                dot={{ fill: "#10b981" }}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#3b82f6"
                name="Predicted"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={{ fill: "#3b82f6" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Predictions Table */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">Next 4 Months Forecast:</p>
          {predictions.map((pred, idx) => (
            <div
              key={idx}
              className="p-3 border border-slate-200 rounded-lg bg-slate-50 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-900">{pred.month}</p>
                  <p className="text-xs text-slate-600">
                    \u20AA{(pred.predicted || 0).toLocaleString()}
                  </p>
                </div>
                <Badge
                  className={
                    (pred.confidence || 0) >= 90
                      ? "bg-emerald-100 text-emerald-700"
                      : (pred.confidence || 0) >= 80
                      ? "bg-blue-100 text-blue-700"
                      : "bg-amber-100 text-amber-700"
                  }
                >
                  {pred.confidence}% confidence
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Range: \u20AA{(pred.lower || 0).toLocaleString()} - \u20AA
                  {(pred.upper || 0).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Insights */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs text-emerald-700">
            <strong>Positive Outlook:</strong> Sales trending upward with consistent 10-15%
            month-over-month growth. Predicted to reach \u20AA750K by June 2026.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
