import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  Key, Brain, ArrowLeft, Plus, Edit2, Trash2,
  CheckCircle2, XCircle, X, Cpu, Hash,
  ToggleRight, ToggleLeft, Eye, EyeOff, Shield,
} from "lucide-react";

const API = "/api";

interface AIApiKey {
  id: number;
  providerId: number;
  keyName: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AIProvider {
  id: number;
  name: string;
  slug: string;
}

function ApiKeyFormModal({ apiKey, providers, onClose, onSaved }: {
  apiKey: AIApiKey | null;
  providers: AIProvider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    providerId: apiKey?.providerId || providers[0]?.id || 1,
    keyName: apiKey?.keyName || "",
    apiKey: apiKey?.apiKey || "",
    isActive: apiKey?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.keyName.trim()) { setError("שם המפתח חובה"); return; }
    if (!form.apiKey.trim()) { setError("מפתח API חובה"); return; }
    setSaving(true);
    try {
      const url = apiKey ? `${API}/ai-api-keys/${apiKey.id}` : `${API}/ai-api-keys`;
      const r = await authFetch(url, {
        method: apiKey ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(`שגיאת שרת (${r.status})`);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-amber-600/5">
          <h3 className="font-bold text-foreground">{apiKey ? "עריכת מפתח" : "הוספת מפתח API חדש"}</h3>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ספק</label>
            <select value={form.providerId} onChange={e => setForm({ ...form, providerId: Number(e.target.value) })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500">
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">שם מזהה</label>
            <input value={form.keyName} onChange={e => setForm({ ...form, keyName: e.target.value })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500" placeholder="Production Key 1" required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">מפתח API</label>
            <input value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} type="password" dir="ltr" className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500 text-left font-mono" placeholder="sk-..." required />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })}>
              {form.isActive ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
            </button>
            <span className="text-sm text-muted-foreground">{form.isActive ? "פעיל" : "מושבת"}</span>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">{error}</div>}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl">ביטול</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-amber-600 text-foreground rounded-xl hover:bg-amber-700 disabled:opacity-50">{saving ? "שומר..." : "שמור"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function ApiKeysPage() {
  const [, setLocation] = useLocation();
  const [editingKey, setEditingKey] = useState<AIApiKey | null | "new">(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: apiKeys = [], isLoading, isError } = useQuery<AIApiKey[]>({
    queryKey: ["ai-api-keys"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-api-keys`);
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const { data: providers = [] } = useQuery<AIProvider[]>({
    queryKey: ["ai-providers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-providers`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-api-keys/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-api-keys"] }),
  });

  const providerMap = new Map(providers.map(p => [p.id, p]));

  const toggleReveal = (id: number) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(245, 158, 11, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(245, 158, 11, 0.02) 1px, transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Key className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">מפתחות API</h1>
                <p className="text-muted-foreground text-xs">ניהול ואבטחת מפתחות הגישה לספקי AI — טכנו-כל עוזי</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-amber-400 flex items-center gap-1"><Shield className="w-3 h-3" /> {apiKeys.length} מפתחות</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">{apiKeys.filter(k => k.isActive).length} פעילים</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditingKey("new")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-foreground hover:bg-amber-700 transition-colors text-sm">
              <Plus className="w-4 h-4" /> מפתח חדש
            </button>
            <button onClick={() => setLocation("/ai/providers")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors text-sm">
              <Brain className="w-4 h-4" /> ספקי AI <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2"><XCircle className="w-4 h-4" /> שגיאה בטעינת מפתחות</div>
        )}

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted/20" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-1/3 rounded bg-muted/20" />
                  <div className="h-3 w-1/2 rounded bg-muted/15" />
                </div>
                <div className="h-6 w-16 rounded-full bg-muted/10" />
              </div>
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl"><Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h3 className="text-foreground font-bold mb-2">אין מפתחות API</h3><p className="text-muted-foreground text-sm">הוסף מפתח API ראשון לחיבור לספקי AI</p></div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-right px-4 py-3 font-medium">שם מזהה</th>
                    <th className="text-right px-4 py-3 font-medium">ספק</th>
                    <th className="text-right px-4 py-3 font-medium">מפתח</th>
                    <th className="text-right px-4 py-3 font-medium">סטטוס</th>
                    <th className="text-right px-4 py-3 font-medium">נוצר</th>
                    <th className="text-right px-4 py-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map(key => {
                    const provider = providerMap.get(key.providerId);
                    const isRevealed = revealedKeys.has(key.id);
                    return (
                      <tr key={key.id} className="border-b border-border/50 hover:bg-card/[0.02] transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{key.keyName}</td>
                        <td className="px-4 py-3 text-xs text-blue-400">{provider?.name || "לא ידוע"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs bg-background px-2.5 py-1 rounded-lg border border-border text-muted-foreground">
                              {isRevealed ? key.apiKey : "••••••••••••••••••••"}
                            </span>
                            <button onClick={() => toggleReveal(key.id)} className="p-1 text-muted-foreground hover:text-foreground">
                              {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {key.isActive
                            ? <span className="text-[10px] px-2 py-1 rounded-lg bg-green-500/10 text-green-400">פעיל</span>
                            : <span className="text-[10px] px-2 py-1 rounded-lg bg-muted text-muted-foreground">מושבת</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(key.createdAt).toLocaleDateString("he-IL")}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingKey(key)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => { if (confirm("מחיקת מפתח זה עלולה לעצור שירותים. למחוק?")) deleteMutation.mutate(key.id); }} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingKey && (
          <ApiKeyFormModal
            apiKey={editingKey === "new" ? null : editingKey}
            providers={providers}
            onClose={() => setEditingKey(null)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["ai-api-keys"] })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
