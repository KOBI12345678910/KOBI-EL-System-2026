import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Globe, Plus, Trash2, Edit2, CheckCircle, AlertCircle, X,
  Loader2, ChevronDown, ChevronUp, Link, Shield, Users,
  ExternalLink, Copy, RefreshCw
} from "lucide-react";

interface SsoProvider {
  id: number;
  name: string;
  slug: string;
  type: "oauth2" | "saml";
  isActive: boolean;
  isAutoProvision: boolean;
  defaultRoleId: number | null;
  roleMappings: Record<string, number>;
  createdAt: string;
}

interface SsoProviderForm {
  name: string;
  slug: string;
  type: "oauth2" | "saml";
  isAutoProvision: boolean;
  defaultRoleId: string;
  config: {
    oauth2?: {
      clientId: string;
      clientSecret: string;
      authorizationUrl: string;
      tokenUrl: string;
      userInfoUrl: string;
      scopes: string;
      redirectUri: string;
    };
    saml?: {
      entryPoint: string;
      issuer: string;
      cert: string;
      callbackUrl: string;
    };
  };
}

const EMPTY_FORM: SsoProviderForm = {
  name: "",
  slug: "",
  type: "oauth2",
  isAutoProvision: true,
  defaultRoleId: "",
  config: {
    oauth2: {
      clientId: "",
      clientSecret: "",
      authorizationUrl: "",
      tokenUrl: "",
      userInfoUrl: "",
      scopes: "openid email profile",
      redirectUri: "",
    },
  },
};

const PRESETS = [
  {
    name: "Microsoft Azure AD",
    type: "oauth2" as const,
    authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    scopes: "openid email profile",
  },
  {
    name: "Google Workspace",
    type: "oauth2" as const,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scopes: "openid email profile",
  },
  {
    name: "Okta",
    type: "oauth2" as const,
    authorizationUrl: "https://{domain}/oauth2/default/v1/authorize",
    tokenUrl: "https://{domain}/oauth2/default/v1/token",
    userInfoUrl: "https://{domain}/oauth2/default/v1/userinfo",
    scopes: "openid email profile",
  },
];

