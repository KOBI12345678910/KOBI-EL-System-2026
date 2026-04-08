import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Code2, Plus, Trash2, Eye, EyeOff, Copy, RefreshCw, Save, Webhook, Key } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const FALLBACK_API_KEYS = [
  { id: 1, name: "אינטגרציה ראשית", key: "ek_live_xxxxxxxxxxxxxxxxxxx", created: "01/01/2026", lastUsed: "17/03/2026", perms: "קריאה/כתיבה" },
  { id: 2, name: "אפליקציה מובייל", key: "ek_live_yyyyyyyyyyyyyyyyyyy", created: "15/02/2026", lastUsed: "17/03/2026", perms: "קריאה בלבד" },
  { id: 3, name: "דשבורד חיצוני", key: "ek_live_zzzzzzzzzzzzzzzzzzz", created: "10/03/2026", lastUsed: "16/03/2026", perms: "קריאה בלבד" },
];

const FALLBACK_WEBHOOKS = [
  { id: 1, name: "הזמנה חדשה", url: "https://n8n.mycompany.com/webhook/orders", events: ["order.created", "order.updated"], active: true },
  { id: 2, name: "לקוח חדש", url: "https://zapier.com/hooks/catch/xxx", events: ["customer.created"], active: true },
  { id: 3, name: "חשבונית שנשלחה", url: "https://hooks.slack.com/services/xxx", events: ["invoice.sent"], active: false },
];

const FALLBACK_ENDPOINTS = [
  { method: "GET", path: "/api/customers", desc: "קבלת רשימת לקוחות" },
  { method: "POST", path: "/api/customers", desc: "יצירת לקוח חדש" },
  { method: "GET", path: "/api/orders", desc: "קבלת הזמנות" },
  { method: "POST", path: "/api/orders", desc: "יצירת הזמנה חדשה" },
  { method: "GET", path: "/api/invoices", desc: "קבלת חשבוניות" },
  { method: "POST", path: "/api/invoices", desc: "יצירת חשבונית" },
];

