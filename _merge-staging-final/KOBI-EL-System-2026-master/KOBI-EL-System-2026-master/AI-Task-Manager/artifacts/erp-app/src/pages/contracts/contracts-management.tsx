import React, { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Eye, AlertCircle, CheckCircle, Clock, Copy, Upload } from "lucide-react";
import ImportButton from "@/components/import-button";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { translateStatus } from "@/lib/status-labels";

interface Contract {
  id: number;
  contractNumber: string;
  title: string;
  contractType: string;
  status: string;
  vendor?: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  created_at?: string;
  updated_at?: string;
}

export default function ContractsManagement() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "create" | "approvals" | "renewals" | "stats">("list");
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    contractNumber: "",
    title: "",
    contractType: "Service Agreement",
    status: "draft",
    vendor: "",
    amount: "",
    startDate: "",
    endDate: "",
  });
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    review: 0,
    signed: 0,
    expired: 0,
    totalContractValue: 0,
  });

  useEffect(() => {
    fetchContracts();
    fetchStats();
  }, []);

  const fetchContracts = async () => {
    try {
      const response = await fetch("/api/contracts", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setContracts(data.contracts || []);
    } catch (error) {
      console.error("Error fetching contracts:", error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/contracts/stats/dashboard", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingId ? `/api/contracts/${editingId}` : "/api/contracts";
      const method = editingId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        setFormData({
          contractNumber: "",
          title: "",
          contractType: "Service Agreement",
          status: "draft",
          vendor: "",
          amount: "",
          startDate: "",
          endDate: "",
        });
        setEditingId(null);
        setActiveTab("list");
        fetchContracts();
      }
    } catch (error) {
      console.error("Error saving contract:", error);
    }
  };

  const handleDeleteContract = async (contractId: number) => {
    if (!window.confirm("למחוק חוזה זה?")) return;
    try {
      await authFetch(`/api/contracts/${contractId}`, { method: "DELETE" });
      fetchContracts();
    } catch (error) {
      console.error("Error deleting contract:", error);
    }
  };

  const handleStatusChange = async (contractId: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/contracts/${contractId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ newStatus, reason: "Status updated via UI" }),
      });
      
      if (response.ok) {
        fetchContracts();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-800";
      case "review":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-blue-100 text-blue-800";
      case "signed":
        return "bg-green-100 text-green-800";
      case "expired":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "draft":
        return <Clock className="w-4 h-4" />;
      case "review":
        return <AlertCircle className="w-4 h-4" />;
      case "signed":
        return <CheckCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">Contract Lifecycle Management</h1>
          <div className="flex gap-2">
            <ImportButton apiRoute="/api/contracts" onSuccess={fetchContracts} />
            <button
              onClick={() => setActiveTab("create")}
              className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              New Contract
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-border">
          {["list", "create", "approvals", "renewals", "stats"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* List Tab */}
        {activeTab === "list" && (
          <div className="bg-white dark:bg-muted rounded-lg shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-muted border-b border-gray-200 dark:border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Contract #</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Title</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Vendor</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Amount</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">End Date</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {contracts.map((contract) => (
                    <tr key={contract.id} className="hover:bg-gray-50 dark:hover:bg-muted">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-foreground">{contract.contractNumber}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-foreground">{contract.title}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{contract.vendor}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {contract.amount ? `₪${contract.amount.toLocaleString()}` : "-"}
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(contract.status)}`}>
                          {getStatusIcon(contract.status)}
                          {translateStatus(contract.status)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{contract.endDate || "-"}</td>
                      <td className="px-6 py-4 text-sm flex gap-2">
                        <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button title="עריכה" onClick={() => { setEditingId(contract.id); setFormData({ contractNumber: contract.contractNumber || "", title: contract.title || "", contractType: contract.contractType || "Service Agreement", status: contract.status || "draft", vendor: contract.vendor || "", amount: String(contract.amount || ""), startDate: contract.startDate || "", endDate: contract.endDate || "" }); setActiveTab("create"); }} className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button title="שכפול" onClick={async () => { const res = await duplicateRecord("/api/contracts", contract.id, { defaultStatus: "draft" }); if (res.ok) { fetchContracts(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="text-slate-500 hover:text-slate-300">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button title="מחיקה" onClick={() => handleDeleteContract(contract.id)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Tab */}
        {activeTab === "create" && (
          <div className="bg-white dark:bg-muted rounded-lg shadow p-8">
            <form onSubmit={handleCreateContract} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contract Number</label>
                  <input
                    type="text"
                    value={formData.contractNumber}
                    onChange={(e) => setFormData({ ...formData, contractNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Vendor</label>
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount (₪)</label>
                  <input
                    type="number"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contract Type</label>
                  <select
                    value={formData.contractType}
                    onChange={(e) => setFormData({ ...formData, contractType: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  >
                    <option>Service Agreement</option>
                    <option>NDA</option>
                    <option>Purchase Agreement</option>
                    <option>License Agreement</option>
                    <option>Employment Contract</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  >
                    <option>draft</option>
                    <option>review</option>
                    <option>approved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 text-foreground py-2 rounded-lg hover:bg-blue-700">
                Create Contract
              </button>
            </form>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === "stats" && (
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Contracts</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-foreground mt-2">{stats.total}</p>
            </div>
            <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Signed Contracts</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{stats.signed}</p>
            </div>
            <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Contract Value</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">₪{(stats.totalContractValue || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">In Draft</p>
              <p className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-2">{stats.draft}</p>
            </div>
            <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">In Review</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">{stats.review}</p>
            </div>
            <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Expired</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{stats.expired}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