export default function SsoSettingsSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SsoProviderForm>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: providers = [], isLoading } = useQuery<SsoProvider[]>({
    queryKey: ["sso-providers"],
    queryFn: async () => {
      const r = await authFetch("/api/sso/providers");
      return r.ok ? r.json() : [];
    },
  });

  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["platform-roles-sso"],
    queryFn: async () => {
      const r = await authFetch("/api/platform/roles");
      return r.ok ? r.json() : [];
    },
  });

  const createProvider = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch("/api/sso/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Failed to create provider");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setSuccess("ספק SSO נוצר בהצלחה");
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateProvider = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await authFetch(`/api/sso/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Failed to update provider");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
      setEditingId(null);
      setShowForm(false);
      setSuccess("ספק SSO עודכן בהצלחה");
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteProvider = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/sso/providers/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete provider");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
      setSuccess("ספק SSO נמחק");
    },
  });

  const toggleProvider = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await authFetch(`/api/sso/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("Failed to toggle provider");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sso-providers"] }),
  });

  const handleSubmit = () => {
    const config: Record<string, any> = {};
    if (form.type === "oauth2" && form.config.oauth2) {
      config.oauth2 = {
        ...form.config.oauth2,
        scopes: form.config.oauth2.scopes.split(" ").filter(Boolean),
      };
    } else if (form.type === "saml" && form.config.saml) {
      config.saml = form.config.saml;
    }

    const payload = {
      name: form.name,
      slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      type: form.type,
      config,
      defaultRoleId: form.defaultRoleId ? parseInt(form.defaultRoleId) : null,
      isAutoProvision: form.isAutoProvision,
    };

    if (editingId) {
      updateProvider.mutate({ id: editingId, data: payload });
    } else {
      createProvider.mutate(payload);
    }
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setForm(prev => ({
      ...prev,
      name: preset.name,
      slug: preset.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      type: preset.type,
      config: {
        oauth2: {
          clientId: "",
          clientSecret: "",
          authorizationUrl: preset.authorizationUrl,
          tokenUrl: preset.tokenUrl,
          userInfoUrl: preset.userInfoUrl,
          scopes: preset.scopes,
          redirectUri: `${window.location.origin}/api/sso/${prev.slug || "provider"}/callback`,
        },
      },
    }));
  };

  const baseUrl = window.location.origin;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{success}</span>
          <button onClick={() => setSuccess(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Globe className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">SSO — כניסה אחת לכולם</h2>
            <p className="text-sm text-slate-400">חיבור לספקי זהות ארגוניים (SAML 2.0, OAuth 2.0)</p>
          </div>
        </div>
        <Button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30"
          variant="outline"
        >
          <Plus className="h-4 w-4 ml-2" />
          הוסף ספק
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">כתובות SP (Service Provider)</h3>
          <div className="space-y-1">
            {[
              { label: "SAML Metadata", url: `${baseUrl}/api/sso/metadata` },
              { label: "SAML ACS URL", url: `${baseUrl}/api/sso/saml/acs` },
              { label: "SAML SLO URL", url: `${baseUrl}/api/sso/saml/slo` },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between bg-input rounded px-3 py-2">
                <span className="text-xs text-slate-400">{item.label}</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-amber-400 font-mono truncate max-w-xs">{item.url}</code>
                  <button onClick={() => navigator.clipboard?.writeText(item.url)} className="text-slate-500 hover:text-slate-300">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground font-semibold">{editingId ? "עריכת ספק SSO" : "ספק SSO חדש"}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-2">תבניות מהירות:</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="text-xs px-3 py-1.5 bg-input border border-border rounded-full text-slate-300 hover:border-blue-500/50 hover:text-blue-400 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-slate-300 text-xs">שם ספק</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Microsoft Azure AD" className="bg-input border-border text-foreground text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300 text-xs">Slug (מזהה ייחודי)</Label>
                <Input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                  placeholder="azure-ad" className="bg-input border-border text-foreground text-sm font-mono" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-300 text-xs">סוג</Label>
              <div className="flex gap-2">
                {(["oauth2", "saml"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setForm(p => ({
                      ...p, type,
                      config: type === "oauth2"
                        ? { oauth2: { clientId: "", clientSecret: "", authorizationUrl: "", tokenUrl: "", userInfoUrl: "", scopes: "openid email profile", redirectUri: "" } }
                        : { saml: { entryPoint: "", issuer: "", cert: "", callbackUrl: "" } }
                    }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${form.type === type ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" : "bg-input text-slate-400 border border-border hover:border-slate-500"}`}
                  >
                    {type === "oauth2" ? "OAuth 2.0" : "SAML 2.0"}
                  </button>
                ))}
              </div>
            </div>

            {form.type === "oauth2" && form.config.oauth2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Client ID</Label>
                    <Input value={form.config.oauth2.clientId}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, clientId: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Client Secret</Label>
                    <Input type="password" value={form.config.oauth2.clientSecret}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, clientSecret: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-xs">Authorization URL</Label>
                  <Input value={form.config.oauth2.authorizationUrl}
                    onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, authorizationUrl: e.target.value } } }))}
                    className="bg-input border-border text-foreground text-sm font-mono text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Token URL</Label>
                    <Input value={form.config.oauth2.tokenUrl}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, tokenUrl: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">User Info URL</Label>
                    <Input value={form.config.oauth2.userInfoUrl}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, userInfoUrl: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Scopes</Label>
                    <Input value={form.config.oauth2.scopes}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, scopes: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Redirect URI</Label>
                    <Input value={form.config.oauth2.redirectUri || `${window.location.origin}/api/sso/${form.slug}/callback`}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, oauth2: { ...p.config.oauth2!, redirectUri: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono text-xs" />
                  </div>
                </div>
              </div>
            )}

            {form.type === "saml" && form.config.saml && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">IdP Entry Point URL</Label>
                    <Input value={form.config.saml.entryPoint}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, saml: { ...p.config.saml!, entryPoint: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">Issuer (Entity ID)</Label>
                    <Input value={form.config.saml.issuer}
                      onChange={e => setForm(p => ({ ...p, config: { ...p.config, saml: { ...p.config.saml!, issuer: e.target.value } } }))}
                      className="bg-input border-border text-foreground text-sm font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-300 text-xs">IdP Certificate (X.509)</Label>
                  <textarea
                    value={form.config.saml.cert}
                    onChange={e => setForm(p => ({ ...p, config: { ...p.config, saml: { ...p.config.saml!, cert: e.target.value } } }))}
                    rows={4}
                    className="w-full bg-input border border-border rounded-md text-foreground text-xs font-mono p-2"
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-slate-300 text-xs">תפקיד ברירת מחדל לחשבונות חדשים</Label>
                <select
                  value={form.defaultRoleId}
                  onChange={e => setForm(p => ({ ...p, defaultRoleId: e.target.value }))}
                  className="w-full bg-input border border-border rounded-md text-foreground text-sm px-3 py-2"
                >
                  <option value="">— ללא תפקיד —</option>
                  {(roles as any[]).filter(r => r.isActive).map(role => (
                    <option key={role.id} value={role.id}>{role.nameHe || role.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, isAutoProvision: !p.isAutoProvision }))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${form.isAutoProvision ? "bg-green-500" : "bg-muted"}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${form.isAutoProvision ? "right-0.5" : "right-[22px]"}`} />
                  </button>
                  <span className="text-sm text-slate-300">יצירה אוטומטית של משתמשים</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>ביטול</Button>
              <Button
                onClick={handleSubmit}
                disabled={!form.name || createProvider.isPending || updateProvider.isPending}
                className="bg-blue-500 hover:bg-blue-600 text-foreground"
              >
                {(createProvider.isPending || updateProvider.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? "עדכן" : "צור ספק")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>אין ספקי SSO מוגדרים</p>
          <p className="text-sm mt-1">הוסף ספק כדי לאפשר כניסה ארגונית</p>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(provider => (
            <Card key={provider.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <Globe className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-foreground font-medium">{provider.name}</p>
                        <Badge className={`text-xs ${provider.isActive ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
                          {provider.isActive ? "פעיל" : "מנוטרל"}
                        </Badge>
                        <Badge className="text-xs bg-blue-500/20 text-blue-400">
                          {provider.type === "oauth2" ? "OAuth 2.0" : "SAML 2.0"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 font-mono">/api/sso/{provider.slug}/authorize</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleProvider.mutate({ id: provider.id, isActive: !provider.isActive })}
                      className={`w-9 h-5 rounded-full transition-colors relative ${provider.isActive ? "bg-green-500" : "bg-muted"}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${provider.isActive ? "right-0.5" : "right-[18px]"}`} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(provider.id);
                        setShowForm(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-foreground"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteProvider.mutate(provider.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  {provider.isAutoProvision && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      יצירה אוטומטית
                    </span>
                  )}
                  <span>נוצר: {new Date(provider.createdAt).toLocaleDateString("he-IL")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
