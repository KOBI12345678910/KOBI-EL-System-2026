import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  Code2, Brain, ArrowLeft, Plus, Edit2, Trash2,
  Search, CheckCircle2, XCircle, X, Cpu, Hash,
  ToggleRight, ToggleLeft, FileText, Zap, Eye,
  ChevronDown, ChevronUp,
} from "lucide-react";

const API = "/api";

interface PromptTemplate {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  promptTemplate: string;
  systemPrompt: string | null;
  defaultModelId: number | null;
  variables: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  language: string | null;
  temperature: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  "data-extraction": { label: "חילוץ נתונים", color: "text-blue-400" },
  "code": { label: "קוד וייצור", color: "text-emerald-400" },
  "summarization": { label: "סיכום", color: "text-violet-400" },
  "translation": { label: "תרגום", color: "text-amber-400" },
  "general": { label: "כללי", color: "text-muted-foreground" },
};

function TemplateFormModal({ template, onClose, onSaved }: {
  template: PromptTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: template?.name || "",
    slug: template?.slug || "",
    category: template?.category || "general",
    description: template?.description || "",
    systemPrompt: template?.systemPrompt || "",
    promptTemplate: template?.promptTemplate || "",
    variables: template?.variables || "",
    isActive: template?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("שם חובה"); return; }
    if (!form.slug.trim()) { setError("מזהה חובה"); return; }
    if (!form.promptTemplate.trim()) { setError("תבנית פרומפט חובה"); return; }
    setSaving(true);
    try {
      const url = template ? `${API}/ai-prompt-templates/${template.id}` : `${API}/ai-prompt-templates`;
      const r = await authFetch(url, {
        method: template ? "PUT" : "POST",
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
        className="w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-purple-600/5">
          <h3 className="font-bold text-foreground">{template ? "עריכת תבנית" : "יצירת תבנית חדשה"}</h3>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">שם התבנית</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מזהה (Slug)</label>
              <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} dir="ltr" className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 text-left" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">קטגוריה</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500">
                <option value="general">כללי</option>
                <option value="data-extraction">חילוץ נתונים</option>
                <option value="translation">תרגום</option>
                <option value="summarization">סיכום</option>
                <option value="code">קוד וייצור</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">System Prompt</label>
            <textarea value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} dir="ltr" rows={3} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 font-mono resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">User Prompt Template</label>
            <textarea value={form.promptTemplate} onChange={e => setForm({ ...form, promptTemplate: e.target.value })} dir="ltr" rows={4} className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 font-mono resize-none" required />
            <p className="text-[10px] text-muted-foreground mt-1">{"השתמש ב- {{varName}} כדי להגדיר משתנים"}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">משתנים (מופרדים בפסיק)</label>
            <input value={form.variables} onChange={e => setForm({ ...form, variables: e.target.value })} dir="ltr" className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 text-left font-mono" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setForm({ ...form, isActive: !form.isActive })}>
              {form.isActive ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
            </button>
            <span className="text-sm text-muted-foreground">{form.isActive ? "פעילה" : "מושבתת"}</span>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">{error}</div>}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl">ביטול</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-purple-600 text-foreground rounded-xl hover:bg-purple-700 disabled:opacity-50">{saving ? "שומר..." : "שמור"}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function PromptTemplatesPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null | "new">(null);
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, isError } = useQuery<PromptTemplate[]>({
    queryKey: ["ai-prompt-templates"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-prompt-templates`);
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-prompt-templates/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-prompt-templates"] }),
  });

  const filtered = templates.filter(t => !search || t.name.includes(search) || t.slug.includes(search) || (t.description || "").includes(search));
  const activeCount = templates.filter(t => t.isActive).length;
  const categoryCount = new Set(templates.map(t => t.category)).size;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(139, 92, 246, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.02) 1px, transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Code2 className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">תבניות פרומפט</h1>
                <p className="text-muted-foreground text-xs">ספריית תבניות מוכנות לשימוש עם מנועי AI — טכנו-כל עוזי</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditingTemplate("new")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-foreground hover:bg-purple-700 transition-colors text-sm">
              <Plus className="w-4 h-4" /> תבנית חדשה
            </button>
            <button onClick={() => setLocation("/hi-tech-dashboard")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors text-sm">
              <Brain className="w-4 h-4" /> דאשבורד AI <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "סה״כ תבניות", value: templates.length, icon: Hash, color: "text-indigo-400", bg: "bg-indigo-400/10" },
            { label: "פעילות", value: activeCount, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10" },
            { label: "קטגוריות", value: categoryCount, icon: FileText, color: "text-amber-400", bg: "bg-amber-400/10" },
            { label: "עם System Prompt", value: templates.filter(t => t.systemPrompt).length, icon: Zap, color: "text-violet-400", bg: "bg-violet-400/10" },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="bg-card border border-border rounded-2xl p-4">
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}><Icon className={`w-4 h-4 ${stat.color}`} /></div>
                <div className="font-black text-xl text-foreground mb-0.5">{stat.value}</div>
                <div className="text-muted-foreground text-xs">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="חיפוש תבנית..." value={search} onChange={e => setSearch(e.target.value)} className="bg-card border border-border rounded-xl pr-9 pl-4 py-2 text-sm text-foreground placeholder-gray-500 focus:outline-none focus:border-purple-500/50 w-64" />
        </div>

        {isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2"><XCircle className="w-4 h-4" /> שגיאה בטעינת תבניות</div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-2/3 rounded bg-muted/20" />
                    <div className="h-3 w-1/3 rounded bg-muted/15" />
                  </div>
                </div>
                <div className="h-3 w-full rounded bg-muted/10" />
                <div className="h-3 w-3/4 rounded bg-muted/10" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl"><Code2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h3 className="text-foreground font-bold mb-2">אין תבניות</h3><p className="text-muted-foreground text-sm">צור תבנית פרומפט ראשונה</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((tpl, i) => {
              const cat = CATEGORY_LABELS[tpl.category] || CATEGORY_LABELS.general;
              const isExpanded = expandedId === tpl.id;
              return (
                <motion.div key={tpl.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : tpl.id)}>
                  <div className="flex items-start justify-between px-4 py-3 border-b border-border">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground text-sm">{tpl.name}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${cat.color} bg-card/5`}>{cat.label}</span>
                        {!tpl.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded text-red-400 bg-red-500/10">מושבתת</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.stopPropagation(); setEditingTemplate(tpl); }} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); if (confirm("למחוק תבנית זו?")) deleteMutation.mutate(tpl.id); }} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 py-3 space-y-3 bg-black/20">
                          {tpl.systemPrompt && (
                            <div>
                              <span className="text-[10px] text-muted-foreground font-mono block mb-1">SYSTEM PROMPT</span>
                              <p className="text-xs text-gray-300 bg-background/50 rounded-lg px-3 py-2 border border-border font-mono whitespace-pre-wrap">{tpl.systemPrompt}</p>
                            </div>
                          )}
                          <div>
                            <span className="text-[10px] text-muted-foreground font-mono block mb-1">USER TEMPLATE</span>
                            <p className="text-xs text-gray-300 bg-background/50 rounded-lg px-3 py-2 border border-border font-mono whitespace-pre-wrap">{tpl.promptTemplate}</p>
                          </div>
                          {tpl.variables && (
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[10px] text-muted-foreground">משתנים:</span>
                              {tpl.variables.split(",").map((v, j) => (
                                <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono">{`{{${v.trim()}}}`}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            {tpl.language && <span>שפה: {tpl.language}</span>}
                            {tpl.temperature && <span>Temperature: {tpl.temperature}</span>}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-mono">{tpl.slug}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editingTemplate && (
          <TemplateFormModal
            template={editingTemplate === "new" ? null : editingTemplate}
            onClose={() => setEditingTemplate(null)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["ai-prompt-templates"] })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
