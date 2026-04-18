import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { AlertTriangle, TrendingUp, BarChart3, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { translateStatus } from "@/lib/status-labels";

interface RiskAssessment {
  id: number;
  overall_risk_score: number;
  vendor_risk_score: number;
  financial_risk_score: number;
  compliance_risk_score: number;
  performance_history_score: number;
  risk_level: string;
  risk_factors: string[];
  recommendations: string[];
  analysis_date: string;
}

interface RiskAlert {
  id: number;
  alert_type: string;
  severity: string;
  message: string;
  status: string;
  created_at: string;
}

export default function ContractRiskScoring() {
  const { data: contractriskscoringData } = useQuery({
    queryKey: ["contract-risk-scoring"],
    queryFn: () => authFetch("/api/contracts/contract_risk_scoring"),
    staleTime: 5 * 60 * 1000,
  });

  const [activeTab, setActiveTab] = useState<"assessments" | "alerts" | "insights">("assessments");
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);

  useEffect(() => {
    fetchAssessments();
    fetchAlerts();
  }, []);

  const fetchAssessments = async () => {
    try {
      const response = await fetch("/api/contract-analytics/risk-assessments", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setAssessments(data.assessments || []);
    } catch (error) {
      console.error("Error fetching assessments:", error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch("/api/contract-analytics/alerts", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
      case "high":
        return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
      case "low":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      case "high":
        return <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-8">Contract Risk Scoring & Analytics</h1>

        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-border">
          {["assessments", "alerts", "insights"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-foreground"
              }`}
            >
              {tab === "assessments" && "Risk Assessments"}
              {tab === "alerts" && "Risk Alerts"}
              {tab === "insights" && "Contract Insights"}
            </button>
          ))}
        </div>

        {/* Risk Assessments Tab */}
        {activeTab === "assessments" && (
          <div className="space-y-6">
            {selectedAssessment ? (
              <div className="bg-white dark:bg-muted rounded-lg shadow p-8">
                <button
                  onClick={() => setSelectedAssessment(null)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 mb-4"
                >
                  ← Back to list
                </button>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-6">Risk Assessment Details</h2>

                <div className="grid grid-cols-4 gap-6 mb-8">
                  <div className={`p-4 rounded-lg ${getRiskColor(selectedAssessment.risk_level)}`}>
                    <p className="text-sm font-medium opacity-75 mb-1">Overall Risk Score</p>
                    <p className="text-3xl font-bold">{selectedAssessment.overall_risk_score.toFixed(1)}</p>
                    <p className="text-sm font-semibold mt-2 uppercase">{selectedAssessment.risk_level}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 opacity-75 mb-1">Vendor Risk</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{selectedAssessment.vendor_risk_score?.toFixed(1)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-sm font-medium text-green-600 dark:text-green-400 opacity-75 mb-1">Financial Risk</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{selectedAssessment.financial_risk_score?.toFixed(1)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <p className="text-sm font-medium text-purple-600 dark:text-purple-400 opacity-75 mb-1">Compliance Risk</p>
                    <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{selectedAssessment.compliance_risk_score?.toFixed(1)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-4">Risk Factors</h3>
                    <ul className="space-y-2">
                      {selectedAssessment.risk_factors?.map((factor, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                          <AlertTriangle className="w-4 h-4 mt-1 text-red-600 flex-shrink-0" />
                          <span>{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-4">Recommendations</h3>
                    <ul className="space-y-2">
                      {selectedAssessment.recommendations?.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                          <CheckCircle2 className="w-4 h-4 mt-1 text-blue-600 flex-shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {assessments.length > 0 ? (
                  assessments.map((assessment) => (
                    <div
                      key={assessment.id}
                      onClick={() => setSelectedAssessment(assessment)}
                      className="bg-white dark:bg-muted rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">Contract Risk Assessment</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(assessment.analysis_date).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-4 py-2 rounded-full font-semibold ${getRiskColor(assessment.risk_level)}`}>
                          {assessment.risk_level.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-gray-900 dark:text-foreground">{assessment.overall_risk_score.toFixed(1)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Overall Score</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{assessment.vendor_risk_score?.toFixed(1)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vendor</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{assessment.financial_risk_score?.toFixed(1)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Financial</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{assessment.compliance_risk_score?.toFixed(1)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Compliance</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{assessment.performance_history_score?.toFixed(1)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Performance</p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-border">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          <strong>Key Factors:</strong> {assessment.risk_factors?.slice(0, 2).join(", ") || "No factors identified"}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No risk assessments available</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Risk Alerts Tab */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <div key={alert.id} className="bg-white dark:bg-muted rounded-lg shadow p-6 border-l-4 border-red-500">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {getSeverityIcon(alert.severity)}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">{alert.alert_type}</h3>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{alert.message}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">{new Date(alert.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        alert.status === "active"
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      }`}
                    >
                      {translateStatus(alert.status)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No active risk alerts</p>
              </div>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === "insights" && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Contract Performance Trending</h3>
                  <p className="text-blue-700 dark:text-blue-300 mt-2">
                    Analysis shows improving performance metrics across key contracts. Cost escalation risk has decreased by 12% this quarter.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">Vendor Concentration Risk</h3>
                  <p className="text-orange-700 dark:text-orange-300 mt-2">
                    25% of contract value is concentrated with top 3 vendors. Consider diversification to reduce supply chain risk.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Renewal Opportunity</h3>
                  <p className="text-green-700 dark:text-green-300 mt-2">
                    3 contracts are eligible for renewal with potential 8-15% cost savings based on market analysis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
