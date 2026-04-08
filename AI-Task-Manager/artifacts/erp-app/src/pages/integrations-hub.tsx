import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card, Modal } from "@/components/ui-components";
import {
  CheckCircle2, XCircle, Loader2, Trash2, TestTube,
  Settings2, Wifi, WifiOff, Save, Search, X, ExternalLink,
  Zap, Shield, Code2, Layers, Plug, Clock,
} from "lucide-react";
import {
  INTEGRATIONS, CATEGORIES, TIER_LABELS,
  type IntegrationCard, type IntegrationField, type IntegrationCategory,
} from "./integrations-hub-data";
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

export default function IntegrationsHubPage() {
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationCard | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [baseUrl, setBaseUrl] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [editingConnection, setEditingConnection] = useState<ConnectionRecord | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      closeModal();
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
      closeModal();
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
      setDeletingId(null);
    },
    onError: () => {
      toast({ title: "שגיאה", description: "לא ניתן למחוק", variant: "destructive" });
      setDeletingId(null);
    },
  });

  const testConnection = async (id: number) => {
    setTestingId(id);
    try {
      const res = await authFetch(`${API_BASE}/integrations/connections/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      if (result.success) {
        toast({ title: "חיבור תקין", description: result.message });
      } else {
        toast({ title: "חיבור נכשל", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", description: "שגיאת תקשורת", variant: "destructive" });
    }
    setTestingId(null);
  };

  const openConnect = (integration: IntegrationCard, conn?: ConnectionRecord) => {
    setSelectedIntegration(integration);
    if (conn) {
      setEditingConnection(conn);
      setBaseUrl(conn.baseUrl || integration.defaultBaseUrl);
      setConnectionName(conn.name);
      const existingAuthConfig = (conn.authConfig || {}) as Record<string, any>;
      const prefilled: Record<string, any> = {};
      integration.fields.forEach(f => {
        if (f.configPath === "authConfig") {
          prefilled[f.key] = existingAuthConfig[f.key] || "";
        } else if (f.configPath === "root") {
          if (f.key === "authMethodSelect") {
            prefilled[f.key] = conn.authMethod || integration.defaultAuthMethod;
          }
        }
      });
      setFormData(prefilled);
    } else {
      setEditingConnection(null);
      setBaseUrl(integration.defaultBaseUrl);
      setConnectionName(integration.name);
      setFormData({});
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedIntegration(null);
    setEditingConnection(null);
    setFormData({});
  };

  const handleSave = () => {
    if (!selectedIntegration) return;
    const authConfig: Record<string, any> = {};

    selectedIntegration.fields.forEach(f => {
      if (f.configPath !== "authConfig") return;
      const val = formData[f.key];
      if (val === undefined || val === null) return;
      const valStr = String(val);
      if (valStr === "") return;
      if (editingConnection && valStr.includes("****")) {
        const existingAuthConfig = (editingConnection.authConfig || {}) as Record<string, any>;
        if (existingAuthConfig[f.key]) {
          authConfig[f.key] = existingAuthConfig[f.key];
          return;
        }
        return;
      }
      authConfig[f.key] = val;
    });

    const existingHeaders = editingConnection
      ? ((editingConnection.defaultHeaders || {}) as Record<string, any>)
      : {};

    const payload = {
      name: connectionName,
      slug: selectedIntegration.slug,
      description: selectedIntegration.description,
      serviceType: "rest_api",
      baseUrl,
      authMethod: formData.authMethodSelect || (editingConnection?.authMethod) || selectedIntegration.defaultAuthMethod,
      authConfig,
      defaultHeaders: existingHeaders,
      isActive: true,
    };

    if (editingConnection) {
      updateMutation.mutate({ id: editingConnection.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const connectedMap = new Map<string, ConnectionRecord>();
  connections.forEach(c => connectedMap.set(c.slug, c));

  const filtered = INTEGRATIONS.filter(integration => {
    const matchesCategory = activeCategory === "all" || integration.category === activeCategory;
    const matchesSearch = !search ||
      integration.name.toLowerCase().includes(search.toLowerCase()) ||
      integration.nameEn.toLowerCase().includes(search.toLowerCase()) ||
      integration.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const connectedCount = connections.length;
  const totalCount = INTEGRATIONS.length;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Plug className="w-6 h-6 text-primary" />
                </div>
                Integrations Hub
              </h1>
              <p className="text-muted-foreground mt-1">
                חבר את המערכת ל-{totalCount}+ שירותים חיצוניים — תקשורת, תשלומים, שיווק, AI ופיתוח
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="text-lg sm:text-2xl font-bold text-green-400">{connectedCount}</div>
                <div className="text-xs text-muted-foreground">מחוברים</div>
              </div>
              <div className="text-center px-4 py-2 bg-muted/30 border border-border rounded-xl">
                <div className="text-lg sm:text-2xl font-bold">{totalCount}</div>
                <div className="text-xs text-muted-foreground">זמינים</div>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-4 h-2 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-primary transition-all duration-500"
              style={{ width: `${(connectedCount / totalCount) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {connectedCount} מתוך {totalCount} שירותים מחוברים ({Math.round((connectedCount / totalCount) * 100)}%)
          </p>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חפש אינטגרציה..."
              className="w-full bg-card border border-border rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const count = cat.id === "all"
              ? INTEGRATIONS.length
              : INTEGRATIONS.filter(i => i.category === cat.id).length;
            const connectedInCat = cat.id === "all"
              ? connectedCount
              : connections.filter(c => {
                const integ = INTEGRATIONS.find(i => i.slug === c.slug);
                return integ?.category === cat.id;
              }).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                <Icon className={`w-4 h-4 ${activeCategory === cat.id ? "" : cat.color}`} />
                {cat.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeCategory === cat.id
                    ? "bg-card/20 text-foreground"
                    : "bg-muted/50 text-muted-foreground"
                }`}>
                  {connectedInCat > 0 ? `${connectedInCat}/` : ""}{count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Integration Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-muted/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-1/2 rounded bg-muted/20" />
                    <div className="h-3 w-2/3 rounded bg-muted/15" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-muted/10" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-muted/15" />
                  <div className="h-5 w-14 rounded-full bg-muted/10" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">לא נמצאו אינטגרציות</p>
            <p className="text-sm mt-1">נסה חיפוש אחר או בחר קטגוריה שונה</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(integration => {
              const conn = connectedMap.get(integration.slug);
              const isConnected = !!conn;
              const isTesting = conn && testingId === conn.id;
              const tier = TIER_LABELS[integration.tier];
              const Icon = integration.icon;
              const needsSetup = integration.status === "requires_backend_setup";

              return (
                <Card
                  key={integration.slug}
                  className={`p-5 flex flex-col transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${
                    needsSetup ? "opacity-75 border-dashed" :
                    isConnected ? "border-green-500/30 bg-green-500/[0.02]" : ""
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 ${integration.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${integration.color}`} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${tier.color}`}>
                        {tier.label}
                      </span>
                      {needsSetup ? (
                        <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                          נדרשת הגדרה
                        </span>
                      ) : isConnected ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                          <Wifi className="w-2.5 h-2.5" />
                          מחובר
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border">
                          לא מחובר
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Info */}
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-0.5">{integration.name}</h3>
                    <p className="text-[10px] text-muted-foreground/70 mb-2">{integration.nameEn}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                      {integration.description}
                    </p>

                    {/* Backend setup note */}
                    {needsSetup && integration.statusNote && (
                      <p className="text-[10px] text-amber-600/80 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1 mb-2">
                        {integration.statusNote}
                      </p>
                    )}

                    {/* Features */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {integration.features.slice(0, 3).map(f => (
                        <span key={f} className="text-[10px] px-1.5 py-0.5 bg-muted/40 rounded text-muted-foreground">
                          {f}
                        </span>
                      ))}
                      {integration.features.length > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-muted/40 rounded text-muted-foreground">
                          +{integration.features.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Last sync */}
                    {conn?.lastSyncAt && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-2">
                        <Clock className="w-3 h-3" />
                        בדיקה: {new Date(conn.lastSyncAt).toLocaleDateString("he-IL")}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-3 border-t border-border/50">
                    {needsSetup ? (
                      <span className="flex-1 text-center text-[10px] text-muted-foreground py-1">
                        לא זמין לחיבור ישיר
                      </span>
                    ) : !isConnected ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1 h-7 text-xs gap-1"
                        onClick={() => openConnect(integration, conn)}
                      >
                        <Plug className="w-3 h-3" />
                        חבר
                      </Button>
                    ) : null}
                    {!needsSetup && (
                    <Button
                      size="sm"
                      variant={isConnected ? "outline" : "ghost"}
                      className={`h-7 text-xs gap-1 ${isConnected ? "flex-1" : ""}`}
                      onClick={() => navigate(`/integrations-hub/${integration.slug}`)}
                    >
                      <Settings2 className="w-3 h-3" />
                      {isConnected ? "הגדרות" : "פרטים"}
                    </Button>
                    )}
                    {isConnected && conn && (
                      <>
                        <button
                          onClick={() => testConnection(conn.id)}
                          disabled={!!isTesting}
                          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          title="בדוק חיבור"
                        >
                          {isTesting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <TestTube className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {isSuperAdmin && (<button
                          onClick={async () => {
                            const ok = await globalConfirm(`למחוק את חיבור "${integration.name}"?`);
                            if (ok) { setDeletingId(conn.id); deleteMutation.mutate(conn.id); }
                          }}
                          disabled={deletingId === conn.id}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                          title="מחק חיבור"
                        >
                          {deletingId === conn.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        )}
                      </>
                    )}
                    {integration.docUrl && (
                      <a
                        href={integration.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                        title="תיעוד"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Connected integrations summary */}
        {connectedCount > 0 && (
          <div className="mt-8 p-5 bg-card border border-border rounded-2xl">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              חיבורים פעילים ({connectedCount})
            </h3>
            <div className="flex flex-wrap gap-2">
              {connections.map(conn => {
                const integ = INTEGRATIONS.find(i => i.slug === conn.slug);
                const Icon = integ?.icon || Plug;
                return (
                  <div
                    key={conn.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-500/5 border border-green-500/20 rounded-lg"
                  >
                    <Icon className={`w-3.5 h-3.5 ${integ?.color || "text-primary"}`} />
                    <span className="text-xs font-medium">{conn.name}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showModal && selectedIntegration && (
        <Modal
          isOpen={showModal}
          onClose={closeModal}
          title={editingConnection ? `עריכת ${selectedIntegration.name}` : `חיבור ${selectedIntegration.name}`}
        >
          <div className="space-y-4 p-4 max-h-[75vh] overflow-y-auto">
            {/* Integration Info */}
            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
              <div className={`w-10 h-10 ${selectedIntegration.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <selectedIntegration.icon className={`w-5 h-5 ${selectedIntegration.color}`} />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{selectedIntegration.name}</p>
                <p className="text-xs text-muted-foreground">{selectedIntegration.description}</p>
              </div>
              {selectedIntegration.docUrl && (
                <a
                  href={selectedIntegration.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  מדריך
                </a>
              )}
            </div>

            {/* Features */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">תכונות עיקריות:</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedIntegration.features.map(f => (
                  <span key={f} className="text-xs px-2 py-0.5 bg-muted/40 rounded-lg text-muted-foreground border border-border/50">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <hr className="border-border/50" />

            {/* Form Fields */}
            <div>
              <Label>שם החיבור</Label>
              <Input
                value={connectionName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnectionName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>כתובת בסיס (Base URL)</Label>
              <Input
                value={baseUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)}
                className="mt-1"
                dir="ltr"
              />
            </div>

            {selectedIntegration.fields.map(field => (
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
                    type={field.type === "textarea" ? "text" : field.type}
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

            {/* Dev Guide */}
            <div className="p-3 bg-muted/20 border border-border/50 rounded-xl">
              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5" />
                מדריך מפתחים (Dev Guide)
              </p>
              <p className="text-xs text-muted-foreground">
                לאחר שמירת החיבור, תוכל להשתמש ב-API הפנימי:
              </p>
              <code className="text-xs text-primary/80 block mt-1 dir-ltr">
                POST /api/integrations/connections/{"{id}"}/test
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                לתיעוד מלא ראה את מדריך ה-REST API v2 בקטגוריית "פיתוח ו-API".
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending || !connectionName || !baseUrl}
                className="flex-1 gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {editingConnection ? "עדכן חיבור" : "שמור וחבר"}
              </Button>
              <Button variant="outline" onClick={closeModal}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
