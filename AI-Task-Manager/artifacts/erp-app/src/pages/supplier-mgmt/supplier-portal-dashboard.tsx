import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Upload, FileText, Truck, Award, AlertCircle, CheckCircle2 } from "lucide-react";

interface DashboardData {
  openPOs: number;
  pendingInvoices: number;
  certifications: any[];
  performanceScore: any;
}

export default function SupplierPortalDashboard() {
  const { data: supplierportaldashboardData } = useQuery({
    queryKey: ["supplier-portal-dashboard"],
    queryFn: () => authFetch("/api/supplier-mgmt/supplier_portal_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "deliveries" | "certs">("overview");

  useEffect(() => {
    const supplierId = new URLSearchParams(window.location.search).get("sid");
    if (supplierId) {
      fetchDashboard(supplierId);
    }
  }, []);

  const fetchDashboard = async (supplierId: string) => {
    try {
      const response = await fetch(`/api/supplier-portal/dashboard/${supplierId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setDashboard(data);
    } catch (error) {
      console.error("Error fetching dashboard:", error);
    }
  };

  if (!dashboard) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-8">Supplier Portal Dashboard</h1>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Open POs</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">{dashboard.openPOs}</p>
              </div>
              <FileText className="w-12 h-12 text-blue-600 dark:text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Pending Invoices</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">{dashboard.pendingInvoices}</p>
              </div>
              <Upload className="w-12 h-12 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Performance Score</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">
                  {parseFloat(dashboard.performanceScore?.overall_score || "0").toFixed(1)}
                </p>
              </div>
              <Award className="w-12 h-12 text-purple-600 dark:text-purple-400 opacity-20" />
            </div>
          </div>

          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">Certifications</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">{dashboard.certifications.length}</p>
              </div>
              <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-border">
          {["overview", "invoices", "deliveries", "certs"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400"
              }`}
            >
              {tab === "overview" && "Overview"}
              {tab === "invoices" && "Invoices"}
              {tab === "deliveries" && "Deliveries"}
              {tab === "certs" && "Certifications"}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-foreground mb-6">Performance Metrics</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">On-Time Delivery Rate</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-foreground">
                    {parseFloat(dashboard.performanceScore?.on_time_delivery_rate || "0").toFixed(1)}%
                  </span>
                  <span className="text-sm text-green-600 dark:text-green-400 mb-1">✓ Excellent</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Quality Reject Rate</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-foreground">
                    {parseFloat(dashboard.performanceScore?.quality_reject_rate || "0").toFixed(1)}%
                  </span>
                  <span className="text-sm text-green-600 dark:text-green-400 mb-1">✓ Good</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Certifications Tab */}
        {activeTab === "certs" && (
          <div className="space-y-4">
            {dashboard.certifications.length > 0 ? (
              dashboard.certifications.map((cert, idx) => (
                <div key={idx} className="bg-white dark:bg-muted rounded-lg shadow p-6 border-l-4 border-blue-500">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">{cert.certification_name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Expires: {new Date(cert.expiry_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      cert.verification_status === "verified"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}>
                      {cert.verification_status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No certifications uploaded</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
