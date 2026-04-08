import { useState, useCallback, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Loader2,
  RefreshCw, Server, Database, Mail, HardDrive, Brain,
  Workflow, Plug, Clock, Wifi, WifiOff, ChevronDown,
  ChevronUp, Wrench, Zap, HeartPulse, Globe,
} from "lucide-react";

const API = "/api";

interface ServiceResult {
  name: string;
  status: "ok" | "error" | "warning";
  message: string;
  latencyMs: number;
  lastChecked: string;
  configured?: boolean;
  account?: string;
  path?: string;
  writable?: boolean;
  subfolders?: string[];
  modelsAvailable?: number;
  workflows?: number;
  activeWorkflows?: number;
}

interface HubStatus {
  overallHealth: "healthy" | "degraded" | "warning";
  scannedAt: string;
  durationMs: number;
  system: ServiceResult[];
  n8n: any;
  summary: {
    total: number;
    healthy: number;
    broken: number;
    skipped: number;
    fixesApplied: number;
  };
  connections: any[];
  fixes: any[];
}

const SERVICE_ICON: Record<string, any> = {
  "ERP API Server": Server,
  "PostgreSQL Database": Database,
  "Email (SMTP/Gmail)": Mail,
  "Storage (Uploads)": HardDrive,
  "Google AI (Gemini)": Brain,
  "n8n Workflow Engine": Workflow,
};

function StatusBadge({ status }: { status: "ok" | "error" | "warning" }) {
  if (status === "ok") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
      <CheckCircle2 className="w-3.5 h-3.5" /> תקין
    </span>
  );
  if (status === "warning") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
      <AlertTriangle className="w-3.5 h-3.5" /> לא מוגדר
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
      <XCircle className="w-3.5 h-3.5" /> שגיאה
    </span>
  );
}

function LatencyIndicator({ ms }: { ms: number }) {
  const color = ms === 0 ? "text-gray-500" : ms < 100 ? "text-green-400" : ms < 500 ? "text-yellow-400" : "text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <Clock className="w-3 h-3" />
      {ms}ms
    </span>
  );
}

