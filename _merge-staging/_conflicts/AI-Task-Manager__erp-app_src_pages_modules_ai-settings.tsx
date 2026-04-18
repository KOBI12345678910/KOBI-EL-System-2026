import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Settings, Bot, Zap, CheckCircle2, XCircle, Loader2, RefreshCw, Wrench,
  MessageSquare, Activity, Key, Save, Eye, EyeOff, AlertTriangle, Moon, ExternalLink
} from "lucide-react";
import { Link } from "wouter";
import ActivityLog from "@/components/activity-log";

const API = "/api";

interface TestResult {
  success: boolean;
  error?: string;
  details?: string;
  responseTimeMs?: number;
  response?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

interface StatusData {
  configured: boolean;
  model: string;
  channels: number;
  totalConversations: number;
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  provider: string;
  providerUrl: string;
  toolsEnabled: boolean;
  availableTools: string[];
  toolCount: number;
  hasApiKey: boolean;
  hasBaseUrl: boolean;
}

interface KimiStatus {
  configured: boolean;
  name: string;
  organizationId: string;
  creatorId: string;
  defaultModel: string;
  availableModels: string[];
  baseUrl: string;
}

interface KimiTestResult {
  success: boolean;
  error?: string;
  responseTimeMs?: number;
  response?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export default function AISettingsPage() {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [kimiTestResult, setKimiTestResult] = useState<KimiTestResult | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<StatusData>({
    queryKey: ["ai-settings-status"],
    queryFn: async () => {
      const r = await authFetch(`${API}/claude/chat/status`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: kimiStatus, isLoading: kimiStatusLoading } = useQuery<KimiStatus>({
    queryKey: ["kimi-status"],
    queryFn: async () => {
      const r = await authFetch(`${API}/kimi/status`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/claude/chat/test-connection`, { method: "POST" });
      const data = await r.json();
      return data as TestResult;
    },
    onSuccess: (data) => setTestResult(data),
    onError: () => setTestResult({ success: false, error: "בקשת בדיקה נכשלה" }),
  });

  const kimiTestMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/kimi/test-connection`, { method: "POST" });
      return r.json() as Promise<KimiTestResult>;
    },
    onSuccess: (data) => {
      setKimiTestResult(data);
      queryClient.invalidateQueries({ queryKey: ["kimi-status"] });
    },
    onError: () => setKimiTestResult({ success: false, error: "בקשת הבדיקה נכשלה" }),
  });

  const saveMut = useMutation({
    mutationFn: async (config: { apiKey?: string; baseUrl?: string }) => {
      const r = await authFetch(`${API}/claude/chat/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!r.ok) throw new Error("Failed to save");
      return r.json();
    },
    onSuccess: () => {
      setSaveResult({ success: true, message: "הגדרות נשמרו בהצלחה" });
      setApiKeyInput("");
      setBaseUrlInput("");
      queryClient.invalidateQueries({ queryKey: ["ai-settings-status"] });
      setTimeout(() => setSaveResult(null), 4000);
    },
    onError: () => setSaveResult({ success: false, message: "שגיאה בשמירת הגדרות" }),
  });

  const handleSaveConfig = () => {
    const config: { apiKey?: string; baseUrl?: string } = {};
    if (apiKeyInput.trim()) config.apiKey = apiKeyInput.trim();
    if (baseUrlInput.trim()) config.baseUrl = baseUrlInput.trim();
    if (Object.keys(config).length === 0) return;
    saveMut.mutate(config);
  };

  return (
    <div dir="rtl" className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center">
          <Settings className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">הגדרות AI</h1>
          <p className="text-muted-foreground text-sm">Claude AI ו-Kimi / Moonshot AI — חיבור, מודל, כלים וסטטוס</p>
        </div>
      </div>

      {/* ─── Claude AI Section ─── */}
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-4 h-4 text-violet-400" />
        <h2 className="text-base font-semibold text-foreground">Claude AI (Anthropic)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-foreground">סטטוס חיבור</h3>
          </div>
          {statusLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>טוען...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {status?.configured ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <span className={status?.configured ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                  {status?.configured ? "מחובר ופעיל" : "לא מוגדר"}
                </span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>API Base URL: {status?.configured ? "מוגדר" : "חסר"}</p>
                <p>API Key: {status?.configured ? "מוגדר" : "חסר"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-foreground">ספק ומודל</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-mono text-sm bg-violet-600/20 px-3 py-1.5 rounded-lg">
                {status?.model || "claude-sonnet-4-6"}
              </span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>ספק: {status?.provider || "Anthropic"}</p>
              <p>Base URL: {status?.providerUrl === "configured" ? "מוגדר" : "לא מוגדר"}</p>
              <p>Max Tokens: 4,096</p>
              <p>ערוצים: {status?.channels || 7}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-foreground">נתוני שימוש</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">סה"כ שיחות:</span>
              <span className="text-foreground font-medium">{status?.totalConversations || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">סה"כ הודעות:</span>
              <span className="text-foreground font-medium">{status?.totalMessages || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input Tokens:</span>
              <span className="text-foreground font-medium">{(status?.totalInputTokens || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output Tokens:</span>
              <span className="text-foreground font-medium">{(status?.totalOutputTokens || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-border/50 pt-2">
              <span className="text-muted-foreground">סה"כ Tokens:</span>
              <span className="text-foreground font-medium">{((status?.totalInputTokens || 0) + (status?.totalOutputTokens || 0)).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-foreground">הגדרת API — Claude</h3>
        </div>
        {status?.configured ? (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-300">החיבור מוגדר דרך משתני סביבה (Replit Integrations). ניתן לעדכן ידנית אם נדרש.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-300">חיבור לא מוגדר. הוסף את Anthropic דרך Replit Integrations, או הגדר ידנית כאן.</span>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={status?.configured ? "••••••••" : "sk-ant-..."}
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-gray-600 focus:border-violet-500 focus:outline-none font-mono"
                dir="ltr"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-300"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Base URL (אופציונלי)</label>
            <input
              type="text"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder="https://api.anthropic.com"
              className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-gray-600 focus:border-violet-500 focus:outline-none font-mono"
              dir="ltr"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveConfig}
              disabled={saveMut.isPending || (!apiKeyInput.trim() && !baseUrlInput.trim())}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-muted disabled:text-muted-foreground text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              {saveMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>שמור הגדרות</span>
            </button>
            {saveResult && (
              <span className={`text-sm ${saveResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {saveResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-foreground">כלי Builder (Tool Use)</h3>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status?.toolsEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
            {status?.toolsEnabled ? "פעיל" : "כבוי"}
          </span>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Claude יכול לבצע פעולות ישירות במערכת דרך כלים (function calling). כשמבקשים ממנו לבנות מודול או ישות — הוא מבצע את הפעולה בפועל.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {(status?.availableTools || []).map((tool: string) => (
            <div key={tool} className="flex items-center gap-2 px-3 py-2 bg-input border border-border/50 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-gray-300 font-mono truncate">{tool}</span>
            </div>
          ))}
        </div>
        {status?.toolCount && (
          <p className="text-muted-foreground text-xs mt-3">{status.toolCount} כלים זמינים</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-foreground">בדיקת חיבור — Claude</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          שלח הודעת בדיקה ל-Claude כדי לוודא שהחיבור תקין ושהמודל מגיב.
        </p>
        <button
          onClick={() => { setTestResult(null); testMut.mutate(); }}
          disabled={testMut.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-muted text-foreground rounded-lg text-sm font-medium transition-colors"
        >
          {testMut.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>בודק חיבור...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              <span>בדוק חיבור</span>
            </>
          )}
        </button>

        {testResult && (
          <div className={`mt-4 p-4 rounded-lg border ${testResult.success ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
            <div className="flex items-center gap-2 mb-2">
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={`font-medium ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.success ? "חיבור תקין!" : "חיבור נכשל"}
              </span>
            </div>
            {testResult.success ? (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>זמן תגובה: {testResult.responseTimeMs}ms</p>
                <p>תשובה: {testResult.response}</p>
                <p>Tokens: {testResult.usage?.input_tokens} input / {testResult.usage?.output_tokens} output</p>
              </div>
            ) : (
              <p className="text-sm text-red-300">{testResult.error || testResult.details}</p>
            )}
          </div>
        )}
      </div>

      {/* ─── Kimi / Moonshot AI Section ─── */}
      <div className="flex items-center gap-2 mt-8 mb-1">
        <Moon className="w-4 h-4 text-cyan-400" />
        <h2 className="text-base font-semibold text-foreground">Kimi / Moonshot AI</h2>
        <Link href="/ai-engine/kimi">
          <span className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer mr-auto">
            <ExternalLink className="w-3 h-3" />
            פתח טרמינל
          </span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-foreground">סטטוס חיבור — Kimi</h3>
          </div>
          {kimiStatusLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>טוען...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {kimiStatus?.configured ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <span className={kimiStatus?.configured ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                  {kimiStatus?.configured ? "MOONSHOT_API_KEY מוגדר" : "MOONSHOT_API_KEY חסר"}
                </span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Base URL: <span className="font-mono text-xs text-gray-300">{kimiStatus?.baseUrl}</span></p>
                <p>מודל ברירת מחדל: <span className="font-mono text-xs text-gray-300">{kimiStatus?.defaultModel}</span></p>
                <p>מודלים: <span className="text-gray-300">{kimiStatus?.availableModels?.join(", ")}</span></p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-cyan-400" />
            <h3 className="font-semibold text-foreground">פרטי ספק — Moonshot</h3>
          </div>
          <div className="text-sm space-y-2">
            <div>
              <span className="text-muted-foreground text-xs block mb-0.5">Organization ID</span>
              <span className="font-mono text-xs text-foreground bg-input px-2 py-1 rounded block break-all">
                {kimiStatus?.organizationId || "org-e84639ad07f543029b5d8545f663a400"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block mb-0.5">Creator ID</span>
              <span className="font-mono text-xs text-foreground bg-input px-2 py-1 rounded block">
                {kimiStatus?.creatorId || "d6t072d9f1khvj148as0"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block mb-0.5">מפתח API</span>
              <span className="font-mono text-xs text-foreground bg-input px-2 py-1 rounded block">
                {kimiStatus?.configured ? "•••••••••••••••••••• (מוגדר כ-env secret)" : "לא מוגדר"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-foreground">בדיקת חיבור — Kimi</h3>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          שלח הודעת בדיקה ל-Kimi (Moonshot AI) כדי לוודא שהחיבור תקין ושה-API Key עובד.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setKimiTestResult(null); kimiTestMut.mutate(); }}
            disabled={kimiTestMut.isPending || !kimiStatus?.configured}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-muted disabled:text-muted-foreground text-foreground rounded-lg text-sm font-medium transition-colors"
          >
            {kimiTestMut.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>בודק חיבור...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>בדוק חיבור Kimi</span>
              </>
            )}
          </button>
          <Link href="/ai-engine/kimi">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-input border border-border hover:border-cyan-500/50 text-foreground rounded-lg text-sm font-medium transition-colors">
              <Moon className="w-4 h-4 text-cyan-400" />
              <span>פתח טרמינל Kimi</span>
            </button>
          </Link>
        </div>

        {kimiTestResult && (
          <div className={`mt-4 p-4 rounded-lg border ${kimiTestResult.success ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
            <div className="flex items-center gap-2 mb-2">
              {kimiTestResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={`font-medium ${kimiTestResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {kimiTestResult.success ? "חיבור Kimi תקין!" : "חיבור Kimi נכשל"}
              </span>
              {kimiTestResult.responseTimeMs && (
                <span className="text-muted-foreground text-xs mr-auto">{kimiTestResult.responseTimeMs}ms</span>
              )}
            </div>
            {kimiTestResult.success ? (
              <div className="text-sm text-muted-foreground space-y-1">
                {kimiTestResult.response && <p>תשובה: {kimiTestResult.response}</p>}
                {kimiTestResult.usage && (
                  <p>Tokens: {kimiTestResult.usage.prompt_tokens} input / {kimiTestResult.usage.completion_tokens} output / {kimiTestResult.usage.total_tokens} סה"כ</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-300">{kimiTestResult.error}</p>
            )}
          </div>
        )}
      </div>

      <ActivityLog entityType="ai-settings" />
    </div>
  );
}
