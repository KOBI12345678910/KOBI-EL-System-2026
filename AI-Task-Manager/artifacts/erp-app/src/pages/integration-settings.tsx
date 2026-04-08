import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card } from "@/components/ui-components";
import {
  ArrowRight, CheckCircle2, XCircle, Loader2, TestTube, Save, ExternalLink,
  Code2, Wifi, WifiOff, Clock, Trash2, Settings2, AlertCircle,
} from "lucide-react";
import { INTEGRATIONS, type IntegrationCard } from "./integrations-hub-data";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface ConnectionRecord {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  lastSyncAt: string | null;
  baseUrl: string;
  authMethod: string;
  authConfig: Record<string, any>;
  defaultHeaders: Record<string, any>;
}

interface SyncLog {
  id: number;
  direction: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: string;
}

export default function IntegrationSettingsPage() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const slug = params.slug;
  const integration = INTEGRATIONS.find(i => i.slug === slug);

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [baseUrl, setBaseUrl] = useState("");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [connectionName, setConnectionName] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data: connections = [], isLoading } = useQuery<ConnectionRecord[]>({
    queryKey: ["integration-connections"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/integrations/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const conn = connections.find(c => c.slug === slug);

  const { data: logs = [] } = useQuery<SyncLog[]>({
    queryKey: ["integration-logs", conn?.id],
    queryFn: async () => {
      if (!conn?.id) return [];
      const res = await authFetch(`${API_BASE}/integrations/connections/${conn.id}/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!conn?.id && !!token,
  });

  useEffect(() => {
    if (!integration) return;
    if (conn) {
      setBaseUrl(conn.baseUrl || integration.defaultBaseUrl);
      setConnectionName(conn.name);
      const existingAuth = (conn.authConfig || {}) as Record<string, any>;
      const prefilled: Record<string, any> = {};
      integration.fields.forEach(f => {
        if (f.configPath === "authConfig") {
          prefilled[f.key] = existingAuth[f.key] || "";
        } else if (f.configPath === "root" && f.key === "authMethodSelect") {
          prefilled[f.key] = conn.authMethod || integration.defaultAuthMethod;
        }
      });
      setFormData(prefilled);
    } else {
      setBaseUrl(integration.defaultBaseUrl);
      setConnectionName(integration.name);
      setFormData({});
    }
  }, [conn, integration]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch(`${API_BASE}/integrations/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast({ title: "אינטגרציה חוברה", description: "החיבור נשמר בהצלחה" });
    },
    onError: (e: any) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await authFetch(`${API_BASE}/integrations/connections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast({ title: "עודכן", description: "החיבור עודכן בהצלחה" });
    },
    onError: () => {
      toast({ title: "שגיאה", description: "לא ניתן לעדכן", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/integrations/connections/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast({ title: "נמחק", description: "החיבור הוסר" });
      navigate("/integrations-hub");
    },
    onError: () => {
      toast({ title: "שגיאה", description: "לא ניתן למחוק", variant: "destructive" });
    },
  });

  const handleTest = async () => {
    if (!conn) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch(`${API_BASE}/integrations/connections/${conn.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      queryClient.invalidateQueries({ queryKey: ["integration-logs", conn.id] });
      setTestResult(result);
      if (result.success) {
        toast({ title: "חיבור תקין", description: result.message });
      } else {
        toast({ title: "חיבור נכשל", description: result.message, variant: "destructive" });
      }
    } catch {
      setTestResult({ success: false, message: "שגיאת תקשורת" });
    }
    setIsTesting(false);
  };

  const handleSave = () => {
    if (!integration) return;
    const authConfig: Record<string, any> = {};

    integration.fields.forEach(f => {
      if (f.configPath !== "authConfig") return;
      const val = formData[f.key];
      if (val === undefined || val === null) return;
      const valStr = String(val);
      if (valStr === "") return;
      if (conn && valStr.includes("****")) {
        const existingAuthConfig = (conn.authConfig || {}) as Record<string, any>;
        if (existingAuthConfig[f.key]) {
          authConfig[f.key] = existingAuthConfig[f.key];
          return;
        }
        return;
      }
      authConfig[f.key] = val;
    });

    const existingHeaders = conn ? ((conn.defaultHeaders || {}) as Record<string, any>) : {};

    const payload = {
      name: connectionName,
      slug: integration.slug,
      description: integration.description,
      serviceType: "rest_api",
      baseUrl,
      authMethod: formData.authMethodSelect || conn?.authMethod || integration.defaultAuthMethod,
      authConfig,
      defaultHeaders: existingHeaders,
      isActive: true,
    };

    if (conn) {
      updateMutation.mutate({ id: conn.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (!integration) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-lg font-medium">אינטגרציה לא נמצאה</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/integrations-hub")}>
          <ArrowRight className="w-4 h-4 ml-2" />
          חזרה ל-Hub
        </Button>
      </div>
    );
  }

  const Icon = integration.icon;
  const TIER_LABELS: Record<string, { label: string; color: string }> = {
    free: { label: "Free", color: "bg-green-500/10 text-green-400 border-green-500/20" },
    pro: { label: "Pro", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    enterprise: { label: "Enterprise", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  };
  const tier = TIER_LABELS[integration.tier];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="p-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <button onClick={() => navigate("/integrations-hub")} className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowRight className="w-4 h-4" />
            Integrations Hub
          </button>
          <span>/</span>
          <span className="text-foreground font-medium">{integration.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 ${integration.bgColor} rounded-2xl flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-8 h-8 ${integration.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg sm:text-2xl font-bold">{integration.name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${tier.color}`}>
                  {tier.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{integration.nameEn}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{integration.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conn ? (
              <span className="flex items-center gap-1.5 text-sm text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">
                <Wifi className="w-4 h-4" />
                מחובר
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border">
                <WifiOff className="w-4 h-4" />
                לא מחובר
              </span>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="flex flex-wrap gap-2 mb-6">
          {integration.features.map(f => (
            <span key={f} className="text-xs px-2.5 py-1 bg-muted/40 rounded-lg text-muted-foreground border border-border/50">
              {f}
            </span>
          ))}
          {integration.docUrl && (
            <a
              href={integration.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              תיעוד רשמי
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Form */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                הגדרות חיבור
              </h2>

              <div className="space-y-4">
                <div>
                  <Label>שם החיבור</Label>
                  <Input
                    value={connectionName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnectionName(e.target.value)}
                    className="mt-1"
                    placeholder={integration.name}
                  />
                </div>

                <div>
                  <Label>כתובת בסיס (Base URL)</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)}
                    className="mt-1"
                    dir="ltr"
                    placeholder={integration.defaultBaseUrl}
                  />
                </div>

                {integration.fields.map(field => (
                  <div key={field.key}>
                    <Label>
                      {field.label}
                      {field.required && <span className="text-red-400 mr-1">*</span>}
                    </Label>
                    {field.type === "select" ? (
                      <select
                        className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                        value={formData[field.key] || ""}
                        onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      >
                        <option value="">בחר...</option>
                        {field.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={field.type}
                        value={formData[field.key] || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="mt-1"
                        dir={["email", "url", "password"].includes(field.type) ? "ltr" : undefined}
                      />
                    )}
                    {field.helpText && (
                      <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                    )}
                  </div>
                ))}
              </div>

              {testResult && (
                <div className={`mt-4 p-3 rounded-xl text-sm ${testResult.success ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 inline ml-2" /> : <XCircle className="w-4 h-4 inline ml-2" />}
                  {testResult.message}
                </div>
              )}

              <div className="flex items-center gap-2 pt-4 border-t border-border mt-4">
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending || !connectionName || !baseUrl}
                  className="flex-1 gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending)
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Save className="w-4 h-4" />}
                  {conn ? "עדכן חיבור" : "שמור וחבר"}
                </Button>
                {conn && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleTest}
                      disabled={isTesting}
                      className="gap-2"
                    >
                      {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                      בדוק חיבור
                    </Button>
                    {isSuperAdmin && (<button
                      onClick={async () => {
                        const ok = await globalConfirm(`למחוק את חיבור "${integration.name}"?`);
                        if (ok) { deleteMutation.mutate(conn.id); }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                      title="מחק חיבור"
                    >
                      {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                    )}
                  </>
                )}
              </div>
            </Card>

            {/* Dev Guide */}
            <Card className="p-5">
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Code2 className="w-4 h-4" />
                מדריך מפתחים (Dev Guide)
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground mb-1">שימוש ב-API הפנימי</p>
                  <p>לאחר שמירת החיבור, ניתן להשתמש בו דרך ה-API הפנימי:</p>
                  <div className="mt-2 p-3 bg-muted/30 rounded-lg font-mono text-xs space-y-1 dir-ltr text-right">
                    <div><span className="text-blue-400">GET</span>  /api/integrations/connections — רשימת חיבורים</div>
                    <div><span className="text-green-400">POST</span> /api/integrations/connections — יצירת חיבור</div>
                    <div><span className="text-yellow-400">PUT</span>  /api/integrations/connections/:id — עדכון</div>
                    <div><span className="text-green-400">POST</span> /api/integrations/connections/:id/test — בדיקה</div>
                    <div><span className="text-red-400">DEL</span>  /api/integrations/connections/:id — מחיקה</div>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">אימות (Auth)</p>
                  <p>שיטת האימות המוגדרת: <code className="text-primary">{integration.defaultAuthMethod}</code></p>
                  <p className="mt-1">כתובת ה-Base URL: <code className="text-primary dir-ltr">{integration.defaultBaseUrl}</code></p>
                </div>
                {integration.docUrl && (
                  <div>
                    <p className="font-medium text-foreground mb-1">תיעוד חיצוני</p>
                    <a
                      href={integration.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {integration.nameEn} Official Documentation
                    </a>
                  </div>
                )}
                <div>
                  <p className="font-medium text-foreground mb-1">פיצ'רים נתמכים</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {integration.features.map(f => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </div>

          {/* Status & Logs Panel */}
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">סטטוס חיבור</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">מצב:</span>
                  {conn ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <Wifi className="w-3 h-3" /> מחובר
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <WifiOff className="w-3 h-3" /> לא מחובר
                    </span>
                  )}
                </div>
                {conn?.lastSyncAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">בדיקה אחרונה:</span>
                    <span className="text-xs">{new Date(conn.lastSyncAt).toLocaleDateString("he-IL")}</span>
                  </div>
                )}
                {conn && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">שיטת אימות:</span>
                    <code className="text-xs text-primary">{conn.authMethod}</code>
                  </div>
                )}
              </div>
            </Card>

            {/* Sync Logs */}
            {conn && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  יומן פעילות
                </h3>
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    אין פעילות עדיין
                  </p>
                ) : (
                  <div className="space-y-2">
                    {logs.slice(0, 8).map(log => (
                      <div key={log.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {log.status === "success" ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {log.direction === "test" ? "בדיקה" : log.direction}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground/60">
                          {new Date(log.startedAt).toLocaleDateString("he-IL")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
