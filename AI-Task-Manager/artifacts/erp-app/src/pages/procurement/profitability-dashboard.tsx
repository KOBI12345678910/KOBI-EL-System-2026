import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, AlertCircle } from "lucide-react";

interface ProfitabilitySummary {
  avgGrossMargin: number;
  avgNetMargin: number;
  avgROI: number;
  profitableProjectsPercent: number;
  totalProjectValue: number;
  monthlyData: Array<{ month: string; margin: number }>;
}

export default function ProfitabilityDashboard() {
  const { data: profitabilitydashboardData } = useQuery({
    queryKey: ["profitability-dashboard"],
    queryFn: () => authFetch("/api/procurement/profitability_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const [summary, setSummary] = useState<ProfitabilitySummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/procurement/profitability-summary", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (error) {
      console.error("Failed to fetch profitability summary:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Profitability Dashboard</h1>
        <p className="text-gray-600">Real-time profitability analysis across projects</p>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Avg. Gross Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{summary.avgGrossMargin}%</p>
                <p className="text-xs text-gray-500 mt-1">Industry avg: 30%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Avg. Net Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">{summary.avgNetMargin}%</p>
                <p className="text-xs text-gray-500 mt-1">After all costs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Avg. ROI</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-purple-600">{summary.avgROI}%</p>
                <p className="text-xs text-gray-500 mt-1">Return on investment</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Profitable Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-600">{summary.profitableProjectsPercent}%</p>
                <p className="text-xs text-gray-500 mt-1">Go-status projects</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Margin Trend (6 Months)</CardTitle>
              <CardDescription>Gross margin percentage over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={summary.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis label={{ value: "Margin %", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="margin"
                    stroke="#3b82f6"
                    name="Margin %"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project Profitability Breakdown</CardTitle>
              <CardDescription>Distribution of margin percentages across active projects</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">High Margin (30%+)</span>
                    <span className="text-sm font-bold">45%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-green-500 h-2 rounded" style={{ width: "45%" }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Medium Margin (15-30%)</span>
                    <span className="text-sm font-bold">35%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-blue-500 h-2 rounded" style={{ width: "35%" }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Low Margin (0-15%)</span>
                    <span className="text-sm font-bold">18%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-yellow-500 h-2 rounded" style={{ width: "18%" }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Negative Margin (&lt;0%)</span>
                    <span className="text-sm font-bold">2%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2">
                    <div className="bg-red-500 h-2 rounded" style={{ width: "2%" }}></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {loading && <div className="text-center text-gray-500">Loading...</div>}
    </div>
  );
}
