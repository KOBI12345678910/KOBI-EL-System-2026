import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Clock, AlertTriangle,
  CheckCircle2, XCircle, Printer, ToggleLeft, ToggleRight, Settings,
  DollarSign, Factory, Users, Package, ShoppingCart, Gauge, Star,
  Truck, BarChart3, ChevronRight,
} from "lucide-react";

const DOMAIN_LABELS: Record<string, string> = {
  finance: "כספים",
  sales: "מכירות",
  production: "ייצור",
  inventory: "מלאי",
  hr: "משאבי אנוש",
  crm: "לקוחות",
  operations: "תפעול",
};

const DOMAIN_ICONS: Record<string, any> = {
  finance: DollarSign,
  sales: ShoppingCart,
  production: Factory,
  inventory: Package,
  hr: Users,
  crm: Star,
  operations: Truck,
};

const MODULE_LABELS: Record<string, string> = {
  finance: "כספים",
  sales: "מכירות",
  production: "ייצור",
  inventory: "מלאי",
  hr: "HR",
  crm: "CRM",
  support: "תמיכה",
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  green: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  yellow: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    text: "text-red-400",
    dot: "bg-red-400",
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const SEVERITY_ICONS: Record<string, any> = {
  critical: XCircle,
  warning: AlertTriangle,
  info: CheckCircle2,
};

interface MetricTrend {
  direction: "up" | "down" | "flat";
  changePct: number;
}

interface Metric {
  key: string;
  label: string;
  domain: string;
  value: number;
  displayValue: string;
  rawValue: number;
  format: string;
  trend: MetricTrend;
  status: "green" | "yellow" | "red";
  description: string;
}

interface ActionItem {
  id: string;
  title: string;
  severity: "critical" | "warning" | "info";
  module: string;
  description: string;
}

interface ScorecardData {
  timestamp: string;
  metrics: Metric[];
  actionItems: ActionItem[];
  summary: {
    totalGreen: number;
    totalYellow: number;
    totalRed: number;
    overallHealth: string;
  };
}

function TrafficLight({ status }: { status: "green" | "yellow" | "red" }) {
  return (
    <div className="flex flex-col gap-1 items-center">
      <div className={`w-3 h-3 rounded-full transition-all ${status === "red" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" : "bg-red-500/20"}`} />
      <div className={`w-3 h-3 rounded-full transition-all ${status === "yellow" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]" : "bg-amber-400/20"}`} />
      <div className={`w-3 h-3 rounded-full transition-all ${status === "green" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-emerald-500/20"}`} />
    </div>
  );
}

function TrendArrow({ trend }: { trend: MetricTrend }) {
  if (trend.direction === "up") {
    return (
      <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-medium">
        <TrendingUp className="w-3 h-3" />
        +{trend.changePct}%
      </span>
    );
  }
  if (trend.direction === "down") {
    return (
      <span className="flex items-center gap-0.5 text-red-400 text-xs font-medium">
        <TrendingDown className="w-3 h-3" />
        {trend.changePct}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="w-3 h-3" />
      יציב
    </span>
  );
}

function MetricCard({ metric, showThresholdEdit, onEditThreshold }: {
  metric: Metric;
  showThresholdEdit: boolean;
  onEditThreshold: (key: string) => void;
}) {
  const colors = STATUS_COLORS[metric.status];
  const DomainIcon = DOMAIN_ICONS[metric.domain] || Gauge;

  return (
    <div className={`relative rounded-xl border ${colors.border} ${colors.bg} p-4 transition-all hover:shadow-lg group print:border-gray-300 print:bg-white`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-white/5`}>
            <DomainIcon className={`w-4 h-4 ${colors.text}`} />
          </div>
          <span className="text-xs text-muted-foreground">{DOMAIN_LABELS[metric.domain] || metric.domain}</span>
        </div>
        <div className="flex items-center gap-2">
          <TrafficLight status={metric.status} />
          {showThresholdEdit && (
            <button
              onClick={() => onEditThreshold(metric.key)}
              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all"
              title="ערוך סף"
            >
              <Settings className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-1">
        <div className={`text-2xl font-bold font-mono ${colors.text} print:text-black`}>
          {metric.displayValue}
        </div>
        <div className="text-sm font-medium text-foreground mt-0.5 print:text-black">{metric.label}</div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-muted-foreground truncate">{metric.description}</span>
        <TrendArrow trend={metric.trend} />
      </div>
    </div>
  );
}

function ThresholdEditor({ metricKey, onSave, onClose }: {
  metricKey: string;
  onSave: (key: string, green: number, yellow: number, higherIsBetter: boolean) => void;
  onClose: () => void;
}) {
  const [green, setGreen] = useState(80);
  const [yellow, setYellow] = useState(50);
  const [higherIsBetter, setHigherIsBetter] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <div className="bg-card border border-border rounded-xl p-6 w-80 shadow-2xl">
        <h3 className="text-foreground font-semibold mb-4">ערוך סף: {metricKey}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">סף ירוק</label>
            <input
              type="number"
              value={green}
              onChange={e => setGreen(Number(e.target.value))}
              className="w-full bg-input border border-border rounded-lg p-2 text-foreground text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">סף צהוב</label>
            <input
              type="number"
              value={yellow}
              onChange={e => setYellow(Number(e.target.value))}
              className="w-full bg-input border border-border rounded-lg p-2 text-foreground text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setHigherIsBetter(!higherIsBetter)} className="text-muted-foreground hover:text-foreground transition-colors">
              {higherIsBetter ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <span className="text-xs text-muted-foreground">גבוה יותר = טוב יותר</span>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={() => onSave(metricKey, green, yellow, higherIsBetter)} size="sm" className="bg-blue-600 hover:bg-blue-700 flex-1">שמור</Button>
          <Button onClick={onClose} variant="outline" size="sm" className="border-border flex-1">ביטול</Button>
        </div>
      </div>
    </div>
  );
}

export default function ExecutiveScorecard() {
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [editThresholdKey, setEditThresholdKey] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [, setLocation] = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch("/api/executive/scorecard");
      if (!res.ok) throw new Error(`שגיאה ${res.status}`);
      const d = await res.json();
      setData(d);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      let running = false;
      intervalRef.current = setInterval(async () => {
        if (running || document.hidden) return;
        running = true;
        try { await fetchData(); } finally { running = false; }
      }, 60000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchData]);

  const saveThreshold = async (key: string, green: number, yellow: number, higherIsBetter: boolean) => {
    try {
      await authFetch(`/api/executive/scorecard/thresholds/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ green_threshold: green, yellow_threshold: yellow, higher_is_better: higherIsBetter }),
      });
      setEditThresholdKey(null);
      fetchData();
    } catch {
      alert("שגיאה בשמירת הסף");
    }
  };

  const handlePrint = () => window.print();

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">טוען כרטיס ניקוד מנכ"ל...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-12 w-12 text-red-400" />
          <p className="text-red-400">{error}</p>
          <Button onClick={fetchData} className="bg-blue-600 hover:bg-blue-700">נסה שוב</Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, actionItems, summary } = data;

  const domainGroups: Record<string, Metric[]> = {};
  metrics.forEach(m => {
    if (!domainGroups[m.domain]) domainGroups[m.domain] = [];
    domainGroups[m.domain].push(m);
  });

  const healthColorMap: Record<string, string> = {
    excellent: "text-emerald-400",
    good: "text-blue-400",
    warning: "text-amber-400",
    critical: "text-red-400",
  };

  const healthLabelMap: Record<string, string> = {
    excellent: "מצוין",
    good: "טוב",
    warning: "דורש תשומת לב",
    critical: "קריטי",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#111128] to-[#0a0a1a] p-4 md:p-6 space-y-5 print:bg-white print:p-4" dir="rtl">
      {editThresholdKey && (
        <ThresholdEditor
          metricKey={editThresholdKey}
          onSave={saveThreshold}
          onClose={() => setEditThresholdKey(null)}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg shadow-blue-500/20">
            <BarChart3 className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">כרטיס ניקוד מנכ"ל</h1>
            <p className="text-sm text-muted-foreground">Executive Scorecard — מבט כולל בריאות עסקית</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {lastRefresh.toLocaleTimeString("he-IL")}
          </span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              autoRefresh
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-muted/10 border-border text-muted-foreground"
            }`}
          >
            {autoRefresh ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            רענון אוטומטי
          </button>
          <Button variant="outline" size="sm" onClick={fetchData} className="border-border text-gray-300 gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            רענון
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="border-border text-gray-300 gap-1">
            <Printer className="h-3.5 w-3.5" />
            הדפסה
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="border-border text-gray-300 gap-1">
            <Settings className="h-3.5 w-3.5" />
            סף
          </Button>
        </div>
      </div>

      <div className="print:block">
        <div className="text-center hidden print:block mb-6">
          <h1 className="text-2xl font-bold">כרטיס ניקוד מנכ"ל — TECHNO-KOL UZI</h1>
          <p className="text-gray-600 text-sm mt-1">נכון ל: {new Date(data.timestamp).toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <Card className="bg-card/80 border-border print:border-gray-300 print:bg-white">
          <CardContent className="p-4 text-center">
            <div className={`text-3xl font-bold ${healthColorMap[summary.overallHealth] || "text-foreground"}`}>
              {healthLabelMap[summary.overallHealth] || summary.overallHealth}
            </div>
            <div className="text-xs text-muted-foreground mt-1">בריאות כללית</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/10 border-emerald-500/20 print:border-gray-300 print:bg-white">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-emerald-400">{summary.totalGreen}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> תקין
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/20 print:border-gray-300 print:bg-white">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-400">{summary.totalYellow}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-400" /> זהירות
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20 print:border-gray-300 print:bg-white">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-red-400">{summary.totalRed}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" /> בעייתי
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {Object.entries(domainGroups).map(([domain, mets]) => (
          <div key={domain}>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const DomainIcon = DOMAIN_ICONS[domain] || Gauge;
                  return <DomainIcon className="w-4 h-4 text-muted-foreground" />;
                })()}
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {DOMAIN_LABELS[domain] || domain}
                </h2>
              </div>
              <div className="flex-1 h-px bg-muted" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-3">
              {mets.map(metric => (
                <MetricCard
                  key={metric.key}
                  metric={metric}
                  showThresholdEdit={showSettings}
                  onEditThreshold={setEditThresholdKey}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {actionItems.length > 0 && (
        <div className="print:break-inside-avoid">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">פריטי פעולה דורשי תשומת לב מנכ"ל</h2>
            <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">{actionItems.length} פריטים</Badge>
          </div>
          <div className="space-y-2">
            {actionItems.map((item, i) => {
              const SeverityIcon = SEVERITY_ICONS[item.severity] || AlertTriangle;
              return (
                <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${SEVERITY_COLORS[item.severity]} print:border-gray-300 print:bg-white print:text-black`}>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                    <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                    <SeverityIcon className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.title}</span>
                      <Badge className="text-[10px] border bg-white/5">
                        {MODULE_LABELS[item.module] || item.module}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 print:hidden" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3 print:border-gray-300">
        <span>TECHNO-KOL UZI ERP — Executive Scorecard</span>
        <span>נוצר: {new Date(data.timestamp).toLocaleString("he-IL")}</span>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
          .print\\:text-black { color: black !important; }
          .print\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .print\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          body { background: white; color: black; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
