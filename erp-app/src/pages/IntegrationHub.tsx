import { useState, useCallback, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Loader2,
  RefreshCw, Server, Database, Mail, HardDrive, Brain,
  Workflow, Plug, Clock, Wifi, WifiOff, ChevronDown,
  ChevronUp, Wrench, Zap, HeartPulse, Globe, Send, Bot,
  Shield, ArrowUpRight, History, Inbox, Copy, Eye, EyeOff,
  Plus, Trash2, Edit3, TestTube, Link2, Cpu,
} from "lucide-react";

const API = "/api";

interface ServiceResult {
  name: string;
  status: "ok" | "error" | "warning";
  message: string;
  latencyMs?: number;
  lastChecked?: string;
  id?: number;
  type?: string;
  category?: string;
  configured?: boolean;
}

interface HubStatus {
  overallHealth: "healthy" | "warning" | "degraded";
  summary: { total: number; connected: number; warnings: number; errors: number };
  durationMs: number;
  system: ServiceResult[];
  integrations: ServiceResult[];
  webhooks: any[];
  recentEvents: any[];
  recentFixes: any[];
  webhookUrl?: string;
}

interface ConnectResult {
  ok: boolean;
  message: string;
  durationMs: number;
  summary: { total: number; connected: number; warnings: number; errors: number; fixesApplied: number };
  system: ServiceResult[];
  integrations: ServiceResult[];
  fixes: any[];
  webhookSent: boolean;
  webhookUrl: string | null;
  webhookStatusCode: number | null;
  webhookLatencyMs: number | null;
  webhookResponse: any;
  webhookError: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "ok" ? "bg-green-500/20 text-green-400 border-green-500/30" :
    status === "warning" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";
  const label = status === "ok" ? "\u05EA\u05E7\u05D9\u05DF" : status === "warning" ? "\u05DC\u05D0 \u05DE\u05D5\u05D2\u05D3\u05E8" : "\u05E9\u05D2\u05D9\u05D0\u05D4";
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
    {status === "ok" ? <CheckCircle2 className="w-3 h-3" /> : status === "warning" ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
    {label}
  </span>;
}

function LatencyBadge({ ms }: { ms?: number }) {
  if (ms === undefined) return null;
  const color = ms < 100 ? "text-green-400" : ms < 500 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs ${color} flex items-center gap-1`}><Clock className="w-3 h-3" />{ms}ms</span>;
}

function ServiceCard({ svc, onTest }: { svc: ServiceResult; onTest: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const icon = svc.name.includes("ERP") ? Server : svc.name.includes("PostgreSQL") ? Database :
    svc.name.includes("Storage") ? HardDrive : svc.name.includes("Email") ? Mail :
    svc.name.includes("Gemini") ? Brain : svc.name.includes("n8n") ? Workflow : Globe;
  const Icon = icon;
  const borderColor = svc.status === "ok" ? "border-green-500/30 bg-green-500/5" :
    svc.status === "warning" ? "border-yellow-500/30 bg-yellow-500/5" : "border-red-500/30 bg-red-500/5";

  return (
    <div className={`rounded-xl border p-4 transition-all ${borderColor}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${svc.status === "ok" ? "bg-green-500/20 text-green-400" : svc.status === "warning" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{svc.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{svc.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LatencyBadge ms={svc.latencyMs} />
          <StatusBadge status={svc.status} />
          <button onClick={(e) => { e.stopPropagation(); onTest(); }} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-500">{"\u05E1\u05D8\u05D8\u05D5\u05E1"}</div>
          <div className={svc.status === "ok" ? "text-green-400" : svc.status === "warning" ? "text-yellow-400" : "text-red-400"}>{svc.status}</div>
          {svc.lastChecked && <>
            <div className="text-gray-500">{"\u05D1\u05D3\u05D9\u05E7\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D4"}</div>
            <div className="text-white font-mono text-[10px]">{new Date(svc.lastChecked).toLocaleString("he-IL")}</div>
          </>}
          {svc.type && <>
            <div className="text-gray-500">{"\u05E1\u05D5\u05D2"}</div>
            <div className="text-white">{svc.type}</div>
          </>}
          {svc.category && <>
            <div className="text-gray-500">{"\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4"}</div>
            <div className="text-white">{svc.category}</div>
          </>}
        </div>
      )}
    </div>
  );
}

export default function IntegrationHubPage() {
  const [hubStatus, setHubStatus] = useState<HubStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhookTestUrl, setWebhookTestUrl] = useState("");
  const [webhookSending, setWebhookSending] = useState(false);
  const [webhookSendResult, setWebhookSendResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "events" | "fixes" | "n8n" | "webhooks" | "mcp">("overview");
  const [incomingMessages, setIncomingMessages] = useState<any[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [expandedIncoming, setExpandedIncoming] = useState<Set<number>>(new Set());
  const [webhooksList, setWebhooksList] = useState<any[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: "", url: "", event_type: "*", secret: "" });
  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [newMcp, setNewMcp] = useState({ name: "", url: "", type: "custom-mcp" });
  const [webhookLogs, setWebhookLogs] = useState<{ webhookId: number; webhookName: string; logs: any[] } | null>(null);
  const [webhookLogsLoading, setWebhookLogsLoading] = useState(false);
  const [n8nConfig, setN8nConfig] = useState<any>(null);
  const [n8nLoading, setN8nLoading] = useState(false);
  const [n8nForm, setN8nForm] = useState({ url: "", apiKey: "", webhookUrl: "", incomingSecret: "" });
  const [n8nSaving, setN8nSaving] = useState(false);
  const [n8nWorkflows, setN8nWorkflows] = useState<any[]>([]);
  const [n8nExecs, setN8nExecs] = useState<any[]>([]);
  const [n8nEventMap, setN8nEventMap] = useState<any[]>([]);
  const [n8nSubTab, setN8nSubTab] = useState<"config" | "workflows" | "executions" | "events" | "incoming">("config");
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [mcpTryTool, setMcpTryTool] = useState("");
  const [mcpTryParams, setMcpTryParams] = useState("{}");
  const [mcpTryResult, setMcpTryResult] = useState<any>(null);
  const [mcpTryLoading, setMcpTryLoading] = useState(false);
  const [mcpCalls, setMcpCalls] = useState<any[]>([]);
  const [connectProgress, setConnectProgress] = useState<{ step: string; pct: number } | null>(null);
  const [eventLog, setEventLog] = useState<any[]>([]);
  const [aiProblem, setAiProblem] = useState("");
  const [aiDiagnosing, setAiDiagnosing] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<any>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/integration-hub/status`);
      if (r.ok) {
        const data = await r.json();
        setHubStatus(data);
        if (data.webhookUrl && !webhookUrl) setWebhookUrl(data.webhookUrl);
      }
    } catch (e) { console.error("Integration Hub status failed:", e); }
    finally { setLoading(false); }
  }, [webhookUrl]);

  const connectAllFix = useCallback(async () => {
    setConnecting(true);
    setConnectResult(null);
    setConnectProgress({ step: "בודק חיבורים...", pct: 10 });
    try {
      setConnectProgress({ step: "מתחבר לשירותים...", pct: 30 });
      const r = await authFetch(`${API}/integration-hub/connect-all-fix`, { method: "POST" });
      setConnectProgress({ step: "מנתח תוצאות...", pct: 70 });
      if (r.ok) {
        const data = await r.json();
        setConnectResult(data);
        setConnectProgress({ step: "מעדכן סטטוס...", pct: 90 });
        await fetchStatus();
        setConnectProgress({ step: "הושלם!", pct: 100 });
        setTimeout(() => setConnectProgress(null), 2000);
      }
    } catch (e) { console.error("Connect-all-fix failed:", e); setConnectProgress(null); }
    finally { setConnecting(false); }
  }, [fetchStatus]);

  const fetchMcpTools = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/integration-hub/mcp/tools`);
      if (r.ok) { const d = await r.json(); setMcpTools(d.tools || []); }
    } catch {}
  }, []);

  const executeMcpTool = useCallback(async () => {
    if (!mcpTryTool) return;
    setMcpTryLoading(true); setMcpTryResult(null);
    try {
      let params = {};
      try { params = JSON.parse(mcpTryParams); } catch { }
      const r = await authFetch(`${API}/integration-hub/mcp/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: mcpTryTool, params }),
      });
      const d = await r.json();
      setMcpTryResult(d);
    } catch (e: any) { setMcpTryResult({ ok: false, error: e.message }); }
    finally { setMcpTryLoading(false); }
  }, [mcpTryTool, mcpTryParams]);

  const fetchMcpCalls = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/integration-hub/mcp/calls`);
      if (r.ok) { const d = await r.json(); setMcpCalls(d.calls || []); }
    } catch {}
  }, []);

  const fetchEventLog = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/integration-hub/events`);
      if (r.ok) { const d = await r.json(); setEventLog(Array.isArray(d) ? d : d.events || []); }
    } catch {}
  }, []);

  const diagnoseAi = useCallback(async () => {
    if (!aiProblem.trim()) return;
    setAiDiagnosing(true); setAiDiagnosis(null);
    try {
      const r = await authFetch(`${API}/integrations/ai/diagnose`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue: aiProblem.trim() }),
      });
      const d = await r.json();
      setAiDiagnosis(d);
    } catch (e: any) { setAiDiagnosis({ ok: false, error: e.message }); }
    finally { setAiDiagnosing(false); }
  }, [aiProblem]);

  const saveWebhook = useCallback(async () => {
    if (!webhookUrl.trim()) return;
    setWebhookSaving(true); setWebhookMsg(null);
    try {
      const r = await authFetch(`${API}/integration-hub/webhook/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
      });
      const d = await r.json();
      setWebhookMsg({ ok: d.ok, text: d.ok ? "Webhook \u05E0\u05E9\u05DE\u05E8 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4!" : (d.error || "\u05E9\u05D2\u05D9\u05D0\u05D4") });
    } catch { setWebhookMsg({ ok: false, text: "\u05E9\u05D2\u05D9\u05D0\u05D4" }); }
    finally { setWebhookSaving(false); }
  }, [webhookUrl]);

  const fetchIncoming = useCallback(async () => {
    setIncomingLoading(true);
    try {
      const r = await authFetch(`${API}/integration-hub/incoming?limit=50`);
      if (r.ok) setIncomingMessages(await r.json());
    } catch (e) { console.error("Incoming fetch failed:", e); }
    finally { setIncomingLoading(false); }
  }, []);

  const toggleIncomingExpand = useCallback((id: number) => {
    setExpandedIncoming(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const fetchN8nConfig = useCallback(async () => {
    setN8nLoading(true);
    try {
      const r = await authFetch(`${API}/integration-hub/n8n/config`);
      if (r.ok) {
        const d = await r.json();
        setN8nConfig(d);
        if (d.config?.url) setN8nForm(f => ({ ...f, url: f.url || d.config.url || "" }));
        if (d.config?.webhookUrl) setN8nForm(f => ({ ...f, webhookUrl: f.webhookUrl || d.config.webhookUrl || "" }));
        if (d.workflows) setN8nWorkflows(d.workflows);
      }
    } catch (e) { console.error("n8n config fetch failed:", e); }
    finally { setN8nLoading(false); }
  }, []);

  const saveN8nConfig = useCallback(async () => {
    setN8nSaving(true);
    try {
      const body: any = {};
      if (n8nForm.url) body.url = n8nForm.url.trim();
      if (n8nForm.apiKey) body.apiKey = n8nForm.apiKey.trim();
      if (n8nForm.webhookUrl) body.webhookUrl = n8nForm.webhookUrl.trim();
      if (n8nForm.incomingSecret) body.incomingSecret = n8nForm.incomingSecret.trim();
      await authFetch(`${API}/integration-hub/n8n/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setN8nForm(f => ({ ...f, apiKey: "" }));
      fetchN8nConfig();
    } catch (e) { console.error("n8n config save failed:", e); }
    finally { setN8nSaving(false); }
  }, [n8nForm, fetchN8nConfig]);

  const fetchN8nWorkflows = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/integration-hub/n8n/workflows`);
      if (r.ok) { const d = await r.json(); setN8nWorkflows(d.workflows || []); }
    } catch {}
  }, []);

  const fetchN8nExecs = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/integration-hub/n8n/executions?limit=20`);
      if (r.ok) { const d = await r.json(); setN8nExecs(d.executions || []); }
    } catch {}
  }, []);

  const fetchN8nEventMap = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/integration-hub/n8n/event-map`);
      if (r.ok) { const d = await r.json(); setN8nEventMap(d.mappings || []); }
    } catch {}
  }, []);

  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const r = await authFetch(`${API}/integration-hub/webhooks`);
      if (r.ok) setWebhooksList(await r.json());
    } catch (e) { console.error("Webhooks fetch failed:", e); }
    finally { setWebhooksLoading(false); }
  }, []);

  const addWebhook = useCallback(async () => {
    if (!newWebhook.name || !newWebhook.url) return;
    try {
      const r = await authFetch(`${API}/integration-hub/webhooks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWebhook),
      });
      if (r.ok) { setNewWebhook({ name: "", url: "", event_type: "*", secret: "" }); setShowAddWebhook(false); fetchWebhooks(); }
    } catch (e) { console.error("Add webhook failed:", e); }
  }, [newWebhook, fetchWebhooks]);

  const deleteWebhook = useCallback(async (id: number) => {
    try {
      await authFetch(`${API}/integration-hub/webhooks/${id}`, { method: "DELETE" });
      fetchWebhooks();
    } catch (e) { console.error("Delete webhook failed:", e); }
  }, [fetchWebhooks]);

  const testWebhookById = useCallback(async (id: number) => {
    try {
      const r = await authFetch(`${API}/integration-hub/webhooks/${id}/test`, { method: "POST" });
      const d = await r.json();
      alert(d.ok ? `Webhook sent! HTTP ${d.status} (${d.latencyMs}ms)` : `Failed: ${d.error || "error"}`);
      fetchWebhooks();
    } catch (e: any) { alert(e.message); }
  }, [fetchWebhooks]);

  const fetchMcpServers = useCallback(async () => {
    setMcpLoading(true);
    try {
      const r = await authFetch(`${API}/integration-hub/mcp/servers`);
      if (r.ok) { const d = await r.json(); setMcpServers(d.servers || []); }
    } catch (e) { console.error("MCP fetch failed:", e); }
    finally { setMcpLoading(false); }
  }, []);

  const addMcpServer = useCallback(async () => {
    if (!newMcp.name) return;
    try {
      const r = await authFetch(`${API}/integration-hub/mcp/servers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMcp),
      });
      if (r.ok) { setNewMcp({ name: "", url: "", type: "custom-mcp" }); setShowAddMcp(false); fetchMcpServers(); }
    } catch (e) { console.error("Add MCP failed:", e); }
  }, [newMcp, fetchMcpServers]);

  const fetchWebhookLogs = useCallback(async (id: number, name: string) => {
    setWebhookLogsLoading(true);
    try {
      const r = await authFetch(`${API}/integration-hub/webhooks/${id}/logs?limit=50`);
      if (r.ok) {
        const d = await r.json();
        setWebhookLogs({ webhookId: id, webhookName: name, logs: d.logs || [] });
      }
    } catch (e) { console.error("Webhook logs failed:", e); }
    finally { setWebhookLogsLoading(false); }
  }, []);

  const deleteMcpServer = useCallback(async (id: string) => {
    try {
      await authFetch(`${API}/integration-hub/mcp/servers/${id}`, { method: "DELETE" });
      fetchMcpServers();
    } catch (e) { console.error("Delete MCP failed:", e); }
  }, [fetchMcpServers]);

  const sendTestWebhook = useCallback(async () => {
    const url = webhookTestUrl.trim() || webhookUrl.trim();
    if (!url) return;
    setWebhookSending(true); setWebhookSendResult(null);
    try {
      const r = await authFetch(`${API}/integration-hub/webhook/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, payload: { event: "test_ping", system: "techno-kol-uzi", timestamp: new Date().toISOString() } }),
      });
      const d = await r.json();
      setWebhookSendResult(d);
    } catch (e: any) { setWebhookSendResult({ ok: false, error: e.message }); }
    finally { setWebhookSending(false); }
  }, [webhookTestUrl, webhookUrl]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  useEffect(() => {
    if (activeTab !== "events") return;
    fetchEventLog();
    const interval = setInterval(fetchEventLog, 5000);
    return () => clearInterval(interval);
  }, [activeTab, fetchEventLog]);

  const okCount = hubStatus?.summary.connected ?? 0;
  const warnCount = hubStatus?.summary.warnings ?? 0;
  const errCount = hubStatus?.summary.errors ?? 0;

  const overallColor = hubStatus?.overallHealth === "healthy" ? "from-green-500 to-emerald-600" :
    hubStatus?.overallHealth === "degraded" ? "from-red-500 to-rose-600" : "from-yellow-500 to-amber-600";

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{"Smart Integration Hub"}</h1>
              <p className="text-sm text-gray-400">{"Webhook Engine \u00B7 AI Auto-Fix \u00B7 MCP Bridge \u00B7 n8n Connector"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <HeartPulse className="w-4 h-4" />
              {"\u05E8\u05E2\u05E0\u05D5\u05DF \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9"}
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 bg-gray-700 peer-checked:bg-violet-600 rounded-full relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
            <button onClick={fetchStatus} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-l from-blue-500 to-purple-600 text-white font-medium text-sm hover:brightness-110 transition-all disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {"\u05E1\u05E8\u05D5\u05E7 \u05D4\u05DB\u05DC"}
            </button>
            <button onClick={connectAllFix} disabled={connecting} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-l from-green-500 to-emerald-600 text-white font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-green-500/20">
              {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
              {"\uD83E\uDD16 \u05D7\u05D1\u05E8 \u05D4\u05DB\u05DC \u05D5\u05EA\u05E7\u05DF"}
            </button>
          </div>
        </div>

        {connectResult && (
          <div className={`rounded-2xl p-[1px] bg-gradient-to-l ${connectResult.ok ? "from-green-500 to-emerald-600" : "from-red-500 to-rose-600"}`}>
            <div className="rounded-2xl bg-[#0a0a1a]/90 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Bot className="w-6 h-6" />
                  <div>
                    <h3 className="text-lg font-bold">{connectResult.ok ? "\uD83E\uDD16 \u05DB\u05DC \u05D4\u05D7\u05D9\u05D1\u05D5\u05E8\u05D9\u05DD \u05D4\u05E6\u05DC\u05D9\u05D7\u05D5!" : "\uD83E\uDD16 \u05D7\u05D9\u05D1\u05D5\u05E8 \u05D7\u05DC\u05E7\u05D9"}</h3>
                    <p className="text-sm text-gray-300">{connectResult.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-400 font-bold">{connectResult.summary.connected} {"\u05DE\u05D7\u05D5\u05D1\u05E8\u05D9\u05DD"}</span>
                  {connectResult.summary.warnings > 0 && <span className="text-yellow-400">{connectResult.summary.warnings} {"\u05D0\u05D6\u05D4\u05E8\u05D5\u05EA"}</span>}
                  {connectResult.summary.errors > 0 && <span className="text-red-400">{connectResult.summary.errors} {"\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA"}</span>}
                  {connectResult.summary.fixesApplied > 0 && <span className="text-blue-400"><Wrench className="w-3 h-3 inline" /> {connectResult.summary.fixesApplied} {"\u05EA\u05D9\u05E7\u05D5\u05E0\u05D9\u05DD"}</span>}
                  {connectResult.webhookSent && <span className="text-purple-400"><Send className="w-3 h-3 inline" /> Webhook {"\u05E0\u05E9\u05DC\u05D7"}</span>}
                  <span className="text-gray-500">{connectResult.durationMs}ms</span>
                </div>
              </div>
              {(connectResult.webhookSent || connectResult.webhookError) && (
                <div className={`mt-3 border-t border-gray-700 pt-3 ${connectResult.webhookSent ? "text-purple-300" : "text-red-400"}`}>
                  <div className="text-xs font-bold mb-1 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    {"Webhook n8n"}
                    {connectResult.webhookStatusCode && <span className="text-gray-400 font-normal">HTTP {connectResult.webhookStatusCode}</span>}
                    {connectResult.webhookLatencyMs && <span className="text-gray-400 font-normal">{connectResult.webhookLatencyMs}ms</span>}
                  </div>
                  {connectResult.webhookResponse && (
                    <pre className="bg-[#0a0a1a] rounded p-2 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all mt-1" dir="ltr">
                      {typeof connectResult.webhookResponse === "string"
                        ? connectResult.webhookResponse
                        : JSON.stringify(connectResult.webhookResponse, null, 2)}
                    </pre>
                  )}
                  {connectResult.webhookError && (
                    <div className="text-xs text-red-400 mt-1">{connectResult.webhookError}</div>
                  )}
                </div>
              )}
              {connectResult.fixes.length > 0 && (
                <div className="mt-3 border-t border-gray-700 pt-3 space-y-1">
                  <div className="text-xs text-gray-400 font-bold mb-1">{"\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA AI Auto-Fix:"}</div>
                  {connectResult.fixes.map((fix: any, i: number) => (
                    <div key={i} className={`text-xs flex items-center gap-2 ${fix.fixed ? "text-green-400" : "text-red-400"}`}>
                      {fix.fixed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span className="font-mono">{fix.name}</span> — {fix.action}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {hubStatus && (
          <div className={`rounded-2xl bg-gradient-to-l ${overallColor} p-[1px]`}>
            <div className="rounded-2xl bg-[#0a0a1a]/90 p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {hubStatus.overallHealth === "healthy" ? <CheckCircle2 className="w-8 h-8 text-green-400" /> :
                  hubStatus.overallHealth === "degraded" ? <XCircle className="w-8 h-8 text-red-400" /> : <AlertTriangle className="w-8 h-8 text-yellow-400" />}
                <div>
                  <h2 className="text-lg font-bold">
                    {hubStatus.overallHealth === "healthy" ? "\u05DB\u05DC \u05D4\u05DE\u05E2\u05E8\u05DB\u05D5\u05EA \u05EA\u05E7\u05D9\u05E0\u05D5\u05EA" :
                      hubStatus.overallHealth === "degraded" ? "\u05D9\u05E9 \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD \u05EA\u05E7\u05D5\u05DC\u05D9\u05DD" : "\u05D9\u05E9 \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD \u05DC\u05D0 \u05DE\u05D5\u05D2\u05D3\u05E8\u05D9\u05DD"}
                  </h2>
                  <p className="text-sm text-gray-300">{"\u05E1\u05E8\u05D9\u05E7\u05D4 \u05D4\u05D5\u05E9\u05DC\u05DE\u05D4 \u05D1-"}{hubStatus.durationMs}ms</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center"><div className="text-2xl font-bold text-green-400">{okCount}</div><div className="text-xs text-gray-400">{"\u05EA\u05E7\u05D9\u05E0\u05D9\u05DD"}</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-yellow-400">{warnCount}</div><div className="text-xs text-gray-400">{"\u05D0\u05D6\u05D4\u05E8\u05D5\u05EA"}</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-red-400">{errCount}</div><div className="text-xs text-gray-400">{"\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA"}</div></div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 border-b border-gray-700/50 pb-1 overflow-x-auto">
          {([["overview", "\u05E1\u05E7\u05D9\u05E8\u05D4", Activity], ["webhooks", "Webhooks", Link2], ["mcp", "MCP Bridge", Cpu], ["n8n", "n8n \u05E0\u05DB\u05E0\u05E1", Inbox], ["events", "\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD", History], ["fixes", "AI Auto-Fix", Wrench]] as const).map(([tab, label, Icon]) => (
            <button key={tab} onClick={() => { setActiveTab(tab as any); if (tab === "n8n") { fetchN8nConfig(); fetchIncoming(); fetchN8nEventMap(); } if (tab === "webhooks") fetchWebhooks(); if (tab === "mcp") { fetchMcpServers(); fetchMcpTools(); fetchMcpCalls(); } if (tab === "events") fetchEventLog(); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab ? "bg-violet-600/20 text-violet-400 border-b-2 border-violet-500" : "text-gray-400 hover:text-white"}`}>
              <Icon className="w-4 h-4" />{label}
              {tab === "n8n" && incomingMessages.length > 0 && <span className="bg-orange-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{incomingMessages.length}</span>}
              {tab === "webhooks" && webhooksList.length > 0 && <span className="bg-purple-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{webhooksList.length}</span>}
              {tab === "mcp" && mcpServers.length > 0 && <span className="bg-cyan-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{mcpServers.length}</span>}
            </button>
          ))}
        </div>

        {loading && !hubStatus && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-violet-400" />
            <p className="text-gray-400">{"\u05E1\u05D5\u05E8\u05E7 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD..."}</p>
          </div>
        )}

        {hubStatus && activeTab === "overview" && (
          <div className="max-h-[calc(100vh-480px)] overflow-y-auto space-y-6 pr-1">
            <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-900/30 to-indigo-900/20 p-6 text-center space-y-4">
              <button onClick={connectAllFix} disabled={connecting} className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xl font-bold shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                {connecting ? <Loader2 className="w-7 h-7 animate-spin" /> : <Bot className="w-7 h-7" />}
                {connecting ? '\u05DE\u05D7\u05D1\u05E8 \u05D5\u05DE\u05EA\u05E7\u05DF...' : '\uD83E\uDD16 \u05D7\u05D1\u05E8 \u05D4\u05DB\u05DC \u05D5\u05EA\u05E7\u05DF'}
              </button>
              {connectProgress && (
                <div className="space-y-2">
                  <div className="w-full bg-gray-700/50 rounded-full h-3 overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full rounded-full transition-all duration-500" style={{ width: `${connectProgress.pct}%` }} />
                  </div>
                  <p className="text-sm text-violet-300">{connectProgress.step}</p>
                </div>
              )}
              {connectResult && (
                <div className={`rounded-lg border p-3 text-right ${connectResult.ok ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                  <p className={`text-sm font-medium ${connectResult.ok ? 'text-green-400' : 'text-red-400'}`}>{connectResult.message}</p>
                  <div className="flex justify-center gap-4 mt-2 text-xs text-gray-400">
                    <span>{connectResult.summary.connected}/{connectResult.summary.total} {'\u05DE\u05D7\u05D5\u05D1\u05E8\u05D9\u05DD'}</span>
                    {connectResult.summary.fixesApplied > 0 && <span className="text-green-400">{connectResult.summary.fixesApplied} {'\u05EA\u05D9\u05E7\u05D5\u05E0\u05D9\u05DD'}</span>}
                    {connectResult.summary.errors > 0 && <span className="text-red-400">{connectResult.summary.errors} {'\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA'}</span>}
                  </div>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 sticky top-0 bg-[#0a0a1a] z-10 py-1">
                <Server className="w-5 h-5 text-blue-400" />
                {"\u05E9\u05D9\u05E8\u05D5\u05EA\u05D9 \u05DE\u05E2\u05E8\u05DB\u05EA"}
                <span className="text-xs text-gray-500 font-normal">({hubStatus.system.length})</span>
              </h2>
              <div className="grid gap-3">
                {hubStatus.system.map(svc => <ServiceCard key={svc.name} svc={svc} onTest={fetchStatus} />)}
              </div>
            </div>

            {hubStatus.integrations.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  {"\u05D0\u05D9\u05E0\u05D8\u05D2\u05E8\u05E6\u05D9\u05D5\u05EA \u05D7\u05D9\u05E6\u05D5\u05E0\u05D9\u05D5\u05EA"}
                  <span className="text-xs text-gray-500 font-normal">({hubStatus.integrations.length})</span>
                </h2>
                <div className="grid gap-3">
                  {hubStatus.integrations.map((svc: any) => <ServiceCard key={svc.id || svc.name} svc={svc} onTest={fetchStatus} />)}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Send className="w-5 h-5 text-purple-400" />
                {"Webhook Engine"}
              </h2>
              <div className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4 space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">{"Webhook URL (\u05E0\u05E9\u05DE\u05E8 \u05D1\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA)"}</label>
                  <div className="flex gap-2">
                    <input type="url" value={webhookUrl} onChange={e => { setWebhookUrl(e.target.value); setWebhookMsg(null); }}
                      placeholder="https://n8n.example.com/webhook/..."
                      className="flex-1 bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30" dir="ltr" />
                    <button onClick={saveWebhook} disabled={webhookSaving || !webhookUrl.trim()}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5">
                      {webhookSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {"\u05E9\u05DE\u05D5\u05E8"}
                    </button>
                  </div>
                  {webhookMsg && <p className={`text-xs mt-1.5 ${webhookMsg.ok ? "text-green-400" : "text-red-400"}`}>{webhookMsg.text}</p>}
                </div>
                <div className="border-t border-gray-700/50 pt-3">
                  <label className="text-xs text-gray-400 block mb-1.5">{"\u05E9\u05DC\u05D7 Webhook \u05D9\u05D3\u05E0\u05D9"}</label>
                  <div className="flex gap-2">
                    <input type="url" value={webhookTestUrl} onChange={e => setWebhookTestUrl(e.target.value)}
                      placeholder={webhookUrl || "https://..."}
                      className="flex-1 bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30" dir="ltr" />
                    <button onClick={sendTestWebhook} disabled={webhookSending || (!webhookTestUrl.trim() && !webhookUrl.trim())}
                      className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5">
                      {webhookSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {"\u05E9\u05DC\u05D7 \u05D8\u05E1\u05D8"}
                    </button>
                  </div>
                  {webhookSendResult && (
                    <div className={`mt-2 rounded-lg p-3 text-xs ${webhookSendResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {webhookSendResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span className="font-bold">
                          {webhookSendResult.ok ? "\u05E0\u05E9\u05DC\u05D7 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4" : "\u05E9\u05D2\u05D9\u05D0\u05D4"}
                        </span>
                        {webhookSendResult.status && <span className="text-gray-400">HTTP {webhookSendResult.status}</span>}
                        {webhookSendResult.latencyMs !== undefined && <span className="text-gray-400">{webhookSendResult.latencyMs}ms</span>}
                      </div>
                      {webhookSendResult.response && (
                        <div className="mt-2 border-t border-gray-700/50 pt-2">
                          <div className="text-[10px] text-gray-500 mb-1 font-bold">{"\u05EA\u05D2\u05D5\u05D1\u05D4 \u05DE-n8n:"}</div>
                          <pre className="bg-[#0a0a1a] rounded p-2 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all" dir="ltr">
                            {typeof webhookSendResult.response === "string"
                              ? webhookSendResult.response
                              : JSON.stringify(webhookSendResult.response, null, 2)}
                          </pre>
                        </div>
                      )}
                      {webhookSendResult.error && !webhookSendResult.response && (
                        <div className="mt-1 text-red-400">{webhookSendResult.error}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {hubStatus.webhooks.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-orange-400" />
                  {"Webhooks \u05E8\u05E9\u05D5\u05DE\u05D9\u05DD"}
                  <span className="text-xs text-gray-500 font-normal">({hubStatus.webhooks.length})</span>
                </h2>
                <div className="grid gap-2">
                  {hubStatus.webhooks.map((w: any) => (
                    <div key={w.id} className="rounded-lg border border-gray-700/50 bg-[#0d0d20] p-3 flex items-center justify-between">
                      <div><span className="text-sm font-medium text-white">{w.name}</span><span className="text-xs text-gray-400 mr-2"> — {w.eventType}</span></div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">{w.triggerCount} {"\u05E9\u05DC\u05D9\u05D7\u05D5\u05EA"}</span>
                        {w.lastStatus && <StatusBadge status={w.lastStatus === "sent" ? "ok" : "error"} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "n8n" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-orange-500/30 bg-[#0d0d20] p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-orange-400" />
                  {"N8N Smart Connector"}
                  {n8nConfig?.status === "connected" && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">{"מחובר"}</span>}
                  {n8nConfig?.status === "disconnected" && <span className="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded-full">{"לא מחובר"}</span>}
                </h2>
                <button onClick={() => { fetchN8nConfig(); fetchIncoming(); }} disabled={n8nLoading}
                  className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 text-xs font-medium transition-colors flex items-center gap-1.5">
                  {n8nLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {"רענון"}
                </button>
              </div>
              <div className="flex gap-1 mb-3">
                {([ ["config", "הגדרות", Server], ["workflows", "Workflows", Workflow], ["executions", "הרצות", Activity], ["events", "מיפוי אירועים", Zap], ["incoming", "נכנסות", Inbox] ] as const).map(([st, lbl, Ic]) => (
                  <button key={st} onClick={() => { setN8nSubTab(st); if (st === "workflows") fetchN8nWorkflows(); if (st === "executions") fetchN8nExecs(); if (st === "incoming") fetchIncoming(); if (st === "events") fetchN8nEventMap(); }}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${n8nSubTab === st ? "bg-orange-600/30 text-orange-300" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"}`}>
                    <Ic className="w-3.5 h-3.5" />{lbl}
                  </button>
                ))}
              </div>
            </div>

            {n8nSubTab === "config" && (
              <div className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Server className="w-4 h-4 text-orange-400" />{"הגדרות חיבור n8n"}</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"n8n Server URL"}</label>
                    <input value={n8nForm.url} onChange={e => setN8nForm(f => ({ ...f, url: e.target.value }))} placeholder="https://n8n.example.com" dir="ltr"
                      className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"API Key"}</label>
                    <input value={n8nForm.apiKey} onChange={e => setN8nForm(f => ({ ...f, apiKey: e.target.value }))} type="password" placeholder={n8nConfig?.config?.hasApiKey ? "••••••• (מוגדר)" : "הזן API Key"} dir="ltr"
                      className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"Webhook URL (לשליחה ל-n8n)"}</label>
                    <input value={n8nForm.webhookUrl} onChange={e => setN8nForm(f => ({ ...f, webhookUrl: e.target.value }))} placeholder="https://n8n.example.com/webhook/..." dir="ltr"
                      className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"Incoming Secret (HMAC אימות webhook נכנס)"}</label>
                    <input value={n8nForm.incomingSecret} onChange={e => setN8nForm(f => ({ ...f, incomingSecret: e.target.value }))} type="password" placeholder={n8nConfig?.config?.hasIncomingSecret ? "••••••• (מוגדר)" : "סוד לאימות (אופציונלי)"} dir="ltr"
                      className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                    <p className="text-[10px] text-gray-500 mt-0.5">{"אם מוגדר, בקשות נכנסות חייבות לכלול חתימת HMAC-SHA256 בכותרת x-webhook-signature"}</p>
                  </div>
                  <button onClick={saveN8nConfig} disabled={n8nSaving || (!n8nForm.url && !n8nForm.apiKey && !n8nForm.webhookUrl && !n8nForm.incomingSecret)}
                    className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white text-sm font-medium transition-colors flex items-center gap-2">
                    {n8nSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{"שמור הגדרות"}
                  </button>
                </div>
                <div className="rounded-lg bg-[#1a1a2e] border border-gray-700/50 p-3 mt-3">
                  <div className="text-xs text-gray-400 mb-1 font-bold">{"Incoming Webhook URL (קבלת נתונים מ-n8n)"}</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-[#0a0a1a] rounded px-3 py-2 text-sm font-mono text-orange-300 select-all" dir="ltr">
                      {`${window.location.origin}/api/integration-hub/incoming`}
                    </code>
                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/integration-hub/incoming`)}
                      className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 transition-colors" title="העתק">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">{"הגדר את ה-URL הזה ב-n8n ככתובת יעד ל-HTTP Request node"}</p>
                </div>
                {n8nConfig && (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="rounded-lg bg-[#1a1a2e] border border-gray-700/50 p-3 text-center">
                      <div className="text-2xl font-bold text-orange-400">{n8nConfig.totalWorkflows || 0}</div>
                      <div className="text-[10px] text-gray-500">{"Workflows"}</div>
                    </div>
                    <div className="rounded-lg bg-[#1a1a2e] border border-gray-700/50 p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{n8nConfig.activeWorkflows || 0}</div>
                      <div className="text-[10px] text-gray-500">{"פעילים"}</div>
                    </div>
                    <div className="rounded-lg bg-[#1a1a2e] border border-gray-700/50 p-3 text-center">
                      <div className="text-2xl font-bold text-white">{incomingMessages.length}</div>
                      <div className="text-[10px] text-gray-500">{"הודעות נכנסות"}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {n8nSubTab === "workflows" && (
              <div className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Workflow className="w-4 h-4 text-orange-400" />{"Workflows ב-n8n"}</h3>
                  <button onClick={fetchN8nWorkflows} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" />{"רענן"}</button>
                </div>
                {n8nWorkflows.length === 0 ? (
                  <div className="text-center py-8">
                    <Workflow className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">{n8nConfig?.status === "connected" ? "אין workflows" : "n8n לא מחובר — הגדר הגדרות חיבור"}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[calc(100vh-500px)] overflow-y-auto">
                    {n8nWorkflows.map((wf: any) => (
                      <div key={wf.id} className="rounded-lg border border-gray-700/50 bg-[#1a1a2e] p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${wf.active ? "bg-green-500" : "bg-gray-600"}`} />
                          <div>
                            <div className="text-sm font-medium text-white">{wf.name}</div>
                            <div className="text-[10px] text-gray-500">{"ID: "}{wf.id} {wf.nodes ? `\u00B7 ${wf.nodes} nodes` : ""}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${wf.active ? "bg-green-500/20 text-green-400" : "bg-gray-600/20 text-gray-400"}`}>{wf.active ? "פעיל" : "כבוי"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {n8nSubTab === "executions" && (
              <div className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Activity className="w-4 h-4 text-orange-400" />{"הרצות אחרונות ב-n8n"}</h3>
                  <button onClick={fetchN8nExecs} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" />{"רענן"}</button>
                </div>
                {n8nExecs.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">{n8nConfig?.status === "connected" ? "אין הרצות" : "n8n לא מחובר"}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[calc(100vh-500px)] overflow-y-auto">
                    {n8nExecs.map((ex: any) => (
                      <div key={ex.id} className="rounded-lg border border-gray-700/50 bg-[#1a1a2e] p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${ex.finished ? (ex.status === "success" ? "bg-green-500" : "bg-red-500") : "bg-yellow-500 animate-pulse"}`} />
                          <div>
                            <div className="text-sm font-medium text-white">{ex.workflowName || `Workflow #${ex.workflowId}`}</div>
                            <div className="text-[10px] text-gray-500">{"ID: "}{ex.id} {ex.startedAt ? `\u00B7 ${new Date(ex.startedAt).toLocaleString("he-IL")}` : ""}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${ex.status === "success" ? "bg-green-500/20 text-green-400" : ex.status === "error" || ex.status === "failed" ? "bg-red-500/20 text-red-400" : ex.finished === false ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-600/20 text-gray-400"}`}>
                            {ex.status === "success" ? "הצליח" : ex.status === "error" || ex.status === "failed" ? "נכשל" : ex.finished === false ? "רץ..." : ex.status || "לא ידוע"}
                          </span>
                          {ex.executionTime && <span className="text-[10px] text-gray-500">{ex.executionTime}ms</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {n8nSubTab === "events" && (
              <div className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-orange-400" />{"מיפוי אירועי ERP \u2192 n8n Workflows"}</h3>
                <p className="text-xs text-gray-500">{"מפה אירועים מהמערכת ל-workflow ב-n8n — כשהאירוע מתרחש, n8n יופעל אוטומטית"}</p>
                <div className="space-y-2">
                  {n8nEventMap.map((m: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-gray-700/50 bg-[#1a1a2e] p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm text-white font-mono">{m.erpEvent}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-sm text-orange-300 font-mono">{m.n8nTarget}</span>
                      </div>
                      <button onClick={async () => {
                        const updated = n8nEventMap.filter((_: any, i: number) => i !== idx);
                        setN8nEventMap(updated);
                        await authFetch(`${API}/integration-hub/n8n/event-map`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mappings: updated }) });
                      }} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {n8nEventMap.length === 0 && <p className="text-center text-gray-600 text-xs py-4">{"אין מיפויים — הוסף מיפוי חדש"}</p>}
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 block mb-1">{"אירוע ERP"}</label>
                    <select id="n8n-erp-event" className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                      <option value="order_created">{"order_created"}</option>
                      <option value="invoice_created">{"invoice_created"}</option>
                      <option value="customer_created">{"customer_created"}</option>
                      <option value="inventory_low">{"inventory_low"}</option>
                      <option value="payment_received">{"payment_received"}</option>
                      <option value="production_complete">{"production_complete"}</option>
                      <option value="quote_approved">{"quote_approved"}</option>
                      <option value="delivery_shipped">{"delivery_shipped"}</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 block mb-1">{"n8n Webhook Path"}</label>
                    <input id="n8n-target" placeholder="erp-order-hook" dir="ltr"
                      className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                  <button onClick={async () => {
                    const evt = (document.getElementById("n8n-erp-event") as HTMLSelectElement)?.value;
                    const tgt = (document.getElementById("n8n-target") as HTMLInputElement)?.value;
                    if (!evt || !tgt) return;
                    const updated = [...n8nEventMap, { erpEvent: evt, n8nTarget: tgt }];
                    setN8nEventMap(updated);
                    await authFetch(`${API}/integration-hub/n8n/event-map`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mappings: updated }) });
                    (document.getElementById("n8n-target") as HTMLInputElement).value = "";
                  }} className="px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            {n8nSubTab === "incoming" && (
              <div className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Inbox className="w-4 h-4 text-orange-400" />{"הודעות נכנסות מ-n8n"}<span className="text-xs text-gray-500 font-normal">({incomingMessages.length})</span></h3>
                  <button onClick={fetchIncoming} disabled={incomingLoading} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                    {incomingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}{"רענן"}
                  </button>
                </div>
                <div className="max-h-[calc(100vh-520px)] overflow-y-auto space-y-2">
                  {incomingMessages.length === 0 && !incomingLoading && (
                    <div className="text-center py-12">
                      <Inbox className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">{"אין הודעות נכנסות מ-n8n"}</p>
                      <p className="text-gray-600 text-[10px] mt-1">{"הגדר את ה-Webhook URL ב-n8n ושלח נתונים"}</p>
                    </div>
                  )}
                  {incomingLoading && incomingMessages.length === 0 && (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
                  )}
                  {incomingMessages.map((msg: any) => {
                    const isExpanded = expandedIncoming.has(msg.id);
                    const payload = typeof msg.payload === "string" ? (() => { try { return JSON.parse(msg.payload); } catch { return msg.payload; } })() : msg.payload;
                    return (
                      <div key={msg.id} className="rounded-lg border border-gray-700/50 bg-[#1a1a2e] overflow-hidden">
                        <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors" onClick={() => toggleIncomingExpand(msg.id)}>
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-orange-500/20"><Inbox className="w-4 h-4 text-orange-400" /></div>
                            <div>
                              <span className="text-sm font-medium text-white">{msg.event_type || "incoming"}</span>
                              <span className="text-xs text-gray-500 mr-2">{" \u2014 "}{msg.status}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">{new Date(msg.created_at).toLocaleString("he-IL")}</span>
                            {isExpanded ? <EyeOff className="w-3.5 h-3.5 text-gray-400" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-gray-700/50 p-3 bg-[#0a0a15]">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] text-gray-500 font-bold">{"Payload:"}</span>
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); }}
                                className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"><Copy className="w-3 h-3" />{"העתק"}</button>
                            </div>
                            <pre className="bg-[#0a0a1a] rounded p-3 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-all" dir="ltr">
                              {typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "webhooks" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Link2 className="w-5 h-5 text-purple-400" />
                {"Webhook Engine"}
                <span className="text-xs text-gray-500 font-normal">({webhooksList.length})</span>
              </h2>
              <button onClick={() => setShowAddWebhook(!showAddWebhook)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />
                {"Webhook \u05D7\u05D3\u05E9"}
              </button>
            </div>

            {showAddWebhook && (
              <div className="rounded-xl border border-purple-500/30 bg-[#0d0d20] p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"\u05E9\u05DD"}</label>
                    <input value={newWebhook.name} onChange={e => setNewWebhook(p => ({ ...p, name: e.target.value }))} placeholder={"n8n Order Webhook"} className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">URL</label>
                    <input value={newWebhook.url} onChange={e => setNewWebhook(p => ({ ...p, url: e.target.value }))} placeholder="https://..." className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"Event Type"}</label>
                    <input value={newWebhook.event_type} onChange={e => setNewWebhook(p => ({ ...p, event_type: e.target.value }))} placeholder="*" className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"Secret (\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9)"}</label>
                    <input value={newWebhook.secret} onChange={e => setNewWebhook(p => ({ ...p, secret: e.target.value }))} placeholder="..." className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" dir="ltr" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowAddWebhook(false)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors">{"\u05D1\u05D9\u05D8\u05D5\u05DC"}</button>
                  <button onClick={addWebhook} disabled={!newWebhook.name || !newWebhook.url} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />{"\u05D4\u05D5\u05E1\u05E3"}
                  </button>
                </div>
              </div>
            )}

            {webhooksLoading && webhooksList.length === 0 && (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>
            )}
            {!webhooksLoading && webhooksList.length === 0 && (
              <div className="text-center py-16">
                <Link2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500">{"\u05D0\u05D9\u05DF webhooks \u05E8\u05E9\u05D5\u05DE\u05D9\u05DD"}</p>
                <p className="text-gray-600 text-xs mt-1">{"\u05DC\u05D7\u05E5 \u05E2\u05DC \u05D4\u05DB\u05E4\u05EA\u05D5\u05E8 \u05DC\u05DE\u05E2\u05DC\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 webhook \u05D7\u05D3\u05E9"}</p>
              </div>
            )}
            <div className="space-y-2 max-h-[calc(100vh-520px)] overflow-y-auto">
              {webhooksList.map((wh: any) => (
                <div key={wh.id} className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${wh.is_active ? "bg-purple-500/20 text-purple-400" : "bg-gray-500/20 text-gray-400"}`}>
                        <Link2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{wh.name}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-0.5" dir="ltr">{(wh.url || wh.webhook_url || "")?.substring(0, 60)}{(wh.url || wh.webhook_url || "")?.length > 60 ? "..." : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{wh.event_type}</span>
                      <span className="text-xs text-gray-500">{wh.trigger_count || 0} {"\u05E9\u05DC\u05D9\u05D7\u05D5\u05EA"}</span>
                      {wh.last_status && <StatusBadge status={wh.last_status === "sent" ? "ok" : "error"} />}
                      <button onClick={() => fetchWebhookLogs(wh.id, wh.name)} className="p-1.5 rounded-lg hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-colors" title={"לוג אירועים"}>
                        <History className="w-4 h-4" />
                      </button>
                      <button onClick={() => testWebhookById(wh.id)} className="p-1.5 rounded-lg hover:bg-purple-500/20 text-gray-400 hover:text-purple-400 transition-colors" title="Test">
                        <Send className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteWebhook(wh.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors" title={"מחיקה"}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {wh.unique_id && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-gray-600 font-mono" dir="ltr">ID: {wh.unique_id}</span>
                      <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/api/integration-hub/webhooks/${wh.unique_id}/receive`); }}
                        className="text-[10px] text-gray-600 hover:text-gray-300 flex items-center gap-1">
                        <Copy className="w-3 h-3" />{"URL"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {webhookLogs && (
              <div className="rounded-xl border border-blue-500/30 bg-[#0d0d20] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400" />
                    {webhookLogs.webhookName} — {"לוג אירועים"}
                    <span className="text-xs text-gray-500 font-normal">({webhookLogs.logs.length})</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => fetchWebhookLogs(webhookLogs.webhookId, webhookLogs.webhookName)} disabled={webhookLogsLoading}
                      className="px-2 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs flex items-center gap-1">
                      {webhookLogsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {"רענן"}
                    </button>
                    <button onClick={() => setWebhookLogs(null)} className="px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-700 text-gray-400 text-xs">{"סגור"}</button>
                  </div>
                </div>
                {webhookLogs.logs.length === 0 && (
                  <p className="text-center text-gray-500 py-6 text-sm">{"אין אירועים עבור webhook זה"}</p>
                )}
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {webhookLogs.logs.map((log: any) => {
                    const payload = typeof log.payload === "string" ? (() => { try { return JSON.parse(log.payload); } catch { return log.payload; } })() : log.payload;
                    return (
                      <div key={log.id} className={`rounded-lg border p-2.5 text-xs ${log.status === "sent" || log.status === "received" ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {log.direction === "outgoing" ? <ArrowUpRight className="w-3 h-3 text-blue-400" /> : <ArrowUpRight className="w-3 h-3 text-orange-400 rotate-180" />}
                            <span className="font-medium text-white">{log.event_type}</span>
                            <span className="text-gray-500">{log.direction}</span>
                            <StatusBadge status={log.status === "sent" || log.status === "received" ? "ok" : "error"} />
                          </div>
                          <div className="flex items-center gap-2">
                            {log.response_code && <span className="text-gray-400">HTTP {log.response_code}</span>}
                            {log.latency_ms != null && <LatencyBadge ms={log.latency_ms} />}
                            <span className="text-gray-500 text-[10px]">{new Date(log.created_at).toLocaleString("he-IL")}</span>
                          </div>
                        </div>
                        {payload && Object.keys(payload).length > 0 && (
                          <pre className="mt-1.5 bg-[#0a0a1a] rounded p-2 text-[10px] font-mono text-gray-400 overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap break-all" dir="ltr">
                            {JSON.stringify(payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "mcp" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                {"MCP Bridge"}
                <span className="text-xs text-gray-500 font-normal">({mcpServers.length})</span>
              </h2>
              <button onClick={() => setShowAddMcp(!showAddMcp)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />
                {"MCP Server \u05D7\u05D3\u05E9"}
              </button>
            </div>

            {showAddMcp && (
              <div className="rounded-xl border border-cyan-500/30 bg-[#0d0d20] p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"\u05E9\u05DD"}</label>
                    <input value={newMcp.name} onChange={e => setNewMcp(p => ({ ...p, name: e.target.value }))} placeholder="Google Maps" className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">URL</label>
                    <input value={newMcp.url} onChange={e => setNewMcp(p => ({ ...p, url: e.target.value }))} placeholder="https://..." className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{"\u05E1\u05D5\u05D2"}</label>
                    <select value={newMcp.type} onChange={e => setNewMcp(p => ({ ...p, type: e.target.value }))} className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
                      <option value="custom-mcp">Custom MCP</option>
                      <option value="stdio">Stdio</option>
                      <option value="sse">SSE</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowAddMcp(false)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors">{"\u05D1\u05D9\u05D8\u05D5\u05DC"}</button>
                  <button onClick={addMcpServer} disabled={!newMcp.name} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />{"\u05D4\u05D5\u05E1\u05E3"}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-cyan-500/30 bg-[#0d0d20] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2"><TestTube className="w-4 h-4" />{"Try It \u2014 \u05D4\u05E8\u05E5 \u05DB\u05DC\u05D9 MCP"}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">{"Tool \u05DC\u05D4\u05E8\u05E6\u05D4"}</label>
                  <select value={mcpTryTool} onChange={e => setMcpTryTool(e.target.value)} className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500">
                    <option value="">{"-- \u05D1\u05D7\u05E8 \u05DB\u05DC\u05D9 --"}</option>
                    {mcpTools.map((t: any) => <option key={t.name || t} value={t.name || t}>{t.name || t}{t.description ? ` \u2014 ${t.description}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">{"Params (JSON)"}</label>
                  <input value={mcpTryParams} onChange={e => setMcpTryParams(e.target.value)} placeholder='{"limit": 5}' className="w-full bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono" dir="ltr" />
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={executeMcpTool} disabled={!mcpTryTool || mcpTryLoading} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5">
                  {mcpTryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {"Execute"}
                </button>
              </div>
              {mcpTryResult && (
                <div className={`rounded-lg border p-3 ${mcpTryResult.ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${mcpTryResult.ok ? 'text-green-400' : 'text-red-400'}`}>{mcpTryResult.ok ? '\u05D4\u05E6\u05DC\u05D7\u05D4' : '\u05E9\u05D2\u05D9\u05D0\u05D4'}</span>
                    {mcpTryResult.latencyMs && <LatencyBadge ms={mcpTryResult.latencyMs} />}
                  </div>
                  <pre className="text-xs text-gray-300 bg-black/30 rounded p-2 overflow-auto max-h-48 font-mono" dir="ltr">{JSON.stringify(mcpTryResult.result || mcpTryResult.error || mcpTryResult, null, 2)}</pre>
                </div>
              )}
            </div>

            {mcpLoading && mcpServers.length === 0 && (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>
            )}
            {!mcpLoading && mcpServers.length === 0 && (
              <div className="text-center py-8">
                <Cpu className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">{"\u05D0\u05D9\u05DF MCP servers \u05DE\u05D7\u05D5\u05D1\u05E8\u05D9\u05DD"}</p>
              </div>
            )}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {mcpServers.map((srv: any) => (
                <div key={srv.id} className="rounded-xl border border-gray-700/50 bg-[#0d0d20] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${srv.status === "discovered" ? "bg-cyan-500/20 text-cyan-400" : srv.status === "configured" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{srv.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">{srv.type}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${srv.status === "discovered" ? "bg-cyan-500/10 text-cyan-400" : srv.status === "configured" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>{srv.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {srv.url && <span className="text-xs text-gray-500 font-mono" dir="ltr">{srv.url.substring(0, 40)}</span>}
                      {srv.skillPath && <span className="text-[10px] text-cyan-600 font-mono" dir="ltr">skill</span>}
                      {!srv.skillPath && (
                        <button onClick={() => deleteMcpServer(srv.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {mcpCalls.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><History className="w-4 h-4" />{"\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05E7\u05E8\u05D9\u05D0\u05D5\u05EA"}</h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {mcpCalls.map((c: any) => (
                    <div key={c.id} className={`rounded-lg border p-2 flex items-center justify-between text-xs ${c.status === 'success' ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-cyan-400">{c.tool}</span>
                        <LatencyBadge ms={c.duration_ms} />
                      </div>
                      <span className="text-gray-500 text-[10px]">{new Date(c.created_at).toLocaleString("he-IL")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "events" && (
          <div className="max-h-[calc(100vh-480px)] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><History className="w-5 h-5 text-blue-400" />{"\u05D9\u05D5\u05DE\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD"}<span className="text-xs text-gray-500 font-normal">({eventLog.length})</span></h2>
              <button onClick={fetchEventLog} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors"><RefreshCw className="w-4 h-4" />{"\u05E8\u05E2\u05E0\u05DF"}</button>
            </div>
            <div className="space-y-2">
              {eventLog.length === 0 && <p className="text-center text-gray-500 py-10">{"\u05D0\u05D9\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD"}</p>}
              {(eventLog.length > 0 ? eventLog : hubStatus?.recentEvents || []).map((e: any) => (
                <div key={e.id} className={`rounded-lg border p-3 flex items-center justify-between ${(e.status === "sent" || e.status === "success" || e.status === "emitted") ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                  <div className="flex items-center gap-3">
                    {(e.direction === "outgoing") ? <ArrowUpRight className="w-4 h-4 text-blue-400" /> : (e.direction === "internal") ? <Cpu className="w-4 h-4 text-cyan-400" /> : <ArrowUpRight className="w-4 h-4 text-orange-400 rotate-180" />}
                    <div>
                      <span className="text-sm font-medium text-white">{e.event_type || e.eventType}</span>
                      <span className="text-xs text-gray-400 mr-2"> {'\u2014'} {e.direction}</span>
                      {e.service_name && <span className="text-xs text-cyan-500 mr-2">[{e.service_name}]</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {(e.response_code || e.responseCode) && <span className="text-gray-400">HTTP {e.response_code || e.responseCode}</span>}
                    {(e.latency_ms || e.latencyMs) != null && <LatencyBadge ms={e.latency_ms || e.latencyMs} />}
                    <StatusBadge status={(e.status === "sent" || e.status === "success" || e.status === "emitted") ? "ok" : "error"} />
                    <span className="text-gray-500 text-[10px]">{new Date(e.created_at || e.createdAt).toLocaleString("he-IL")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "fixes" && (
          <div className="max-h-[calc(100vh-480px)] overflow-y-auto space-y-4">
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-indigo-900/10 p-5 space-y-4">
              <h3 className="text-base font-semibold text-purple-400 flex items-center gap-2"><Brain className="w-5 h-5" />{"\u05D0\u05D9\u05D1\u05D7\u05D5\u05DF AI \u2014 \u05EA\u05D0\u05E8 \u05D1\u05E2\u05D9\u05D4"}</h3>
              <div className="flex gap-3">
                <input value={aiProblem} onChange={e => setAiProblem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") diagnoseAi(); }} placeholder={"\u05EA\u05D0\u05E8 \u05D0\u05EA \u05D4\u05D1\u05E2\u05D9\u05D4... \u05DC\u05DE\u05E9\u05DC: \u05D4\u05D5\u05D5\u05D1\u05D4\u05D5\u05E7 \u05DC\u05D0 \u05DE\u05D2\u05D9\u05E2, \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D0 \u05DE\u05E1\u05EA\u05E0\u05DB\u05E8\u05E0\u05D9\u05DD, timeout \u05D1\u05D7\u05D9\u05D1\u05D5\u05E8"} className="flex-1 bg-[#1a1a2e] border border-gray-600/50 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                <button onClick={diagnoseAi} disabled={!aiProblem.trim() || aiDiagnosing} className="px-5 py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center gap-2 whitespace-nowrap">
                  {aiDiagnosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  {aiDiagnosing ? '\u05DE\u05D0\u05D1\u05D7\u05DF...' : '\u05D0\u05D1\u05D7\u05DF \u05D5\u05EA\u05E7\u05DF'}
                </button>
              </div>
              {aiDiagnosis && (
                <div className={`rounded-lg border p-4 space-y-3 ${aiDiagnosis.ok !== false ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                  {aiDiagnosis.error && <p className="text-sm text-red-400">{aiDiagnosis.error}</p>}
                  {aiDiagnosis.diagnosis && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-semibold text-purple-300">{'\u05D0\u05D9\u05D1\u05D7\u05D5\u05DF AI'}</span>
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{typeof aiDiagnosis.diagnosis === 'string' ? aiDiagnosis.diagnosis : JSON.stringify(aiDiagnosis.diagnosis, null, 2)}</p>
                    </div>
                  )}
                  {aiDiagnosis.fix && (
                    <div className="mt-2 rounded-lg bg-black/30 p-3">
                      <span className="text-xs text-green-400 font-medium">{'\u05EA\u05D9\u05E7\u05D5\u05DF \u05DE\u05D5\u05E6\u05E2:'}</span>
                      <pre className="text-xs text-gray-300 mt-1 font-mono whitespace-pre-wrap" dir="ltr">{typeof aiDiagnosis.fix === 'string' ? aiDiagnosis.fix : JSON.stringify(aiDiagnosis.fix, null, 2)}</pre>
                    </div>
                  )}
                  {aiDiagnosis.action && (
                    <div className="flex items-center gap-2 mt-2">
                      <Wrench className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-xs text-yellow-400">{'\u05E4\u05E2\u05D5\u05DC\u05D4:'} {aiDiagnosis.action}</span>
                      {aiDiagnosis.reason && <span className="text-xs text-gray-500"> {'\u2014'} {aiDiagnosis.reason}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {hubStatus && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><History className="w-4 h-4" />{"\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05EA\u05D9\u05E7\u05D5\u05E0\u05D9\u05DD"}</h3>
                {hubStatus.recentFixes.length === 0 && <p className="text-center text-gray-500 py-6">{"\u05D0\u05D9\u05DF \u05EA\u05D9\u05E7\u05D5\u05E0\u05D9\u05DD \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD"}</p>}
                {hubStatus.recentFixes.map((f: any) => (
                  <div key={f.id} className={`rounded-lg border p-3 flex items-center justify-between ${f.result === "success" ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                    <div className="flex items-center gap-3">
                      {f.result === "success" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      <div>
                        <span className="text-sm font-medium text-white">{f.issue}</span>
                        <span className="text-xs text-gray-400 mr-2"> {'\u2014'} {f.action}</span>
                      </div>
                    </div>
                    <span className="text-gray-500 text-[10px]">{new Date(f.createdAt).toLocaleString("he-IL")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
