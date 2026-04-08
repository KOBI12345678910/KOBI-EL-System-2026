import { useState, useEffect, useCallback } from "react";
import { LoadingOverlay } from "@/components/ui/unified-states";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

export default function EmployeePortalPage() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [leaveForm, setLeaveForm] = useState({ leaveType: "vacation", startDate: "", endDate: "", totalDays: "", reason: "" });
  const [reimbForm, setReimbForm] = useState({ category: "travel", amount: "", description: "", expenseDate: "" });
  const [submitting, setSubmitting] = useState(false);
  const leaveValidation = useFormValidation<typeof leaveForm>({
    startDate: { required: true, message: "תאריך התחלה חובה" },
    endDate: { required: true, message: "תאריך סיום חובה" },
  });
  const reimbValidation = useFormValidation<typeof reimbForm>({
    amount: { required: true, message: "סכום חובה" },
    description: { required: true, message: "תיאור חובה" },
  });

  const token = localStorage.getItem("portal_token");

  const logout = useCallback(() => {
    if (token) authFetch("/api/portal/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    setLocation("/portal/login");
  }, [token, setLocation]);

  useEffect(() => {
    if (!token) { setLocation("/portal/login"); return; }
    authFetch("/api/portal/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.user) setUser(data.user); else logout(); })
      .catch(() => logout());
  }, [token, setLocation, logout]);

  useEffect(() => {
    if (!token || !user) return;
    authFetch("/api/portal/employee/dashboard", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setDashboard(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, user]);

  async function submitLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!leaveValidation.validate(leaveForm)) return;
    setSubmitting(true);
    try {
      await authFetch("/api/portal/employee/leave-request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(leaveForm),
      });
      setLeaveForm({ leaveType: "vacation", startDate: "", endDate: "", totalDays: "", reason: "" });
      const data = await authFetch("/api/portal/employee/dashboard", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setDashboard(data);
    } catch {} finally { setSubmitting(false); }
  }

  async function submitReimbursement(e: React.FormEvent) {
    e.preventDefault();
    if (!reimbValidation.validate(reimbForm)) return;
    setSubmitting(true);
    try {
      await authFetch("/api/portal/employee/reimbursement", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(reimbForm),
      });
      setReimbForm({ category: "travel", amount: "", description: "", expenseDate: "" });
      const data = await authFetch("/api/portal/employee/dashboard", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setDashboard(data);
    } catch {} finally { setSubmitting(false); }
  }

  if (loading) return <LoadingOverlay className="min-h-screen bg-slate-950" />;

  const tabs = [
    { id: "overview", label: "סקירה כללית" },
    { id: "payslips", label: "תלושי שכר" },
    { id: "attendance", label: "נוכחות" },
    { id: "leave", label: "בקשת חופשה" },
    { id: "reimbursement", label: "החזר הוצאות" },
  ];

  const statusLabels: Record<string, string> = { pending: "ממתין", approved: "אושר", rejected: "נדחה" };
  const leaveTypeLabels: Record<string, string> = { vacation: "חופשה שנתית", sick: "מחלה", personal: "אישי", maternity: "לידה", military: "מילואים" };

  return (
    <div className="min-h-screen bg-slate-950 text-foreground" dir="rtl">
      <header className="bg-slate-900/80 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold">פורטל עובדים</h1>
            <p className="text-sm text-muted-foreground">שלום, {user?.fullName}</p>
          </div>
        </div>
        <button onClick={logout} className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 transition">התנתק</button>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${activeTab === tab.id ? "bg-emerald-600 text-foreground" : "bg-slate-800/50 text-muted-foreground hover:text-foreground hover:bg-slate-700/50"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="text-xl sm:text-3xl font-bold text-emerald-400">{dashboard?.payslips?.length || 0}</div>
                <div className="text-muted-foreground text-sm mt-1">תלושי שכר</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="text-xl sm:text-3xl font-bold text-blue-400">{dashboard?.attendance?.length || 0}</div>
                <div className="text-muted-foreground text-sm mt-1">ימי נוכחות</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="text-xl sm:text-3xl font-bold text-yellow-400">{dashboard?.leaveRequests?.filter((r: any) => r.status === "pending").length || 0}</div>
                <div className="text-muted-foreground text-sm mt-1">בקשות ממתינות</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <div className="text-xl sm:text-3xl font-bold text-purple-400">{dashboard?.reimbursements?.length || 0}</div>
                <div className="text-muted-foreground text-sm mt-1">בקשות החזר</div>
              </div>
            </div>

            {(dashboard?.leaveRequests || []).length > 0 && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h3 className="font-semibold mb-3">בקשות חופשה אחרונות</h3>
                <div className="space-y-2">
                  {dashboard.leaveRequests.slice(0, 5).map((lr: any) => (
                    <div key={lr.id} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg">
                      <div>
                        <span className="font-medium">{leaveTypeLabels[lr.leaveType] || lr.leaveType}</span>
                        <span className="text-muted-foreground text-sm mr-2">{lr.totalDays} ימים</span>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${lr.status === "approved" ? "bg-green-500/20 text-green-300" : lr.status === "rejected" ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                        {statusLabels[lr.status] || lr.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "payslips" && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/30"><tr>
                <th className="px-4 py-3 text-right text-slate-300">מזהה</th>
                <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
                <th className="px-4 py-3 text-right text-slate-300">תאריך</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(dashboard?.payslips || []).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3">{p.id}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300">{p.status || "פעיל"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("he-IL")}</td>
                  </tr>
                ))}
                {(!dashboard?.payslips?.length) && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">אין תלושי שכר</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/30"><tr>
                <th className="px-4 py-3 text-right text-slate-300">תאריך</th>
                <th className="px-4 py-3 text-right text-slate-300">כניסה</th>
                <th className="px-4 py-3 text-right text-slate-300">יציאה</th>
                <th className="px-4 py-3 text-right text-slate-300">שעות</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {(dashboard?.attendance || []).map((a: any) => (
                  <tr key={a.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3">{a.data?.date || "-"}</td>
                    <td className="px-4 py-3">{a.data?.check_in || "-"}</td>
                    <td className="px-4 py-3">{a.data?.check_out || "-"}</td>
                    <td className="px-4 py-3">{a.data?.total_hours || "-"}</td>
                  </tr>
                ))}
                {(!dashboard?.attendance?.length) && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">אין נתוני נוכחות</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "leave" && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 max-w-lg">
            <h2 className="text-lg font-semibold mb-4">בקשת חופשה חדשה</h2>
            <form onSubmit={submitLeave} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">סוג חופשה</label>
                <select value={leaveForm.leaveType} onChange={e => setLeaveForm(p => ({ ...p, leaveType: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground focus:outline-none focus:border-emerald-500">
                  <option value="vacation">חופשה שנתית</option>
                  <option value="sick">מחלה</option>
                  <option value="personal">אישי</option>
                  <option value="maternity">לידה</option>
                  <option value="military">מילואים</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">מתאריך <RequiredMark /></label>
                  <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))}
                    className={`w-full px-4 py-2.5 bg-muted/50 border rounded-lg text-foreground focus:outline-none focus:border-emerald-500 ${leaveValidation.errors.startDate ? "border-red-500" : "border-border"}`} />
                  <FormFieldError error={leaveValidation.errors.startDate} />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">עד תאריך <RequiredMark /></label>
                  <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))}
                    className={`w-full px-4 py-2.5 bg-muted/50 border rounded-lg text-foreground focus:outline-none focus:border-emerald-500 ${leaveValidation.errors.endDate ? "border-red-500" : "border-border"}`} />
                  <FormFieldError error={leaveValidation.errors.endDate} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">מספר ימים</label>
                <input type="number" value={leaveForm.totalDays} onChange={e => setLeaveForm(p => ({ ...p, totalDays: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">סיבה</label>
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground focus:outline-none focus:border-emerald-500" rows={2} />
              </div>
              <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-foreground rounded-lg font-medium transition disabled:opacity-50">
                {submitting ? "שולח..." : "שלח בקשה"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "overview" && (
          <ActivityLog entityType="employee-portal" compact />
        )}

        {activeTab === "reimbursement" && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 max-w-lg">
            <h2 className="text-lg font-semibold mb-4">בקשת החזר הוצאות</h2>
            <form onSubmit={submitReimbursement} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">קטגוריה</label>
                <select value={reimbForm.category} onChange={e => setReimbForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground focus:outline-none focus:border-emerald-500">
                  <option value="travel">נסיעות</option>
                  <option value="meals">ארוחות</option>
                  <option value="equipment">ציוד</option>
                  <option value="training">הכשרה</option>
                  <option value="office">משרד</option>
                  <option value="other">אחר</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">סכום (ILS) <RequiredMark /></label>
                <input type="number" value={reimbForm.amount} onChange={e => setReimbForm(p => ({ ...p, amount: e.target.value }))}
                  className={`w-full px-4 py-2.5 bg-muted/50 border rounded-lg text-foreground focus:outline-none focus:border-emerald-500 ${reimbValidation.errors.amount ? "border-red-500" : "border-border"}`} />
                <FormFieldError error={reimbValidation.errors.amount} />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">תאריך הוצאה</label>
                <input type="date" value={reimbForm.expenseDate} onChange={e => setReimbForm(p => ({ ...p, expenseDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">תיאור <RequiredMark /></label>
                <textarea value={reimbForm.description} onChange={e => setReimbForm(p => ({ ...p, description: e.target.value }))}
                  className={`w-full px-4 py-2.5 bg-muted/50 border rounded-lg text-foreground focus:outline-none focus:border-emerald-500 ${reimbValidation.errors.description ? "border-red-500" : "border-border"}`} rows={2} />
                <FormFieldError error={reimbValidation.errors.description} />
              </div>
              <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-foreground rounded-lg font-medium transition disabled:opacity-50">
                {submitting ? "שולח..." : "שלח בקשה"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
