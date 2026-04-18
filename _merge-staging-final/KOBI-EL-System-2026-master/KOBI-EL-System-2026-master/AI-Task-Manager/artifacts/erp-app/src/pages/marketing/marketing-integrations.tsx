import { useState, useEffect } from "react";
import { Plug, CheckCircle, XCircle, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Save, TestTube } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const h = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

interface Platform {
  id: string;
  name: string;
  nameHe: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  baseUrl: string;
  authMethod: string;
  fields: { key: string; label: string; type: string; placeholder: string; required?: boolean }[];
  testEndpoint: string;
  syncEndpoint: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "google-ads",
    name: "Google Ads",
    nameHe: "גוגל אדס",
    slug: "google-ads",
    description: "סנכרון קמפיינים ומדדי ביצועים מ-Google Ads",
    icon: "🔵",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    baseUrl: "https://googleads.googleapis.com",
    authMethod: "bearer",
    fields: [
      { key: "token", label: "Developer Token", type: "password", placeholder: "הזן developer token", required: true },
      { key: "customerId", label: "Customer ID", type: "text", placeholder: "XXX-XXX-XXXX", required: true },
      { key: "loginCustomerId", label: "Manager Account ID", type: "text", placeholder: "ב-MCC חשבון" },
    ],
    testEndpoint: "/v14/customers:listAccessibleCustomers",
    syncEndpoint: "/api/marketing/sync/google-ads",
  },
  {
    id: "facebook-ads",
    name: "Facebook / Meta Ads",
    nameHe: "פייסבוק / מטה אדס",
    slug: "facebook-ads",
    description: "משיכת נתוני קמפיינים ומדדים מ-Meta Business Suite",
    icon: "🔷",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10 border-indigo-500/20",
    baseUrl: "https://graph.facebook.com",
    authMethod: "bearer",
    fields: [
      { key: "token", label: "Access Token", type: "password", placeholder: "הזן access token", required: true },
      { key: "adAccountId", label: "Ad Account ID", type: "text", placeholder: "act_XXXXXXXXX", required: true },
      { key: "appId", label: "App ID", type: "text", placeholder: "מזהה האפליקציה" },
    ],
    testEndpoint: "/v18.0/me",
    syncEndpoint: "/api/marketing/sync/facebook-ads",
  },
  {
    id: "google-analytics",
    name: "Google Analytics 4",
    nameHe: "גוגל אנליטיקס",
    slug: "google-analytics",
    description: "מעקב תנועה, המרות ומדדי אתר",
    icon: "📊",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
    baseUrl: "https://analyticsdata.googleapis.com",
    authMethod: "bearer",
    fields: [
      { key: "token", label: "API Key / Service Account Token", type: "password", placeholder: "הזן API key", required: true },
      { key: "propertyId", label: "Property ID", type: "text", placeholder: "XXXXXXXXX", required: true },
    ],
    testEndpoint: "/v1beta",
    syncEndpoint: "/api/marketing/sync/google-analytics",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    nameHe: "מיילצ'ימפ",
    slug: "mailchimp",
    description: "סנכרון רשימות תפוצה ומדדי קמפייני אימייל",
    icon: "📧",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10 border-yellow-500/20",
    baseUrl: "https://us1.api.mailchimp.com",
    authMethod: "basic",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "XXXXXXXX-usX", required: true },
      { key: "serverPrefix", label: "Server Prefix", type: "text", placeholder: "us1, us6, ...", required: true },
      { key: "listId", label: "Audience List ID", type: "text", placeholder: "מזהה רשימת התפוצה" },
    ],
    testEndpoint: "/3.0/",
    syncEndpoint: "/api/marketing/sync/mailchimp",
  },
];

interface ConnectionState {
  connectionId?: number;
  connected: boolean;
  lastSync?: string;
  credentials: Record<string, string>;
  expanded: boolean;
  testing: boolean;
  syncing: boolean;
  testResult?: { success: boolean; message: string };
  saving: boolean;
}

