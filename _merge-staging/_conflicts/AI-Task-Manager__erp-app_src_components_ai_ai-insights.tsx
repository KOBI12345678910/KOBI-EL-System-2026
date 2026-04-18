import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, TrendingUp, AlertTriangle, Lightbulb, ChevronDown,
  ChevronUp, RefreshCcw, BarChart3, ShieldAlert, Loader2, Zap, Eye
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface AIInsight {
  id: string;
  type: "anomaly" | "trend" | "opportunity" | "alert" | "recommendation";
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  category: string;
  actionLabel?: string;
  actionUrl?: string;
}

interface MonitoringAlert {
  check: string;
  status: string;
  value: number;
  threshold: number;
  raw: string;
  extras: Record<string, string>;
}

function parseMonitoringAlert(description: string): MonitoringAlert | null {
  const lower = description.toLowerCase();
  if (!lower.includes("check:") || !lower.includes("status:") || !lower.includes("value:")) {
    return null;
  }

  const segments = description.split("|").map((s) => s.trim());
  const map: Record<string, string> = {};

  for (const seg of segments) {
    const colonIdx = seg.indexOf(":");
    if (colonIdx === -1) continue;
    const key = seg.slice(0, colonIdx).trim().toLowerCase();
    const val = seg.slice(colonIdx + 1).trim();
    map[key] = val;
  }

  const check = map["check"] || "";
  const status = map["status"] || "";
  const rawValue = map["value"] || "";

  const valueMatch = rawValue.match(/^([\d.]+)/);
  const thresholdMatch = rawValue.match(/\(threshold:\s*([\d.]+)\)/);

  if (!check || !status || !valueMatch) return null;

  const value = parseFloat(valueMatch[1]);
  const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : 100;

  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (!["check", "status", "value"].includes(k)) {
      extras[k] = v;
    }
  }

  return { check, status, value, threshold, raw: description, extras };
}

function getMetricLabel(check: string): string {
  const labels: Record<string, string> = {
    cpu: "עומס מעבד",
    memory: "שימוש בזיכרון",
    disk: "שימוש בדיסק",
    network: "תעבורת רשת",
  };
  return labels[check.toLowerCase()] || check;
}

function getStatusEmoji(status: string): string {
  switch (status.toLowerCase()) {
    case "critical": return "🔴";
    case "warning": return "⚠️";
    case "ok": return "✅";
    default: return "ℹ️";
  }
}

function getBarColor(value: number): string {
  if (value > 90) return "bg-red-500";
  if (value > 70) return "bg-yellow-400";
  return "bg-emerald-400";
}

