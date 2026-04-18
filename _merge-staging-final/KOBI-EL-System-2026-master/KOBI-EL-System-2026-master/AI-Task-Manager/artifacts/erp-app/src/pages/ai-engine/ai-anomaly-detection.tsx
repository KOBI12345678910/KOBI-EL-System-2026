import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, AlertCircle, CheckCircle2, XCircle, RefreshCw,
  Filter, ChevronDown, Eye, BarChart3, Activity, Shield,
  TrendingDown, Package, DollarSign, Wrench, Users, HeadphonesIcon
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

type Severity = "critical" | "high" | "medium" | "low";
type AnomalyStatus = "active" | "acknowledged" | "dismissed";
type Module = "sales" | "inventory" | "finance" | "production" | "quality" | "support" | "crm" | string;

interface Anomaly {
  id: string;
  module: Module;
  moduleHe: string;
  severity: Severity;
  title: string;
  description: string;
  value: number | string;
  expected: number | string;
  deviation: number;
  detectedAt: string;
  status: AnomalyStatus;
  suggestedAction: string;
}

interface AnomalyStats {
  total: number;
  active: number;
  acknowledged: number;
  dismissed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string; icon: any }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: XCircle },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: AlertTriangle },
  medium: { label: "בינוני", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertCircle },
  low: { label: "נמוך", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Activity },
};

const MODULE_ICONS: Record<string, any> = {
  sales: TrendingDown,
  inventory: Package,
  finance: DollarSign,
  production: Wrench,
  quality: Shield,
  support: HeadphonesIcon,
  crm: Users,
};

const MODULE_LABELS: Record<string, string> = {
  sales: "מכירות",
  inventory: "מלאי",
  finance: "כספים",
  production: "ייצור",
  quality: "איכות",
  support: "תמיכה",
  crm: "CRM",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

function AnomalyCard({ anomaly, onAcknowledge, onDismiss }: {
  anomaly: Anomaly;
  onAcknowledge: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.low;
  const ModIcon = MODULE_ICONS[anomaly.module] || AlertCircle;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`bg-card border ${sev.border} rounded-xl overflow-hidden`}
    >
      <div
        className="p-4 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl ${sev.bg} flex items-center justify-center flex-shrink-0`}>
            <sev.icon className={`w-4 h-4 ${sev.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sev.bg} ${sev.color} border ${sev.border}`}>
                {sev.label}
              </span>
              <div className="flex items-center gap-1">
                <ModIcon className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{anomaly.moduleHe || MODULE_LABELS[anomaly.module]}</span>
              </div>
              {anomaly.status === "acknowledged" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">אושר</span>
              )}
              {anomaly.status === "dismissed" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground border border-border">בוטל</span>
              )}
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1">{anomaly.title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{anomaly.description}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(anomaly.detectedAt)}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 border-t ${sev.border} pt-3`}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className={`rounded-lg ${sev.bg} p-2.5 text-center`}>
                  <div className={`text-lg font-bold ${sev.color}`}>{anomaly.value}</div>
                  <div className="text-[10px] text-muted-foreground">ערך נוכחי</div>
                </div>
                <div className="rounded-lg bg-muted/20 p-2.5 text-center">
                  <div className="text-lg font-bold text-foreground">{anomaly.expected}</div>
                  <div className="text-[10px] text-muted-foreground">ערך צפוי</div>
                </div>
                <div className="rounded-lg bg-muted/20 p-2.5 text-center">
                  <div className="text-lg font-bold text-foreground">{anomaly.deviation}</div>
                  <div className="text-[10px] text-muted-foreground">סטייה (Z/%)</div>
                </div>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-amber-400 mb-0.5">פעולה מוצעת</div>
                    <p className="text-xs text-muted-foreground">{anomaly.suggestedAction}</p>
                  </div>
                </div>
              </div>
              {anomaly.status === "active" && (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAcknowledge(anomaly.id); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-medium transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    אשר טיפול
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(anomaly.id); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border text-muted-foreground text-xs font-medium transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    בטל התראה
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AiAnomalyDetection() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const fetchAnomalies = useCallback(async (refresh = false) => {
    try {
      const params = new URLSearchParams();
      if (moduleFilter !== "all") params.set("module", moduleFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (refresh) params.set("refresh", "true");

      const r = await authFetch(`${API}/analytics/anomalies?${params}`, { headers: headers() });
      const data = await r.json();
      setAnomalies(data.anomalies || []);
      setStats(data.stats || null);
      setLastScanAt(data.lastScanAt || null);
    } catch (err) {
      console.error("Anomaly fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, severityFilter, statusFilter]);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  async function handleScan() {
    setScanning(true);
    try {
      await authFetch(`${API}/analytics/anomalies/scan`, { method: "POST", headers: headers() });
      await fetchAnomalies(true);
    } finally {
      setScanning(false);
    }
  }

  async function handleAcknowledge(id: string) {
    await authFetch(`${API}/analytics/anomalies/${id}/acknowledge`, { method: "POST", headers: headers() });
    setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: "acknowledged" } : a));
  }

  async function handleDismiss(id: string) {
    await authFetch(`${API}/analytics/anomalies/${id}/dismiss`, { method: "POST", headers: headers() });
    setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: "dismissed" } : a));
  }

  const modules = ["all", ...Object.keys(MODULE_LABELS)];

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">זיהוי חריגות AI</h1>
            <p className="text-xs text-muted-foreground">סריקה אוטומטית של מדדים עסקיים — Z-Score, IQR, חריגות סטטיסטיות</p>
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-primary/30 text-sm font-medium text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "סורק..." : "סרוק מחדש"}
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "קריטי", value: stats.critical, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "גבוה", value: stats.high, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
            { label: "בינוני", value: stats.medium, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "אושרו", value: stats.acknowledged, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          ].map((stat, i) => (
            <div key={i} className={`border rounded-xl p-3 text-center ${stat.bg}`}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="all">כל המודולים</option>
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="all">כל החומרות</option>
          <option value="critical">קריטי</option>
          <option value="high">גבוה</option>
          <option value="medium">בינוני</option>
          <option value="low">נמוך</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
        >
          <option value="all">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="acknowledged">אושר</option>
          <option value="dismissed">בוטל</option>
        </select>
        {lastScanAt && (
          <span className="text-xs text-muted-foreground mr-auto">
            סריקה אחרונה: {new Date(lastScanAt).toLocaleTimeString("he-IL")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span>סורק מדדים...</span>
        </div>
      ) : anomalies.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">אין חריגות פעילות</p>
          <p className="text-xs text-muted-foreground">כל המדדים תקינים לפי הסף הנוכחי</p>
          <button
            onClick={handleScan}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-foreground text-sm hover:bg-primary/90 transition-colors"
          >
            הרץ סריקה מחדש
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{anomalies.length} חריגות מוצגות</span>
            <div className="flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>מדדים סטטיסטיים</span>
            </div>
          </div>
          <AnimatePresence>
            {anomalies.map(anomaly => (
              <AnomalyCard
                key={anomaly.id}
                anomaly={anomaly}
                onAcknowledge={handleAcknowledge}
                onDismiss={handleDismiss}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
