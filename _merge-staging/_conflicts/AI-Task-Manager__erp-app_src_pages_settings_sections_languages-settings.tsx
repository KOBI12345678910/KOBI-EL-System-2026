import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Globe, Plus, Trash2, Star, Check, X, Edit2, Save, Languages } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface Locale {
  id: number;
  code: string;
  name: string;
  nativeName: string;
  direction: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface Translation {
  id: number;
  localeCode: string;
  namespace: string;
  key: string;
  value: string;
}

export default function LanguagesSettingsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"locales" | "translations">("locales");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showAddLocale, setShowAddLocale] = useState(false);
  const [newLocale, setNewLocale] = useState({ code: "", name: "", nativeName: "", direction: "ltr" });
  const [editingTranslation, setEditingTranslation] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [filterLocale, setFilterLocale] = useState("");
  const [filterNamespace, setFilterNamespace] = useState("");
  const [showAddTranslation, setShowAddTranslation] = useState(false);
  const [newTranslation, setNewTranslation] = useState({ localeCode: "", namespace: "common", key: "", value: "" });

  const { data: locales = [] } = useQuery<Locale[]>({
    queryKey: ["platform-locales"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/locales`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: translations = [] } = useQuery<Translation[]>({
    queryKey: ["platform-translations", filterLocale, filterNamespace],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterLocale) params.set("localeCode", filterLocale);
      if (filterNamespace) params.set("namespace", filterNamespace);
      const r = await authFetch(`${API_BASE}/platform/translations?${params}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createLocaleMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API_BASE}/platform/locales`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-locales"] });
      setShowAddLocale(false);
      setNewLocale({ code: "", name: "", nativeName: "", direction: "ltr" });
      toast({ title: "נוספה שפה", description: "שפה חדשה נוספה בהצלחה" });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const updateLocaleMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API_BASE}/platform/locales/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-locales"] });
      toast({ title: "עודכן", description: "שפה עודכנה בהצלחה" });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteLocaleMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/locales/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-locales"] });
      toast({ title: "נמחקה", description: "שפה נמחקה בהצלחה" });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const createTranslationMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API_BASE}/platform/translations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-translations"] });
      setShowAddTranslation(false);
      setNewTranslation({ localeCode: "", namespace: "common", key: "", value: "" });
      toast({ title: "נוסף תרגום", description: "תרגום חדש נוסף" });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const updateTranslationMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: string }) => {
      const r = await authFetch(`${API_BASE}/platform/translations/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-translations"] });
      setEditingTranslation(null);
      toast({ title: "עודכן" });
    },
  });

  const deleteTranslationMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/platform/translations/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-translations"] });
      toast({ title: "נמחק" });
    },
  });

  const tabs = [
    { id: "locales", label: "שפות", icon: Globe },
    { id: "translations", label: "תרגומים", icon: Languages },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-lg sm:text-2xl font-bold mb-2">שפות ולוקליזציה</h1>
      <p className="text-sm text-muted-foreground mb-6">ניהול שפות המערכת, כיווניות ומילון תרגומים</p>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "locales" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">שפות פעילות</h3>
            <Button onClick={() => setShowAddLocale(true)} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> הוסף שפה
            </Button>
          </div>

          {showAddLocale && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-medium mb-3">הוספת שפה חדשה</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>קוד שפה (ISO)</Label>
                  <Input value={newLocale.code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLocale(p => ({ ...p, code: e.target.value }))} placeholder="ar, fr, ru..." className="mt-1" />
                </div>
                <div>
                  <Label>שם באנגלית</Label>
                  <Input value={newLocale.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLocale(p => ({ ...p, name: e.target.value }))} placeholder="Arabic" className="mt-1" />
                </div>
                <div>
                  <Label>שם בשפת המקור</Label>
                  <Input value={newLocale.nativeName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLocale(p => ({ ...p, nativeName: e.target.value }))} placeholder="العربية" className="mt-1" />
                </div>
                <div>
                  <Label>כיוון</Label>
                  <select className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={newLocale.direction} onChange={(e) => setNewLocale(p => ({ ...p, direction: e.target.value }))}>
                    <option value="ltr">שמאל לימין (LTR)</option>
                    <option value="rtl">ימין לשמאל (RTL)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={() => createLocaleMutation.mutate(newLocale)} size="sm" disabled={!newLocale.code || !newLocale.name}>
                  <Check className="w-4 h-4 mr-1" /> הוסף
                </Button>
                <Button onClick={() => setShowAddLocale(false)} variant="outline" size="sm">
                  <X className="w-4 h-4 mr-1" /> ביטול
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {locales.map((locale) => (
              <Card key={locale.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{locale.nativeName}</span>
                      <span className="text-xs text-muted-foreground">({locale.name})</span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded-md font-mono">{locale.code}</span>
                      <span className="text-xs px-2 py-0.5 bg-muted rounded-md">{locale.direction.toUpperCase()}</span>
                      {locale.isDefault && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-md">
                          <Star className="w-3 h-3" /> ברירת מחדל
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!locale.isDefault && (
                    <Button
                      onClick={() => updateLocaleMutation.mutate({ id: locale.id, isDefault: true })}
                      variant="outline" size="sm" className="gap-1"
                    >
                      <Star className="w-3.5 h-3.5" /> קבע כברירת מחדל
                    </Button>
                  )}
                  <Button
                    onClick={() => updateLocaleMutation.mutate({ id: locale.id, isActive: !locale.isActive })}
                    variant="outline" size="sm"
                  >
                    {locale.isActive ? "כבה" : "הפעל"}
                  </Button>
                  {!locale.isDefault && isSuperAdmin && (
                    <Button
                      onClick={async () => { const ok = await globalConfirm("למחוק שפה זו?"); if (ok) deleteLocaleMutation.mutate(locale.id); }}
                      variant="outline" size="sm" className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "translations" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">מילון תרגומים</h3>
            <Button onClick={() => setShowAddTranslation(true)} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> הוסף תרגום
            </Button>
          </div>

          <div className="flex gap-3">
            <div>
              <select
                className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
                value={filterLocale}
                onChange={(e) => setFilterLocale(e.target.value)}
              >
                <option value="">כל השפות</option>
                {locales.map((l) => (
                  <option key={l.code} value={l.code}>{l.nativeName} ({l.code})</option>
                ))}
              </select>
            </div>
            <div>
              <Input
                value={filterNamespace}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterNamespace(e.target.value)}
                placeholder="סנן לפי namespace..."
                className="h-9"
              />
            </div>
          </div>

          {showAddTranslation && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-medium mb-3">הוספת תרגום</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שפה</Label>
                  <select
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={newTranslation.localeCode}
                    onChange={(e) => setNewTranslation(p => ({ ...p, localeCode: e.target.value }))}
                  >
                    <option value="">בחר שפה...</option>
                    {locales.map((l) => (
                      <option key={l.code} value={l.code}>{l.nativeName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Namespace</Label>
                  <Input value={newTranslation.namespace} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTranslation(p => ({ ...p, namespace: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>מפתח</Label>
                  <Input value={newTranslation.key} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTranslation(p => ({ ...p, key: e.target.value }))} placeholder="menu.dashboard" className="mt-1" />
                </div>
                <div>
                  <Label>ערך</Label>
                  <Input value={newTranslation.value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTranslation(p => ({ ...p, value: e.target.value }))} placeholder="לוח בקרה" className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={() => createTranslationMutation.mutate(newTranslation)} size="sm" disabled={!newTranslation.localeCode || !newTranslation.key || !newTranslation.value}>
                  <Check className="w-4 h-4 mr-1" /> הוסף
                </Button>
                <Button onClick={() => setShowAddTranslation(false)} variant="outline" size="sm">
                  <X className="w-4 h-4 mr-1" /> ביטול
                </Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-medium">שפה</th>
                  <th className="text-right p-3 font-medium">Namespace</th>
                  <th className="text-right p-3 font-medium">מפתח</th>
                  <th className="text-right p-3 font-medium">ערך</th>
                  <th className="text-right p-3 font-medium w-24">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {translations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">אין תרגומים עדיין</td>
                  </tr>
                ) : (
                  translations.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3 font-mono text-xs">{t.localeCode}</td>
                      <td className="p-3 text-xs">{t.namespace}</td>
                      <td className="p-3 font-mono text-xs">{t.key}</td>
                      <td className="p-3">
                        {editingTranslation === t.id ? (
                          <div className="flex items-center gap-2">
                            <Input value={editValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)} className="h-7 text-sm" />
                            <Button size="sm" onClick={() => updateTranslationMutation.mutate({ id: t.id, value: editValue })} className="h-7 px-2">
                              <Save className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingTranslation(null)} className="h-7 px-2">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          t.value
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditingTranslation(t.id); setEditValue(t.value); }} className="p-1 hover:bg-muted rounded">
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק?"); if (ok) deleteTranslationMutation.mutate(t.id); }} className="p-1 hover:bg-destructive/10 rounded">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="languages" />
        <RelatedRecords entityType="languages" />
      </div>
    </div>
  );
}
