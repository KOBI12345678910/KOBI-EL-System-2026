import { useState, useEffect, useMemo, useCallback } from "react";
import { AlertTriangle, Shield, Check, Pause, ArrowUpRight, RefreshCw, Filter, Bell, TrendingUp, DollarSign, Clock, Copy, Eye, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRealtimeAlerts } from "@/hooks/use-realtime-alerts";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  duplicate_payment: "תשלום כפול",
  amount_anomaly: "סכום חריג",
  new_supplier_large: "ספק חדש + סכום גבוה",
  no_po: "ללא הזמנת רכש",
  after_hours: "מחוץ לשעות עבודה",
  multiple_payments: "ריבוי תשלומים",
};

const ANOMALY_TYPE_ICONS: Record<string, any> = {
  duplicate_payment: Copy,
  amount_anomaly: TrendingUp,
  new_supplier_large: AlertTriangle,
  no_po: Eye,
  after_hours: Clock,
  multiple_payments: Zap,
};

const SEVERITY_CONFIG: Record<string, { label: string; border: string; badge: string; icon: string; bg: string }> = {
  critical: {
    label: "קריטי",
    border: "border-red-500/40",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: "text-red-400",
    bg: "bg-red-500/5",
  },
  warning: {
    label: "אזהרה",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    icon: "text-amber-400",
    bg: "bg-amber-500/5",
  },
  info: {
    label: "מידע",
    border: "border-blue-500/20",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: "text-blue-400",
    bg: "bg-blue-500/5",
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-orange-500/15 text-orange-400" },
  approved: { label: "אושר כתקין", color: "bg-green-500/15 text-green-400" },
  frozen: { label: "הוקפא לבדיקה", color: "bg-blue-500/15 text-blue-400" },
  escalated: { label: "הועבר לאישור", color: "bg-purple-500/15 text-purple-400" },
};

export default function PaymentAnomaliesPage() {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("open");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [anomRes, statRes] = await Promise.all([
        authFetch(`${API}/payment-anomalies`, { headers }),
        authFetch(`${API}/payment-anomalies/stats`, { headers }),
      ]);
      setAnomalies(safeArray(await anomRes.json()));
      setStats(await statRes.json());
      setLastRefresh(new Date());
    } catch {
      /* ignore */
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  // Initial load + periodic refresh every 60 seconds
  useEffect(() => {
    load();
    let running = false;
    const interval = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try { await load(false); } finally { running = false; }
    }, 60000);
    return () => clearInterval(interval);
  }, [load]);

  // Subscribe to SSE realtime alerts — refresh when a payment anomaly notification arrives
  useRealtimeAlerts((notification) => {
    if (notification.type === "payment_anomaly_critical" || notification.type === "payment_anomaly_new") {
      load(false);
    }
  });

  const runDetection = async () => {
    setDetecting(true);
    try {
      await authFetch(`${API}/payment-anomalies/detect`, { method: "POST", headers });
      await load();
    } finally {
      setDetecting(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      await authFetch(`${API}/payment-anomalies/${id}/status`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return anomalies.filter(a => {
      if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
      if (filterType !== "all" && a.anomaly_type !== filterType) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterDateFrom) {
        const anomDate = (a.payment_date || a.detected_at || "").slice(0, 10);
        if (anomDate && anomDate < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const anomDate = (a.payment_date || a.detected_at || "").slice(0, 10);
        if (anomDate && anomDate > filterDateTo) return false;
      }
      return true;
    });
  }, [anomalies, filterSeverity, filterType, filterStatus, filterDateFrom, filterDateTo]);

  const criticalOpen = Number(stats.critical_count || 0);
  const warningOpen = Number(stats.warning_count || 0);
  const approvedCount = Number(stats.approved_count || 0);
  const totalExposure = Number(stats.total_exposure || 0);
  const weekCount = Number(stats.week_count || 0);
  const totalOpen = Number(stats.open_count || 0);
  const approvalRate = totalOpen + approvedCount > 0 ? Math.round((approvedCount / (totalOpen + approvedCount)) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <AlertTriangle className="w-7 h-7 text-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">התראות תשלומים חריגים</h1>
              <p className="text-muted-foreground text-sm">מנוע זיהוי אוטומטי — מנתח תשלומים ומזהה חריגות בזמן אמת</p>
            </div>
            {criticalOpen > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-lg border border-red-500/30 animate-pulse">
                <Bell className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-300 font-bold">{criticalOpen} קריטיות</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              עודכן: {lastRefresh.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={runDetection}
              disabled={detecting}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${detecting ? "animate-spin" : ""}`} />
              {detecting ? "מזהה חריגות..." : "הרץ זיהוי"}
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[
            { label: "חריגות פתוחות", value: totalOpen, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
            { label: "קריטיות", value: criticalOpen, color: "text-red-400 bg-red-500/10 border-red-500/20" },
            { label: "אזהרות", value: warningOpen, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
            { label: "חשיפה כספית", value: `₪${fmt(totalExposure)}`, color: "text-red-400 bg-red-500/10 border-red-500/20" },
            { label: "השבוע", value: weekCount, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
          ].map((kpi, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`rounded-xl border p-4 ${kpi.color}`}
            >
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{kpi.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Summary bar */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <DollarSign className="w-4 h-4 text-red-400" />
              <span>חשיפה כספית כוללת:</span>
              <span className="font-bold text-red-400">₪{fmt(totalExposure)}</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <div>אנומליות השבוע: <span className="text-foreground font-medium">{weekCount}</span></div>
              <div>אושרו כתקין: <span className="text-green-400 font-medium">{approvedCount}</span></div>
              <div>אחוז אישור: <span className="text-blue-400 font-medium">{approvalRate}%</span></div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="open">פתוח</option>
            <option value="approved">אושר כתקין</option>
            <option value="frozen">הוקפא</option>
            <option value="escalated">הועבר לאישור</option>
          </select>
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">כל החומרות</option>
            <option value="critical">קריטי</option>
            <option value="warning">אזהרה</option>
            <option value="info">מידע</option>
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">כל הסוגים</option>
            {Object.entries(ANOMALY_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>מ:</span>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-foreground"
            />
            <span>עד:</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-foreground"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-auto">
            <Filter className="w-3 h-3" />
            {filtered.length} מתוך {anomalies.length} רשומות
          </div>
        </div>

        {/* Anomaly List */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground" />
            טוען נתונים...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-16 text-center">
            <Shield className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <h3 className="font-bold text-green-300 text-lg mb-2">לא נמצאו חריגות</h3>
            <p className="text-sm text-muted-foreground">
              {anomalies.length === 0
                ? "לחץ \"הרץ זיהוי\" כדי לסרוק תשלומים חריגים"
                : "הסינון הנוכחי אינו מציג תוצאות — שנה פילטרים"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((a, idx) => {
                const sev = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.warning;
                const TypeIcon = ANOMALY_TYPE_ICONS[a.anomaly_type] || AlertTriangle;
                const statusCfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.open;
                const isUpdating = updatingId === a.id;
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`rounded-2xl border ${sev.border} ${sev.bg} p-5`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-800/60 ${sev.icon}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sev.badge}`}>
                            {sev.label}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">
                            {ANOMALY_TYPE_LABELS[a.anomaly_type] || a.anomaly_type}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                          <span className="text-xs text-muted-foreground mr-auto">
                            {a.created_at ? new Date(a.created_at).toLocaleDateString("he-IL") : ""}
                          </span>
                        </div>

                        <h3 className="font-bold text-sm text-foreground mb-1">{a.title}</h3>
                        <p className="text-xs text-muted-foreground mb-2">{a.description}</p>

                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          {a.amount > 0 && (
                            <div>
                              <span className="text-muted-foreground">סכום: </span>
                              <span className="text-amber-400 font-medium">₪{fmt(a.amount)}</span>
                            </div>
                          )}
                          {a.supplier_name && (
                            <div>
                              <span className="text-muted-foreground">ספק: </span>
                              <span className="text-foreground">{a.supplier_name}</span>
                            </div>
                          )}
                          {a.payment_date && (
                            <div>
                              <span className="text-muted-foreground">תאריך תשלום: </span>
                              <span className="text-foreground">{new Date(a.payment_date).toLocaleDateString("he-IL")}</span>
                            </div>
                          )}
                          {a.recommendation && (
                            <div className="flex items-center gap-1 text-blue-400">
                              <ArrowUpRight className="w-3 h-3" />
                              <span>{a.recommendation}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {a.status === "open" && (
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => updateStatus(a.id, "approved")}
                            disabled={isUpdating}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 border border-green-500/25 text-green-400 hover:bg-green-500/25 transition-colors text-xs disabled:opacity-50"
                            title="אשר כתקין"
                          >
                            <Check className="w-3.5 h-3.5" />
                            אשר
                          </button>
                          <button
                            onClick={() => updateStatus(a.id, "frozen")}
                            disabled={isUpdating}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-400 hover:bg-blue-500/25 transition-colors text-xs disabled:opacity-50"
                            title="הקפא לבדיקה"
                          >
                            <Pause className="w-3.5 h-3.5" />
                            הקפא
                          </button>
                          <button
                            onClick={() => updateStatus(a.id, "escalated")}
                            disabled={isUpdating}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-400 hover:bg-purple-500/25 transition-colors text-xs disabled:opacity-50"
                            title="שלח לאישור מנהל"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            העבר
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Detection categories legend */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-400" />
            קטגוריות זיהוי פעילות
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { type: "duplicate_payment", desc: "אותו ספק, סכום דומה, תוך 7 ימים" },
              { type: "amount_anomaly", desc: "חריגה של 50%+ מהממוצע ההיסטורי" },
              { type: "new_supplier_large", desc: "ספק חדש (פחות מ-3 תשלומים) + מעל ₪10,000" },
              { type: "no_po", desc: "תשלום מעל ₪5,000 ללא הזמנת רכש מאושרת" },
              { type: "after_hours", desc: "אושר מחוץ לשעות 07:00–19:00" },
              { type: "multiple_payments", desc: "3+ תשלומים לאותו ספק ביום אחד" },
            ].map((item, i) => {
              const Icon = ANOMALY_TYPE_ICONS[item.type] || AlertTriangle;
              return (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-900/50 px-3 py-2">
                  <Icon className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-foreground">{ANOMALY_TYPE_LABELS[item.type]}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
            <RelatedRecords entityType="payment-anomaly" entityId="dashboard" />
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
            <ActivityLog entityType="payment-anomaly" entityId="dashboard" />
          </div>
        </div>
      </div>
    </div>
  );
}
