import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Key, Plus, Copy, Trash2, ToggleLeft, ToggleRight, Clock, Shield, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface ApiKey {
  id: number;
  name: string;
  key_preview: string;
  user_id: number;
  scopes: string[];
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface GatewayStats {
  cache: {
    totalEntries: number;
    active: number;
    expired: number;
  };
  version: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpDays, setNewKeyExpDays] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [keysRes, statsRes] = await Promise.all([
        authFetch("/api/api-keys"),
        authFetch("/api/gateway/stats"),
      ]);
      if (keysRes.ok) {
        const d = await keysRes.json();
        setKeys(d.data || []);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          expires_in_days: newKeyExpDays ? Number(newKeyExpDays) : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.api_key || "");
        toast.success("מפתח API נוצר בהצלחה");
        loadData();
      } else {
        toast.error("שגיאה ביצירת מפתח");
      }
    } catch {
      toast.error("שגיאה ביצירת מפתח");
    } finally {
      setSaving(false);
    }
  };

  const toggleKey = async (id: number) => {
    try {
      const res = await authFetch(`/api/api-keys/${id}/toggle`, { method: "PUT" });
      if (res.ok) {
        toast.success("סטטוס מפתח עודכן");
        loadData();
      }
    } catch {
      toast.error("שגיאה בעדכון");
    }
  };

  const deleteKey = async (id: number) => {
    if (!confirm("למחוק מפתח זה?")) return;
    try {
      const res = await authFetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("מפתח נמחק");
        loadData();
      }
    } catch {
      toast.error("שגיאה במחיקה");
    }
  };

  const clearCache = async () => {
    try {
      const res = await authFetch("/api/gateway/cache/clear", { method: "POST" });
      if (res.ok) {
        toast.success("מטמון נוקה בהצלחה");
        loadData();
      }
    } catch {
      toast.error("שגיאה בניקוי מטמון");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("הועתק ללוח");
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100">ניהול מפתחות API ושער API</h1>
            <p className="text-sm text-slate-400">ניהול מפתחות גישה חיצוניים, מטמון ותיעוד API</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-foreground rounded-lg text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Swagger UI
          </a>
          <a
            href="/api/graphql"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-foreground rounded-lg text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            GraphQL
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">מפתחות פעילים</p>
                <p className="text-2xl font-bold text-blue-400">
                  {keys.filter(k => k.is_active).length}
                </p>
              </div>
              <Key className="w-8 h-8 text-blue-400 opacity-40" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">שימושים היום</p>
                <p className="text-2xl font-bold text-green-400">
                  {keys.reduce((s, k) => s + (k.usage_count || 0), 0)}
                </p>
              </div>
              <Shield className="w-8 h-8 text-green-400 opacity-40" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">מטמון</p>
                <p className="text-2xl font-bold text-amber-400">
                  {stats?.cache?.active || 0} פעיל
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={clearCache}>
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-slate-100">מפתחות API</CardTitle>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button
                className="bg-blue-600 hover:bg-blue-500"
                onClick={() => { setNewKeyName(""); setNewKeyExpDays(""); setCreatedKey(""); }}
              >
                <Plus className="w-4 h-4 ml-1" />
                מפתח חדש
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-800 border-slate-700" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-slate-100">יצירת מפתח API חדש</DialogTitle>
              </DialogHeader>
              {createdKey ? (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
                    <p className="text-sm text-amber-300 mb-2">שמור את המפתח — הוא לא יוצג שוב!</p>
                    <div className="flex gap-2">
                      <code className="flex-1 p-2 bg-slate-900 rounded text-xs text-green-400 break-all">{createdKey}</code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(createdKey)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => { setShowCreate(false); setCreatedKey(""); }}>סגור</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-slate-300 mb-1 block">שם המפתח</label>
                    <Input
                      value={newKeyName}
                      onChange={e => setNewKeyName(e.target.value)}
                      placeholder="לדוגמה: אינטגרציה עם מערכת X"
                      className="bg-slate-900 border-slate-600 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-300 mb-1 block">תפוגה (ימים, ריק = ללא תפוגה)</label>
                    <Input
                      value={newKeyExpDays}
                      onChange={e => setNewKeyExpDays(e.target.value)}
                      placeholder="90"
                      type="number"
                      className="bg-slate-900 border-slate-600 text-slate-100"
                    />
                  </div>
                  <Button className="w-full bg-blue-600 hover:bg-blue-500" onClick={createKey} disabled={saving || !newKeyName.trim()}>
                    {saving ? "יוצר..." : "צור מפתח"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-400 text-center py-8">טוען...</p>
          ) : keys.length === 0 ? (
            <p className="text-slate-400 text-center py-8">אין מפתחות API. צור מפתח חדש כדי להתחיל.</p>
          ) : (
            <div className="space-y-3">
              {keys.map(k => (
                <div key={k.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className={`w-5 h-5 ${k.is_active ? "text-green-400" : "text-slate-500"}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{k.name}</span>
                        <Badge variant={k.is_active ? "default" : "secondary"} className={k.is_active ? "bg-green-600/30 text-green-300" : ""}>
                          {k.is_active ? "פעיל" : "מושבת"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <code>{k.key_preview}</code>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {k.usage_count} שימושים
                        </span>
                        {k.last_used_at && (
                          <span>שימוש אחרון: {new Date(k.last_used_at).toLocaleDateString("he-IL")}</span>
                        )}
                        {k.expires_at && (
                          <span className={new Date(k.expires_at) < new Date() ? "text-red-400" : ""}>
                            תפוגה: {new Date(k.expires_at).toLocaleDateString("he-IL")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleKey(k.id)}>
                      {k.is_active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteKey(k.id)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">מידע על ממשק ה-API</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">אימות — Authentication</h3>
              <div className="p-3 bg-slate-900 rounded-lg space-y-2 text-sm text-slate-400">
                <p>שתי שיטות אימות נתמכות:</p>
                <div className="space-y-1">
                  <p className="text-slate-300">1. Bearer Token (מ-login)</p>
                  <code className="block text-xs text-green-400 p-1 bg-slate-950 rounded">
                    Authorization: Bearer {"<token>"}
                  </code>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-300">2. API Key</p>
                  <code className="block text-xs text-green-400 p-1 bg-slate-950 rounded">
                    X-Api-Key: tku_...
                  </code>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">מגבלות שימוש — Rate Limits</h3>
              <div className="p-3 bg-slate-900 rounded-lg space-y-2 text-sm text-slate-400">
                <p>200 בקשות לדקה לכל משתמש (רגיל)</p>
                <p>20 בקשות לדקה לנקודות קצה כבדות</p>
                <p className="text-slate-300 mt-2">נקודות קצה:</p>
                <code className="block text-xs text-blue-400 p-1 bg-slate-950 rounded">/api/docs — Swagger UI</code>
                <code className="block text-xs text-purple-400 p-1 bg-slate-950 rounded">/api/graphql — GraphQL Playground</code>
                <code className="block text-xs text-amber-400 p-1 bg-slate-950 rounded">/api/docs/spec.json — OpenAPI Spec</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
