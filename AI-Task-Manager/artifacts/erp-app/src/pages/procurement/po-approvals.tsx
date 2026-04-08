import React, { useState, useEffect } from "react";
import { Check, X, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

interface ApprovalStep {
  id: number;
  step_number: number;
  approver_email: string;
  approver_name: string;
  approver_role: string;
  status: string;
  approved_at?: string;
  comments?: string;
}

interface POApproval {
  id: number;
  po_number: string;
  po_amount: string;
  approval_status: string;
  steps?: ApprovalStep[];
}

export default function POApprovals() {
  const [activeTab, setActiveTab] = useState<"queue" | "thresholds">("queue");
  const [approvals, setApprovals] = useState<POApproval[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<POApproval | null>(null);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    minAmount: "",
    maxAmount: "",
    requiredRoles: [] as string[],
    escalationHours: 24,
  });

  useEffect(() => {
    if (activeTab === "queue") {
      fetchApprovals();
    } else {
      fetchThresholds();
    }
  }, [activeTab]);

  const fetchApprovals = async () => {
    try {
      const response = await fetch("/api/po-approvals", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setApprovals(data.approvals || []);
    } catch (error) {
      console.error("Error fetching approvals:", error);
    }
  };

  const fetchThresholds = async () => {
    try {
      const response = await fetch("/api/po-approval-thresholds", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setThresholds(data.thresholds || []);
    } catch (error) {
      console.error("Error fetching thresholds:", error);
    }
  };

  const handleApproveStep = async (approvalId: number, stepId: number) => {
    try {
      await fetch(`/api/po-approval/${approvalId}/step/${stepId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ comments: "" }),
      });
      fetchApprovals();
    } catch (error) {
      console.error("Error approving:", error);
    }
  };

  const handleRejectStep = async (approvalId: number, stepId: number) => {
    try {
      await fetch(`/api/po-approval/${approvalId}/step/${stepId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ comments: "Rejected" }),
      });
      fetchApprovals();
    } catch (error) {
      console.error("Error rejecting:", error);
    }
  };

  const handleCreateThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/po-approval-thresholds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(formData),
      });
      setFormData({
        minAmount: "",
        maxAmount: "",
        requiredRoles: [],
        escalationHours: 24,
      });
      fetchThresholds();
    } catch (error) {
      console.error("Error creating threshold:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-8">PO Approval Workflow</h1>

        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-border">
          {["queue", "thresholds"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-foreground"
              }`}
            >
              {tab === "queue" && "Approval Queue"}
              {tab === "thresholds" && "Approval Thresholds"}
            </button>
          ))}
        </div>

        {/* Approval Queue Tab */}
        {activeTab === "queue" && (
          <div className="space-y-6">
            {selectedApproval ? (
              <div className="bg-white dark:bg-muted rounded-lg shadow p-8">
                <button
                  onClick={() => setSelectedApproval(null)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 mb-6"
                >
                  ← Back to Queue
                </button>

                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">{selectedApproval.po_number}</h2>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">Amount: ${parseFloat(selectedApproval.po_amount).toLocaleString()}</p>
                </div>

                <div className="space-y-4">
                  {selectedApproval.steps?.map((step, idx) => (
                    <div key={step.id} className="border border-gray-200 dark:border-border rounded-lg p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-foreground ${
                            step.status === "approved"
                              ? "bg-green-500"
                              : step.status === "rejected"
                              ? "bg-red-500"
                              : "bg-gray-400"
                          }`}>
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">{step.approver_name || step.approver_email}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{step.approver_role}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          step.status === "approved"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : step.status === "rejected"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        }`}>
                          {step.status}
                        </span>
                      </div>

                      {step.status === "pending" && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApproveStep(selectedApproval.id, step.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-lg hover:bg-green-700"
                          >
                            <Check className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectStep(selectedApproval.id, step.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-foreground rounded-lg hover:bg-red-700"
                          >
                            <X className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      )}

                      {step.approved_at && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          Approved on {new Date(step.approved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {approvals.length > 0 ? (
                  approvals.map((approval) => (
                    <div
                      key={approval.id}
                      onClick={() => setSelectedApproval(approval)}
                      className="bg-white dark:bg-muted rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground">{approval.po_number}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Amount: ${parseFloat(approval.po_amount).toLocaleString()}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          approval.approval_status === "approved"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : approval.approval_status === "rejected"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        }`}>
                          {approval.approval_status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {approval.approval_status === "pending" ? (
                          <>
                            <Clock className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Awaiting approval</span>
                          </>
                        ) : approval.approval_status === "approved" ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Approved</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Rejected</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">No pending approvals</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Thresholds Tab */}
        {activeTab === "thresholds" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-muted rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-foreground mb-6">Add Threshold</h2>
                <form onSubmit={handleCreateThreshold} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Min Amount</label>
                    <input
                      type="number"
                      value={formData.minAmount}
                      onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Max Amount</label>
                    <input
                      type="number"
                      value={formData.maxAmount}
                      onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Escalation Hours</label>
                    <input
                      type="number"
                      value={formData.escalationHours}
                      onChange={(e) => setFormData({ ...formData, escalationHours: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                    />
                  </div>
                  <button type="submit" className="w-full bg-blue-600 text-foreground py-2 rounded-lg hover:bg-blue-700 font-medium">
                    Add Threshold
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-muted rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-muted border-b border-gray-200 dark:border-border">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Min Amount</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Max Amount</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Escalation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {thresholds.map((threshold) => (
                      <tr key={threshold.id} className="hover:bg-gray-50 dark:hover:bg-muted">
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-foreground">${parseFloat(threshold.min_amount).toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-foreground">${parseFloat(threshold.max_amount || "∞").toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{threshold.escalation_hours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
