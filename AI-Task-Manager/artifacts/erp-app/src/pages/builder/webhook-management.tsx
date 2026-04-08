import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Webhook, Plus, Trash2, Settings, Play, Eye, Copy, CheckCircle,
  XCircle, RefreshCw, Globe, Shield, Zap, ChevronDown, ChevronUp,
  ExternalLink, Clock, Link, X, ChevronLeft, AlertTriangle, ArrowDown, ArrowUp
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

const ERP_EVENTS = [
  { value: "record.created", label: "רשומה נוצרה" },
  { value: "record.updated", label: "רשומה עודכנה" },
  { value: "record.deleted", label: "רשומה נמחקה" },
  { value: "record.status_changed", label: "סטטוס השתנה" },
  { value: "notification.created", label: "התראה חדשה" },
  { value: "approval.requested", label: "בקשת אישור" },
  { value: "approval.approved", label: "אישור התקבל" },
  { value: "approval.rejected", label: "אישור נדחה" },
  { value: "invoice.overdue", label: "חשבונית באיחור" },
  { value: "stock.low", label: "מלאי נמוך" },
  { value: "order.created", label: "הזמנה חדשה" },
];

interface OutgoingWebhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  authType: string;
  authValue: string | null;
  description: string | null;
  retryPolicy: { maxRetries: number; backoffSeconds: number };
  isActive: boolean;
  createdAt: string;
}

interface IncomingEndpoint {
  id: number;
  name: string;
  slug: string;
  secret: string | null;
  description: string | null;
  mappedAction: string | null;
  isActive: boolean;
  totalCalls: number;
  lastCalledAt: string | null;
  createdAt: string;
}

interface WebhookDeliveryLog {
  id: number;
  event: string;
  success: boolean;
  responseStatus: number | null;
  errorMessage: string | null;
  duration: number | null;
  sentAt: string;
  retryCount: number;
}

