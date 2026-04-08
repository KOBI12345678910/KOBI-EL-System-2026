import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface FlowDef {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  source: string;
  target: string;
  category: string;
  icon: string;
}

interface FlowResult {
  flowId: string;
  flowName: string;
  source: string;
  target: string;
  success: boolean;
  recordsAffected: number;
  details?: Record<string, any>;
  error?: string;
  timestamp: string;
  durationMs: number;
}

interface FlowStats {
  total: number;
  last24h: number;
  successRate: number;
  totalRecords: number;
  byFlow: Record<string, { runs: number; success: number; records: number }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  procurement: "רכש",
  finance: "כספים",
  inventory: "מלאי",
  import: "ייבוא",
  production: "ייצור",
};

const CATEGORY_COLORS: Record<string, string> = {
  procurement: "bg-blue-500",
  finance: "bg-green-500",
  inventory: "bg-amber-500",
  import: "bg-purple-500",
  production: "bg-rose-500",
};

export default function DataFlowAutomations() {
  const queryClient = useQueryClient();
  const [runningFlow, setRunningFlow] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [lastRunResults, setLastRunResults] = useState<FlowResult[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showHistory, setShowHistory] = useState(false);

  const { data: flowData, isLoading: loading } = useQuery<{ flows: FlowDef[]; stats: FlowStats | null; history: FlowResult[] }>({
    queryKey: ["data-flows"],
    queryFn: async () => {
      const res = await authFetch(`${API}/data-flows`);
      if (!res.ok) return { flows: [], stats: null, history: [] };
      const d = await res.json();
      return {
        flows: Array.isArray(d.flows) ? d.flows : [],
        stats: d.stats || null,
        history: Array.isArray(d.history) ? d.history : [],
      };
    },
    staleTime: 30_000,
  });

  const flows = flowData?.flows ?? [];
  const stats = flowData?.stats ?? null;
  const history = flowData?.history ?? [];

  async function handleRunFlow(flowId: string) {
    setRunningFlow(flowId);
    try {
      const res = await authFetch(`${API}/data-flows/run/${flowId}`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setLastRunResults(prev => [result, ...prev].slice(0, 50));
      }
    } catch {}
    setRunningFlow(null);
    queryClient.invalidateQueries({ queryKey: ["data-flows"] });
  }

  async function handleRunAll() {
    setRunningAll(true);
    try {
      const res = await authFetch(`${API}/data-flows/run-all`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLastRunResults(Array.isArray(data.results) ? data.results : []);
      }
    } catch {}
    setRunningAll(false);
    queryClient.invalidateQueries({ queryKey: ["data-flows"] });
  }

  const filteredFlows = useMemo(() => {
    return selectedCategory === "all" ? flows : flows.filter(f => f.category === selectedCategory);
  }, [flows, selectedCategory]);

  const categories = useMemo(() => {
    return Array.from(new Set(flows.map(f => f.category)));
  }, [flows]);

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-screen" dir="rtl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
            <span className="text-3xl">⚡</span>
            מנוע אוטומציות זרימת נתונים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            סנכרון אוטומטי בין כל מודולי ה-ERP — רכש, מלאי, כספים, ייצור, ייבוא
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            {showHistory ? "הסתר" : "הצג"} היסטוריה ({history.length})
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            🔄 רענון
          </button>
          <button
            onClick={handleRunAll}
            disabled={runningAll}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-gradient-to-l from-blue-600 to-indigo-600 text-foreground hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {runningAll ? <><span className="animate-spin">⏳</span> מריץ...</> : <>🚀 הרץ הכל</>}
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="זרימות פעילות" value={String(flows.length)} icon="⚡" color="bg-blue-500/10 border-blue-500/20" />
          <StatCard label="הרצות (24 שעות)" value={String(stats.last24h)} icon="📊" color="bg-green-500/10 border-green-500/20" />
          <StatCard label="אחוז הצלחה" value={`${stats.successRate}%`} icon="✅" color="bg-emerald-500/10 border-emerald-500/20" />
          <StatCard label="רשומות מעודכנות" value={String(stats.totalRecords)} icon="📝" color="bg-purple-500/10 border-purple-500/20" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          הכל ({flows.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {CATEGORY_LABELS[cat] || cat} ({flows.filter(f => f.category === cat).length})
          </button>
        ))}
      </div>

      {lastRunResults.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 p-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <span>📋</span> תוצאות הרצה אחרונה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {lastRunResults.slice(0, 9).map((r, i) => (
              <div key={i} className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between ${r.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                <span className="font-medium truncate ml-2">{r.flowName}</span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  {r.success ? "✅" : "❌"} {r.recordsAffected} רשומות | {r.durationMs}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredFlows.map(flow => {
          const flowStats = stats?.byFlow?.[flow.id];
          const isRunning = runningFlow === flow.id;
          return (
            <div key={flow.id} className="bg-card rounded-xl border border-border/50 p-4 hover:border-primary/30 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[flow.category] || "bg-muted"}`} />
                  <span className="text-xs text-muted-foreground font-medium">
                    {CATEGORY_LABELS[flow.category] || flow.category}
                  </span>
                </div>
                <button
                  onClick={() => handleRunFlow(flow.id)}
                  disabled={isRunning || runningAll}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  {isRunning ? "⏳" : "▶️"} הרץ
                </button>
              </div>
              <h3 className="font-bold text-sm text-foreground mb-1">{flow.name}</h3>
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{flow.description}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="bg-muted px-2 py-0.5 rounded font-mono">{flow.source}</span>
                <span>←</span>
                <span className="bg-muted px-2 py-0.5 rounded font-mono">{flow.target}</span>
              </div>
              {flowStats && (
                <div className="mt-3 pt-2 border-t border-border/30 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{flowStats.runs} הרצות</span>
                  <span>{flowStats.success} הצלחות</span>
                  <span>{flowStats.records} רשומות</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-card rounded-xl border border-border/50 p-6">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <span>🔗</span> תרשים זרימת נתונים — ERP מלא
        </h3>
        <div className="overflow-x-auto">
          <div className="min-w-[700px] flex items-center justify-between gap-2 py-4">
            <FlowNode label="בקשת רכש" color="bg-blue-500/10 text-blue-400" />
            <Arrow />
            <FlowNode label="הזמנת רכש" color="bg-blue-500/20 text-blue-300" />
            <Arrow />
            <FlowNode label="קבלת טובין" color="bg-cyan-500/10 text-cyan-400" />
            <Arrow />
            <FlowNode label="מלאי/חומרים" color="bg-amber-500/10 text-amber-400" />
            <Arrow />
            <FlowNode label="חשבונות זכאים" color="bg-green-500/10 text-green-400" />
            <Arrow />
            <FlowNode label="ספר ראשי GL" color="bg-emerald-500/10 text-emerald-400" />
          </div>
          <div className="min-w-[700px] flex items-center justify-between gap-2 py-4 mt-2">
            <FlowNode label="הצעות מחיר" color="bg-purple-500/10 text-purple-400" />
            <Arrow />
            <FlowNode label="היסטוריית מחירים" color="bg-purple-500/20 text-purple-300" />
            <div className="w-8" />
            <FlowNode label="הערכות ספקים" color="bg-rose-500/10 text-rose-400" />
            <Arrow />
            <FlowNode label="ציון ספק" color="bg-rose-500/20 text-rose-300" />
            <div className="w-8" />
            <FlowNode label="החזרות" color="bg-orange-500/10 text-orange-400" />
            <Arrow />
            <FlowNode label="זיכוי ספק" color="bg-orange-500/20 text-orange-300" />
          </div>
          <div className="min-w-[700px] flex items-center justify-between gap-2 py-4 mt-2">
            <FlowNode label="שערי חליפין" color="bg-indigo-500/10 text-indigo-400" />
            <Arrow />
            <FlowNode label="הזמנות ייבוא" color="bg-indigo-500/20 text-indigo-300" />
            <div className="w-8" />
            <FlowNode label="מכתבי אשראי" color="bg-teal-500/10 text-teal-400" />
            <Arrow />
            <FlowNode label="עלויות ייבוא" color="bg-teal-500/20 text-teal-300" />
            <div className="w-8" />
            <FlowNode label="משלוחים" color="bg-sky-500/10 text-sky-400" />
            <Arrow />
            <FlowNode label="שחרור מכס" color="bg-sky-500/20 text-sky-300" />
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="bg-card rounded-xl border border-border/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">📜 היסטוריית הרצות</h3>
            {history.filter(h => !h.success).length > 0 && (
              <button
                onClick={async () => {
                  const failedFlowIds = [...new Set(history.filter(h => !h.success).map(h => h.flowId))];
                  for (const fid of failedFlowIds) {
                    await handleRunFlow(fid);
                  }
                }}
                disabled={runningFlow !== null || runningAll}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                🔁 הרץ מחדש {history.filter(h => !h.success).length} כישלונות
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/50">
                  <th className="text-right py-2 px-2">זמן</th>
                  <th className="text-right py-2 px-2">זרימה</th>
                  <th className="text-right py-2 px-2">מקור → יעד</th>
                  <th className="text-right py-2 px-2">סטטוס</th>
                  <th className="text-right py-2 px-2">רשומות</th>
                  <th className="text-right py-2 px-2">משך</th>
                  <th className="text-right py-2 px-2">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 50).map((h, i) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-muted/30">
                    <td className="py-1.5 px-2 text-muted-foreground">{new Date(h.timestamp).toLocaleString("he-IL")}</td>
                    <td className="py-1.5 px-2 font-medium text-foreground">{h.flowName}</td>
                    <td className="py-1.5 px-2 text-muted-foreground font-mono">{h.source} → {h.target}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-2 py-0.5 rounded-full ${h.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {h.success ? "✅ הצלחה" : "❌ כישלון"}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 font-bold text-foreground">{h.recordsAffected}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{h.durationMs}ms</td>
                    <td className="py-1.5 px-2">
                      {!h.success && (
                        <button
                          onClick={() => handleRunFlow(h.flowId)}
                          disabled={runningFlow === h.flowId}
                          className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          {runningFlow === h.flowId ? "⏳" : "🔁"} נסה שוב
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">אין היסטוריה עדיין — הרץ אוטומציות כדי ליצור רשומות</div>
            )}
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border/50 p-4">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <span>🔄</span> סנכרון בין-מודולי (Event Bus)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          בנוסף לזרימות המתוזמנות, המערכת כוללת מנוע אירועים אוטומטי שמפעיל סנכרון מיידי בין מודולים:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            { name: "רכש → מלאי", desc: "הזמנת רכש מאושרת מעדכנת מלאי חומרים" },
            { name: "ליד → לקוח", desc: "המרת ליד יוצרת כרטיס לקוח + חשבון פיננסי" },
            { name: "עובד → הרשאות", desc: "שינוי סטטוס עובד מעדכן הרשאות מערכת" },
            { name: "חשבונית ספק → AP", desc: "חשבונית חדשה נכנסת לחשבונות זכאים" },
            { name: "הזמנת מכירה → חשבונית", desc: "הזמנה מאושרת יוצרת חשבונית אוטומטית" },
            { name: "מלאי נמוך → התראה", desc: "ירידה מתחת למינימום יוצרת התראה והזמנת רכש" },
          ].map((s, i) => (
            <div key={i} className="bg-muted/30 rounded-lg px-3 py-2">
              <div className="text-xs font-bold text-foreground">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                פעיל — אירועים בזמן אמת
              </div>
            </div>
          ))}
        </div>
      </div>

      <ActivityLog entityType="data-flow-automations" compact />
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-2xl font-black text-foreground">{value}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function FlowNode({ label, color }: { label: string; color: string }) {
  return (
    <div className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${color}`}>
      {label}
    </div>
  );
}

function Arrow() {
  return (
    <div className="text-muted-foreground text-lg font-bold">→</div>
  );
}
