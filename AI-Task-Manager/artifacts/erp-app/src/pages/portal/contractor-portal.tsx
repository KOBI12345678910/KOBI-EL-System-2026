import { useState, useEffect, useCallback, useMemo } from "react";
import { LoadingOverlay } from "@/components/ui/unified-states";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Briefcase, Search, Eye, X, AlertTriangle, LogOut, BarChart3,
  FileText, DollarSign, CheckCircle2, Clock, Calendar, Send, Users
} from "lucide-react";

const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));

export default function ContractorPortalPage() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [reportData, setReportData] = useState({ description: "", hours: "", date: "" });
  const [submitting, setSubmitting] = useState(false);

  const token = localStorage.getItem("portal_token");
  const pHeaders = { Authorization: `Bearer ${token}` };

  const logout = useCallback(() => {
    if (token) authFetch("/api/portal/auth/logout", { method: "POST", headers: pHeaders }).catch(() => {});
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");
    setLocation("/portal/login");
  }, [token, setLocation]);

  useEffect(() => {
    if (!token) { setLocation("/portal/login"); return; }
    authFetch("/api/portal/auth/me", { headers: pHeaders })
      .then(r => r.json())
      .then(data => { if (data.user) setUser(data.user); else logout(); })
      .catch(() => logout());
  }, [token, setLocation, logout]);

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true); setError(null);
    authFetch("/api/portal/contractor/dashboard", { headers: pHeaders })
      .then(r => r.json())
      .then(data => setDashboard(data))
      .catch(() => setError("שגיאה בטעינת נתונים"))
      .finally(() => setLoading(false));
  }, [token, user]);

  const agreements = useMemo(() => {
    const list = dashboard?.agreements || [];
    if (!search) return list;
    return list.filter((a: any) => JSON.stringify(a).toLowerCase().includes(search.toLowerCase()));
  }, [dashboard, search]);

  const payments = useMemo(() => {
    const list = dashboard?.payments || [];
    if (!search) return list;
    return list.filter((p: any) => JSON.stringify(p).toLowerCase().includes(search.toLowerCase()));
  }, [dashboard, search]);

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authFetch("/api/portal/contractor/reports", {
        method: "POST",
        headers: { ...pHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ data: reportData }),
      });
      setReportData({ description: "", hours: "", date: "" });
    } catch {} finally { setSubmitting(false); }
  }

  const tabs = [
    { id: "overview", label: "סקירה כללית", icon: BarChart3 },
    { id: "agreements", label: "הסכמים", icon: FileText },
    { id: "payments", label: "תשלומים", icon: DollarSign },
    { id: "report", label: "דוח עבודה", icon: Send },
  ];

  const kpis = [
    { label: "הסכמים", value: fmt(dashboard?.agreements?.length || 0), icon: FileText, color: "text-orange-400" },
    { label: "תשלומים", value: fmt(dashboard?.payments?.length || 0), icon: DollarSign, color: "text-green-400" },
    { label: "סטטוס", value: dashboard?.contractor ? "פעיל" : "—", icon: CheckCircle2, color: "text-blue-400" },
    { label: "פרויקטים", value: fmt(dashboard?.projects?.length || 0), icon: Briefcase, color: "text-violet-400" },
  ];

  if (loading) return <LoadingOverlay className="min-h-[400px]" />;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Briefcase className="text-orange-400 w-6 h-6" /> פורטל קבלנים</h1>
          <p className="text-sm text-muted-foreground mt-1">שלום, {user?.fullName || user?.full_name || "קבלן"} — ניהול הסכמים, תשלומים ודוחות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === "agreements" && <ExportDropdown data={agreements} headers={{ id: "מזהה", status: "סטטוס", createdAt: "תאריך" }} filename="agreements" />}
          {activeTab === "payments" && <ExportDropdown data={payments} headers={{ id: "מזהה", status: "סטטוס", createdAt: "תאריך" }} filename="payments" />}
          <button onClick={logout} className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted"><LogOut className="w-4 h-4" /> התנתק</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-colors ${activeTab === tab.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/30"}`}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </div>
        {(activeTab === "agreements" || activeTab === "payments") && (
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md mr-auto">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        )}
      </div>

      {error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">{error}</p></div>
      ) : activeTab === "overview" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-orange-400" /> הסכמים אחרונים</h3>
            {(dashboard?.agreements || []).slice(0, 5).map((a: any) => (
              <div key={a.id} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                <span className="text-sm text-muted-foreground">הסכם #{a.id}</span>
                <Badge className="text-[10px] bg-orange-500/20 text-orange-400">{a.status || "פעיל"}</Badge>
              </div>
            ))}
            {!(dashboard?.agreements?.length) && <p className="text-sm text-muted-foreground text-center py-4">אין הסכמים</p>}
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><DollarSign className="w-4 h-4 text-green-400" /> תשלומים אחרונים</h3>
            {(dashboard?.payments || []).slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                <span className="text-sm text-muted-foreground">תשלום #{p.id}</span>
                <Badge className="text-[10px] bg-green-500/20 text-green-400">{p.status || "שולם"}</Badge>
              </div>
            ))}
            {!(dashboard?.payments?.length) && <p className="text-sm text-muted-foreground text-center py-4">אין תשלומים</p>}
          </div>
        </div>
      ) : activeTab === "agreements" ? (
        agreements.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הסכמים</p></div>
        ) : (
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מזהה</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תאריך</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>{agreements.map((a: any) => (
                <tr key={a.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-foreground font-medium">{a.id}</td>
                  <td className="px-4 py-3"><Badge className="text-[10px] bg-orange-500/20 text-orange-400">{a.status || "פעיל"}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{a.createdAt ? new Date(a.createdAt).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-4 py-3"><button onClick={() => setViewDetail(a)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div></div>
        )
      ) : activeTab === "payments" ? (
        payments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין תשלומים</p></div>
        ) : (
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מזהה</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תאריך</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>{payments.map((p: any) => (
                <tr key={p.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-foreground font-medium">{p.id}</td>
                  <td className="px-4 py-3"><Badge className="text-[10px] bg-green-500/20 text-green-400">{p.status || "שולם"}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="px-4 py-3"><button onClick={() => setViewDetail(p)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div></div>
        )
      ) : (
        <div className="bg-card border border-border/50 rounded-2xl p-6 max-w-lg">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><Send className="w-5 h-5 text-orange-400" /> הגשת דוח עבודה</h2>
          <form onSubmit={submitReport} className="space-y-4">
            <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך</label><input type="date" value={reportData.date} onChange={e => setReportData(p => ({ ...p, date: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שעות עבודה</label><input type="number" value={reportData.hours} onChange={e => setReportData(p => ({ ...p, hours: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={reportData.description} onChange={e => setReportData(p => ({ ...p, description: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" rows={3} /></div>
            <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 disabled:opacity-50">{submitting ? "שולח..." : "שלח דוח"}</button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RelatedRecords tabs={[
          { key: "agreements", label: "הסכמים", endpoint: "/api/portal/contractor/dashboard", columns: [{ key: "id", label: "מזהה" }, { key: "status", label: "סטטוס" }] },
        ]} />
        <ActivityLog entityType="contractor-portal" compact />
      </div>

      <AnimatePresence>{viewDetail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">פרטים</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5"><pre className="text-sm text-muted-foreground whitespace-pre-wrap">{JSON.stringify(viewDetail, null, 2)}</pre></div>
            <div className="p-5 border-t border-border"><button onClick={() => setViewDetail(null)} className="w-full px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm text-center">סגור</button></div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
