import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import { LoadingOverlay } from "@/components/ui/unified-states";

export default function PortalManagementPage() {
  const { token } = useAuth();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [sendHistory, setSendHistory] = useState<any>({ history: [], total: 0 });
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [reimbursements, setReimbursements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteForm, setInviteForm] = useState({ email: "", userType: "supplier", linkedEntityId: "", linkedEntityType: "" });
  const [apiKeyForm, setApiKeyForm] = useState({ name: "", ownerType: "supplier", ownerId: "" });
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", events: "" });
  const [sendForm, setSendForm] = useState({ documentType: "", documentTitle: "", recipientType: "supplier", recipientName: "", recipientEmail: "", channel: "email", messageContent: "" });
  const [showForm, setShowForm] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [inviteResult, setInviteResult] = useState("");

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await authFetch("/api/portal/management/dashboard", { headers: headers() });
      const data = await res.json();
      setStats(data.stats);
    } catch {} finally { setLoading(false); }
  }, [headers]);

  const loadUsers = useCallback(async () => {
    const res = await authFetch("/api/portal/management/users", { headers: headers() });
    setUsers(await res.json());
  }, [headers]);

  const loadInvitations = useCallback(async () => {
    const res = await authFetch("/api/portal/management/invitations", { headers: headers() });
    setInvitations(await res.json());
  }, [headers]);

  const loadApiKeys = useCallback(async () => {
    const res = await authFetch("/api/portal/management/api-keys", { headers: headers() });
    setApiKeys(await res.json());
  }, [headers]);

  const loadWebhooks = useCallback(async () => {
    const res = await authFetch("/api/portal/management/webhooks", { headers: headers() });
    setWebhooks(await res.json());
  }, [headers]);

  const loadSendHistory = useCallback(async () => {
    const res = await authFetch("/api/portal/management/send-history", { headers: headers() });
    setSendHistory(await res.json());
  }, [headers]);

  const loadLeaveRequests = useCallback(async () => {
    const res = await authFetch("/api/portal/management/leave-requests", { headers: headers() });
    setLeaveRequests(await res.json());
  }, [headers]);

  const loadReimbursements = useCallback(async () => {
    const res = await authFetch("/api/portal/management/reimbursements", { headers: headers() });
    setReimbursements(await res.json());
  }, [headers]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (activeTab === "users") loadUsers();
    if (activeTab === "invitations") loadInvitations();
    if (activeTab === "api-keys") loadApiKeys();
    if (activeTab === "webhooks") loadWebhooks();
    if (activeTab === "send-history") loadSendHistory();
    if (activeTab === "leave") loadLeaveRequests();
    if (activeTab === "reimbursements") loadReimbursements();
  }, [activeTab, loadUsers, loadInvitations, loadApiKeys, loadWebhooks, loadSendHistory, loadLeaveRequests, loadReimbursements]);

  async function createInvite() {
    const body: any = { email: inviteForm.email, userType: inviteForm.userType };
    if (inviteForm.linkedEntityId) body.linkedEntityId = Number(inviteForm.linkedEntityId);
    if (inviteForm.linkedEntityType) body.linkedEntityType = inviteForm.linkedEntityType;
    const res = await authFetch("/api/portal/management/invite", { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (data.inviteToken) {
      setInviteResult(data.inviteToken);
      setInviteForm({ email: "", userType: "supplier", linkedEntityId: "", linkedEntityType: "" });
      loadInvitations();
    } else {
      alert(data.error || "שגיאה");
    }
  }

  async function createApiKey() {
    const body: any = { name: apiKeyForm.name, ownerType: apiKeyForm.ownerType };
    if (apiKeyForm.ownerId) body.ownerId = Number(apiKeyForm.ownerId);
    const res = await authFetch("/api/portal/management/api-keys", { method: "POST", headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (data.key) {
      setNewApiKey(data.key);
      setApiKeyForm({ name: "", ownerType: "supplier", ownerId: "" });
      loadApiKeys();
    } else {
      alert(data.error || "שגיאה");
    }
  }

  async function createWebhook() {
    const events = webhookForm.events ? webhookForm.events.split(",").map(e => e.trim()) : ["*"];
    const res = await authFetch("/api/portal/management/webhooks", { method: "POST", headers: headers(), body: JSON.stringify({ name: webhookForm.name, url: webhookForm.url, events }) });
    const data = await res.json();
    if (data.id) {
      setWebhookForm({ name: "", url: "", events: "" });
      setShowForm("");
      loadWebhooks();
    } else {
      alert(data.error || "שגיאה");
    }
  }

  async function sendDocument() {
    const res = await authFetch("/api/portal/management/send-document", { method: "POST", headers: headers(), body: JSON.stringify(sendForm) });
    const data = await res.json();
    if (data.id) {
      setSendForm({ documentType: "", documentTitle: "", recipientType: "supplier", recipientName: "", recipientEmail: "", channel: "email", messageContent: "" });
      setShowForm("");
      loadSendHistory();
    } else {
      alert(data.error || "שגיאה");
    }
  }

  async function toggleUserActive(id: number, isActive: boolean) {
    await authFetch(`/api/portal/management/users/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ isActive: !isActive }) });
    loadUsers();
  }

  async function deleteUser(id: number) {
    if (!(await globalConfirm("למחוק משתמש זה?"))) return;
    await authFetch(`/api/portal/management/users/${id}`, { method: "DELETE", headers: headers() });
    loadUsers();
  }

  async function toggleApiKey(id: number, isActive: boolean) {
    await authFetch(`/api/portal/management/api-keys/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ isActive: !isActive }) });
    loadApiKeys();
  }

  async function toggleWebhook(id: number, isActive: boolean) {
    await authFetch(`/api/portal/management/webhooks/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ isActive: !isActive }) });
    loadWebhooks();
  }

  async function handleLeaveAction(id: number, status: string) {
    await authFetch(`/api/portal/management/leave-requests/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ status }) });
    loadLeaveRequests();
    loadDashboard();
  }

  async function handleReimbAction(id: number, status: string) {
    await authFetch(`/api/portal/management/reimbursements/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ status }) });
    loadReimbursements();
    loadDashboard();
  }

  const userTypeLabels: Record<string, string> = { supplier: "ספק", contractor: "קבלן", employee: "עובד" };
  const channelLabels: Record<string, string> = { email: "אימייל", whatsapp: "WhatsApp" };
  const statusLabels: Record<string, string> = { pending: "ממתין", approved: "אושר", rejected: "נדחה", sent: "נשלח" };

  const tabs = [
    { id: "dashboard", label: "סקירה" },
    { id: "users", label: "משתמשים" },
    { id: "invitations", label: "הזמנות" },
    { id: "api-keys", label: "מפתחות API" },
    { id: "webhooks", label: "Webhooks" },
    { id: "send-document", label: "שליחת מסמך" },
    { id: "send-history", label: "היסטוריית שליחה" },
    { id: "leave", label: "בקשות חופשה" },
    { id: "reimbursements", label: "החזרי הוצאות" },
  ];

  if (loading) return <LoadingOverlay className="min-h-[256px]" />;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">ניהול פורטל חיצוני</h1>
          <p className="text-muted-foreground text-sm mt-1">ניהול ספקים, קבלנים ועובדים חיצוניים</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${activeTab === tab.id ? "bg-blue-600 text-foreground" : "bg-slate-800/50 text-muted-foreground hover:text-foreground hover:bg-slate-700/50"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "משתמשים חיצוניים", value: stats.totalExternalUsers, color: "blue" },
            { label: "ספקים", value: stats.supplierUsers, color: "indigo" },
            { label: "קבלנים", value: stats.contractorUsers, color: "orange" },
            { label: "עובדים", value: stats.employeeUsers, color: "emerald" },
            { label: "הזמנות פתוחות", value: stats.pendingInvitations, color: "yellow" },
            { label: "מפתחות API פעילים", value: stats.activeApiKeys, color: "purple" },
            { label: "Webhooks פעילים", value: stats.activeWebhooks, color: "pink" },
            { label: "מסמכים נשלחו", value: stats.totalDocumentsSent, color: "cyan" },
            { label: "בקשות חופשה ממתינות", value: stats.pendingLeaveRequests, color: "amber" },
            { label: "החזרי הוצאות ממתינים", value: stats.pendingReimbursements, color: "rose" },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <div className={`text-xl sm:text-3xl font-bold text-${s.color}-400`}>{s.value}</div>
              <div className="text-muted-foreground text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/30"><tr>
                <th className="px-4 py-3 text-right text-slate-300">שם</th>
                <th className="px-4 py-3 text-right text-slate-300">אימייל</th>
                <th className="px-4 py-3 text-right text-slate-300">סוג</th>
                <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
                <th className="px-4 py-3 text-right text-slate-300">כניסה אחרונה</th>
                <th className="px-4 py-3 text-right text-slate-300">פעולות</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">{userTypeLabels[u.userType] || u.userType}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${u.isActive ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>{u.isActive ? "פעיל" : "מושבת"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("he-IL") : "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => toggleUserActive(u.id, u.isActive)} className="text-xs px-2 py-1 rounded bg-slate-600 hover:bg-muted transition">{u.isActive ? "השבת" : "הפעל"}</button>
                        <button onClick={() => deleteUser(u.id)} className="text-xs px-2 py-1 rounded bg-red-600/30 hover:bg-red-600/50 text-red-300 transition">מחק</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">אין משתמשים חיצוניים</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "invitations" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <h3 className="font-semibold mb-4">שליחת הזמנה חדשה</h3>
            {inviteResult && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                קוד הזמנה: <code className="bg-slate-700 px-2 py-1 rounded font-mono text-xs select-all">{inviteResult}</code>
                <button onClick={() => { navigator.clipboard.writeText(inviteResult); }} className="mr-2 text-xs underline">העתק</button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="אימייל" />
              <select value={inviteForm.userType} onChange={e => setInviteForm(p => ({ ...p, userType: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm">
                <option value="supplier">ספק</option>
                <option value="contractor">קבלן</option>
                <option value="employee">עובד</option>
              </select>
              <input type="text" value={inviteForm.linkedEntityId} onChange={e => setInviteForm(p => ({ ...p, linkedEntityId: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="מזהה ישות (אופציונלי)" />
              <button onClick={createInvite} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition">שלח הזמנה</button>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/30"><tr>
                <th className="px-4 py-3 text-right text-slate-300">אימייל</th>
                <th className="px-4 py-3 text-right text-slate-300">סוג</th>
                <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
                <th className="px-4 py-3 text-right text-slate-300">תוקף</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {invitations.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3">{inv.email}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">{userTypeLabels[inv.userType] || inv.userType}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${inv.isUsed ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}`}>{inv.isUsed ? "נוצל" : "ממתין"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString("he-IL")}</td>
                  </tr>
                ))}
                {invitations.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">אין הזמנות</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "api-keys" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <h3 className="font-semibold mb-4">יצירת מפתח API חדש</h3>
            {newApiKey && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
                מפתח חדש: <code className="bg-slate-700 px-2 py-1 rounded font-mono text-xs select-all break-all">{newApiKey}</code>
                <button onClick={() => { navigator.clipboard.writeText(newApiKey); }} className="mr-2 text-xs underline">העתק</button>
                <p className="mt-1 text-yellow-400 text-xs">שמור את המפתח - הוא לא יוצג שוב!</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="text" value={apiKeyForm.name} onChange={e => setApiKeyForm(p => ({ ...p, name: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="שם המפתח" />
              <select value={apiKeyForm.ownerType} onChange={e => setApiKeyForm(p => ({ ...p, ownerType: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm">
                <option value="supplier">ספק</option>
                <option value="contractor">קבלן</option>
                <option value="system">מערכת</option>
              </select>
              <input type="text" value={apiKeyForm.ownerId} onChange={e => setApiKeyForm(p => ({ ...p, ownerId: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="מזהה בעלים (אופציונלי)" />
              <button onClick={createApiKey} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-sm font-medium transition">צור מפתח</button>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/30"><tr>
                <th className="px-4 py-3 text-right text-slate-300">שם</th>
                <th className="px-4 py-3 text-right text-slate-300">קידומת</th>
                <th className="px-4 py-3 text-right text-slate-300">סוג בעלים</th>
                <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
                <th className="px-4 py-3 text-right text-slate-300">שימושים</th>
                <th className="px-4 py-3 text-right text-slate-300">פעולות</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {apiKeys.map((k: any) => (
                  <tr key={k.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.keyPrefix}...</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">{userTypeLabels[k.ownerType] || k.ownerType}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${k.isActive ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>{k.isActive ? "פעיל" : "מושבת"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{k.usageCount}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleApiKey(k.id, k.isActive)} className="text-xs px-2 py-1 rounded bg-slate-600 hover:bg-muted transition">{k.isActive ? "השבת" : "הפעל"}</button>
                    </td>
                  </tr>
                ))}
                {apiKeys.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">אין מפתחות API</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <h3 className="font-semibold mb-4">הוספת Webhook חדש</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="text" value={webhookForm.name} onChange={e => setWebhookForm(p => ({ ...p, name: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="שם" />
              <input type="url" value={webhookForm.url} onChange={e => setWebhookForm(p => ({ ...p, url: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="URL" />
              <input type="text" value={webhookForm.events} onChange={e => setWebhookForm(p => ({ ...p, events: e.target.value }))}
                className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" placeholder="אירועים (מופרד בפסיקים)" />
              <button onClick={createWebhook} className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-foreground rounded-lg text-sm font-medium transition">צור Webhook</button>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/30"><tr>
                <th className="px-4 py-3 text-right text-slate-300">שם</th>
                <th className="px-4 py-3 text-right text-slate-300">URL</th>
                <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
                <th className="px-4 py-3 text-right text-slate-300">כשלים</th>
                <th className="px-4 py-3 text-right text-slate-300">פעולות</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {webhooks.map((w: any) => (
                  <tr key={w.id} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-medium">{w.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs truncate max-w-[200px]">{w.url}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${w.isActive ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>{w.isActive ? "פעיל" : "מושבת"}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{w.failureCount}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleWebhook(w.id, w.isActive)} className="text-xs px-2 py-1 rounded bg-slate-600 hover:bg-muted transition">{w.isActive ? "השבת" : "הפעל"}</button>
                    </td>
                  </tr>
                ))}
                {webhooks.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">אין Webhooks</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "send-document" && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 max-w-2xl">
          <h3 className="font-semibold mb-4">שליחת מסמך</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">סוג מסמך</label>
              <select value={sendForm.documentType} onChange={e => setSendForm(p => ({ ...p, documentType: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm">
                <option value="">בחר...</option>
                <option value="invoice">חשבונית</option>
                <option value="purchase_order">הזמנת רכש</option>
                <option value="payslip">תלוש שכר</option>
                <option value="contract">חוזה</option>
                <option value="report">דוח</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">כותרת המסמך</label>
              <input type="text" value={sendForm.documentTitle} onChange={e => setSendForm(p => ({ ...p, documentTitle: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">סוג נמען</label>
              <select value={sendForm.recipientType} onChange={e => setSendForm(p => ({ ...p, recipientType: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm">
                <option value="supplier">ספק</option>
                <option value="contractor">קבלן</option>
                <option value="employee">עובד</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">שם הנמען</label>
              <input type="text" value={sendForm.recipientName} onChange={e => setSendForm(p => ({ ...p, recipientName: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">אימייל נמען</label>
              <input type="email" value={sendForm.recipientEmail} onChange={e => setSendForm(p => ({ ...p, recipientEmail: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">ערוץ</label>
              <select value={sendForm.channel} onChange={e => setSendForm(p => ({ ...p, channel: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm">
                <option value="email">אימייל</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-1">תוכן הודעה</label>
              <textarea value={sendForm.messageContent} onChange={e => setSendForm(p => ({ ...p, messageContent: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-foreground text-sm" rows={3} />
            </div>
          </div>
          <button onClick={sendDocument} className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg font-medium transition">
            שלח מסמך
          </button>
        </div>
      )}

      {activeTab === "send-history" && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/30 text-muted-foreground text-sm">סה"כ: {sendHistory.total} שליחות</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-700/30"><tr>
              <th className="px-4 py-3 text-right text-slate-300">סוג מסמך</th>
              <th className="px-4 py-3 text-right text-slate-300">כותרת</th>
              <th className="px-4 py-3 text-right text-slate-300">נמען</th>
              <th className="px-4 py-3 text-right text-slate-300">ערוץ</th>
              <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
              <th className="px-4 py-3 text-right text-slate-300">תאריך</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {(sendHistory.history || []).map((h: any) => (
                <tr key={h.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3">{h.documentType}</td>
                  <td className="px-4 py-3">{h.documentTitle || "-"}</td>
                  <td className="px-4 py-3">{h.recipientName || h.recipientEmail || "-"}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">{channelLabels[h.channel] || h.channel}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${h.status === "sent" ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}`}>{statusLabels[h.status] || h.status}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(h.sentAt).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
              {(!sendHistory.history?.length) && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">אין היסטוריית שליחה</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "leave" && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/30"><tr>
              <th className="px-4 py-3 text-right text-slate-300">עובד</th>
              <th className="px-4 py-3 text-right text-slate-300">סוג</th>
              <th className="px-4 py-3 text-right text-slate-300">תאריכים</th>
              <th className="px-4 py-3 text-right text-slate-300">ימים</th>
              <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
              <th className="px-4 py-3 text-right text-slate-300">פעולות</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {leaveRequests.map((lr: any) => (
                <tr key={lr.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3">{lr.employeeId}</td>
                  <td className="px-4 py-3">{lr.leaveType}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(lr.startDate).toLocaleDateString("he-IL")} - {new Date(lr.endDate).toLocaleDateString("he-IL")}</td>
                  <td className="px-4 py-3">{lr.totalDays}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${lr.status === "approved" ? "bg-green-500/20 text-green-300" : lr.status === "rejected" ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}`}>{statusLabels[lr.status] || lr.status}</span></td>
                  <td className="px-4 py-3">
                    {lr.status === "pending" && (
                      <div className="flex gap-1">
                        <button onClick={() => handleLeaveAction(lr.id, "approved")} className="text-xs px-2 py-1 rounded bg-green-600/30 hover:bg-green-600/50 text-green-300 transition">אשר</button>
                        <button onClick={() => handleLeaveAction(lr.id, "rejected")} className="text-xs px-2 py-1 rounded bg-red-600/30 hover:bg-red-600/50 text-red-300 transition">דחה</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {leaveRequests.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">אין בקשות חופשה</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "reimbursements" && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-700/30"><tr>
              <th className="px-4 py-3 text-right text-slate-300">עובד</th>
              <th className="px-4 py-3 text-right text-slate-300">קטגוריה</th>
              <th className="px-4 py-3 text-right text-slate-300">סכום</th>
              <th className="px-4 py-3 text-right text-slate-300">תיאור</th>
              <th className="px-4 py-3 text-right text-slate-300">סטטוס</th>
              <th className="px-4 py-3 text-right text-slate-300">פעולות</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {reimbursements.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-700/20">
                  <td className="px-4 py-3">{r.employeeId}</td>
                  <td className="px-4 py-3">{r.category}</td>
                  <td className="px-4 py-3 font-medium">{r.amount} {r.currency}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{r.description || "-"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${r.status === "approved" ? "bg-green-500/20 text-green-300" : r.status === "rejected" ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"}`}>{statusLabels[r.status] || r.status}</span></td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <div className="flex gap-1">
                        <button onClick={() => handleReimbAction(r.id, "approved")} className="text-xs px-2 py-1 rounded bg-green-600/30 hover:bg-green-600/50 text-green-300 transition">אשר</button>
                        <button onClick={() => handleReimbAction(r.id, "rejected")} className="text-xs px-2 py-1 rounded bg-red-600/30 hover:bg-red-600/50 text-red-300 transition">דחה</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {reimbursements.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">אין בקשות החזר</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <ActivityLog entityType="portal-management" compact />
    </div>
  );
}
