import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Settings, Save, RefreshCw, CheckCircle2, AlertTriangle,
  Zap, Brain, Moon, Sparkles, Activity, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, Cpu, Shield
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface ProviderSettings {
  id: number;
  provider: string;
  is_enabled: boolean;
  priority: number;
  monthly_budget: string | null;
  monthly_spent: string | null;
  requests_this_month: number;
  health_status: string;
  preferred_model_for_code: string;
  preferred_model_for_reasoning: string;
  preferred_model_for_fast: string;
  preferred_model_for_hebrew: string;
  last_health_check: string;
}

interface HealthData {
  providers: Record<string, { configured: boolean; status: string; error?: string }>;
}

const PROVIDER_META: Record<string, { label: string; icon: any; color: string; bgColor: string; description: string }> = {
  claude: {
    label: "Claude (Anthropic)",
    icon: Brain,
    color: "text-violet-400",
    bgColor: "bg-violet-500/20",
    description: "חשיבה מורכבת, ניתוח ויצירת קוד",
  },
  openai: {
    label: "OpenAI (GPT)",
    icon: Sparkles,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/20",
    description: "קוד, יצירת תוכן ומשימות כלליות",
  },
  gemini: {
    label: "Gemini (Google)",
    icon: Zap,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    description: "מהיר ויעיל לשאלות קצרות ועיבוד",
  },
  kimi: {
    label: "Kimi (Moonshot)",
    icon: Moon,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20",
    description: "מיוחד לעברית ועם חלון הקשר גדול",
  },
};

const TASK_TYPE_LABELS = [
  { key: "preferred_model_for_code", label: "מודל לקוד" },
  { key: "preferred_model_for_reasoning", label: "מודל להסקת מסקנות" },
  { key: "preferred_model_for_fast", label: "מודל מהיר" },
  { key: "preferred_model_for_hebrew", label: "מודל לעברית" },
];

