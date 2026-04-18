import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Shield, Search, Download, RefreshCw, AlertTriangle,
  CheckCircle2, Clock, Zap, Filter, BarChart3, ArrowLeft,
  TrendingUp, Activity, Brain, ChevronDown, ChevronRight
} from "lucide-react";
import { Link } from "wouter";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface AuditLog {
  id: number;
  user_id: string;
  provider: string;
  model: string;
  task_type: string;
  input_summary: string;
  output_summary: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status_code: number;
  error_message: string;
  action_taken: string;
  fallback_used: boolean;
  original_provider: string;
  created_at: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  claude: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  openai: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  gemini: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  kimi: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const TASK_COLORS: Record<string, string> = {
  code: "bg-blue-500/20 text-blue-400",
  reasoning: "bg-violet-500/20 text-violet-400",
  fast: "bg-green-500/20 text-green-400",
  hebrew: "bg-amber-500/20 text-amber-400",
  general: "bg-gray-500/20 text-gray-400",
};

export default function AIAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTaskType, setFilterTaskType] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"logs" | "analytics">("logs");
  const limit = 50;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (search) params.set("search", search);
      if (filterProvider) params.set("provider", filterProvider);
      if (filterStatus) params.set("status", filterStatus);
      if (filterTaskType) params.set("taskType", filterTaskType);

      const [logsRes, analyticsRes] = await Promise.all([
        authFetch(`${API}/ai-orchestration/audit-logs?${params}`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/ai-orchestration/audit-logs/analytics`, { headers: headers() }).then(r => r.json()),
      ]);
      setLogs(logsRes.logs || []);
      setTotal(logsRes.total || 0);
      setAnalytics(analyticsRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [offset, filterProvider, filterStatus, filterTaskType]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    fetchLogs();
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterProvider) params.set("provider", filterProvider);
    const url = `${API}/ai-orchestration/audit-logs/export?${params}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-audit-log.csv";
    a.click();
  };

  const formatMs = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  const formatDate = (d: string) => new Date(d).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 flex items-center justify-center">
          <Shield className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">יומן ביקורת AI</h1>
          <p className="text-muted-foreground text-sm">כל בקשה, תגובה ופעולה — לוגים מלאים לציות ואבטחה</p>
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={fetchLogs} className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg hover:bg-muted text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> רענן
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg hover:bg-muted text-sm">
            <Download className="w-3.5 h-3.5" /> ייצוא CSV
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-0">
        {(["logs", "analytics"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab ? "border-violet-500 text-violet-400" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "logs" ? "לוגים" : "אנליטיקס"}
          </button>
        ))}
      </div>

      {activeTab === "analytics" && analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(analytics.byProvider || []).map((p: any, i: number) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-xl p-4">
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border mb-2 ${PROVIDER_COLORS[p.provider] || "bg-gray-500/20 text-gray-400"}`}>
                  {p.provider}
                </div>
                <div className="text-2xl font-bold text-foreground">{p.total_requests}</div>
                <div className="text-xs text-muted-foreground">בקשות כולל</div>
                <div className="text-xs text-green-400 mt-1">{p.success_count} הצלחות</div>
                {p.avg_latency_ms && (
                  <div className="text-xs text-muted-foreground">{Math.round(p.avg_latency_ms)}ms ממוצע</div>
                )}
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-foreground">סוגי משימות</h3>
              </div>
              <div className="space-y-2">
                {(analytics.byTaskType || []).map((t: any, i: number) => {
                  const max = Math.max(...(analytics.byTaskType || []).map((x: any) => x.count));
                  const pct = max > 0 ? (t.count / max) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_COLORS[t.task_type] || "bg-gray-500/20 text-gray-400"}`}>
                        {t.task_type || "—"}
                      </span>
                      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-left">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-foreground">שגיאות אחרונות</h3>
              </div>
              {(analytics.recentErrors || []).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">אין שגיאות — הכל תקין!</div>
              ) : (
                <div className="space-y-2">
                  {(analytics.recentErrors || []).map((e: any, i: number) => (
                    <div key={i} className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${PROVIDER_COLORS[e.provider] || ""}`}>{e.provider}</span>
                        <span className="text-xs text-muted-foreground">{e.model}</span>
                        <span className="text-xs text-muted-foreground mr-auto">{formatDate(e.created_at)}</span>
                      </div>
                      <p className="text-xs text-red-400 mt-1 truncate">{e.error_message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="חיפוש בלוגים..."
                  className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-foreground rounded-lg text-sm">חפש</button>
            </form>

            <select
              value={filterProvider}
              onChange={e => { setFilterProvider(e.target.value); setOffset(0); }}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">כל הספקים</option>
              <option value="claude">Claude</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="kimi">Kimi</option>
            </select>

            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setOffset(0); }}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">כל הסטטוסים</option>
              <option value="success">הצלחה</option>
              <option value="error">שגיאה</option>
            </select>

            <select
              value={filterTaskType}
              onChange={e => { setFilterTaskType(e.target.value); setOffset(0); }}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
            >
              <option value="">כל הסוגים</option>
              <option value="code">קוד</option>
              <option value="reasoning">הסקת מסקנות</option>
              <option value="fast">מהיר</option>
              <option value="hebrew">עברית</option>
              <option value="general">כללי</option>
            </select>
          </div>

          <div className="text-sm text-muted-foreground">
            {total} רשומות סה"כ
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-16 bg-card rounded-xl animate-pulse border border-border" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין לוגים להצגה. לוגים יופיעו לאחר שיישלחו בקשות AI.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${log.status_code === 200 ? "bg-green-500/20" : "bg-red-500/20"}`}>
                      {log.status_code === 200
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                        : <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                    </div>

                    <span className={`text-xs px-2 py-0.5 rounded-full border ${PROVIDER_COLORS[log.provider] || "bg-gray-500/20 text-gray-400"}`}>
                      {log.provider}
                    </span>

                    <span className="text-xs text-muted-foreground truncate flex-1 max-w-[300px]">
                      {log.input_summary ? log.input_summary.slice(0, 80) + (log.input_summary.length > 80 ? "..." : "") : "—"}
                    </span>

                    <div className="flex items-center gap-3 mr-auto text-xs text-muted-foreground">
                      {log.fallback_used && (
                        <span className="text-amber-400 text-[10px] px-1.5 py-0.5 bg-amber-500/10 rounded-full">fallback</span>
                      )}
                      {log.task_type && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TASK_COLORS[log.task_type] || ""}`}>{log.task_type}</span>
                      )}
                      {log.latency_ms && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatMs(log.latency_ms)}</span>}
                      {log.total_tokens && <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{log.total_tokens.toLocaleString()}</span>}
                      <span>{formatDate(log.created_at)}</span>
                      {expandedLog === log.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {expandedLog === log.id && (
                    <div className="border-t border-border p-4 bg-muted/10 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">מודל</div>
                        <div className="text-foreground">{log.model}</div>
                      </div>
                      {log.user_id && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">משתמש</div>
                          <div className="text-foreground">{log.user_id}</div>
                        </div>
                      )}
                      {log.input_tokens && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">טוקנים</div>
                          <div className="text-foreground">{log.input_tokens} כניסה + {log.output_tokens} יציאה = {log.total_tokens} סה"כ</div>
                        </div>
                      )}
                      {log.action_taken && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">פעולה שננקטה</div>
                          <div className="text-foreground">{log.action_taken}</div>
                        </div>
                      )}
                      {log.fallback_used && log.original_provider && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">ספק מקורי (fallback)</div>
                          <div className="text-amber-400">{log.original_provider} → {log.provider}</div>
                        </div>
                      )}
                      {log.input_summary && (
                        <div className="col-span-full">
                          <div className="text-xs text-muted-foreground mb-1">קלט</div>
                          <div className="text-foreground/80 text-xs bg-background rounded-lg p-2 max-h-24 overflow-y-auto">{log.input_summary}</div>
                        </div>
                      )}
                      {log.output_summary && (
                        <div className="col-span-full">
                          <div className="text-xs text-muted-foreground mb-1">פלט</div>
                          <div className="text-foreground/80 text-xs bg-background rounded-lg p-2 max-h-24 overflow-y-auto">{log.output_summary}</div>
                        </div>
                      )}
                      {log.error_message && (
                        <div className="col-span-full">
                          <div className="text-xs text-red-400 mb-1">שגיאה</div>
                          <div className="text-red-300 text-xs bg-red-500/10 rounded-lg p-2">{log.error_message}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {total > limit && (
            <div className="flex justify-center gap-3">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40"
              >
                הקודם
              </button>
              <span className="px-4 py-2 text-sm text-muted-foreground">
                {offset + 1}-{Math.min(offset + limit, total)} מתוך {total}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2 bg-card border border-border rounded-lg text-sm disabled:opacity-40"
              >
                הבא
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
