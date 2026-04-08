import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  ArrowLeft, ArrowRight, RefreshCw, Filter, CheckCircle2, XCircle,
  Clock, Activity, TrendingUp, Zap, Search, ChevronDown
} from "lucide-react";
import { Link } from "wouter";

const API = "/api";

const FLOW_LABELS: Record<string, string> = {
  crm_lead_to_customer: "ליד → לקוח",
  crm_lead_to_order: "ליד → הזמנה",
  opportunity_to_order: "הזדמנות → הזמנה",
  order_to_production: "הזמנה → ייצור",
  order_to_purchase: "הזמנה → רכש",
  order_to_invoice: "הזמנה → חשבונית",
  production_to_inventory: "ייצור → מלאי",
  purchase_to_inventory: "רכש → מלאי",
  invoice_to_payment: "חשבונית → תשלום",
  generic_transfer: "העברה כללית",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400",
  failed: "text-red-400",
};

export default function CrossModuleTransactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [flowFilter, setFlowFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTx, setSearchTx] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (flowFilter) params.set("flow", flowFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await authFetch(`${API}/super-agent/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setStats(data.stats || []);
    } catch {
      setTransactions([]);
      setStats([]);
    }
    setLoading(false);
  }, [flowFilter, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = searchTx
    ? transactions.filter(t =>
        t.transaction_id?.toLowerCase().includes(searchTx.toLowerCase()) ||
        t.flow_name?.includes(searchTx) ||
        t.result_summary?.includes(searchTx)
      )
    : transactions;

  const totalCompleted = stats.filter(s => s.status === "completed").reduce((a, s) => a + s.cnt, 0);
  const totalFailed = stats.filter(s => s.status === "failed").reduce((a, s) => a + s.cnt, 0);
  const avgDuration = stats.length > 0
    ? Math.round(stats.reduce((a, s) => a + (s.avg_ms || 0) * s.cnt, 0) / Math.max(stats.reduce((a, s) => a + s.cnt, 0), 1))
    : 0;

  const uniqueFlows = [...new Set(stats.map(s => s.flow_name))];

  return (
    <div className="min-h-screen bg-background text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/ai-engine">
            <button className="p-2 rounded-lg bg-muted/60 hover:bg-muted/60 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              מעקב עסקאות Cross-Module
            </h1>
            <p className="text-gray-400 text-sm mt-1">היסטוריית כל העסקאות בין מודולים — תיעוד אוטומטי אחרי כל פעולה</p>
          </div>
          <button
            onClick={loadData}
            className="mr-auto p-2.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 transition"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/20">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">סה&quot;כ עסקאות</p>
                <p className="text-2xl font-bold">{totalCompleted + totalFailed}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">הצליחו</p>
                <p className="text-2xl font-bold text-emerald-400">{totalCompleted}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-red-500/20">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">נכשלו</p>
                <p className="text-2xl font-bold text-red-400">{totalFailed}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/20">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-gray-400 text-xs">ממוצע ביצוע</p>
                <p className="text-2xl font-bold">{avgDuration}ms</p>
              </div>
            </div>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="bg-muted/40 border border-border/50 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              סטטיסטיקות לפי תהליך
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {uniqueFlows.map(flow => {
                const completed = stats.find(s => s.flow_name === flow && s.status === "completed");
                const failed = stats.find(s => s.flow_name === flow && s.status === "failed");
                return (
                  <div
                    key={flow}
                    className="bg-background/50 border border-border/30 rounded-lg p-3 cursor-pointer hover:border-cyan-500/40 transition"
                    onClick={() => setFlowFilter(flowFilter === flow ? "" : flow)}
                  >
                    <p className="text-xs text-gray-400 truncate">{FLOW_LABELS[flow] || flow}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {completed && <span className="text-emerald-400 text-sm font-bold">{completed.cnt}</span>}
                      {failed && <span className="text-red-400 text-sm font-bold">{failed.cnt}</span>}
                      <span className="text-gray-500 text-xs mr-auto">{completed?.avg_ms || 0}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="חיפוש לפי מזהה עסקה, תהליך..."
              value={searchTx}
              onChange={e => setSearchTx(e.target.value)}
              className="w-full bg-muted/60 border border-border/50 rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none transition"
            />
          </div>

          <select
            value={flowFilter}
            onChange={e => setFlowFilter(e.target.value)}
            className="bg-muted/60 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">כל התהליכים</option>
            {Object.entries(FLOW_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-muted/60 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">כל הסטטוסים</option>
            <option value="completed">הצליח</option>
            <option value="failed">נכשל</option>
          </select>
        </div>

        <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-cyan-400" />
              <p>טוען עסקאות...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Zap className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>אין עסקאות להצגה</p>
              <p className="text-xs mt-1">עסקאות ירשמו אוטומטית כשתבוצע פעולת cross-module</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/30">
              {filtered.map(tx => {
                const isExpanded = expanded === tx.transaction_id;
                const ts = new Date(tx.created_at).toLocaleString("he-IL", {
                  timeZone: "Asia/Jerusalem",
                  day: "2-digit", month: "2-digit", year: "2-digit",
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                });
                return (
                  <div key={tx.transaction_id}>
                    <div
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 cursor-pointer transition"
                      onClick={() => setExpanded(isExpanded ? null : tx.transaction_id)}
                    >
                      {tx.status === "completed" ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-cyan-400 font-mono">{tx.transaction_id}</code>
                          <span className="text-xs bg-muted/60 text-gray-300 px-2 py-0.5 rounded">
                            {FLOW_LABELS[tx.flow_name] || tx.flow_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>{tx.from_module}</span>
                          <ArrowRight className="w-3 h-3" style={{ transform: "scaleX(-1)" }} />
                          <span>{tx.to_module}</span>
                          {tx.amount && (
                            <span className="text-amber-400 font-medium">
                              {"\u20AA"}{Number(tx.amount).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <span className="text-xs text-gray-500 block">{ts}</span>
                        <span className="text-xs text-gray-600 block">{tx.duration_ms}ms</span>
                      </div>

                      <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-4 bg-background/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs mb-1">פרמטרים</p>
                            <pre className="text-xs text-gray-300 bg-muted/50 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap" dir="ltr">
                              {JSON.stringify(tx.params, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs mb-1">תוצאה</p>
                            <div className="text-xs text-gray-300 bg-muted/50 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap" dir="rtl">
                              {tx.error_message ? (
                                <span className="text-red-400">{tx.error_message}</span>
                              ) : (
                                tx.result_summary?.replace(/\*\*/g, "").replace(/[✅❌📋📒📊💰🧾💳📦👤🏦]/g, "") || "—"
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                          <span>מקור: {tx.source_entity_type} #{tx.source_entity_id || "—"}</span>
                          <span>יעד: {tx.target_entity_type} #{tx.target_entity_id || "—"}</span>
                          <span className={STATUS_COLORS[tx.status] || ""}>{tx.status}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}