export default function WebhookManagement() {
  const [activeTab, setActiveTab] = useState<"outgoing" | "incoming">("outgoing");
  const [showCreateOutgoing, setShowCreateOutgoing] = useState(false);
  const [showCreateIncoming, setShowCreateIncoming] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<OutgoingWebhook | null>(null);
  const [viewingLogs, setViewingLogs] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, any>>({});
  const [expandedEndpoint, setExpandedEndpoint] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: outgoingWebhooks = [], isLoading: loadingOutgoing } = useQuery<OutgoingWebhook[]>({
    queryKey: ["outgoing-webhooks"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/outgoing-webhooks`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: incomingEndpoints = [], isLoading: loadingIncoming } = useQuery<IncomingEndpoint[]>({
    queryKey: ["incoming-webhooks"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/incoming-webhooks`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: deliveryLogs = [] } = useQuery<WebhookDeliveryLog[]>({
    queryKey: ["webhook-delivery-logs", viewingLogs],
    queryFn: async () => {
      if (!viewingLogs) return [];
      const r = await authFetch(`${API}/platform/outgoing-webhooks/${viewingLogs}/logs?limit=20`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!viewingLogs,
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: "outgoing" | "incoming" }) => {
      const url = type === "outgoing" ? `${API}/platform/outgoing-webhooks/${id}` : `${API}/platform/incoming-webhooks/${id}`;
      await authFetch(url, { method: "DELETE" });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [vars.type === "outgoing" ? "outgoing-webhooks" : "incoming-webhooks"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive, type }: { id: number; isActive: boolean; type: "outgoing" | "incoming" }) => {
      const url = type === "outgoing" ? `${API}/platform/outgoing-webhooks/${id}` : `${API}/platform/incoming-webhooks/${id}`;
      await authFetch(url, { method: "PUT", body: JSON.stringify({ isActive: !isActive }) });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [vars.type === "outgoing" ? "outgoing-webhooks" : "incoming-webhooks"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ id, type }: { id: number; type: "outgoing" | "incoming" }) => {
      const url = type === "outgoing" ? `${API}/platform/outgoing-webhooks/${id}/test` : `${API}/platform/incoming-webhooks/${id}/test`;
      const r = await authFetch(url, { method: "POST" });
      return r.json();
    },
    onSuccess: (data, vars) => {
      setTestResult(prev => ({ ...prev, [vars.id]: data }));
      queryClient.invalidateQueries({ queryKey: [vars.type === "outgoing" ? "outgoing-webhooks" : "incoming-webhooks"] });
    },
  });

  const getWebhookUrl = (slug: string) => {
    const domain = window.location.host;
    return `${window.location.protocol}//${domain}/api/platform/webhooks/receive/${slug}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const baseUrl = `${window.location.protocol}//${window.location.host}/api/platform/webhooks/receive/`;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">ניהול Webhooks</h1>
            <p className="text-sm text-muted-foreground">אינטגרציות נכנסות ויוצאות</p>
          </div>
        </div>
        {activeTab === "outgoing" ? (
          <button onClick={() => setShowCreateOutgoing(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            Webhook יוצא
          </button>
        ) : (
          <button onClick={() => setShowCreateIncoming(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />
            Endpoint נכנס
          </button>
        )}
      </div>

      <div className="flex bg-muted rounded-xl p-0.5 w-fit">
        <button onClick={() => setActiveTab("outgoing")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "outgoing" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
          <ArrowUp className="w-4 h-4" />
          יוצאים ({outgoingWebhooks.length})
        </button>
        <button onClick={() => setActiveTab("incoming")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "incoming" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
          <ArrowDown className="w-4 h-4" />
          נכנסים ({incomingEndpoints.length})
        </button>
      </div>

      {activeTab === "outgoing" && (
        <div className="space-y-3">
          {loadingOutgoing ? (
            <div className="py-12 text-center text-muted-foreground">טוען...</div>
          ) : outgoingWebhooks.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Webhook className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">אין Webhooks יוצאים</h3>
              <p className="text-muted-foreground mb-4">הוסף Webhook לשליחת אירועי ERP למערכות חיצוניות</p>
              <button onClick={() => setShowCreateOutgoing(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium">
                <Plus className="w-4 h-4" />
                Webhook יוצא חדש
              </button>
            </div>
          ) : (
            outgoingWebhooks.map((wh) => (
              <div key={wh.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${wh.isActive ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
                    <div>
                      <h3 className="font-semibold">{wh.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{wh.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testMutation.mutate({ id: wh.id, type: "outgoing" })}
                      disabled={testMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs hover:bg-primary/20 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      בדוק
                    </button>
                    <button onClick={() => setViewingLogs(viewingLogs === wh.id ? null : wh.id)} className="p-1.5 hover:bg-muted rounded-lg">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => setEditingWebhook(wh)} className="p-1.5 hover:bg-muted rounded-lg">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: wh.id, isActive: wh.isActive, type: "outgoing" })}
                      className={`text-xs px-2 py-1 rounded-lg ${wh.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}
                    >
                      {wh.isActive ? "פעיל" : "כבוי"}
                    </button>
                    {isSuperAdmin && (
                      <button onClick={async () => { const ok = await globalConfirm("מחיקת webhook", { itemName: wh.name, entityType: "webhook יוצא" }); if (ok) deleteMutation.mutate({ id: wh.id, type: "outgoing" }); }} className="p-1.5 hover:bg-destructive/10 rounded-lg">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {(wh.events || []).map((ev) => (
                    <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">{ERP_EVENTS.find(e => e.value === ev)?.label || ev}</span>
                  ))}
                  {wh.authType !== "none" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                      <Shield className="w-2.5 h-2.5 inline-block mr-1" />
                      {wh.authType}
                    </span>
                  )}
                </div>

                {testResult[wh.id] && (
                  <div className={`mt-2 p-3 rounded-xl text-xs ${testResult[wh.id].success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                    <div className="flex items-center gap-2">
                      {testResult[wh.id].success ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      <span className={testResult[wh.id].success ? "text-green-400" : "text-red-400"}>
                        {testResult[wh.id].success ? "הבדיקה הצליחה" : "הבדיקה נכשלה"}
                        {testResult[wh.id].responseStatus && ` — HTTP ${testResult[wh.id].responseStatus}`}
                        {testResult[wh.id].duration && ` (${testResult[wh.id].duration}ms)`}
                      </span>
                    </div>
                    {testResult[wh.id].errorMessage && <p className="text-red-400 mt-1">{testResult[wh.id].errorMessage}</p>}
                  </div>
                )}

                {viewingLogs === wh.id && deliveryLogs.length > 0 && (
                  <div className="mt-3 border-t border-border/30 pt-3">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">לוג שליחות אחרונות</h4>
                    <div className="space-y-1.5">
                      {deliveryLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className="flex items-center gap-3 text-xs">
                          {log.success ? <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                          <span className="text-muted-foreground">{log.event}</span>
                          {log.responseStatus && <span className="font-mono">HTTP {log.responseStatus}</span>}
                          {log.duration && <span className="text-muted-foreground">{log.duration}ms</span>}
                          <span className="text-muted-foreground mr-auto">{new Date(log.sentAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "incoming" && (
        <div className="space-y-3">
          {loadingIncoming ? (
            <div className="py-12 text-center text-muted-foreground">טוען...</div>
          ) : incomingEndpoints.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">אין Endpoints נכנסים</h3>
              <p className="text-muted-foreground mb-4">הוסף endpoint לקבלת Webhooks ממערכות חיצוניות</p>
              <button onClick={() => setShowCreateIncoming(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium">
                <Plus className="w-4 h-4" />
                Endpoint חדש
              </button>
            </div>
          ) : (
            incomingEndpoints.map((ep) => (
              <div key={ep.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${ep.isActive ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
                    <div>
                      <h3 className="font-semibold">{ep.name}</h3>
                      {ep.description && <p className="text-xs text-muted-foreground">{ep.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testMutation.mutate({ id: ep.id, type: "incoming" })}
                      disabled={testMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs hover:bg-primary/20"
                    >
                      <Play className="w-3.5 h-3.5" />
                      בדוק
                    </button>
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: ep.id, isActive: ep.isActive, type: "incoming" })}
                      className={`text-xs px-2 py-1 rounded-lg ${ep.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}
                    >
                      {ep.isActive ? "פעיל" : "כבוי"}
                    </button>
                    {isSuperAdmin && (
                      <button onClick={async () => { const ok = await globalConfirm("מחיקת נקודת קצה", { itemName: ep.name, entityType: "webhook נכנס" }); if (ok) deleteMutation.mutate({ id: ep.id, type: "incoming" }); }} className="p-1.5 hover:bg-destructive/10 rounded-lg">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                    <Link className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{baseUrl}{ep.slug}</span>
                    <button onClick={() => copyToClipboard(`${baseUrl}${ep.slug}`)} className="p-1 hover:bg-muted rounded flex-shrink-0">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                  {ep.secret && (
                    <div className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">X-Webhook-Secret:</span>
                      <span className="text-xs font-mono text-amber-400 truncate flex-1">{ep.secret}</span>
                      <button onClick={() => copyToClipboard(ep.secret || "")} className="p-1 hover:bg-muted rounded flex-shrink-0">
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span>{ep.totalCalls} קריאות</span>
                  {ep.lastCalledAt && <span>אחרון: {new Date(ep.lastCalledAt).toLocaleDateString("he-IL")}</span>}
                </div>

                {testResult[ep.id] && (
                  <div className={`mt-2 p-3 rounded-xl text-xs ${testResult[ep.id].success ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                    <div className="flex items-center gap-2">
                      {testResult[ep.id].success ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      <span className={testResult[ep.id].success ? "text-green-400" : "text-red-400"}>
                        {testResult[ep.id].success ? "Endpoint פעיל ומגיב" : "הבדיקה נכשלה"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <AnimatePresence>
        {showCreateOutgoing && (
          <CreateOutgoingWebhookModal onClose={() => setShowCreateOutgoing(false)} onSuccess={() => { setShowCreateOutgoing(false); queryClient.invalidateQueries({ queryKey: ["outgoing-webhooks"] }); }} />
        )}
        {showCreateIncoming && (
          <CreateIncomingEndpointModal onClose={() => setShowCreateIncoming(false)} onSuccess={() => { setShowCreateIncoming(false); queryClient.invalidateQueries({ queryKey: ["incoming-webhooks"] }); }} />
        )}
        {editingWebhook && (
          <EditWebhookModal webhook={editingWebhook} onClose={() => setEditingWebhook(null)} onSuccess={() => { setEditingWebhook(null); queryClient.invalidateQueries({ queryKey: ["outgoing-webhooks"] }); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateOutgoingWebhookModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[], authType: "none", authValue: "", description: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name || !form.url) return;
    setSaving(true);
    try {
      await authFetch(`${API}/platform/outgoing-webhooks`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onSuccess();
    } catch {}
    setSaving(false);
  };

  const toggleEvent = (ev: string) => {
    setForm(f => ({ ...f, events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev] }));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Webhook יוצא חדש</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="למשל: Slack Notifications" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">URL *</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://hooks.slack.com/..." className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">אירועים לשליחה</label>
            <div className="grid grid-cols-2 gap-2">
              {ERP_EVENTS.map(ev => (
                <button key={ev.value} type="button" onClick={() => toggleEvent(ev.value)} className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-right transition-all ${form.events.includes(ev.value) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 border ${form.events.includes(ev.value) ? "bg-primary border-primary" : "border-muted-foreground"}`} />
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">אימות</label>
            <select value={form.authType} onChange={e => setForm(f => ({ ...f, authType: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
              <option value="none">ללא</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
            </select>
          </div>
          {form.authType !== "none" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ערך אימות</label>
              <input value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={submit} disabled={!form.name || !form.url || saving} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {saving ? "שומר..." : "צור Webhook"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateIncomingEndpointModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", mappedAction: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await authFetch(`${API}/platform/incoming-webhooks`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onSuccess();
    } catch {}
    setSaving(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Endpoint נכנס חדש</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="למשל: Shopify Orders" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
            <div className="flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>URL ייחודי וסיסמת Secret יווצרו אוטומטית. השתמש בהם להגדרת Webhook במערכת החיצונית.</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={submit} disabled={!form.name || saving} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {saving ? "יוצר..." : "צור Endpoint"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditWebhookModal({ webhook, onClose, onSuccess }: { webhook: OutgoingWebhook; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: webhook.name, url: webhook.url, events: webhook.events || [], authType: webhook.authType, authValue: webhook.authValue || "", description: webhook.description || "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await authFetch(`${API}/platform/outgoing-webhooks/${webhook.id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      onSuccess();
    } catch {}
    setSaving(false);
  };

  const toggleEvent = (ev: string) => {
    setForm(f => ({ ...f, events: f.events.includes(ev) ? f.events.filter(e => e !== ev) : [...f.events, ev] }));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">עריכת Webhook</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">URL</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">אירועים</label>
            <div className="grid grid-cols-2 gap-2">
              {ERP_EVENTS.map(ev => (
                <button key={ev.value} type="button" onClick={() => toggleEvent(ev.value)} className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-right transition-all ${form.events.includes(ev.value) ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 border ${form.events.includes(ev.value) ? "bg-primary border-primary" : "border-muted-foreground"}`} />
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">אימות</label>
            <select value={form.authType} onChange={e => setForm(f => ({ ...f, authType: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
              <option value="none">ללא</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
            </select>
          </div>
          {form.authType !== "none" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ערך אימות</label>
              <input value={form.authValue} onChange={e => setForm(f => ({ ...f, authValue: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={submit} disabled={saving} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {saving ? "שומר..." : "עדכן Webhook"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