function MonitoringAlertBody({ alert }: { alert: MonitoringAlert }) {
  const [showDetails, setShowDetails] = useState(false);

  const emoji = getStatusEmoji(alert.status);
  const label = getMetricLabel(alert.check);
  const valuePct = Math.min((alert.value / alert.threshold) * 100, 100);
  const barColor = getBarColor(alert.value);
  const statusLower = alert.status.toLowerCase();
  const loadWord = statusLower === "ok" ? "" : " גבוה";
  const summaryLine = `${emoji} ${label}${loadWord}: ${alert.value.toFixed(1)}% (סף מרבי: ${alert.threshold}%)`;

  return (
    <div className="mt-1 space-y-2">
      <p className="text-xs text-white/80 leading-relaxed font-medium">{summaryLine}</p>

      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${valuePct}%` }}
        />
      </div>

      <button
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-white/50 hover:text-white/80 transition-colors"
      >
        {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        פרטים טכניים
      </button>

      {showDetails && (
        <div className="rounded-lg bg-black/20 px-3 py-2 text-[10px] text-white/50 font-mono leading-relaxed break-all">
          {alert.raw}
        </div>
      )}
    </div>
  );
}

const INSIGHT_CONFIG = {
  anomaly: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  trend: { icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  opportunity: { icon: Lightbulb, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  alert: { icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  recommendation: { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
};

const MONITORING_STATUS_STYLE: Record<string, { cardBorder: string; cardBg: string; iconColor: string }> = {
  critical: { cardBorder: "border-red-500/40", cardBg: "bg-red-500/10", iconColor: "text-red-400" },
  warning:  { cardBorder: "border-amber-400/40", cardBg: "bg-amber-500/10", iconColor: "text-amber-400" },
  ok:       { cardBorder: "border-emerald-400/40", cardBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
};

const SEVERITY_BORDER = {
  info: "border-r-blue-500/50",
  warning: "border-r-amber-500/50",
  critical: "border-r-red-500",
};

export default function AIInsights() {
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: insights = [], isLoading, refetch, isFetching } = useQuery<AIInsight[]>({
    queryKey: ["ai-insights-dashboard"],
    queryFn: async () => {
      try {
        const [summaryRes, notifRes] = await Promise.all([
          authFetch(`${API}/claude/knowledge/schema-summary`),
          authFetch(`${API}/notifications?limit=10&archived=false`),
        ]);

        const insights: AIInsight[] = [];
        let id = 0;

        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          const health = summary?.health || {};
          const totals = summary?.totals || {};

          if ((health.entitiesWithoutFields || 0) > 0) {
            insights.push({
              id: String(id++),
              type: "alert",
              title: `${health.entitiesWithoutFields} ישויות ללא שדות`,
              description: "ישנן ישויות במערכת שלא הוגדרו להן שדות. מומלץ להגדיר שדות או למחוק ישויות שאינן בשימוש.",
              severity: "warning",
              category: "מבנה מערכת",
              actionLabel: "צפה בישויות",
              actionUrl: "/builder/entities",
            });
          }

          if ((health.draftModules || 0) > 0) {
            const draftNames: string[] = health.draftModuleNames || [];
            const namesList = draftNames.length > 0
              ? `המודולים: ${draftNames.join(", ")}.`
              : "";
            insights.push({
              id: String(id++),
              type: "recommendation",
              title: `${health.draftModules} מודולים בטיוטה ממתינים לפרסום`,
              description: `מודולים בטיוטה אינם נגישים למשתמשי המערכת. שקול לפרסם אותם או לארכב מודולים שאינם נחוצים.${namesList ? " " + namesList : ""}`,
              severity: "info",
              category: "מודולים",
              actionLabel: "פרסום מודולים",
              actionUrl: "/builder/publish",
            });
          }

          if ((totals.records || 0) > 0) {
            insights.push({
              id: String(id++),
              type: "trend",
              title: `${(totals.records || 0).toLocaleString()} רשומות במערכת`,
              description: `המערכת כוללת ${totals.modules || 0} מודולים, ${totals.entities || 0} ישויות ו-${totals.fields || 0} שדות. ממוצע ${health.averageFieldsPerEntity || 0} שדות לישות.`,
              severity: "info",
              category: "סטטיסטיקות",
            });
          }

          if ((health.averageFieldsPerEntity || 0) < 3 && (totals.entities || 0) > 0) {
            insights.push({
              id: String(id++),
              type: "recommendation",
              title: "ממוצע שדות נמוך לישויות",
              description: `הממוצע הנוכחי הוא ${health.averageFieldsPerEntity || 0} שדות לישות. מומלץ להעשיר את הישויות עם שדות נוספים לייעול התהליכים.`,
              severity: "info",
              category: "אופטימיזציה",
              actionLabel: "ניהול שדות",
              actionUrl: "/builder/fields",
            });
          }
        }

        if (notifRes.ok) {
          const notifData = await notifRes.json();
          const criticalNotifs = (notifData.notifications || []).filter((n: any) => n.priority === "critical" && !n.isRead);
          if (criticalNotifs.length > 0) {
            insights.push({
              id: String(id++),
              type: "alert",
              title: `${criticalNotifs.length} התראות קריטיות ממתינות`,
              description: criticalNotifs[0]?.message || "ישנן התראות קריטיות שדורשות טיפול מיידי.",
              severity: "critical",
              category: "התראות",
              actionLabel: "צפה בהתראות",
              actionUrl: "/notifications",
            });
          }

          const pendingApprovals = (notifData.notifications || []).filter((n: any) => n.category === "approval" && !n.isRead);
          if (pendingApprovals.length > 0) {
            insights.push({
              id: String(id++),
              type: "opportunity",
              title: `${pendingApprovals.length} אישורים ממתינים`,
              description: "ישנם פריטים שדורשים את אישורך. טיפול מהיר ישפר את זרימת העבודה.",
              severity: "warning",
              category: "אישורים",
              actionLabel: "צפה באישורים",
              actionUrl: "/purchase-approvals",
            });
          }
        }

        insights.push({
          id: String(id++),
          type: "opportunity",
          title: "שפר את ביצועי המערכת עם AI",
          description: "השתמש בכלי ה-AI המובנים לאוטומציה של תהליכים, מילוי טפסים חכם, וניתוח נתונים אוטומטי.",
          severity: "info",
          category: "AI",
          actionLabel: "הגדרות AI",
          actionUrl: "/ai-builder",
        });

        return insights.sort((a, b) => {
          const sevOrder = { critical: 0, warning: 1, info: 2 };
          return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
        });
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 40%, #c084fc 70%, #d8b4fe 100%)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <div
            className="flex items-center gap-3 cursor-pointer flex-1 hover:opacity-90 transition-opacity"
            onClick={() => setIsExpanded(!isExpanded)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsExpanded(!isExpanded); }}
          >
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-card/20 text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-sm">
                <Zap className="w-3 h-3" />
                Real-time
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-card/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="text-right">
              <h3 className="font-bold text-lg text-white">תובנות והמלצות AI</h3>
              <p className="text-[11px] text-white/70">{insights.length} תובנות זמינות</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 text-white/70 hover:text-white hover:bg-card/10 rounded-lg transition-colors"
            >
              <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-white/70 hover:text-white transition-colors"
            >
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {isLoading ? (
                <div className="px-6 py-8 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-white/70" />
                  <span className="text-sm text-white/70">מנתח נתונים...</span>
                </div>
              ) : insights.length === 0 ? (
                <div className="px-6 py-10 flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-card/10 backdrop-blur-sm flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-white/50" />
                  </div>
                  <p className="text-white/70 text-sm">אין תובנות חדשות כרגע</p>
                </div>
              ) : (
                <div className="px-6 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.map((insight, i) => {
                    const config = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.recommendation;
                    const Icon = config.icon;
                    const monitoringAlert = parseMonitoringAlert(insight.description);
                    const monitoringStyle = monitoringAlert
                      ? (MONITORING_STATUS_STYLE[monitoringAlert.status.toLowerCase()] || MONITORING_STATUS_STYLE.warning)
                      : null;
                    const cardBorderClass = monitoringStyle ? monitoringStyle.cardBorder : "border-white/10";
                    const cardBgClass = monitoringStyle ? monitoringStyle.cardBg : "bg-card/10";
                    const iconColorClass = monitoringStyle ? monitoringStyle.iconColor : "text-white";
                    return (
                      <motion.div
                        key={insight.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-3 rounded-xl backdrop-blur-sm border ${cardBgClass} ${cardBorderClass}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-card/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Icon className={`w-3.5 h-3.5 ${iconColorClass}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-white">{insight.title}</h4>
                            {monitoringAlert ? (
                              <MonitoringAlertBody alert={monitoringAlert} />
                            ) : (
                              <p className="text-xs text-white/60 mt-1 leading-relaxed">{insight.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-card/10 text-white/70">{insight.category}</span>
                              {insight.actionLabel && insight.actionUrl && (
                                <a
                                  href={insight.actionUrl}
                                  className="text-[10px] font-medium text-white hover:underline"
                                >
                                  {insight.actionLabel} ←
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="px-6 pb-4">
                <a
                  href="/ai-builder"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-card/15 hover:bg-card/20 backdrop-blur-sm text-white text-sm font-medium transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  צפה בכל התובנות והאוטומציות
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl overflow-hidden bg-card border border-border"
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 text-[11px] font-bold flex items-center gap-1.5 border border-cyan-500/20">
              <BarChart3 className="w-3 h-3" />
              Live Analysis
            </span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="text-right">
              <h3 className="font-bold text-base text-white">תובנות AI חכמות</h3>
              <p className="text-[10px] text-muted-foreground">ניתוח מתמשך של ביצועי המערכת</p>
            </div>
          </div>
          <a
            href="/ai-builder"
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            הצג הכל ←
          </a>
        </div>
      </motion.div>
    </div>
  );
}