export default function ApiConnectionsSection() {
  const { data: apiconnectionsData } = useQuery({
    queryKey: ["api-connections"],
    queryFn: () => authFetch("/api/settings/api_connections"),
    staleTime: 5 * 60 * 1000,
  });

  const API_KEYS = apiconnectionsData ?? FALLBACK_API_KEYS;

  const [activeTab, setActiveTab] = useState("keys");
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [showAddKey, setShowAddKey] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [newKey, setNewKey] = useState({ name: "", perms: "קריאה בלבד" });
  const [newWebhook, setNewWebhook] = useState({ name: "", url: "", event: "" });
  const [webhooks, setWebhooks] = useState(WEBHOOKS);

  const tabs = [
    { id: "keys", label: "מפתחות API" },
    { id: "webhooks", label: "Webhooks" },
    { id: "docs", label: "תיעוד Endpoints" },
    { id: "logs", label: "לוג קריאות" },
  ];

  const toggleVisible = (id: number) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) => key.slice(0, 10) + "•".repeat(key.length - 10);

  const METHOD_COLORS: Record<string, string> = {
    GET: "text-green-400 bg-green-500/10",
    POST: "text-blue-400 bg-blue-500/10",
    PUT: "text-yellow-400 bg-yellow-500/10",
    DELETE: "text-red-400 bg-red-500/10",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500/20 to-gray-500/20 flex items-center justify-center">
          <Code2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">API וחיבורים</h1>
          <p className="text-sm text-muted-foreground">ניהול מפתחות API, webhooks, endpoints ולוג קריאות</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "keys" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">מפתחות API</h3>
            <Button size="sm" className="gap-2" onClick={() => setShowAddKey(true)}>
              <Plus className="w-4 h-4" />
              מפתח חדש
            </Button>
          </div>

          {showAddKey && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-semibold mb-3">מפתח API חדש</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם המפתח</Label>
                  <Input value={newKey.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(p => ({ ...p, name: e.target.value }))} placeholder="תיאור שימוש" className="mt-1" />
                </div>
                <div>
                  <Label>הרשאות</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newKey.perms} onChange={(e) => setNewKey(p => ({ ...p, perms: e.target.value }))}>
                    <option>קריאה בלבד</option>
                    <option>קריאה/כתיבה</option>
                    <option>ניהול מלא</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" disabled={!newKey.name} className="gap-1">
                  <Key className="w-3.5 h-3.5" /> צור מפתח
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddKey(false)}>ביטול</Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {API_KEYS.map((apiKey) => (
              <Card key={apiKey.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-sm">{apiKey.name}</h4>
                    <p className="text-xs text-muted-foreground">נוצר: {apiKey.created} • שימוש אחרון: {apiKey.lastUsed}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      apiKey.perms === "ניהול מלא" ? "bg-red-500/10 text-red-400" :
                      apiKey.perms === "קריאה/כתיבה" ? "bg-blue-500/10 text-blue-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {apiKey.perms}
                    </span>
                    <button className="p-1 hover:bg-red-500/10 rounded">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                  <code className="text-xs font-mono flex-1">
                    {visibleKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                  </code>
                  <button onClick={() => toggleVisible(apiKey.id)} className="p-1 hover:bg-muted rounded">
                    {visibleKeys.has(apiKey.id) ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  <button className="p-1 hover:bg-muted rounded">
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Webhooks</h3>
            <Button size="sm" className="gap-2" onClick={() => setShowAddWebhook(true)}>
              <Plus className="w-4 h-4" />
              Webhook חדש
            </Button>
          </div>

          {showAddWebhook && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-semibold mb-3">Webhook חדש</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם</Label>
                  <Input value={newWebhook.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhook(p => ({ ...p, name: e.target.value }))} placeholder="תיאור" className="mt-1" />
                </div>
                <div>
                  <Label>URL</Label>
                  <Input value={newWebhook.url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhook(p => ({ ...p, url: e.target.value }))} placeholder="https://..." className="mt-1" />
                </div>
                <div>
                  <Label>אירוע</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newWebhook.event} onChange={(e) => setNewWebhook(p => ({ ...p, event: e.target.value }))}>
                    <option value="">בחר אירוע...</option>
                    <option value="order.created">order.created</option>
                    <option value="customer.created">customer.created</option>
                    <option value="invoice.sent">invoice.sent</option>
                    <option value="payment.received">payment.received</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" disabled={!newWebhook.name || !newWebhook.url} className="gap-1">
                  <Webhook className="w-3.5 h-3.5" /> הוסף
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddWebhook(false)}>ביטול</Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {webhooks.map((hook) => (
              <Card key={hook.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Webhook className="w-4 h-4 text-muted-foreground" />
                      <h4 className="font-semibold text-sm">{hook.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${hook.active ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                        {hook.active ? "פעיל" : "כבוי"}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mb-2">{hook.url}</p>
                    <div className="flex gap-1">
                      {hook.events.map(e => (
                        <span key={e} className="text-xs bg-muted/50 px-2 py-0.5 rounded font-mono">{e}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mr-4">
                    <button className="p-1 hover:bg-muted rounded" title="בדוק">
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button className="p-1 hover:bg-red-500/10 rounded" onClick={() => setWebhooks(prev => prev.filter(w => w.id !== hook.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "docs" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Base URL</h3>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 font-mono text-sm">https://erp.mycompany.com/api</div>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">Method</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">Endpoint</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground">תיאור</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((ep, i) => (
                  <tr key={i} className="border-b border-border hover:bg-muted/20">
                    <td className="p-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded font-mono ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
                    </td>
                    <td className="p-3 font-mono text-xs">{ep.path}</td>
                    <td className="p-3 text-xs text-muted-foreground">{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeTab === "logs" && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">לוג קריאות API</h3>
            <span className="text-xs text-muted-foreground">100 קריאות אחרונות</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right p-3 font-medium text-muted-foreground">זמן</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Method</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Endpoint</th>
                <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                <th className="text-right p-3 font-medium text-muted-foreground">זמן תגובה</th>
              </tr>
            </thead>
            <tbody>
              {[
                { time: "10:42:15", method: "GET", path: "/api/customers", status: 200, ms: "45ms" },
                { time: "10:42:10", method: "POST", path: "/api/orders", status: 201, ms: "123ms" },
                { time: "10:41:58", method: "GET", path: "/api/invoices", status: 200, ms: "38ms" },
                { time: "10:41:45", method: "PUT", path: "/api/customers/42", status: 200, ms: "67ms" },
                { time: "10:41:30", method: "DELETE", path: "/api/products/15", status: 404, ms: "22ms" },
                { time: "10:41:15", method: "GET", path: "/api/reports/monthly", status: 200, ms: "234ms" },
              ].map((log, i) => (
                <tr key={i} className="border-b border-border hover:bg-muted/20">
                  <td className="p-3 font-mono">{log.time}</td>
                  <td className="p-3">
                    <span className={`font-bold px-1.5 py-0.5 rounded font-mono ${METHOD_COLORS[log.method]}`}>{log.method}</span>
                  </td>
                  <td className="p-3 font-mono">{log.path}</td>
                  <td className="p-3">
                    <span className={`font-medium ${log.status < 300 ? "text-green-400" : log.status < 500 ? "text-yellow-400" : "text-red-400"}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{log.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="api-connections" />
        <RelatedRecords entityType="api-connections" />
      </div>
    </div>
  );
}
