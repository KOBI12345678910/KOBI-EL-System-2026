import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  Globe, Brain, ArrowLeft, Plus, Edit2, Trash2,
  CheckCircle2, XCircle, X, Cpu, Hash,
  ToggleRight, ToggleLeft, ExternalLink, Plug,
} from "lucide-react";

const API = "/api";

interface AIProvider {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  apiBaseUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function ProviderFormModal({ provider, onClose, onSaved }: {
  provider: AIProvider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: provider?.name || "",
    slug: provider?.slug || "",
    description: provider?.description || "",
    website: provider?.website || "",
    apiBaseUrl: provider?.apiBaseUrl || "",
    isActive: provider?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("שם הספק חובה"); return; }
    if (!form.slug.trim()) { setError("מזהה חובה"); return; }
    setSaving(true);
    try {
      const url = provider ? `${API}/ai-providers/${provider.id}` : `${API}/ai-providers`;
      const r = await authFetch(url, {
        method: provider ? "PUT" : "POST",
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-blue-600/5">
          <h3 className="font-bold text-foreground">{provider ? "עריכת ספק" : "הוספת ספק חדש"}</h3>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">שם הספק</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מזהה (Slug)</label>
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} dir="ltr" className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500 text-left" required />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">אתר (Website)</label>
            <input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} dir="ltr" className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500 text-left" placeholder="https://..." />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">כתובת API (Base URL)</label>
            <input value={form.apiBaseUrl} onChange={e => setForm({ ...form, apiBaseUrl: e.target.value })} dir="ltr" className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-blue-500 text-left font-mono" placeholder="https://api.example.com/v1" />
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
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-foreground rounded-xl hover:bg-blue-700 disabled:opacity-50">{saving ? "שומר..." : "שמור"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function ProvidersPage() {
  const [, setLocation] = useLocation();
  const [editingProvider, setEditingProvider] = useState<AIProvider | null | "new">(null);
  const queryClient = useQueryClient();

  const { data: providers = [], isLoading, isError } = useQuery<AIProvider[]>({
    queryKey: ["ai-providers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-providers`);
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-providers/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-providers"] }),
  });

  const activeCount = providers.filter(p => p.isActive).length;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(59, 130, 246, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.02) 1px, transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Plug className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">ספקי AI</h1>
                <p className="text-muted-foreground text-xs">ניהול אינטגרציות עם ספקי בינה מלאכותית — טכנו-כל עוזי</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {activeCount} פעילים</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">{providers.length} ספקים סה״כ</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditingProvider("new")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-foreground hover:bg-blue-700 transition-colors text-sm">
              <Plus className="w-4 h-4" /> ספק חדש
            </button>
            <button onClick={() => setLocation("/ai/models")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors text-sm">
              <Brain className="w-4 h-4" /> מודלי AI <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2"><XCircle className="w-4 h-4" /> שגיאה בטעינת ספקים</div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-1/2 rounded bg-muted/20" />
                    <div className="h-3 w-1/3 rounded bg-muted/15" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-muted/10" />
              </div>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl"><Plug className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h3 className="text-foreground font-bold mb-2">אין ספקים</h3><p className="text-muted-foreground text-sm">הוסף ספק AI ראשון</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((provider, i) => (
              <motion.div key={provider.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className="bg-card border border-border rounded-2xl overflow-hidden hover:border-blue-500/30 transition-colors">
                <div className="px-4 py-3 border-b border-border bg-blue-500/5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-sm">{provider.name}</h3>
                      <span className="text-[10px] text-muted-foreground font-mono">{provider.slug}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-lg ${provider.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {provider.isActive ? "פעיל" : "מושבת"}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-2">
                  {provider.description && <p className="text-xs text-muted-foreground">{typeof provider.description === 'string' && provider.description.startsWith('{') ? 'ספק AI' : provider.description}</p>}
                  {provider.apiBaseUrl && (
                    <div className="text-[10px] text-muted-foreground font-mono bg-background/50 rounded-lg px-2 py-1.5 border border-border break-all" dir="ltr">{provider.apiBaseUrl}</div>
                  )}
                  {provider.website && (
                    <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> {provider.website.replace("https://", "")}
                    </a>
                  )}
                </div>

                <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{new Date(provider.createdAt).toLocaleDateString("he-IL")}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingProvider(provider)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm("למחוק ספק זה?")) deleteMutation.mutate(provider.id); }} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingProvider && (
          <ProviderFormModal
            provider={editingProvider === "new" ? null : editingProvider}
            onClose={() => setEditingProvider(null)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["ai-providers"] })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