const MODEL_OPTIONS: Record<string, string[]> = {
  claude: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-6"],
  openai: ["gpt-5.2", "gpt-5-mini", "gpt-5-nano", "gpt-5.3-codex"],
  gemini: ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-pro-preview", "gemini-2.5-pro"],
  kimi: ["kimi-k2.5", "kimi-k2-thinking", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
};

export default function AIAdminSettingsPage() {
  const [providers, setProviders] = useState<ProviderSettings[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedProviders, setEditedProviders] = useState<Record<string, Partial<ProviderSettings>>>({});
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [provRes, healthRes] = await Promise.all([
        authFetch(`${API}/ai-orchestration/providers`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/ai-orchestration/health`, { headers: headers() }).then(r => r.json()),
      ]);
      setProviders(provRes.providers || []);
      setHealth(healthRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const updateLocal = (provider: string, key: string, value: any) => {
    setEditedProviders(prev => ({
      ...prev,
      [provider]: { ...(prev[provider] || {}), [key]: value },
    }));
  };

  const saveProvider = async (provider: string) => {
    const changes = editedProviders[provider];
    if (!changes || Object.keys(changes).length === 0) return;

    setSaving(provider);
    try {
      await authFetch(`${API}/ai-orchestration/providers/${provider}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(changes),
      });
      toast({ title: `${provider} עודכן בהצלחה` });
      setEditedProviders(prev => { const n = { ...prev }; delete n[provider]; return n; });
      await fetchData();
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const getProviderValue = (provider: ProviderSettings, key: string): any => {
    const edited = editedProviders[provider.provider];
    if (edited && key in edited) return edited[key];
    return (provider as any)[key];
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-card rounded-xl animate-pulse border border-border" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center">
          <Settings className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">הגדרות מנוע AI</h1>
          <p className="text-muted-foreground text-sm">ניהול ספקים, עדיפויות, תקציבים ומודלים מועדפים</p>
        </div>
        <button onClick={fetchData} className="mr-auto flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg hover:bg-muted text-sm">
          <RefreshCw className="w-3.5 h-3.5" /> רענן
        </button>
      </div>

      {health && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">סטטוס חיבורים</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(health.providers).map(([prov, h]) => (
              <div key={prov} className="flex items-center gap-2 p-2 bg-background rounded-lg">
                {h.status === "healthy" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-medium text-foreground">{prov}</div>
                  <div className={`text-[10px] ${h.status === "healthy" ? "text-green-400" : "text-amber-400"}`}>
                    {h.status === "healthy" ? "מחובר" : "לא מוגדר"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {providers.map((prov, i) => {
          const meta = PROVIDER_META[prov.provider];
          if (!meta) return null;
          const Icon = meta.icon;
          const healthStatus = health?.providers?.[prov.provider];
          const isExpanded = expandedProvider === prov.provider;
          const hasChanges = !!editedProviders[prov.provider] && Object.keys(editedProviders[prov.provider]).length > 0;

          return (
            <motion.div key={prov.provider} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className={`w-10 h-10 rounded-xl ${meta.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
                    {healthStatus?.status === "healthy" && (
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">עדיפות</div>
                    <input
                      type="number"
                      value={getProviderValue(prov, "priority") || 100}
                      onChange={e => updateLocal(prov.provider, "priority", parseInt(e.target.value))}
                      className="w-16 px-2 py-0.5 bg-background border border-border rounded text-xs text-foreground text-center"
                    />
                  </div>

                  <button
                    onClick={() => updateLocal(prov.provider, "is_enabled", !getProviderValue(prov, "is_enabled"))}
                    className={getProviderValue(prov, "is_enabled") ? "text-green-400" : "text-muted-foreground"}
                  >
                    {getProviderValue(prov, "is_enabled")
                      ? <ToggleRight className="w-7 h-7" />
                      : <ToggleLeft className="w-7 h-7" />}
                  </button>

                  {hasChanges && (
                    <button
                      onClick={() => saveProvider(prov.provider)}
                      disabled={saving === prov.provider}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-foreground rounded-lg text-xs disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      {saving === prov.provider ? "שומר..." : "שמור"}
                    </button>
                  )}

                  <button onClick={() => setExpandedProvider(isExpanded ? null : prov.provider)}>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border p-4 bg-muted/10 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">תקציב חודשי ($)</label>
                      <input
                        type="number"
                        value={getProviderValue(prov, "monthly_budget") || ""}
                        onChange={e => updateLocal(prov.provider, "monthlyBudget", e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="ללא הגבלה"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">בקשות החודש</label>
                      <div className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground">
                        {prov.requests_this_month || 0}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs text-muted-foreground mb-2 font-medium">מודלים מועדפים לפי סוג משימה</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {TASK_TYPE_LABELS.map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                          <select
                            value={getProviderValue(prov, key) || ""}
                            onChange={e => updateLocal(prov.provider, key, e.target.value)}
                            className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                          >
                            <option value="">ברירת מחדל</option>
                            {(MODEL_OPTIONS[prov.provider] || []).map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveProvider(prov.provider)}
                      disabled={saving === prov.provider || !hasChanges}
                      className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-foreground rounded-lg text-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving === prov.provider ? "שומר..." : "שמור שינויים"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-foreground">לוגיקת ניתוב AI</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { task: "קוד ופיתוח", provider: "OpenAI → Claude", icon: "💻" },
            { task: "הסקת מסקנות", provider: "Claude → OpenAI", icon: "🧠" },
            { task: "שאלות מהירות", provider: "Gemini Flash → OpenAI", icon: "⚡" },
            { task: "עברית", provider: "Kimi → Claude", icon: "🇮🇱" },
          ].map((r, i) => (
            <div key={i} className="bg-background rounded-lg p-3">
              <div className="text-lg mb-1">{r.icon}</div>
              <div className="text-xs font-medium text-foreground">{r.task}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{r.provider}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
