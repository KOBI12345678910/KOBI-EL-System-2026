import { useState, useCallback, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import {
  Plug, Plus, Edit2, Trash2, Search, X, Save,
  Loader2, CheckCircle2, XCircle, Zap, Globe, Shield,
  Clock, Activity, RefreshCw, ToggleRight, ToggleLeft,
  ChevronDown, ChevronUp, Key, Server, Wifi, WifiOff,
  BarChart3, AlertTriangle, Copy, Eye, EyeOff, History,
  Radar, Wrench, Database, Workflow, HeartPulse, ChevronRight,
} from "lucide-react";

const API = "/api";

interface ApiConnection {
  id: number;
  name: string;
  description: string | null;
  base_url: string;
  auth_type: string;
  auth_config: any;
  headers: any;
  category: string;
  method: string;
  health_endpoint: string | null;
  is_active: boolean;
  timeout_ms: number;
  retry_count: number;
  rate_limit_rpm: number;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_latency_ms: number | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  healthy: number;
  unhealthy: number;
  untested: number;
  categories: number;
}

interface LogEntry {
  id: number;
  action: string;
  status: string;
  latency_ms: number;
  response_code: number | null;
  details: string | null;
  created_at: string;
}

const AUTH_TYPES = [
  { value: "none", label: "ללא" },
  { value: "bearer", label: "Bearer Token" },
  { value: "api-key", label: "API Key" },
  { value: "basic", label: "Basic Auth" },
  { value: "oauth2", label: "OAuth 2.0" },
];

const CATEGORIES = [
  { value: "erp", label: "ERP" },
  { value: "crm", label: "CRM" },
  { value: "finance", label: "כספים" },
  { value: "payments", label: "תשלומים" },
  { value: "shipping", label: "משלוחים" },
  { value: "government", label: "ממשלתי" },
  { value: "communication", label: "תקשורת" },
  { value: "ai", label: "בינה מלאכותית" },
  { value: "storage", label: "אחסון" },
  { value: "monitoring", label: "ניטור" },
  { value: "general", label: "כללי" },
];

const CAT_COLORS: Record<string, string> = {
  erp: "bg-blue-500/20 text-blue-300",
  crm: "bg-purple-500/20 text-purple-300",
  finance: "bg-green-500/20 text-green-300",
  payments: "bg-emerald-500/20 text-emerald-300",
  shipping: "bg-amber-500/20 text-amber-300",
  government: "bg-red-500/20 text-red-300",
  communication: "bg-cyan-500/20 text-cyan-300",
  ai: "bg-violet-500/20 text-violet-300",
  storage: "bg-orange-500/20 text-orange-300",
  monitoring: "bg-pink-500/20 text-pink-300",
  general: "bg-gray-500/20 text-gray-300",
};

const STATUS_COLORS: Record<string, string> = {
  success: "text-green-400",
  error: "text-red-400",
};

const emptyForm = {
  name: "",
  description: "",
  base_url: "",
  auth_type: "none",
  auth_token: "",
  auth_header_name: "X-API-Key",
  auth_key: "",
  auth_username: "",
  auth_password: "",
  headers_raw: "",
  category: "general",
  method: "GET",
  health_endpoint: "",
  is_active: true,
  timeout_ms: 30000,
  retry_count: 3,
  rate_limit_rpm: 60,
};

export default function ApiConnectionHubPage() {
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ApiConnection | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsFor, setLogsFor] = useState<number | null>(null);
  const [showAuthSecret, setShowAuthSecret] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connRes, statsRes] = await Promise.all([
        authFetch(`${API}/api-connections`),
        authFetch(`${API}/api-connections-stats`),
      ]);
      if (!connRes.ok) throw new Error("שגיאה בטעינת חיבורים");
      const connData = await connRes.json();
      setConnections(Array.isArray(connData) ? connData : []);
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = connections.filter(c => {
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (statusFilter === "active" && !c.is_active) return false;
    if (statusFilter === "inactive" && c.is_active) return false;
    if (statusFilter === "healthy" && c.last_test_status !== "success") return false;
    if (statusFilter === "unhealthy" && c.last_test_status !== "error") return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) ||
      c.base_url.toLowerCase().includes(s) ||
      (c.description || "").toLowerCase().includes(s);
  });

  const openCreate = () => {
    setEditItem(null);
    setForm({ ...emptyForm });
    setShowForm(true);
    setShowAuthSecret(false);
  };

  const openEdit = (c: ApiConnection) => {
    setEditItem(c);
    let authToken = "", authHeaderName = "X-API-Key", authKey = "", authUsername = "", authPassword = "";
    if (c.auth_config) {
      const cfg = typeof c.auth_config === "string" ? JSON.parse(c.auth_config) : c.auth_config;
      authToken = cfg.token || "";
      authHeaderName = cfg.header_name || "X-API-Key";
      authKey = cfg.key || "";
      authUsername = cfg.username || "";
      authPassword = cfg.password || "";
    }
    let headersRaw = "";
    if (c.headers) {
      try {
        const h = typeof c.headers === "string" ? JSON.parse(c.headers) : c.headers;
        headersRaw = Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n");
      } catch {}
    }
    setForm({
      name: c.name,
      description: c.description || "",
      base_url: c.base_url,
      auth_type: c.auth_type,
      auth_token: authToken,
      auth_header_name: authHeaderName,
      auth_key: authKey,
      auth_username: authUsername,
      auth_password: authPassword,
      headers_raw: headersRaw,
      category: c.category,
      method: c.method,
      health_endpoint: c.health_endpoint || "",
      is_active: c.is_active,
      timeout_ms: c.timeout_ms,
      retry_count: c.retry_count,
      rate_limit_rpm: c.rate_limit_rpm,
    });
    setShowForm(true);
    setShowAuthSecret(false);
  };

  const buildAuthConfig = () => {
    if (form.auth_type === "bearer") return { token: form.auth_token };
    if (form.auth_type === "api-key") return { header_name: form.auth_header_name, key: form.auth_key };
    if (form.auth_type === "basic") return { username: form.auth_username, password: form.auth_password };
    return null;
  };

  const parseHeaders = () => {
    if (!form.headers_raw.trim()) return null;
    const result: Record<string, string> = {};
    form.headers_raw.split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx > 0) result[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    });
    return Object.keys(result).length > 0 ? result : null;
  };

  const handleScanAll = async () => {
    setScanning(true);
    setScanResult(null);
    setShowScanPanel(true);
    try {
      const res = await authFetch(`${API}/api-connections/scan-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_fix: true }),
      });
      const data = await res.json();
      setScanResult(data);
      load();
    } catch (e: any) {
      setScanResult({ error: e.message });
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.base_url.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        base_url: form.base_url,
        auth_type: form.auth_type,
        auth_config: buildAuthConfig(),
        headers: parseHeaders(),
        category: form.category,
        method: form.method,
        health_endpoint: form.health_endpoint || null,
        is_active: form.is_active,
        timeout_ms: form.timeout_ms,
        retry_count: form.retry_count,
        rate_limit_rpm: form.rate_limit_rpm,
      };
      const url = editItem ? `${API}/api-connections/${editItem.id}` : `${API}/api-connections`;
      const method = editItem ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "שגיאה בשמירה");
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await authFetch(`${API}/api-connections/${id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult({ id, ...data });
      load();
    } catch (e: any) {
      setTestResult({ id, ok: false, error: e.message });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await authFetch(`${API}/api-connections/${id}`, { method: "DELETE" });
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggle = async (c: ApiConnection) => {
    try {
      await authFetch(`${API}/api-connections/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadLogs = async (id: number) => {
    if (logsFor === id) { setLogsFor(null); return; }
    setLogsFor(id);
    try {
      const res = await authFetch(`${API}/api-connections/${id}/logs?limit=20`);
      if (res.ok) setLogs(await res.json());
    } catch {}
  };

  const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) => (
    <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/20 rounded-xl">
            <Plug className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Smart API Connection Hub</h1>
            <p className="text-sm text-muted-foreground">ניהול וחיבור APIs חכם — בדיקת תקינות, ניטור ביצועים, אבטחה</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground" title="רענן">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleScanAll}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white rounded-lg transition-all font-medium shadow-lg shadow-emerald-500/20"
          >
            {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radar className="w-5 h-5" />}
            סרוק, בדוק ותקן הכל
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            חיבור חדש
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="סה״כ חיבורים" value={Number(stats.total)} icon={Plug} color="bg-blue-500/20 text-blue-400" />
          <StatCard label="פעילים" value={Number(stats.active)} icon={Wifi} color="bg-green-500/20 text-green-400" />
          <StatCard label="כבויים" value={Number(stats.inactive)} icon={WifiOff} color="bg-gray-500/20 text-gray-400" />
          <StatCard label="תקינים" value={Number(stats.healthy)} icon={CheckCircle2} color="bg-emerald-500/20 text-emerald-400" />
          <StatCard label="תקולים" value={Number(stats.unhealthy)} icon={AlertTriangle} color="bg-red-500/20 text-red-400" />
          <StatCard label="לא נבדקו" value={Number(stats.untested)} icon={Clock} color="bg-amber-500/20 text-amber-400" />
          <StatCard label="קטגוריות" value={Number(stats.categories)} icon={BarChart3} color="bg-violet-500/20 text-violet-400" />
        </div>
      )}

      {showScanPanel && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-l from-emerald-500/10 to-teal-500/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                {scanning ? <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /> : <Radar className="w-6 h-6 text-emerald-400" />}
              </div>
              <div>
                <h2 className="font-bold text-foreground text-lg">
                  {scanning ? "סורק את כל החיבורים..." : "תוצאות סריקה כוללת"}
                </h2>
                {scanResult?.summary && (
                  <p className="text-xs text-muted-foreground">
                    {`נסרקו ${scanResult.summary.total} חיבורים ב-${scanResult.summary.durationMs}ms — ${scanResult.summary.fixesApplied} תיקונים`}
                  </p>
                )}
              </div>
            </div>
            <button onClick={() => setShowScanPanel(false)} className="p-1 hover:bg-white/5 rounded">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {scanning && (
            <div className="p-8 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-emerald-500/20 rounded-full" />
                <div className="absolute inset-0 w-20 h-20 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <Radar className="absolute inset-0 m-auto w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-muted-foreground">בודק מערכת, חיבורים חיצוניים, n8n...</p>
              <p className="text-xs text-muted-foreground">מנסה לתקן חיבורים תקולים אוטומטית</p>
            </div>
          )}

          {scanResult && !scanResult.error && (
            <div className="p-4 space-y-4">
              {scanResult.summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-blue-400">{scanResult.summary.total}</div>
                    <div className="text-xs text-muted-foreground">סה״כ נסרקו</div>
                  </div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-green-400">{scanResult.summary.healthy}</div>
                    <div className="text-xs text-muted-foreground">תקינים</div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-red-400">{scanResult.summary.broken}</div>
                    <div className="text-xs text-muted-foreground">תקולים</div>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-amber-400">{scanResult.summary.skipped}</div>
                    <div className="text-xs text-muted-foreground">דולגו</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-emerald-400">{scanResult.summary.fixesApplied}</div>
                    <div className="text-xs text-muted-foreground">תוקנו</div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-400" /> בדיקות מערכת
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {(scanResult.system || []).map((s: any, i: number) => (
                    <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border ${s.ok ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                      {s.name.includes("Database") ? <Database className="w-4 h-4" /> : <Server className="w-4 h-4" />}
                      <span className="text-sm flex-1">{s.name}</span>
                      {s.ok ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      {s.latencyMs != null && <span className="text-xs text-muted-foreground">{s.latencyMs}ms</span>}
                    </div>
                  ))}
                  <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${scanResult.n8n?.ok ? "bg-green-500/5 border-green-500/20" : scanResult.n8n?.checked ? "bg-red-500/5 border-red-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
                    <Workflow className="w-4 h-4" />
                    <span className="text-sm flex-1">n8n</span>
                    {scanResult.n8n?.ok ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-muted-foreground">{scanResult.n8n.workflowCount} workflows ({scanResult.n8n.activeWorkflows} פעילים)</span>
                      </>
                    ) : (
                      <>
                        {scanResult.n8n?.checked ? <XCircle className="w-4 h-4 text-red-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                        <span className="text-xs text-muted-foreground truncate">{scanResult.n8n?.error || "לא מוגדר"}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {scanResult.connections?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Plug className="w-4 h-4 text-violet-400" /> חיבורים חיצוניים
                  </h3>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {scanResult.connections.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-2 rounded hover:bg-white/5">
                        {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" /> :
                         c.skipped ? <Clock className="w-4 h-4 text-gray-500 shrink-0" /> :
                         <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                        <span className="font-medium">{c.name}</span>
                        {c.latencyMs > 0 && <span className="text-xs text-muted-foreground">{c.latencyMs}ms</span>}
                        {c.status && <span className="text-xs text-muted-foreground">HTTP {c.status}</span>}
                        {c.error && <span className="text-xs text-red-400 truncate">{c.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scanResult.fixes?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-400" /> תיקונים שבוצעו
                  </h3>
                  <div className="space-y-1">
                    {scanResult.fixes.map((f: any, i: number) => (
                      <div key={i} className={`flex items-center gap-2 text-sm p-2 rounded-lg border ${f.severity === "error" ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                        {f.severity === "error" ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        <span className="font-medium">{f.name}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{f.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scanResult.summary && scanResult.summary.broken === 0 && scanResult.summary.total > 0 && (
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <HeartPulse className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="font-medium text-green-400">כל החיבורים תקינים!</p>
                    <p className="text-xs text-muted-foreground">המערכת פועלת כשורה, כל חיבורי ה-API מגיבים</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {scanResult?.error && (
            <div className="p-4">
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                <XCircle className="w-4 h-4" />
                <span>{scanResult.error}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חיבור..." className="w-full pr-10 pl-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-lg text-sm">
          <option value="all">כל הקטגוריות</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-lg text-sm">
          <option value="all">כל הסטטוסים</option>
          <option value="active">פעילים</option>
          <option value="inactive">כבויים</option>
          <option value="healthy">תקינים</option>
          <option value="unhealthy">תקולים</option>
        </select>
        <div className="text-sm text-muted-foreground">{filtered.length} חיבורים</div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Plug className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין חיבורי API{search ? " התואמים לחיפוש" : ""}</p>
          {!search && <button onClick={openCreate} className="mt-3 text-blue-400 hover:text-blue-300">הוסף חיבור ראשון</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => handleToggle(c)} title={c.is_active ? "פעיל" : "כבוי"}>
                  {c.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
                </button>
                <div className="flex items-center gap-2">
                  {c.last_test_status === "success" && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  {c.last_test_status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
                  {!c.last_test_status && <Clock className="w-4 h-4 text-gray-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CAT_COLORS[c.category] || CAT_COLORS.general}`}>
                      {CATEGORIES.find(cat => cat.value === c.category)?.label || c.category}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-muted-foreground font-mono">{c.method}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {AUTH_TYPES.find(a => a.value === c.auth_type)?.label || c.auth_type}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5 truncate font-mono" dir="ltr">{c.base_url}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.last_test_latency_ms != null && (
                    <span className={`text-xs px-2 py-1 rounded ${c.last_test_latency_ms < 500 ? "text-green-400" : c.last_test_latency_ms < 2000 ? "text-amber-400" : "text-red-400"}`}>
                      {c.last_test_latency_ms}ms
                    </span>
                  )}
                  <button
                    onClick={() => handleTest(c.id)}
                    disabled={testing === c.id}
                    className="p-1.5 hover:bg-blue-500/10 rounded text-blue-400 disabled:opacity-50"
                    title="בדוק חיבור"
                  >
                    {testing === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  </button>
                  <button onClick={() => loadLogs(c.id)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground" title="לוגים">
                    <History className="w-4 h-4" />
                  </button>
                  <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground">
                    {expandedId === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground" title="ערוך">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {deleteConfirm === c.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><CheckCircle2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteConfirm(null)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground" title="מחק">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {testResult && testResult.id === c.id && (
                <div className={`mx-4 mb-3 p-3 rounded-lg border text-sm ${testResult.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                  {testResult.ok
                    ? `חיבור תקין — HTTP ${testResult.status} — ${testResult.latencyMs}ms`
                    : `שגיאה — ${testResult.error || `HTTP ${testResult.status}`} — ${testResult.latencyMs}ms`}
                </div>
              )}

              {expandedId === c.id && (
                <div className="border-t border-border p-4 space-y-2 bg-black/20 text-sm">
                  {c.description && <div><span className="text-muted-foreground">תיאור: </span>{c.description}</div>}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><span className="text-muted-foreground">Timeout: </span>{c.timeout_ms}ms</div>
                    <div><span className="text-muted-foreground">ניסיונות חוזרים: </span>{c.retry_count}</div>
                    <div><span className="text-muted-foreground">מגבלת קצב: </span>{c.rate_limit_rpm}/דקה</div>
                    {c.health_endpoint && <div><span className="text-muted-foreground">Health: </span><code dir="ltr">{c.health_endpoint}</code></div>}
                  </div>
                  {c.last_test_at && (
                    <div className="text-muted-foreground">
                      בדיקה אחרונה: {new Date(c.last_test_at).toLocaleString("he-IL")} — <span className={STATUS_COLORS[c.last_test_status || ""] || ""}>{c.last_test_status}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    נוצר: {new Date(c.created_at).toLocaleDateString("he-IL")} · עודכן: {new Date(c.updated_at).toLocaleDateString("he-IL")}
                  </div>
                </div>
              )}

              {logsFor === c.id && logs.length > 0 && (
                <div className="border-t border-border p-4 bg-black/30">
                  <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <History className="w-4 h-4" /> היסטוריית בדיקות
                  </h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {logs.map(l => (
                      <div key={l.id} className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground w-32">{new Date(l.created_at).toLocaleString("he-IL")}</span>
                        <span className={l.status === "success" ? "text-green-400" : "text-red-400"}>{l.status}</span>
                        <span className="text-muted-foreground">{l.latency_ms}ms</span>
                        {l.response_code && <span className="text-muted-foreground">HTTP {l.response_code}</span>}
                        {l.details && <span className="text-muted-foreground">{l.details}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Plug className="w-5 h-5 text-blue-400" />
                {editItem ? "עריכת חיבור" : "חיבור API חדש"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/5 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">שם החיבור *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="לדוגמה: Priority ERP API" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">קטגוריה</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">כתובת URL בסיסית *</label>
                <input value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder="https://api.example.com/v1" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">תיאור</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="תיאור קצר של החיבור" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">שיטת בדיקה (Method)</label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">נתיב בדיקת תקינות</label>
                  <input value={form.health_endpoint} onChange={e => setForm(f => ({ ...f, health_endpoint: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder="/health" dir="ltr" />
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Shield className="w-4 h-4 text-amber-400" /> אימות (Authentication)
                </div>
                <select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                  {AUTH_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {form.auth_type === "bearer" && (
                  <div className="relative">
                    <input type={showAuthSecret ? "text" : "password"} value={form.auth_token} onChange={e => setForm(f => ({ ...f, auth_token: e.target.value }))} className="w-full px-3 py-2 pr-10 bg-background border border-border rounded-lg text-sm font-mono" placeholder="Bearer token" dir="ltr" />
                    <button type="button" onClick={() => setShowAuthSecret(!showAuthSecret)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showAuthSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
                {form.auth_type === "api-key" && (
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.auth_header_name} onChange={e => setForm(f => ({ ...f, auth_header_name: e.target.value }))} className="px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder="X-API-Key" dir="ltr" />
                    <div className="relative">
                      <input type={showAuthSecret ? "text" : "password"} value={form.auth_key} onChange={e => setForm(f => ({ ...f, auth_key: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder="API Key value" dir="ltr" />
                      <button type="button" onClick={() => setShowAuthSecret(!showAuthSecret)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showAuthSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {form.auth_type === "basic" && (
                  <div className="grid grid-cols-2 gap-3">
                    <input value={form.auth_username} onChange={e => setForm(f => ({ ...f, auth_username: e.target.value }))} className="px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="שם משתמש" dir="ltr" />
                    <input type={showAuthSecret ? "text" : "password"} value={form.auth_password} onChange={e => setForm(f => ({ ...f, auth_password: e.target.value }))} className="px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="סיסמה" dir="ltr" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">Headers נוספים (שורה לכל header)</label>
                <textarea value={form.headers_raw} onChange={e => setForm(f => ({ ...f, headers_raw: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder={"Content-Type: application/json\nAccept: application/json"} dir="ltr" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">Timeout (ms)</label>
                  <input type="number" value={form.timeout_ms} onChange={e => setForm(f => ({ ...f, timeout_ms: Number(e.target.value) }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">ניסיונות חוזרים</label>
                  <input type="number" value={form.retry_count} onChange={e => setForm(f => ({ ...f, retry_count: Number(e.target.value) }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" min={0} max={10} />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">מגבלת קצב (לדקה)</label>
                  <input type="number" value={form.rate_limit_rpm} onChange={e => setForm(f => ({ ...f, rate_limit_rpm: Number(e.target.value) }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" min={1} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                  {form.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
                </button>
                <span className="text-sm">{form.is_active ? "פעיל" : "כבוי"}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.base_url.trim()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editItem ? "עדכן" : "צור חיבור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
