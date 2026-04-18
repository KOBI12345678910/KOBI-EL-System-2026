import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import {
  Plus, Edit2, Trash2, Plug, ArrowRightLeft, Webhook, RefreshCw,
  CheckCircle2, XCircle, Clock, Globe, Zap, Activity, AlertCircle,
  Copy, ExternalLink, FileText, ArrowDown, ArrowUp, ArrowLeftRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface Connection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  serviceType: string;
  baseUrl: string;
  authMethod: string;
  authConfig: any;
  defaultHeaders: any;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface Endpoint {
  id: number;
  connectionId: number;
  name: string;
  slug: string;
  method: string;
  path: string;
  fieldMapping: any[];
  syncDirection: string;
  entityId: number | null;
  isActive: boolean;
}

interface IntWebhook {
  id: number;
  connectionId: number;
  name: string;
  slug: string;
  webhookSecret: string | null;
  entityId: number | null;
  fieldMapping: any[];
  eventType: string;
  isActive: boolean;
}

interface SyncLog {
  id: number;
  connectionId: number;
  endpointId: number | null;
  webhookId: number | null;
  direction: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  details: any;
  startedAt: string;
  completedAt: string | null;
}

interface EntityField {
  slug: string;
  name: string;
  fieldType: string;
}

const AUTH_METHODS = [
  { value: "none", label: "ללא אימות" },
  { value: "api_key", label: "API Key" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "oauth2", label: "OAuth 2.0" },
];

const SYNC_DIRECTIONS = [
  { value: "import", label: "ייבוא (קבלה)" },
  { value: "export", label: "ייצוא (שליחה)" },
  { value: "bidirectional", label: "דו-כיווני" },
];

const TRANSFORM_OPTIONS = [
  { value: "", label: "ללא המרה" },
  { value: "string", label: "טקסט" },
  { value: "number", label: "מספר" },
  { value: "boolean", label: "כן/לא" },
  { value: "date", label: "תאריך" },
  { value: "lowercase", label: "אותיות קטנות" },
  { value: "uppercase", label: "אותיות גדולות" },
  { value: "trim", label: "חיתוך רווחים" },
  { value: "lookup_key", label: "מפתח חיפוש" },
];

export default function IntegrationBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [endpointModalOpen, setEndpointModalOpen] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"endpoints" | "webhooks" | "logs">("endpoints");

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    serviceType: "rest_api",
    baseUrl: "",
    authMethod: "none",
    authConfig: {} as Record<string, string>,
    defaultHeaders: [] as { key: string; value: string }[],
    isActive: true,
  });

  const [endpointForm, setEndpointForm] = useState({
    name: "",
    slug: "",
    method: "GET",
    path: "",
    syncDirection: "import",
    entityId: null as number | null,
    fieldMapping: [{ source: "", target: "", transform: "" }],
    requestHeaders: [] as { key: string; value: string }[],
    requestBody: "",
    responseMapping: [{ source: "", target: "", transform: "" }],
  });

  const [webhookForm, setWebhookForm] = useState({
    name: "",
    slug: "",
    eventType: "create",
    webhookSecret: "",
    entityId: null as number | null,
    fieldMapping: [{ source: "", target: "", transform: "" }],
  });

  const { data: connections = [], isLoading } = useQuery<Connection[]>({
    queryKey: ["integrations"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/integrations`);
      if (!r.ok) throw new Error("Failed to fetch integrations");
      return r.json();
    },
  });

  const { data: endpoints = [] } = useQuery<Endpoint[]>({
    queryKey: ["integration-endpoints", selectedConnection?.id],
    queryFn: async () => {
      if (!selectedConnection) return [];
      const r = await authFetch(`${API_BASE}/platform/integrations/${selectedConnection.id}/endpoints`);
      if (!r.ok) throw new Error("Failed to fetch endpoints");
      return r.json();
    },
    enabled: !!selectedConnection,
  });

  const { data: webhooks = [] } = useQuery<IntWebhook[]>({
    queryKey: ["integration-webhooks", selectedConnection?.id],
    queryFn: async () => {
      if (!selectedConnection) return [];
      const r = await authFetch(`${API_BASE}/platform/integrations/${selectedConnection.id}/webhooks`);
      if (!r.ok) throw new Error("Failed to fetch webhooks");
      return r.json();
    },
    enabled: !!selectedConnection,
  });

  const { data: syncLogs = [] } = useQuery<SyncLog[]>({
    queryKey: ["integration-sync-logs", selectedConnection?.id],
    queryFn: async () => {
      if (!selectedConnection) return [];
      const r = await authFetch(`${API_BASE}/platform/integrations/${selectedConnection.id}/sync-logs`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedConnection,
  });

  const { data: entities = [] } = useQuery<any[]>({
    queryKey: ["all-entities"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/entities`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const entityFieldsQuery = (entityId: number | null) => ({
    queryKey: ["entity-fields-for-mapping", entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const r = await authFetch(`${API_BASE}/platform/integrations/entity-fields/${entityId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!entityId,
  });

  const { data: endpointEntityFields = [] } = useQuery<EntityField[]>(entityFieldsQuery(endpointForm.entityId));
  const { data: webhookEntityFields = [] } = useQuery<EntityField[]>(entityFieldsQuery(webhookForm.entityId));

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API_BASE}/platform/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create connection");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setIsModalOpen(false);
      toast({ title: "נוצר בהצלחה", description: "חיבור חדש נוצר." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await authFetch(`${API_BASE}/platform/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update connection");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setIsModalOpen(false);
      toast({ title: "עודכן בהצלחה", description: "החיבור עודכן." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/integrations/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete connection");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      if (selectedConnection) setSelectedConnection(null);
      toast({ title: "נמחק", description: "החיבור הוסר." });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/integrations/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["integration-sync-logs", selectedConnection?.id] });
      if (data.success) {
        toast({ title: "חיבור תקין", description: `תגובה תוך ${data.responseTime}ms (סטטוס ${data.status})` });
      } else {
        toast({ title: "חיבור נכשל", description: data.message, variant: "destructive" });
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: async ({ id, endpointId, direction }: { id: number; endpointId?: number; direction?: string }) => {
      const r = await authFetch(`${API_BASE}/platform/integrations/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointId, direction }),
      });
      if (!r.ok) throw new Error("Failed to sync");
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["integration-sync-logs"] });
      const processed = data.recordsProcessed ?? data.results?.reduce((s: number, r: any) => s + (r.recordsProcessed || 0), 0) ?? 0;
      const failed = data.recordsFailed ?? data.results?.reduce((s: number, r: any) => s + (r.recordsFailed || 0), 0) ?? 0;
      toast({
        title: "סנכרון הושלם",
        description: `${processed} רשומות עובדו${failed > 0 ? `, ${failed} נכשלו` : ""}`,
      });
    },
    onError: () => {
      toast({ title: "שגיאה בסנכרון", description: "הסנכרון נכשל", variant: "destructive" });
    },
  });

  const createEndpointMutation = useMutation({
    mutationFn: async (data: any) => {
      const headersObj: Record<string, string> = {};
      (data.requestHeaders || []).filter((h: any) => h.key?.trim()).forEach((h: any) => { headersObj[h.key.trim()] = h.value; });
      let parsedBody = null;
      if (data.requestBody) {
        try { parsedBody = JSON.parse(data.requestBody); } catch {
          throw new Error("Request Body אינו JSON תקין");
        }
      }
      const payload = {
        ...data,
        entityId: data.entityId || undefined,
        requestHeaders: headersObj,
        requestBody: parsedBody,
        fieldMapping: [
          ...(data.fieldMapping || []).map((m: any) => ({ ...m, direction: "request" })),
          ...(data.responseMapping || []).map((m: any) => ({ ...m, direction: "response" })),
        ].filter((m: any) => m.source && m.target),
      };
      delete payload.responseMapping;
      const r = await authFetch(`${API_BASE}/platform/integrations/${selectedConnection!.id}/endpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Failed to create endpoint" }));
        throw new Error(err.message || "Failed to create endpoint");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-endpoints"] });
      setEndpointModalOpen(false);
      toast({ title: "נוצר בהצלחה", description: "Endpoint חדש נוצר." });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/integration-endpoints/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete endpoint");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-endpoints"] });
      toast({ title: "נמחק", description: "ה-Endpoint הוסר." });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = { ...data, entityId: data.entityId || undefined };
      const r = await authFetch(`${API_BASE}/platform/integrations/${selectedConnection!.id}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Failed to create webhook" }));
        throw new Error(err.message || "Failed to create webhook");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-webhooks"] });
      setWebhookModalOpen(false);
      toast({ title: "נוצר בהצלחה", description: "Webhook חדש נוצר." });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/integration-webhooks/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete webhook");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-webhooks"] });
      toast({ title: "נמחק", description: "ה-Webhook הוסר." });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", slug: "", description: "", serviceType: "rest_api", baseUrl: "", authMethod: "none", authConfig: {}, defaultHeaders: [], isActive: true });
    setIsModalOpen(true);
  };

  const openEdit = (conn: Connection) => {
    setEditingId(conn.id);
    const headers = conn.defaultHeaders as Record<string, string> || {};
    setFormData({
      name: conn.name,
      slug: conn.slug,
      description: conn.description || "",
      serviceType: conn.serviceType,
      baseUrl: conn.baseUrl,
      authMethod: conn.authMethod,
      authConfig: (conn.authConfig as Record<string, string>) || {},
      defaultHeaders: Object.entries(headers).map(([key, value]) => ({ key, value })),
      isActive: conn.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const headersObj: Record<string, string> = {};
    formData.defaultHeaders.filter(h => h.key.trim()).forEach(h => { headersObj[h.key.trim()] = h.value; });
    const payload = {
      ...formData,
      description: formData.description || undefined,
      defaultHeaders: headersObj,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "הועתק", description: "הטקסט הועתק ללוח." });
  };

  const getWebhookUrl = (slug: string) => {
    const base = window.location.origin;
    return `${base}/api/platform/webhooks/receive/${slug}`;
  };

  const directionIcon = (dir: string) => {
    if (dir === "import") return <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />;
    if (dir === "export") return <ArrowUp className="w-3.5 h-3.5 text-blue-400" />;
    return <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />;
  };

  if (selectedConnection) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedConnection(null)} className="text-primary hover:text-primary/80 font-medium">
            &larr; חזרה לרשימה
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyan-500/10">
              <Globe className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-foreground">{selectedConnection.name}</h1>
              <p className="text-sm text-muted-foreground font-mono">{selectedConnection.baseUrl}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => testMutation.mutate(selectedConnection.id)}
              variant="outline"
              className="gap-2"
              disabled={testMutation.isPending}
            >
              <Zap className={`w-4 h-4 ${testMutation.isPending ? "animate-pulse" : ""}`} />
              {testMutation.isPending ? "בודק..." : "בדיקת חיבור"}
            </Button>
            <Button
              onClick={() => syncMutation.mutate({ id: selectedConnection.id })}
              variant="outline"
              className="gap-2"
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              סנכרן הכל
            </Button>
            <Button onClick={() => openEdit(selectedConnection)} variant="ghost" className="gap-2">
              <Edit2 className="w-4 h-4" /> ערוך
            </Button>
          </div>
        </div>

        {testMutation.data && (
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${testMutation.data.success ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
            {testMutation.data.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <div>
              <p className={`text-sm font-medium ${testMutation.data.success ? "text-emerald-400" : "text-red-400"}`}>
                {testMutation.data.message}
              </p>
              {testMutation.data.responseTime && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  זמן תגובה: {testMutation.data.responseTime}ms
                  {testMutation.data.status && ` | סטטוס: ${testMutation.data.status}`}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {([
            { key: "endpoints" as const, label: "Endpoints", icon: ArrowRightLeft },
            { key: "webhooks" as const, label: "Webhooks", icon: Webhook },
            { key: "logs" as const, label: "יומן סנכרון", icon: Activity },
          ]).map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.key === "logs" && syncLogs.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-muted rounded-md text-[10px]">{syncLogs.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "endpoints" && (
          <Card>
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">Endpoints</h3>
              </div>
              <Button size="sm" onClick={() => {
                setEndpointForm({ name: "", slug: "", method: "GET", path: "", syncDirection: "import", entityId: null, fieldMapping: [{ source: "", target: "", transform: "" }], requestHeaders: [], requestBody: "", responseMapping: [{ source: "", target: "", transform: "" }] });
                setEndpointModalOpen(true);
              }} className="gap-1">
                <Plus className="w-4 h-4" /> הוסף
              </Button>
            </div>
            <div className="p-4 space-y-3">
              {endpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">לא הוגדרו endpoints</p>
              ) : endpoints.map((ep) => (
                <div key={ep.id} className="p-4 rounded-xl bg-muted/10 border border-border/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${ep.method === "GET" ? "bg-emerald-500/10 text-emerald-400" : ep.method === "POST" ? "bg-blue-500/10 text-blue-400" : ep.method === "PUT" ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                        {ep.method}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{ep.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{ep.path}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {directionIcon(ep.syncDirection)}
                        {SYNC_DIRECTIONS.find(s => s.value === ep.syncDirection)?.label}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => syncMutation.mutate({ id: selectedConnection.id, endpointId: ep.id })}
                        disabled={syncMutation.isPending}
                        className="gap-1 text-xs"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                        סנכרן
                      </Button>
                      {isSuperAdmin && (<Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => { const ok = await globalConfirm("למחוק endpoint זה?"); if (ok) deleteEndpointMutation.mutate(ep.id); }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      )}
                    </div>
                  </div>
                  {ep.entityId && (
                    <div className="text-xs text-muted-foreground mt-1">
                      ישות מקושרת: {entities.find((e: any) => e.id === ep.entityId)?.name || `#${ep.entityId}`}
                    </div>
                  )}
                  {ep.fieldMapping && Array.isArray(ep.fieldMapping) && ep.fieldMapping.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ep.fieldMapping.filter((m: any) => m.source && m.target).map((m: any, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/5 rounded text-[10px] text-muted-foreground font-mono">
                          {m.source} → {m.target}
                          {m.transform && <span className="text-primary/60">({m.transform})</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === "webhooks" && (
          <Card>
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-foreground">Webhooks</h3>
              </div>
              <Button size="sm" onClick={() => {
                setWebhookForm({ name: "", slug: "", eventType: "create", webhookSecret: "", entityId: null, fieldMapping: [{ source: "", target: "", transform: "" }] });
                setWebhookModalOpen(true);
              }} className="gap-1">
                <Plus className="w-4 h-4" /> הוסף
              </Button>
            </div>
            <div className="p-4 space-y-3">
              {webhooks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">לא הוגדרו webhooks</p>
              ) : webhooks.map((wh) => (
                <div key={wh.id} className="p-4 rounded-xl bg-muted/10 border border-border/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Webhook className="w-4 h-4 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{wh.name}</p>
                        <p className="text-xs text-muted-foreground">אירוע: {wh.eventType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {wh.isActive ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle2 className="w-3 h-3" /> פעיל</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><XCircle className="w-3 h-3" /> מושבת</span>
                      )}
                      {isSuperAdmin && (<Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => { const ok = await globalConfirm("למחוק webhook זה?"); if (ok) deleteWebhookMutation.mutate(wh.id); }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 p-2.5 bg-background/50 rounded-lg border border-border/30">
                    <p className="text-[10px] text-muted-foreground mb-1">כתובת Webhook (POST):</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-primary font-mono flex-1 break-all">{getWebhookUrl(wh.slug)}</code>
                      <button
                        onClick={() => copyToClipboard(getWebhookUrl(wh.slug))}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    {wh.webhookSecret && (
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Header: <code className="text-primary/70">X-Webhook-Secret: ****</code>
                      </p>
                    )}
                  </div>
                  {wh.entityId && (
                    <div className="text-xs text-muted-foreground mt-2">
                      ישות מקושרת: {entities.find((e: any) => e.id === wh.entityId)?.name || `#${wh.entityId}`}
                    </div>
                  )}
                  {wh.fieldMapping && Array.isArray(wh.fieldMapping) && wh.fieldMapping.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {wh.fieldMapping.filter((m: any) => m.source && m.target).map((m: any, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/5 rounded text-[10px] text-muted-foreground font-mono">
                          {m.source} → {m.target}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === "logs" && (
          <Card>
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-foreground">יומן סנכרון</h3>
              </div>
              <span className="text-xs text-muted-foreground">{syncLogs.length} רשומות</span>
            </div>
            <div className="divide-y divide-border/30">
              {syncLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">אין היסטוריית סנכרון</p>
              ) : syncLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-muted/5 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      {log.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : log.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : log.status === "running" ? (
                        <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={`text-sm font-medium ${log.status === "completed" ? "text-emerald-400" : log.status === "failed" ? "text-red-400" : "text-foreground"}`}>
                        {log.status === "completed" ? "הושלם" : log.status === "failed" ? "נכשל" : log.status === "running" ? "רץ..." : "ממתין"}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {log.direction === "test" ? <Zap className="w-3.5 h-3.5 text-cyan-400" /> : directionIcon(log.direction)}
                        {log.direction === "import" ? "ייבוא" : log.direction === "export" ? "ייצוא" : log.direction === "inbound_webhook" ? "webhook נכנס" : log.direction === "test" ? "בדיקת חיבור" : log.direction}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.startedAt).toLocaleString("he-IL")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {(log.details as any)?.statusCode && (
                      <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${(log.details as any).statusCode < 300 ? "bg-emerald-500/10 text-emerald-400" : (log.details as any).statusCode < 400 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                        HTTP {(log.details as any).statusCode}
                      </span>
                    )}
                    {(log.details as any)?.method && (
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {(log.details as any).method} {(log.details as any).path}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500/50" />
                      {log.recordsProcessed} עובדו
                    </span>
                    {log.recordsFailed > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-red-500/50" />
                        {log.recordsFailed} נכשלו
                      </span>
                    )}
                    {(log.details as any)?.responseTime && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-500/50" />
                        {(log.details as any).responseTime}ms
                      </span>
                    )}
                    {log.completedAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s
                      </span>
                    )}
                  </div>
                  {log.errorMessage && (
                    <p className="text-xs text-red-400/80 mt-1.5 bg-red-500/5 px-2.5 py-1.5 rounded-lg">
                      {log.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Modal isOpen={endpointModalOpen} onClose={() => setEndpointModalOpen(false)} title="הוספת Endpoint">
          <form onSubmit={(e) => {
            e.preventDefault();
            createEndpointMutation.mutate({
              ...endpointForm,
              fieldMapping: endpointForm.fieldMapping.filter(f => f.source && f.target),
              responseMapping: endpointForm.responseMapping.filter(f => f.source && f.target),
            });
          }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם</Label>
                <Input value={endpointForm.name} onChange={e => setEndpointForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>מזהה</Label>
                <Input value={endpointForm.slug} onChange={e => setEndpointForm(p => ({ ...p, slug: e.target.value }))} dir="ltr" className="text-left" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Method</Label>
                <select value={endpointForm.method} onChange={e => setEndpointForm(p => ({ ...p, method: e.target.value }))}
                  className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>כיוון סנכרון</Label>
                <select value={endpointForm.syncDirection} onChange={e => setEndpointForm(p => ({ ...p, syncDirection: e.target.value }))}
                  className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary">
                  {SYNC_DIRECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>ישות יעד</Label>
                <select
                  value={endpointForm.entityId ?? ""}
                  onChange={e => setEndpointForm(p => ({ ...p, entityId: e.target.value ? Number(e.target.value) : null }))}
                  className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
                >
                  <option value="">בחר ישות...</option>
                  {entities.map((ent: any) => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Path</Label>
              <Input value={endpointForm.path} onChange={e => setEndpointForm(p => ({ ...p, path: e.target.value }))} placeholder="/users" dir="ltr" className="text-left" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Headers נוספים</Label>
                <button type="button" onClick={() => setEndpointForm(p => ({ ...p, requestHeaders: [...p.requestHeaders, { key: "", value: "" }] }))}
                  className="text-xs text-primary hover:text-primary/80">+ הוסף Header</button>
              </div>
              {endpointForm.requestHeaders.map((h, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={h.key}
                    onChange={e => {
                      const hs = [...endpointForm.requestHeaders];
                      hs[i] = { ...hs[i], key: e.target.value };
                      setEndpointForm(p => ({ ...p, requestHeaders: hs }));
                    }}
                    placeholder="Header Name"
                    dir="ltr" className="text-left flex-1"
                  />
                  <Input
                    value={h.value}
                    onChange={e => {
                      const hs = [...endpointForm.requestHeaders];
                      hs[i] = { ...hs[i], value: e.target.value };
                      setEndpointForm(p => ({ ...p, requestHeaders: hs }));
                    }}
                    placeholder="Header Value"
                    dir="ltr" className="text-left flex-1"
                  />
                  <button type="button" onClick={() => {
                    setEndpointForm(p => ({ ...p, requestHeaders: p.requestHeaders.filter((_, j) => j !== i) }));
                  }} className="p-1 text-muted-foreground hover:text-destructive">×</button>
                </div>
              ))}
            </div>

            {(endpointForm.method === "POST" || endpointForm.method === "PUT" || endpointForm.method === "PATCH") && (
              <div className="space-y-2">
                <Label>Request Body (JSON)</Label>
                <textarea
                  value={endpointForm.requestBody}
                  onChange={e => setEndpointForm(p => ({ ...p, requestBody: e.target.value }))}
                  placeholder='{"key": "{{field_name}}"}'
                  dir="ltr"
                  className="w-full min-h-[80px] rounded-xl border-2 border-border bg-background/50 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:border-primary text-left"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>מיפוי שדות (Request)</Label>
                {endpointForm.entityId && (
                  <span className="text-[10px] text-muted-foreground">{endpointEntityFields.length} שדות זמינים</span>
                )}
              </div>
              {endpointForm.fieldMapping.map((fm, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={fm.source}
                    onChange={e => {
                      const fms = [...endpointForm.fieldMapping];
                      fms[i] = { ...fms[i], source: e.target.value };
                      setEndpointForm(p => ({ ...p, fieldMapping: fms }));
                    }}
                    placeholder="שדה מקור"
                    dir="ltr"
                    className="text-left flex-1"
                  />
                  <span className="text-muted-foreground">&rarr;</span>
                  {endpointForm.entityId && endpointEntityFields.length > 0 ? (
                    <select
                      value={fm.target}
                      onChange={e => {
                        const fms = [...endpointForm.fieldMapping];
                        fms[i] = { ...fms[i], target: e.target.value };
                        setEndpointForm(p => ({ ...p, fieldMapping: fms }));
                      }}
                      className="h-12 flex-1 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
                    >
                      <option value="">בחר שדה...</option>
                      {endpointEntityFields.map(f => (
                        <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={fm.target}
                      onChange={e => {
                        const fms = [...endpointForm.fieldMapping];
                        fms[i] = { ...fms[i], target: e.target.value };
                        setEndpointForm(p => ({ ...p, fieldMapping: fms }));
                      }}
                      placeholder="שדה יעד"
                      dir="ltr"
                      className="text-left flex-1"
                    />
                  )}
                  <select
                    value={fm.transform}
                    onChange={e => {
                      const fms = [...endpointForm.fieldMapping];
                      fms[i] = { ...fms[i], transform: e.target.value };
                      setEndpointForm(p => ({ ...p, fieldMapping: fms }));
                    }}
                    className="h-12 w-32 rounded-xl border-2 border-border bg-background/50 px-2 text-xs focus-visible:outline-none focus-visible:border-primary"
                  >
                    {TRANSFORM_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {endpointForm.fieldMapping.length > 1 && (
                    <button type="button" onClick={() => {
                      const fms = endpointForm.fieldMapping.filter((_, j) => j !== i);
                      setEndpointForm(p => ({ ...p, fieldMapping: fms }));
                    }} className="p-1 text-muted-foreground hover:text-destructive">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setEndpointForm(p => ({ ...p, fieldMapping: [...p.fieldMapping, { source: "", target: "", transform: "" }] }))}
                className="text-sm text-primary hover:text-primary/80">+ הוסף מיפוי</button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>מיפוי תגובה (Response)</Label>
              </div>
              {endpointForm.responseMapping.map((fm, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={fm.source}
                    onChange={e => {
                      const fms = [...endpointForm.responseMapping];
                      fms[i] = { ...fms[i], source: e.target.value };
                      setEndpointForm(p => ({ ...p, responseMapping: fms }));
                    }}
                    placeholder="שדה בתגובה (response.data.id)"
                    dir="ltr"
                    className="text-left flex-1"
                  />
                  <span className="text-muted-foreground">&rarr;</span>
                  {endpointForm.entityId && endpointEntityFields.length > 0 ? (
                    <select
                      value={fm.target}
                      onChange={e => {
                        const fms = [...endpointForm.responseMapping];
                        fms[i] = { ...fms[i], target: e.target.value };
                        setEndpointForm(p => ({ ...p, responseMapping: fms }));
                      }}
                      className="h-12 flex-1 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
                    >
                      <option value="">בחר שדה...</option>
                      {endpointEntityFields.map(f => (
                        <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={fm.target}
                      onChange={e => {
                        const fms = [...endpointForm.responseMapping];
                        fms[i] = { ...fms[i], target: e.target.value };
                        setEndpointForm(p => ({ ...p, responseMapping: fms }));
                      }}
                      placeholder="שדה ישות"
                      dir="ltr"
                      className="text-left flex-1"
                    />
                  )}
                  <select
                    value={fm.transform}
                    onChange={e => {
                      const fms = [...endpointForm.responseMapping];
                      fms[i] = { ...fms[i], transform: e.target.value };
                      setEndpointForm(p => ({ ...p, responseMapping: fms }));
                    }}
                    className="h-12 w-32 rounded-xl border-2 border-border bg-background/50 px-2 text-xs focus-visible:outline-none focus-visible:border-primary"
                  >
                    {TRANSFORM_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {endpointForm.responseMapping.length > 1 && (
                    <button type="button" onClick={() => {
                      const fms = endpointForm.responseMapping.filter((_, j) => j !== i);
                      setEndpointForm(p => ({ ...p, responseMapping: fms }));
                    }} className="p-1 text-muted-foreground hover:text-destructive">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setEndpointForm(p => ({ ...p, responseMapping: [...p.responseMapping, { source: "", target: "", transform: "" }] }))}
                className="text-sm text-primary hover:text-primary/80">+ הוסף מיפוי</button>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setEndpointModalOpen(false)}>ביטול</Button>
              <Button type="submit" disabled={createEndpointMutation.isPending}>
                {createEndpointMutation.isPending ? "שומר..." : "שמור"}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={webhookModalOpen} onClose={() => setWebhookModalOpen(false)} title="הוספת Webhook">
          <form onSubmit={(e) => {
            e.preventDefault();
            createWebhookMutation.mutate({
              ...webhookForm,
              webhookSecret: webhookForm.webhookSecret || undefined,
              fieldMapping: webhookForm.fieldMapping.filter(f => f.source && f.target),
            });
          }} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם</Label>
                <Input value={webhookForm.name} onChange={e => setWebhookForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>מזהה (Slug)</Label>
                <Input value={webhookForm.slug} onChange={e => setWebhookForm(p => ({ ...p, slug: e.target.value }))} dir="ltr" className="text-left" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>סוג אירוע</Label>
                <select value={webhookForm.eventType} onChange={e => setWebhookForm(p => ({ ...p, eventType: e.target.value }))}
                  className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary">
                  <option value="create">יצירה</option>
                  <option value="update">עדכון</option>
                  <option value="delete">מחיקה</option>
                  <option value="custom">מותאם</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>ישות יעד</Label>
                <select
                  value={webhookForm.entityId ?? ""}
                  onChange={e => setWebhookForm(p => ({ ...p, entityId: e.target.value ? Number(e.target.value) : null }))}
                  className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
                >
                  <option value="">בחר ישות...</option>
                  {entities.map((ent: any) => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Webhook Secret (אופציונלי)</Label>
              <Input
                value={webhookForm.webhookSecret}
                onChange={e => setWebhookForm(p => ({ ...p, webhookSecret: e.target.value }))}
                placeholder="סוד לאימות בקשות נכנסות"
                dir="ltr"
                className="text-left"
                type="password"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>מיפוי שדות</Label>
                {webhookForm.entityId && (
                  <span className="text-[10px] text-muted-foreground">{webhookEntityFields.length} שדות זמינים</span>
                )}
              </div>
              {webhookForm.fieldMapping.map((fm, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={fm.source}
                    onChange={e => {
                      const fms = [...webhookForm.fieldMapping];
                      fms[i] = { ...fms[i], source: e.target.value };
                      setWebhookForm(p => ({ ...p, fieldMapping: fms }));
                    }}
                    placeholder="שדה ב-payload"
                    dir="ltr"
                    className="text-left flex-1"
                  />
                  <span className="text-muted-foreground">&rarr;</span>
                  {webhookForm.entityId && webhookEntityFields.length > 0 ? (
                    <select
                      value={fm.target}
                      onChange={e => {
                        const fms = [...webhookForm.fieldMapping];
                        fms[i] = { ...fms[i], target: e.target.value };
                        setWebhookForm(p => ({ ...p, fieldMapping: fms }));
                      }}
                      className="h-12 flex-1 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
                    >
                      <option value="">בחר שדה...</option>
                      {webhookEntityFields.map(f => (
                        <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={fm.target}
                      onChange={e => {
                        const fms = [...webhookForm.fieldMapping];
                        fms[i] = { ...fms[i], target: e.target.value };
                        setWebhookForm(p => ({ ...p, fieldMapping: fms }));
                      }}
                      placeholder="שדה ישות"
                      dir="ltr"
                      className="text-left flex-1"
                    />
                  )}
                  <select
                    value={fm.transform}
                    onChange={e => {
                      const fms = [...webhookForm.fieldMapping];
                      fms[i] = { ...fms[i], transform: e.target.value };
                      setWebhookForm(p => ({ ...p, fieldMapping: fms }));
                    }}
                    className="h-12 w-32 rounded-xl border-2 border-border bg-background/50 px-2 text-xs focus-visible:outline-none focus-visible:border-primary"
                  >
                    {TRANSFORM_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {webhookForm.fieldMapping.length > 1 && (
                    <button type="button" onClick={() => {
                      const fms = webhookForm.fieldMapping.filter((_, j) => j !== i);
                      setWebhookForm(p => ({ ...p, fieldMapping: fms }));
                    }} className="p-1 text-muted-foreground hover:text-destructive">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setWebhookForm(p => ({ ...p, fieldMapping: [...p.fieldMapping, { source: "", target: "", transform: "" }] }))}
                className="text-sm text-primary hover:text-primary/80">+ הוסף מיפוי</button>
            </div>
            {webhookForm.slug && (
              <div className="p-3 bg-muted/10 rounded-xl border border-border/30">
                <p className="text-[10px] text-muted-foreground mb-1">כתובת Webhook שתיווצר:</p>
                <code className="text-xs text-primary font-mono break-all">{getWebhookUrl(webhookForm.slug)}</code>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setWebhookModalOpen(false)}>ביטול</Button>
              <Button type="submit" disabled={createWebhookMutation.isPending}>
                {createWebhookMutation.isPending ? "שומר..." : "שמור"}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "עריכת חיבור" : "יצירת חיבור חדש"}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <ConnectionFormFields formData={formData} setFormData={setFormData} />
            <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>ביטול</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "שומר..." : "שמור חיבור"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">בונה אינטגרציות</h1>
          <p className="text-muted-foreground mt-1">חיבור מערכות חיצוניות באמצעות API, webhooks וסנכרון מתוזמן</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-5 h-5" /> צור חיבור חדש
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">טוען חיבורים...</div>
      ) : connections.length === 0 ? (
        <Card className="p-12 text-center">
          <Plug className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">אין חיבורים חיצוניים</h3>
          <p className="text-sm text-muted-foreground mb-4">חבר מערכת חיצונית ראשונה לסנכרון נתונים</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> צור חיבור</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connections.map((conn) => (
            <div key={conn.id} onClick={() => setSelectedConnection(conn)} className="cursor-pointer"><Card className="flex flex-col hover:border-primary/30 transition-colors">
              <div className="p-5 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10">
                    <Plug className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{conn.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-1">{conn.baseUrl}</p>
                  </div>
                </div>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(conn)} className="p-2 text-muted-foreground hover:bg-card/10 hover:text-foreground rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {isSuperAdmin && <button onClick={async () => {
                    const ok = await globalConfirm("למחוק חיבור זה?"); if (ok) deleteMutation.mutate(conn.id);
                  }} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>}
                </div>
              </div>
              <div className="px-5 pb-3 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 text-[10px] rounded bg-cyan-500/10 text-cyan-400 font-semibold uppercase tracking-wider">
                  {conn.serviceType}
                </span>
                <span className="px-2 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400 font-semibold">
                  {AUTH_METHODS.find(a => a.value === conn.authMethod)?.label}
                </span>
                {conn.isActive ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3 h-3" /> פעיל
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-muted/20 text-muted-foreground font-semibold">
                    <XCircle className="w-3 h-3" /> מושבת
                  </span>
                )}
              </div>
              {conn.lastSyncAt && (
                <div className="px-5 pb-3">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    סנכרון אחרון: {new Date(conn.lastSyncAt).toLocaleString("he-IL")}
                  </span>
                </div>
              )}
              <div className="p-4 border-t border-border/30 flex justify-between items-center" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedConnection(conn)} className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                  נהל חיבור &larr;
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => testMutation.mutate(conn.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/20 hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    disabled={testMutation.isPending}
                  >
                    <Zap className={`w-3.5 h-3.5 ${testMutation.isPending ? "animate-pulse" : ""}`} /> בדוק
                  </button>
                  <button
                    onClick={() => syncMutation.mutate({ id: conn.id })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/20 hover:bg-muted/40 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    disabled={syncMutation.isPending}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} /> סנכרן
                  </button>
                </div>
              </div>
            </Card></div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "עריכת חיבור" : "יצירת חיבור חדש"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ConnectionFormFields formData={formData} setFormData={setFormData} />
          <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>ביטול</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "שומר..." : "שמור חיבור"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ConnectionFormFields({ formData, setFormData }: {
  formData: { name: string; slug: string; description: string; serviceType: string; baseUrl: string; authMethod: string; authConfig: Record<string, string>; defaultHeaders: { key: string; value: string }[]; isActive: boolean };
  setFormData: React.Dispatch<React.SetStateAction<typeof formData>>;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>שם החיבור</Label>
          <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Salesforce CRM" />
        </div>
        <div className="space-y-2">
          <Label>מזהה (Slug)</Label>
          <Input value={formData.slug} onChange={e => setFormData(p => ({ ...p, slug: e.target.value }))} placeholder="salesforce" dir="ltr" className="text-left" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>תיאור</Label>
        <Input value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="חיבור למערכת CRM..." />
      </div>
      <div className="space-y-2">
        <Label>כתובת API (Base URL)</Label>
        <Input value={formData.baseUrl} onChange={e => setFormData(p => ({ ...p, baseUrl: e.target.value }))} placeholder="https://api.service.com/v1" dir="ltr" className="text-left" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>סוג שירות</Label>
          <select value={formData.serviceType} onChange={e => setFormData(p => ({ ...p, serviceType: e.target.value }))}
            className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary">
            <option value="rest_api">REST API</option>
            <option value="graphql">GraphQL</option>
            <option value="soap">SOAP</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>שיטת אימות</Label>
          <select value={formData.authMethod} onChange={e => setFormData(p => ({ ...p, authMethod: e.target.value }))}
            className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary">
            {AUTH_METHODS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </div>
      {formData.authMethod !== "none" && (
        <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-border/30">
          <Label>הגדרות אימות</Label>
          {formData.authMethod === "api_key" && (
            <>
              <Input
                value={formData.authConfig.headerName || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, headerName: e.target.value } }))}
                placeholder="Header Name (e.g., X-API-Key)"
                dir="ltr" className="text-left"
              />
              <Input
                value={formData.authConfig.apiKey || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, apiKey: e.target.value } }))}
                placeholder="API Key"
                dir="ltr" className="text-left" type="password"
              />
            </>
          )}
          {formData.authMethod === "bearer" && (
            <Input
              value={formData.authConfig.token || ""}
              onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, token: e.target.value } }))}
              placeholder="Bearer Token"
              dir="ltr" className="text-left" type="password"
            />
          )}
          {formData.authMethod === "basic" && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={formData.authConfig.username || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, username: e.target.value } }))}
                placeholder="Username" dir="ltr" className="text-left"
              />
              <Input
                value={formData.authConfig.password || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, password: e.target.value } }))}
                placeholder="Password" dir="ltr" className="text-left" type="password"
              />
            </div>
          )}
          {formData.authMethod === "oauth2" && (
            <>
              <Input
                value={formData.authConfig.clientId || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, clientId: e.target.value } }))}
                placeholder="Client ID" dir="ltr" className="text-left"
              />
              <Input
                value={formData.authConfig.clientSecret || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, clientSecret: e.target.value } }))}
                placeholder="Client Secret" dir="ltr" className="text-left" type="password"
              />
              <Input
                value={formData.authConfig.tokenUrl || ""}
                onChange={e => setFormData(p => ({ ...p, authConfig: { ...p.authConfig, tokenUrl: e.target.value } }))}
                placeholder="Token URL" dir="ltr" className="text-left"
              />
            </>
          )}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Headers ברירת מחדל</Label>
          <button type="button" onClick={() => setFormData(p => ({ ...p, defaultHeaders: [...p.defaultHeaders, { key: "", value: "" }] }))}
            className="text-xs text-primary hover:text-primary/80">+ הוסף Header</button>
        </div>
        {formData.defaultHeaders.map((h, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={h.key}
              onChange={e => {
                const hs = [...formData.defaultHeaders];
                hs[i] = { ...hs[i], key: e.target.value };
                setFormData(p => ({ ...p, defaultHeaders: hs }));
              }}
              placeholder="Header Name (e.g., Content-Type)"
              dir="ltr" className="text-left flex-1"
            />
            <Input
              value={h.value}
              onChange={e => {
                const hs = [...formData.defaultHeaders];
                hs[i] = { ...hs[i], value: e.target.value };
                setFormData(p => ({ ...p, defaultHeaders: hs }));
              }}
              placeholder="Header Value"
              dir="ltr" className="text-left flex-1"
            />
            <button type="button" onClick={() => {
              setFormData(p => ({ ...p, defaultHeaders: p.defaultHeaders.filter((_, j) => j !== i) }));
            }} className="p-1 text-muted-foreground hover:text-destructive">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="connActive" checked={formData.isActive}
          onChange={e => setFormData(p => ({ ...p, isActive: e.target.checked }))}
          className="w-5 h-5 rounded border-border bg-background text-primary" />
        <Label htmlFor="connActive" className="mb-0">חיבור פעיל</Label>
      </div>
    </>
  );
}