function ServiceCard({ svc, onTest }: { svc: ServiceResult; onTest: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const Icon = SERVICE_ICON[svc.name] || Plug;

  const handleTest = async () => {
    setTesting(true);
    await onTest();
    setTesting(false);
  };

  return (
    <div className={`rounded-xl border transition-all ${
      svc.status === "ok" ? "border-green-500/30 bg-green-500/5" :
      svc.status === "warning" ? "border-yellow-500/30 bg-yellow-500/5" :
      "border-red-500/30 bg-red-500/5"
    }`}>
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${
            svc.status === "ok" ? "bg-green-500/20 text-green-400" :
            svc.status === "warning" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-red-500/20 text-red-400"
          }`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{svc.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{svc.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LatencyIndicator ms={svc.latencyMs} />
          <StatusBadge status={svc.status} />
          <button
            onClick={(e) => { e.stopPropagation(); handleTest(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            disabled={testing}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-gray-500">{"סטטוס"}</div>
            <div className="text-white font-mono">{svc.status}</div>
            <div className="text-gray-500">{"זמן תגובה"}</div>
            <div className="text-white font-mono">{svc.latencyMs}ms</div>
            <div className="text-gray-500">{"בדיקה אחרונה"}</div>
            <div className="text-white font-mono text-[11px]">{new Date(svc.lastChecked).toLocaleString("he-IL")}</div>
            {svc.account && <>
              <div className="text-gray-500">{"חשבון"}</div>
              <div className="text-white font-mono">{svc.account}</div>
            </>}
            {svc.path && <>
              <div className="text-gray-500">{"נתיב"}</div>
              <div className="text-white font-mono text-[11px] break-all">{svc.path}</div>
            </>}
            {svc.subfolders && svc.subfolders.length > 0 && <>
              <div className="text-gray-500">{"תתי-תיקיות"}</div>
              <div className="text-white font-mono">{svc.subfolders.join(", ")}</div>
            </>}
            {svc.modelsAvailable !== undefined && <>
              <div className="text-gray-500">{"מודלים זמינים"}</div>
              <div className="text-white font-mono">{svc.modelsAvailable}</div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

interface ConnectAllResult {
  ok: boolean;
  message: string;
  durationMs: number;
  connectedAt: string;
  summary: { total: number; connected: number; warnings: number; errors: number; fixesApplied: number };
  services: ServiceResult[];
  connections: ServiceResult[];
  fixes: any[];
}

export default function ApiHubPage() {
  const [hubStatus, setHubStatus] = useState<HubStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<ConnectAllResult | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/hub/status`);
      if (r.ok) {
        const data = await r.json();
        setHubStatus(data);
        if (data.n8n?.webhookUrl && !webhookUrl) {
          setWebhookUrl(data.n8n.webhookUrl);
        }
        setLastScan(new Date().toLocaleString("he-IL"));
      }
    } catch (e) {
      console.error("Hub status fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const testService = useCallback(async (serviceName: string) => {
    const alias = serviceName.includes("ERP") ? "erp" :
      serviceName.includes("PostgreSQL") ? "db" :
      serviceName.includes("Storage") ? "storage" :
      serviceName.includes("Email") ? "email" :
      serviceName.includes("Gemini") ? "gemini" :
      serviceName.includes("n8n") ? "n8n" : serviceName;
    try {
      const r = await authFetch(`${API}/hub/test/${encodeURIComponent(alias)}`);
      if (r.ok) {
        const result = await r.json();
        setHubStatus(prev => {
          if (!prev) return prev;
          const newSystem = prev.system.map(s =>
            s.name === result.name ? { ...s, ...result } : s
          );
          return { ...prev, system: newSystem };
        });
      }
    } catch (e) {
      console.error("Test failed:", e);
    }
  }, []);

  const connectAll = useCallback(async () => {
    setConnecting(true);
    setConnectResult(null);
    try {
      const r = await authFetch(`${API}/hub/connect-all`, { method: "POST" });
      if (r.ok) {
        const data = await r.json();
        setConnectResult(data);
        await fetchStatus();
      }
    } catch (e) {
      console.error("Connect-all failed:", e);
    } finally {
      setConnecting(false);
    }
  }, [fetchStatus]);

  const saveWebhook = useCallback(async () => {
    if (!webhookUrl.trim()) return;
    setWebhookSaving(true);
    setWebhookMsg(null);
    try {
      const r = await authFetch(`${API}/hub/n8n/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
      });
      const data = await r.json();
      setWebhookMsg({ ok: data.ok, text: data.ok ? "Webhook נשמר בהצלחה!" : (data.error || "שגיאה בשמירה") });
      if (data.ok) await fetchStatus();
    } catch (e) {
      setWebhookMsg({ ok: false, text: "שגיאה בשמירה" });
    } finally {
      setWebhookSaving(false);
    }
  }, [webhookUrl, fetchStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  const okCount = hubStatus?.system.filter(s => s.status === "ok").length ?? 0;
  const warnCount = hubStatus?.system.filter(s => s.status === "warning").length ?? 0;
  const errCount = hubStatus?.system.filter(s => s.status === "error").length ?? 0;
  const totalSystem = hubStatus?.system.length ?? 0;

  const overallColor = hubStatus?.overallHealth === "healthy" ? "from-green-500 to-emerald-600" :
    hubStatus?.overallHealth === "degraded" ? "from-red-500 to-rose-600" : "from-yellow-500 to-amber-600";
  const overallText = hubStatus?.overallHealth === "healthy" ? "כל המערכות תקינות" :
    hubStatus?.overallHealth === "degraded" ? "יש שירותים תקולים" : "יש שירותים לא מוגדרים";
  const overallIcon = hubStatus?.overallHealth === "healthy" ? CheckCircle2 :
    hubStatus?.overallHealth === "degraded" ? XCircle : AlertTriangle;
  const OverallIcon = overallIcon;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
              <Activity className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{"API Hub — מרכז בקרה"}</h1>
              <p className="text-sm text-gray-400">{"מצב כל השירותים והחיבורים במערכת"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                autoRefresh ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
              }`}
            >
              <HeartPulse className="w-4 h-4" />
              {autoRefresh ? "רענון אוטומטי פעיל" : "רענון אוטומטי"}
            </button>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-l from-blue-500 to-purple-600 text-white font-medium text-sm hover:brightness-110 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {"סרוק הכל"}
            </button>
            <button
              onClick={connectAll}
              disabled={connecting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-l from-green-500 to-emerald-600 text-white font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-green-500/20"
            >
              {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plug className="w-5 h-5" />}
              {"🔌 חבר הכל"}
            </button>
          </div>
        </div>

        {hubStatus && (
          <div className={`rounded-2xl bg-gradient-to-l ${overallColor} p-[1px]`}>
            <div className="rounded-2xl bg-[#0a0a1a]/90 p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <OverallIcon className="w-8 h-8" />
                <div>
                  <h2 className="text-lg font-bold">{overallText}</h2>
                  <p className="text-sm text-gray-300">
                    {"סריקה הושלמה ב-"}{hubStatus.durationMs}ms
                    {lastScan && <> • {"עדכון אחרון: "}{lastScan}</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{okCount}</div>
                  <div className="text-xs text-gray-400">{"תקינים"}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{warnCount}</div>
                  <div className="text-xs text-gray-400">{"אזהרות"}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">{errCount}</div>
                  <div className="text-xs text-gray-400">{"שגיאות"}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {connectResult && (
          <div className={`rounded-2xl p-[1px] bg-gradient-to-l ${connectResult.ok ? "from-green-500 to-emerald-600" : "from-red-500 to-rose-600"}`}>
            <div className="rounded-2xl bg-[#0a0a1a]/90 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Plug className="w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold">{connectResult.ok ? "🔌 כל החיבורים הצליחו!" : "🔌 חיבור חלקי"}</h3>
                    <p className="text-sm text-gray-300">{connectResult.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-400 font-bold">{connectResult.summary.connected} {"מחוברים"}</span>
                  {connectResult.summary.warnings > 0 && <span className="text-yellow-400">{connectResult.summary.warnings} {"אזהרות"}</span>}
                  {connectResult.summary.errors > 0 && <span className="text-red-400">{connectResult.summary.errors} {"שגיאות"}</span>}
                  {connectResult.summary.fixesApplied > 0 && <span className="text-blue-400">{connectResult.summary.fixesApplied} {"תיקונים אוטומטיים"}</span>}
                  <span className="text-gray-500">{connectResult.durationMs}ms</span>
                </div>
              </div>
              {connectResult.fixes.length > 0 && (
                <div className="mt-3 border-t border-gray-700 pt-3 space-y-1">
                  <div className="text-xs text-gray-400 font-bold mb-1">{"פעולות שבוצעו:"}</div>
                  {connectResult.fixes.map((fix: any, i: number) => (
                    <div key={i} className={`text-xs flex items-center gap-2 ${fix.severity === "error" ? "text-red-400" : "text-green-400"}`}>
                      {fix.severity === "error" ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      <span className="font-mono">{fix.name}</span> — {fix.action}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {loading && !hubStatus && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
            <p className="text-gray-400">{"סורק את כל השירותים..."}</p>
          </div>
        )}

        {hubStatus && (
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto space-y-6 pr-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 sticky top-0 bg-[#0a0a1a] z-10 py-1">
                <Server className="w-5 h-5 text-blue-400" />
                {"שירותי מערכת"}
                <span className="text-xs text-gray-500 font-normal">({totalSystem})</span>
              </h2>
              <div className="grid gap-3">
                {hubStatus.system.map((svc) => (
                  <ServiceCard key={svc.name} svc={svc} onTest={() => testService(svc.name)} />
                ))}
              </div>
            </div>

            {hubStatus.n8n && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-purple-400" />
                  {"n8n Workflow Engine"}
                </h2>
                <div className={`rounded-xl border p-4 ${
                  hubStatus.n8n.ok ? "border-green-500/30 bg-green-500/5" :
                  !hubStatus.n8n.configured ? "border-yellow-500/30 bg-yellow-500/5" :
                  "border-red-500/30 bg-red-500/5"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${
                        hubStatus.n8n.ok ? "bg-green-500/20 text-green-400" :
                        !hubStatus.n8n.configured ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>
                        <Workflow className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{hubStatus.n8n.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {hubStatus.n8n.ok
                            ? `${hubStatus.n8n.workflows || 0} workflows (${hubStatus.n8n.activeWorkflows || 0} פעילים)`
                            : (hubStatus.n8n.error || "לא זמין")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {hubStatus.n8n.latencyMs !== undefined && <LatencyIndicator ms={hubStatus.n8n.latencyMs} />}
                      <StatusBadge status={hubStatus.n8n.ok ? "ok" : (!hubStatus.n8n.configured ? "warning" : "error")} />
                      <button
                        onClick={() => testService("n8n")}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-gray-700/50 bg-[#0d0d20] p-3">
                  <label className="text-xs text-gray-400 block mb-1.5">{"Webhook URL"}</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => { setWebhookUrl(e.target.value); setWebhookMsg(null); }}
                      placeholder="https://n8n.example.com/webhook/..."
                      className="flex-1 bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
                      dir="ltr"
                    />
                    <button
                      onClick={saveWebhook}
                      disabled={webhookSaving || !webhookUrl.trim()}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {webhookSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {"שמור"}
                    </button>
                  </div>
                  {webhookMsg && (
                    <p className={`text-xs mt-1.5 ${webhookMsg.ok ? "text-green-400" : "text-red-400"}`}>
                      {webhookMsg.ok ? <CheckCircle2 className="w-3 h-3 inline ml-1" /> : <XCircle className="w-3 h-3 inline ml-1" />}
                      {" "}{webhookMsg.text}
                    </p>
                  )}
                </div>
              </div>
            )}

            {hubStatus.connections.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  {"חיבורי API חיצוניים"}
                  <span className="text-xs text-gray-500 font-normal">({hubStatus.connections.length})</span>
                </h2>
                <div className="grid gap-3">
                  {hubStatus.connections.map((conn: any) => (
                    <div key={conn.id} className={`rounded-xl border p-4 flex items-center justify-between ${
                      conn.ok ? "border-green-500/30 bg-green-500/5" :
                      conn.skipped ? "border-gray-500/30 bg-gray-500/5" :
                      "border-red-500/30 bg-red-500/5"
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${conn.ok ? "bg-green-500/20 text-green-400" : conn.skipped ? "bg-gray-500/20 text-gray-400" : "bg-red-500/20 text-red-400"}`}>
                          {conn.ok ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{conn.name}</h3>
                          <p className="text-xs text-gray-400">{conn.url || conn.reason || conn.error}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {conn.latencyMs !== undefined && <LatencyIndicator ms={conn.latencyMs} />}
                        <StatusBadge status={conn.ok ? "ok" : (conn.skipped ? "warning" : "error")} />
                        {conn.fixed && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            <Wrench className="w-3 h-3" /> {conn.fixed}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hubStatus.fixes.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-amber-400" />
                  {"תיקונים שבוצעו"}
                </h2>
                <div className="space-y-2">
                  {hubStatus.fixes.map((fix: any, i: number) => (
                    <div key={i} className={`rounded-lg border p-3 flex items-center gap-3 ${
                      fix.severity === "error" ? "border-red-500/30 bg-red-500/5" :
                      "border-green-500/30 bg-green-500/5"
                    }`}>
                      {fix.severity === "error" ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                      <div>
                        <span className="text-sm font-medium text-white">{fix.name}</span>
                        <span className="text-xs text-gray-400 mr-2"> — {fix.action}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hubStatus.summary.total === 0 && hubStatus.connections.length === 0 && (
              <div className="text-center py-10 text-gray-500">
                <Plug className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{"אין חיבורי API חיצוניים"}</p>
                <p className="text-sm mt-1">{"הוסף חיבורים דרך Smart API Connection Hub"}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
