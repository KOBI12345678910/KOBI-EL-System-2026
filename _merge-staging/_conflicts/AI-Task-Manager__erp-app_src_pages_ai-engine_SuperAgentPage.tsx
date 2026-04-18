import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "@/lib/utils";
import { Link } from "wouter";
import {
  ArrowLeft, RefreshCw, Play, CheckCircle2, XCircle, Clock,
  Activity, Zap, Layers, ArrowRight, ChevronDown, Search,
  Network, Database, GitBranch, BarChart3, Terminal, Send,
  AlertTriangle, TrendingUp, Box, FileText
} from "lucide-react";

const API = "/api";

const FLOW_META: Record<string, { label: string; icon: string; from: string; to: string; color: string; params: { key: string; label: string; type: string }[] }> = {
  crm_lead_to_customer: {
    label: "ליד → לקוח", icon: "👤", from: "CRM", to: "מכירות",
    color: "from-blue-500/20 to-cyan-500/20",
    params: [{ key: "lead_id", label: "מזהה ליד", type: "number" }],
  },
  crm_lead_to_order: {
    label: "ליד → הזמנה", icon: "📋", from: "CRM", to: "מכירות",
    color: "from-blue-500/20 to-indigo-500/20",
    params: [{ key: "lead_id", label: "מזהה ליד", type: "number" }],
  },
  opportunity_to_order: {
    label: "הזדמנות → הזמנה", icon: "🎯", from: "CRM", to: "מכירות",
    color: "from-violet-500/20 to-purple-500/20",
    params: [{ key: "opportunity_id", label: "מזהה הזדמנות", type: "number" }],
  },
  order_to_production: {
    label: "הזמנה → ייצור", icon: "🏭", from: "מכירות", to: "ייצור",
    color: "from-amber-500/20 to-orange-500/20",
    params: [{ key: "order_id", label: "מזהה הזמנה", type: "number" }],
  },
  order_to_purchase: {
    label: "הזמנה → רכש", icon: "🛒", from: "מכירות", to: "רכש",
    color: "from-emerald-500/20 to-green-500/20",
    params: [{ key: "order_id", label: "מזהה הזמנה", type: "number" }],
  },
  order_to_invoice: {
    label: "הזמנה → חשבונית", icon: "🧾", from: "מכירות", to: "פיננסים",
    color: "from-cyan-500/20 to-teal-500/20",
    params: [{ key: "order_id", label: "מזהה הזמנה", type: "number" }],
  },
  production_to_inventory: {
    label: "ייצור → מלאי", icon: "📦", from: "ייצור", to: "מלאי",
    color: "from-orange-500/20 to-red-500/20",
    params: [{ key: "work_order_id", label: "מזהה הוראת עבודה", type: "number" }],
  },
  purchase_to_inventory: {
    label: "רכש → מלאי", icon: "📥", from: "רכש", to: "מלאי",
    color: "from-green-500/20 to-emerald-500/20",
    params: [{ key: "purchase_order_id", label: "מזהה הזמנת רכש", type: "number" }],
  },
  invoice_to_payment: {
    label: "חשבונית → תשלום", icon: "💳", from: "פיננסים", to: "פיננסים",
    color: "from-teal-500/20 to-cyan-500/20",
    params: [
      { key: "invoice_id", label: "מזהה חשבונית", type: "number" },
      { key: "amount", label: "סכום (אופציונלי)", type: "number" },
      { key: "payment_method", label: "אמצעי תשלום", type: "select" },
    ],
  },
};

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "check", label: "צ'ק" },
  { value: "credit_card", label: "כרטיס אשראי" },
  { value: "cash", label: "מזומן" },
];

interface Transaction {
  transaction_id: string;
  flow_name: string;
  from_module: string;
  to_module: string;
  status: string;
  amount: string | null;
  duration_ms: number;
  result_summary: string;
  error_message: string | null;
  params: Record<string, any>;
  source_entity_id: number | null;
  target_entity_id: number | null;
  created_at: string;
}

interface FlowStat {
  flow_name: string;
  status: string;
  cnt: number;
  avg_ms: number;
}