export default function MarketingIntegrationsPage() {
  const [connections, setConnections] = useState<Record<string, ConnectionState>>(
    Object.fromEntries(PLATFORMS.map(p => [p.id, {
      connected: false,
      credentials: {},
      expanded: false,
      testing: false,
      syncing: false,
      saving: false,
    }]))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/integrations/connections`, { headers: h() });
      const data = await res.json();
      if (Array.isArray(data)) {
        const updates: Record<string, Partial<ConnectionState>> = {};
        for (const conn of data) {
          const platform = PLATFORMS.find(p => p.slug === conn.slug);
          if (platform) {
            const authConfig = conn.authConfig || {};
            updates[platform.id] = {
              connectionId: conn.id,
              connected: conn.isActive,
              lastSync: conn.lastSyncAt,
              credentials: authConfig,
            };
          }
        }
        setConnections(prev => {
          const next = { ...prev };
          for (const [id, update] of Object.entries(updates)) {
            next[id] = { ...next[id], ...update };
          }
          return next;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setConnections(prev => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id].expanded },
    }));
  };

  const updateCred = (platformId: string, key: string, value: string) => {
    setConnections(prev => ({
      ...prev,
      [platformId]: {
        ...prev[platformId],
        credentials: { ...prev[platformId].credentials, [key]: value },
      },
    }));
  };

  const save = async (platform: Platform) => {
    const state = connections[platform.id];
    setConnections(prev => ({ ...prev, [platform.id]: { ...prev[platform.id], saving: true } }));
    try {
      const creds = state.credentials;
      const body = {
        name: platform.name,
        slug: platform.slug,
        description: platform.description,
        serviceType: "rest_api",
        baseUrl: platform.baseUrl,
        authMethod: platform.authMethod,
        authConfig: { ...creds, testEndpoint: platform.testEndpoint },
        defaultHeaders: {},
        isActive: true,
      };

      let res;
      if (state.connectionId) {
        res = await authFetch(`${API}/integrations/connections/${state.connectionId}`, {
          method: "PUT",
          headers: h(),
          body: JSON.stringify(body),
        });
      } else {
        res = await authFetch(`${API}/integrations/connections`, {
          method: "POST",
          headers: h(),
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      setConnections(prev => ({
        ...prev,
        [platform.id]: {
          ...prev[platform.id],
          connectionId: data.id || prev[platform.id].connectionId,
          connected: true,
          saving: false,
        },
      }));
    } catch (e) {
      console.error(e);
      setConnections(prev => ({ ...prev, [platform.id]: { ...prev[platform.id], saving: false } }));
    }
  };

  const test = async (platform: Platform) => {
    const state = connections[platform.id];
    if (!state.connectionId) {
      alert("שמור את החיבור תחילה לפני בדיקת החיבור");
      return;
    }
    setConnections(prev => ({ ...prev, [platform.id]: { ...prev[platform.id], testing: true, testResult: undefined } }));
    try {
      const res = await authFetch(`${API}/integrations/connections/${state.connectionId}/test`, {
        method: "POST",
        headers: h(),
      });
      const data = await res.json();
      setConnections(prev => ({
        ...prev,
        [platform.id]: {
          ...prev[platform.id],
          testing: false,
          testResult: { success: data.success, message: data.message },
          lastSync: data.success ? new Date().toISOString() : prev[platform.id].lastSync,
        },
      }));
    } catch (e: any) {
      setConnections(prev => ({
        ...prev,
        [platform.id]: {
          ...prev[platform.id],
          testing: false,
          testResult: { success: false, message: e.message },
        },
      }));
    }
  };

  const sync = async (platform: Platform) => {
    const state = connections[platform.id];
    if (!state.connectionId) {
      alert("שמור את החיבור תחילה");
      return;
    }
    setConnections(prev => ({ ...prev, [platform.id]: { ...prev[platform.id], syncing: true } }));
    try {
      const creds = connections[platform.id].credentials;
      const res = await fetch(platform.syncEndpoint, {
        method: "POST",
        headers: h(),
        body: JSON.stringify({ connectionId: state.connectionId, credentials: creds }),
      });
      const data = await res.json();
      setConnections(prev => ({
        ...prev,
        [platform.id]: {
          ...prev[platform.id],
          syncing: false,
          lastSync: new Date().toISOString(),
          testResult: {
            success: data.success !== false,
            message: data.message || (data.synced ? `סונכרנו ${data.synced} רשומות` : "הסנכרון הושלם"),
          },
        },
      }));
    } catch (e: any) {
      setConnections(prev => ({
        ...prev,
        [platform.id]: {
          ...prev[platform.id],
          syncing: false,
          testResult: { success: false, message: e.message },
        },
      }));
    }
  };

  const formatDate = (d?: string) => {
    if (!d) return "לא בוצע";
    return new Date(d).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Plug className="text-purple-400" size={28} />
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">חיבורי פלטפורמות שיווק</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1 mr-10">חבר פלטפורמות פרסום דיגיטלי לסנכרון אוטומטי של נתוני קמפיינים</p>
        </div>
        <button onClick={loadConnections} className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />רענון
        </button>
      </div>

      <div className="bg-muted/50 border border-border rounded-xl p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            חבר את פלטפורמות הפרסום שלך על ידי הזנת API Keys ו-Access Tokens. הנתונים מסונכרנים ידנית בלחיצת כפתור.
            אין שמירת credentials בטקסט גלוי — כל הנתונים מוצפנים ומוסתרים בממשק.
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {PLATFORMS.map(platform => {
          const state = connections[platform.id];
          return (
            <div key={platform.id} className={`${state.connected ? platform.bgColor : "bg-background border-border"} border rounded-xl overflow-hidden`}>
              <div className="p-4 cursor-pointer" onClick={() => toggle(platform.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{platform.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-semibold">{platform.nameHe}</span>
                        <span className="text-muted-foreground text-sm">({platform.name})</span>
                        {state.connected ? (
                          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full border border-green-500/30">
                            <CheckCircle size={10} />מחובר
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            <XCircle size={10} />לא מחובר
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs mt-0.5">{platform.description}</p>
                      {state.lastSync && (
                        <p className="text-muted-foreground text-xs mt-0.5">סנכרון אחרון: {formatDate(state.lastSync)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {state.connected && (
                      <button
                        onClick={e => { e.stopPropagation(); sync(platform); }}
                        disabled={state.syncing}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-xs disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={state.syncing ? "animate-spin" : ""} />
                        {state.syncing ? "מסנכרן..." : "סנכרן עכשיו"}
                      </button>
                    )}
                    {state.expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {state.expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {platform.fields.map(field => (
                          <div key={field.key}>
                            <label className="block text-sm text-muted-foreground mb-1">
                              {field.label}
                              {field.required && <span className="text-red-400 mr-1">*</span>}
                            </label>
                            <input
                              type={field.type}
                              value={state.credentials[field.key] || ""}
                              onChange={e => updateCred(platform.id, field.key, e.target.value)}
                              placeholder={field.placeholder}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:border-purple-500 focus:outline-none"
                              autoComplete="off"
                            />
                          </div>
                        ))}
                      </div>

                      {state.testResult && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${state.testResult.success ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
                          {state.testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                          {state.testResult.message}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => save(platform)}
                          disabled={state.saving}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-sm disabled:opacity-50"
                        >
                          <Save size={14} />
                          {state.saving ? "שומר..." : "שמור הגדרות"}
                        </button>
                        <button
                          onClick={() => test(platform)}
                          disabled={state.testing || !state.connectionId}
                          className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm disabled:opacity-50"
                          title={!state.connectionId ? "שמור תחילה" : ""}
                        >
                          <TestTube size={14} />
                          {state.testing ? "בודק..." : "בדוק חיבור"}
                        </button>
                        {state.connected && (
                          <button
                            onClick={() => sync(platform)}
                            disabled={state.syncing}
                            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-foreground rounded-lg text-sm disabled:opacity-50"
                          >
                            <RefreshCw size={14} className={state.syncing ? "animate-spin" : ""} />
                            {state.syncing ? "מסנכרן..." : "סנכרן נתונים"}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="bg-background border border-border rounded-xl p-4">
        <h3 className="text-foreground font-semibold mb-2 flex items-center gap-2">
          <Plug size={16} className="text-purple-400" />
          Webhook Endpoints
        </h3>
        <p className="text-muted-foreground text-sm mb-3">
          השתמש בנקודות קצה אלה לקבלת עדכונים אוטומטיים מפלטפורמות שיווק חיצוניות:
        </p>
        <div className="space-y-2">
          {[
            { path: "/api/marketing/webhook/leads", label: "עדכוני לידים", desc: "קבלת לידים חדשים מפלטפורמות פרסום" },
            { path: "/api/marketing/webhook/conversions", label: "אירועי המרות", desc: "עדכון נתוני המרות בזמן אמת" },
            { path: "/api/marketing/webhook/spend", label: "עדכוני הוצאות", desc: "סנכרון הוצאות יומיות" },
          ].map((ep, i) => (
            <div key={i} className="bg-muted rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-green-400 font-mono text-sm">{ep.path}</span>
                <div className="text-muted-foreground text-xs mt-0.5">{ep.desc}</div>
              </div>
              <span className="text-xs bg-muted text-gray-300 px-2 py-0.5 rounded">{ep.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
