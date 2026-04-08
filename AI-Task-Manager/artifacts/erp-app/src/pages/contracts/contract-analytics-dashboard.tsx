import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

interface PortfolioSummary {
  riskDistribution: Array<{ risk_level: string; count: number }>;
  averageRiskScore: number;
  activeAlertCount: number;
  topRisks: Array<{ contract_id: number; overall_risk_score: number; risk_level: string }>;
}

export default function ContractAnalyticsDashboard() {
  const { data: contractanalyticsdashboardData } = useQuery({
    queryKey: ["contract-analytics-dashboard"],
    queryFn: () => authFetch("/api/contracts/contract_analytics_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolioSummary();
  }, []);

  const fetchPortfolioSummary = async () => {
    try {
      const response = await fetch("/api/contract-analytics/portfolio-summary", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      console.error("Error fetching portfolio summary:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background p-8 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-8">Contract Analytics Dashboard</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Average Risk Score</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">{summary?.averageRiskScore.toFixed(1)}</p>
              </div>
              <BarChart3 className="w-12 h-12 text-blue-600 dark:text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Active Alerts</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{summary?.activeAlertCount}</p>
              </div>
              <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Critical Risk</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">
                  {summary?.riskDistribution.find((r) => r.risk_level === "critical")?.count || 0}
                </p>
              </div>
              <PieChartIcon className="w-12 h-12 text-orange-600 dark:text-orange-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Low Risk</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                  {summary?.riskDistribution.find((r) => r.risk_level === "low")?.count || 0}
                </p>
              </div>
              <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </div>
        </div>

        {/* Risk Distribution and Top Risks */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Risk Distribution */}
          <div className="lg:col-span-1 bg-white dark:bg-muted rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-6">Risk Distribution</h2>
            <div className="space-y-4">
              {["critical", "high", "medium", "low"].map((level) => {
                const count = summary?.riskDistribution.find((r) => r.risk_level === level)?.count || 0;
                const colorMap: Record<string, string> = {
                  critical: "bg-red-500",
                  high: "bg-orange-500",
                  medium: "bg-yellow-500",
                  low: "bg-green-500",
                };
                return (
                  <div key={level}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{level}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-foreground">{count}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-muted rounded-full h-2">
                      <div className={`${colorMap[level]} h-2 rounded-full`} style={{ width: `${Math.min((count / 10) * 100, 100)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Risks */}
          <div className="lg:col-span-2 bg-white dark:bg-muted rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top Risk Contracts
            </h2>
            <div className="space-y-3">
              {summary?.topRisks.slice(0, 5).map((risk) => (
                <div key={risk.contract_id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-sm font-medium text-gray-900 dark:text-foreground">Contract #{risk.contract_id}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{risk.overall_risk_score.toFixed(1)}</p>
                    <p className={`text-xs font-semibold uppercase ${
                      risk.risk_level === "critical"
                        ? "text-red-600 dark:text-red-400"
                        : risk.risk_level === "high"
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}>
                      {risk.risk_level}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analytics Summary */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Analytics Overview</h3>
          <ul className="space-y-2 text-blue-800 dark:text-blue-200">
            <li>• Contract portfolio is being continuously monitored with AI-powered risk assessment</li>
            <li>• Predictive analytics forecast future performance and renewal success rates</li>
            <li>• Automated alerts notify stakeholders of emerging risks and critical issues</li>
            <li>• Dashboard provides real-time insights into contract health and portfolio composition</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