export default function SuperAgentDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<FlowStat[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "flows" | "history" | "execute">("overview");
  const [selectedFlow, setSelectedFlow] = useState("");
  const [flowParams, setFlowParams] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [filterFlow, setFilterFlow] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterFlow) params.set("flow", filterFlow);
      if (filterStatus) params.set("status", filterStatus);

      const [txRes, modRes] = await Promise.all([
        authFetch(`${API}/super-agent/transactions?${params}`).then(r => r.json()),
        authFetch(`${API}/super-agent/cross-module`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list_modules" }),
        }).then(r => r.json()).catch(() => ({ result: "" })),
      ]);
      setTransactions(txRes.transactions || []);
      setStats(txRes.stats || []);
      const modLines = (modRes.result || "").match(/\*\*(\w+)\*\*/g) || [];
      setModules(modLines.map((m: string) => m.replace(/\*\*/g, "")));
    } catch {
      setTransactions([]);
      setStats([]);
    }
    setLoading(false);
  }, [filterFlow, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const executeFlow = async () => {
    if (!selectedFlow) return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const params: Record<string, any> = {};
      const meta = FLOW_META[selectedFlow];
      if (meta) {
        meta.params.forEach(p => {
          const val = flowParams[p.key];
          if (val) params[p.key] = p.type === "number" ? Number(val) : val;
        });
      }
      const res = await authFetch(`${API}/super-agent/cross-module`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flow", flow: selectedFlow, params }),
      });
      const data = await res.json();
      setExecuteResult(data.result || data.error || JSON.stringify(data));
      loadData();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    } catch (e: any) {
      setExecuteResult(`שגיאה: ${e.message}`);
    }
    setExecuting(false);
  };

  const totalCompleted = stats.filter(s => s.status === "completed").reduce((a, s) => a + s.cnt, 0);
  const totalFailed = stats.filter(s => s.status === "failed").reduce((a, s) => a + s.cnt, 0);
  const totalAll = totalCompleted + totalFailed;
  const successRate = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 100;
  const avgMs = stats.length > 0
    ? Math.round(stats.reduce((a, s) => a + (s.avg_ms || 0) * s.cnt, 0) / Math.max(totalAll, 1))
    : 0;

  const uniqueFlows = [...new Set(stats.map(s => s.flow_name))];

  const tabs = [
    { id: "overview" as const, label: "סקירה כללית", icon: BarChart3 },
    { id: "flows" as const, label: "תהליכים עסקיים", icon: GitBranch },
    { id: "execute" as const, label: "הפעלת תהליך", icon: Play },
    { id: "history" as const, label: "היסטוריית עסקאות", icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center gap-4 mb-6">
          <Link href="/ai-engine">
            <button className="p-2 rounded-lg bg-muted/60 hover:bg-muted/60 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/30">
                <Network className="w-6 h-6 text-purple-400" />
              </div>
              <span className="bg-gradient-to-l from-purple-400 to-violet-500 bg-clip-text text-transparent">
                Super Agent — מנוע Cross-Module
              </span>
            </h1>
            <p className="text-gray-400 text-sm mt-1 mr-14">
              ניהול, הפעלה ומעקב אחר תהליכים עסקיים בין {modules.length || 23} מודולים
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 transition"
            title="רענון"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard icon={<Layers className="w-5 h-5 text-purple-400" />} label="מודולים" value={String(modules.length || 23)} bg="bg-purple-500/10" />
          <StatCard icon={<GitBranch className="w-5 h-5 text-blue-400" />} label="תהליכים" value="9" bg="bg-blue-500/10" />
          <StatCard icon={<Activity className="w-5 h-5 text-cyan-400" />} label="עסקאות" value={String(totalAll)} bg="bg-cyan-500/10" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} label="אחוז הצלחה" value={`${successRate}%`} bg="bg-emerald-500/10" />
          <StatCard icon={<Zap className="w-5 h-5 text-amber-400" />} label="ממוצע ביצוע" value={`${avgMs}ms`} bg="bg-amber-500/10" />
        </div>

        <div className="flex gap-1 mb-6 bg-muted/30 rounded-xl p-1 border border-border/40">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition flex-1 justify-center ${
                activeTab === tab.id
                  ? "bg-purple-600/30 text-purple-300 border border-purple-500/30"
                  : "text-gray-400 hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="bg-muted/30 border border-border/40 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                סטטיסטיקות לפי תהליך
              </h3>
              {uniqueFlows.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">אין עסקאות עדיין — הפעל תהליך כדי לראות סטטיסטיקות</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uniqueFlows.map(flow => {
                    const meta = FLOW_META[flow];
                    const completed = stats.find(s => s.flow_name === flow && s.status === "completed");
                    const failed = stats.find(s => s.flow_name === flow && s.status === "failed");
                    const total = (completed?.cnt || 0) + (failed?.cnt || 0);
                    const rate = total > 0 ? Math.round(((completed?.cnt || 0) / total) * 100) : 0;
                    return (
                      <div key={flow} className={`bg-gradient-to-br ${meta?.color || "from-gray-700/20 to-gray-800/20"} border border-border/30 rounded-xl p-4`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{meta?.icon || "🔄"}</span>
                          <span className="text-sm font-medium text-foreground">{meta?.label || flow}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-emerald-400">הצליחו: {completed?.cnt || 0}</span>
                          {(failed?.cnt || 0) > 0 && <span className="text-red-400">נכשלו: {failed?.cnt}</span>}
                          <span className="text-gray-500">ממוצע: {completed?.avg_ms || 0}ms</span>
                          <span className="mr-auto text-gray-400">{rate}%</span>
                        </div>
                        <div className="mt-2 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-muted/30 border border-border/40 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                מודולים מחוברים ({modules.length || 23})
              </h3>
              <div className="flex flex-wrap gap-2">
                {(modules.length > 0 ? modules : ["sales","finance","procurement","inventory","production","hr","projects","crm","marketing","import_export","maintenance","quality","documents","strategy","supply_chain","platform","portal","analytics","product_dev","pricing","calendar","integrations","ai_engine"]).map(m => (
                  <span key={m} className="px-3 py-1.5 bg-muted/30 border border-border/30 rounded-lg text-xs text-gray-300 hover:border-cyan-500/40 transition cursor-default">
                    <Database className="w-3 h-3 inline ml-1 text-cyan-400/60" />
                    {m}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-muted/30 border border-border/40 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                עסקאות אחרונות
              </h3>
              {transactions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">אין עסקאות עדיין</p>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 5).map(tx => (
                    <TxRow key={tx.transaction_id} tx={tx} />
                  ))}
                  {transactions.length > 5 && (
                    <button onClick={() => setActiveTab("history")} className="text-sm text-purple-400 hover:text-purple-300 transition mt-2 block">
                      הצג את כל {transactions.length} העסקאות →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "flows" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(FLOW_META).map(([key, flow]) => {
              const completed = stats.find(s => s.flow_name === key && s.status === "completed");
              const failed = stats.find(s => s.flow_name === key && s.status === "failed");
              return (
                <div
                  key={key}
                  className={`bg-gradient-to-br ${flow.color} border border-border/30 rounded-xl p-5 hover:border-purple-500/40 transition cursor-pointer group`}
                  onClick={() => { setSelectedFlow(key); setFlowParams({}); setExecuteResult(null); setActiveTab("execute"); }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{flow.icon}</span>
                    <div>
                      <h3 className="font-semibold text-foreground">{flow.label}</h3>
                      <p className="text-xs text-gray-400">{flow.from} → {flow.to}</p>
                    </div>
                    <Play className="w-5 h-5 text-gray-500 group-hover:text-purple-400 mr-auto transition" />
                  </div>
                  <div className="text-xs text-gray-500">
                    <code className="bg-muted/50 px-2 py-0.5 rounded">{key}</code>
                  </div>
                  <div className="flex gap-3 mt-3 text-xs">
                    <span className="text-emerald-400">{completed?.cnt || 0} הצליחו</span>
                    {(failed?.cnt || 0) > 0 && <span className="text-red-400">{failed?.cnt} נכשלו</span>}
                    {completed && <span className="text-gray-500">ממוצע {completed.avg_ms}ms</span>}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    פרמטרים: {flow.params.map(p => p.label).join(", ")}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "execute" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-muted/30 border border-border/40 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-400" />
                הפעלת תהליך Cross-Module
              </h3>

              <div className="mb-4">
                <label className="text-sm text-gray-400 mb-2 block">בחר תהליך</label>
                <select
                  value={selectedFlow}
                  onChange={e => { setSelectedFlow(e.target.value); setFlowParams({}); setExecuteResult(null); }}
                  className="w-full bg-muted/60 border border-border/50 rounded-lg px-4 py-3 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition"
                >
                  <option value="">— בחר תהליך —</option>
                  {Object.entries(FLOW_META).map(([key, flow]) => (
                    <option key={key} value={key}>{flow.icon} {flow.label} ({flow.from} → {flow.to})</option>
                  ))}
                </select>
              </div>

              {selectedFlow && FLOW_META[selectedFlow] && (
                <div className="space-y-3 mb-5">
                  {FLOW_META[selectedFlow].params.map(p => (
                    <div key={p.key}>
                      <label className="text-sm text-gray-400 mb-1 block">{p.label}</label>
                      {p.type === "select" ? (
                        <select
                          value={flowParams[p.key] || ""}
                          onChange={e => setFlowParams({ ...flowParams, [p.key]: e.target.value })}
                          className="w-full bg-muted/60 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500/50"
                        >
                          <option value="">— בחר —</option>
                          {PAYMENT_METHODS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={p.type}
                          value={flowParams[p.key] || ""}
                          onChange={e => setFlowParams({ ...flowParams, [p.key]: e.target.value })}
                          placeholder={p.label}
                          className="w-full bg-muted/60 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={executeFlow}
                disabled={!selectedFlow || executing}
                className="w-full py-3 rounded-lg bg-gradient-to-l from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-foreground font-medium flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {executing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    מבצע...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    הפעל תהליך
                  </>
                )}
              </button>
            </div>

            {executeResult && (
              <div ref={resultRef} className="bg-muted/30 border border-border/40 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  תוצאה
                </h4>
                <div className="bg-background/50 rounded-lg p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed" dir="rtl">
                  {executeResult.split("\n").map((line, i) => {
                    const cleaned = line.replace(/\*\*/g, "");
                    if (cleaned.startsWith("✅")) return <div key={i} className="text-emerald-400">{cleaned}</div>;
                    if (cleaned.startsWith("❌")) return <div key={i} className="text-red-400">{cleaned}</div>;
                    if (cleaned.startsWith("⚠️")) return <div key={i} className="text-amber-400">{cleaned}</div>;
                    if (cleaned.startsWith("📋")) return <div key={i} className="text-cyan-400 text-xs mt-2">{cleaned}</div>;
                    return <div key={i}>{cleaned}</div>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="חיפוש לפי TX-ID..."
                  value={filterFlow === "__search" ? "" : ""}
                  onChange={() => {}}
                  className="w-full bg-muted/60 border border-border/50 rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-purple-500/50 focus:outline-none"
                />
              </div>
              <select
                value={filterFlow}
                onChange={e => setFilterFlow(e.target.value)}
                className="bg-muted/60 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-purple-500/50"
              >
                <option value="">כל התהליכים</option>
                {Object.entries(FLOW_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-muted/60 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-purple-500/50"
              >
                <option value="">כל הסטטוסים</option>
                <option value="completed">הצליח</option>
                <option value="failed">נכשל</option>
              </select>
            </div>

            <div className="bg-muted/30 border border-border/40 rounded-xl overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-gray-500">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-purple-400" />
                  <p>טוען עסקאות...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Zap className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p>אין עסקאות להצגה</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700/30">
                  {transactions.map(tx => {
                    const isExpanded = expandedTx === tx.transaction_id;
                    return (
                      <div key={tx.transaction_id}>
                        <div
                          className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 cursor-pointer transition"
                          onClick={() => setExpandedTx(isExpanded ? null : tx.transaction_id)}
                        >
                          {tx.status === "completed" ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs text-purple-400 font-mono">{tx.transaction_id}</code>
                              <span className="text-xs bg-muted/60 text-gray-300 px-2 py-0.5 rounded">
                                {FLOW_META[tx.flow_name]?.icon} {FLOW_META[tx.flow_name]?.label || tx.flow_name}
                              </span>
                              {tx.amount && (
                                <span className="text-xs text-amber-400 font-medium">
                                  {"\u20AA"}{Number(tx.amount).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {tx.from_module} → {tx.to_module} | {tx.duration_ms}ms
                            </div>
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">
                            {new Date(tx.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
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
                                <div className="text-xs text-gray-300 bg-muted/50 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap">
                                  {tx.error_message ? (
                                    <span className="text-red-400">{tx.error_message}</span>
                                  ) : (
                                    tx.result_summary?.replace(/\*\*/g, "").substring(0, 500) || "—"
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
                              {tx.source_entity_id && <span>מקור: #{tx.source_entity_id}</span>}
                              {tx.target_entity_id && <span>יעד: #{tx.target_entity_id}</span>}
                              <span>זמן: {new Date(tx.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
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
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bg}`}>{icon}</div>
        <div>
          <p className="text-gray-400 text-xs">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const meta = FLOW_META[tx.flow_name];
  return (
    <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-4 py-2.5">
      {tx.status === "completed" ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
      )}
      <span className="text-sm">{meta?.icon}</span>
      <span className="text-sm text-foreground">{meta?.label || tx.flow_name}</span>
      <code className="text-xs text-gray-500 font-mono">{tx.transaction_id}</code>
      {tx.amount && <span className="text-xs text-amber-400">{"\u20AA"}{Number(tx.amount).toLocaleString()}</span>}
      <span className="mr-auto text-xs text-gray-500">
        {new Date(tx.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-xs text-gray-600">{tx.duration_ms}ms</span>
    </div>
  );
}