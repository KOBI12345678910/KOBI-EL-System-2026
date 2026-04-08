import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  Brain, Cpu, Zap, Settings, CheckCircle2, XCircle,
  Globe, DollarSign, Hash, ArrowLeft, Search,
  ToggleLeft, ToggleRight, Sparkles, Plus,
  MessageSquare, Image, Code2, Layers,
  ChevronDown, ChevronUp, ExternalLink, Star,
  Activity, BarChart3, Edit2, Trash2, X,
} from "lucide-react";

const API = "/api";

interface AIModel {
  id: number;
  providerId: number;
  name: string;
  slug: string;
  description: string | null;
  modelType: string;
  maxTokens: number | null;
  costPerInputToken: string | null;
  costPerOutputToken: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  modelCode: string | null;
  modelName: string | null;
  providerName: string | null;
  costPer1kTokens: string | null;
  supportsHebrew: boolean | null;
  isDefault: boolean | null;
  notes: string | null;
  tags: string | null;
}

interface AIProvider {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  apiBaseUrl: string | null;
  isActive: boolean;
}

const PROVIDER_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
  2: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
  3: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  4: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  5: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
};

const MODEL_TYPE_ICONS: Record<string, typeof Brain> = {
  chat: MessageSquare,
  completion: Code2,
  embedding: Layers,
  image: Image,
};

function formatTokenCount(tokens: number | null): string {
  if (!tokens) return "—";
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
  return tokens.toLocaleString();
}

function formatCost(cost: string | null): string {
  if (!cost) return "—";
  const n = parseFloat(cost);
  if (n === 0) return "חינם";
  if (n < 0.00001) return `$${(n * 1000000).toFixed(2)}/1M`;
  if (n < 0.001) return `$${(n * 1000).toFixed(2)}/1K`;
  return `$${n.toFixed(4)}`;
}

function ModelFormModal({ model, providers, onClose, onSaved }: {
  model: AIModel | null;
  providers: AIProvider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    providerId: model?.providerId || providers[0]?.id || 1,
    name: model?.name || "",
    slug: model?.slug || "",
    description: model?.description || "",
    modelType: model?.modelType || "chat",
    maxTokens: model?.maxTokens || 4096,
    costPerInputToken: model?.costPerInputToken || "0.0001",
    costPerOutputToken: model?.costPerOutputToken || "0.0002",
    isActive: model?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) { setFormError("שם המודל חובה"); return; }
    if (!form.slug.trim()) { setFormError("מזהה (Slug) חובה"); return; }
    const maxTokens = Number(form.maxTokens);
    if (isNaN(maxTokens) || maxTokens < 0) { setFormError("ערך טוקנים לא תקין"); return; }
    setSaving(true);
    try {
      const url = model ? `${API}/ai-models/${model.id}` : `${API}/ai-models`;
      const method = model ? "PUT" : "POST";
      const payload = { ...form, maxTokens };
      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        throw new Error(errBody || `שגיאת שרת (${r.status})`);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || "שגיאה בשמירת המודל");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden"
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-purple-600/5">
          <h3 className="font-bold text-foreground">{model ? "עריכת מודל" : "הוספת מודל חדש"}</h3>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ספק</label>
              <select
                value={form.providerId}
                onChange={e => setForm({ ...form, providerId: Number(e.target.value) })}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500"
              >
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">סוג</label>
              <select
                value={form.modelType}
                onChange={e => setForm({ ...form, modelType: e.target.value })}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500"
              >
                <option value="chat">Chat</option>
                <option value="completion">Completion</option>
                <option value="embedding">Embedding</option>
                <option value="image">Image</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">שם המודל</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="לדוגמה: Moonshot V1 128K"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-purple-500"
              required
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">מזהה (Slug)</label>
            <input
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
              placeholder="moonshot-v1-128k"
              dir="ltr"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-purple-500 text-left"
              required
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">תיאור</label>
            <input
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="תיאור קצר של המודל"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max Tokens</label>
              <input
                type="number"
                value={form.maxTokens}
                onChange={e => setForm({ ...form, maxTokens: Number(e.target.value) })}
                dir="ltr"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 text-left"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">עלות קלט ($)</label>
              <input
                value={form.costPerInputToken}
                onChange={e => setForm({ ...form, costPerInputToken: e.target.value })}
                dir="ltr"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 text-left"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">עלות פלט ($)</label>
              <input
                value={form.costPerOutputToken}
                onChange={e => setForm({ ...form, costPerOutputToken: e.target.value })}
                dir="ltr"
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-purple-500 text-left"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className="transition-colors"
            >
              {form.isActive
                ? <ToggleRight className="w-6 h-6 text-green-400" />
                : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
            </button>
            <span className="text-sm text-muted-foreground">{form.isActive ? "פעיל" : "מושבת"}</span>
          </div>

          {formError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-purple-600 text-foreground rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function ModelsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [expandedModel, setExpandedModel] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [editingModel, setEditingModel] = useState<AIModel | null | "new">(null);
  const queryClient = useQueryClient();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: models = [], isLoading: modelsLoading, isError: modelsError } = useQuery<AIModel[]>({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-models`);
      if (!r.ok) throw new Error(`שגיאה בטעינת מודלים (${r.status})`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const { data: providers = [], isError: providersError } = useQuery<AIProvider[]>({
    queryKey: ["ai-providers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-providers`);
      if (!r.ok) throw new Error(`שגיאה בטעינת ספקים (${r.status})`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await authFetch(`${API}/ai-models/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      setErrorMsg(null);
    },
    onError: () => setErrorMsg("שגיאה בעדכון סטטוס המודל"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-models/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      setErrorMsg(null);
    },
    onError: () => setErrorMsg("שגיאה במחיקת המודל"),
  });

  const providerMap = new Map(providers.map(p => [p.id, p]));

  const filteredModels = models.filter(m => {
    const matchSearch = !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.slug.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || "").toLowerCase().includes(search.toLowerCase());
    const matchProvider = !selectedProvider || m.providerId === selectedProvider;
    return matchSearch && matchProvider;
  });

  const groupedByProvider = new Map<number, AIModel[]>();
  filteredModels.forEach(m => {
    const list = groupedByProvider.get(m.providerId) || [];
    list.push(m);
    groupedByProvider.set(m.providerId, list);
  });

  const activeCount = models.filter(m => m.isActive).length;
  const providerCount = new Set(models.map(m => m.providerId)).size;
  const hebrewCount = models.filter(m => m.supportsHebrew !== false).length;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(139, 92, 246, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.02) 1px, transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Brain className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">מודלי AI</h1>
                <p className="text-muted-foreground text-xs">ניהול מודלים, ספקים ויכולות AI — טכנו-כל עוזי</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 className="w-3 h-3" />
                {activeCount} פעילים
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">{models.length} מודלים סה״כ</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">{providerCount} ספקים</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingModel("new")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-foreground hover:bg-purple-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              הוסף מודל
            </button>
            <button
              onClick={() => setLocation("/ai-engine")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors text-sm"
            >
              <Brain className="w-4 h-4" />
              מנוע AI
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "מודלים פעילים", value: `${activeCount} / ${models.length}`, icon: Cpu, color: "text-green-400", bg: "bg-green-400/10" },
            { label: "ספקי AI", value: providerCount, icon: Globe, color: "text-blue-400", bg: "bg-blue-400/10" },
            { label: "תומכים בעברית", value: hebrewCount, icon: MessageSquare, color: "text-violet-400", bg: "bg-violet-400/10" },
            { label: "קיבולת טוקנים מקסימלית", value: formatTokenCount(Math.max(...models.map(m => m.maxTokens || 0), 0)), icon: Zap, color: "text-amber-400", bg: "bg-amber-400/10" },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div className="font-black text-xl text-foreground mb-0.5">{stat.value}</div>
                <div className="text-muted-foreground text-xs">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="חיפוש מודל..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-card border border-border rounded-xl pr-9 pl-4 py-2 text-sm text-foreground placeholder-gray-500 focus:outline-none focus:border-purple-500/50 w-64"
              />
            </div>

            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedProvider(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !selectedProvider ? "bg-purple-600/20 text-purple-400 border border-purple-500/40" : "bg-card text-muted-foreground border border-border hover:border-border"
                }`}
              >
                הכל
              </button>
              {providers.map(p => {
                const colors = PROVIDER_COLORS[p.id] || PROVIDER_COLORS[1];
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(selectedProvider === p.id ? null : p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedProvider === p.id
                        ? `${colors.bg} ${colors.text} border ${colors.border}`
                        : "bg-card text-muted-foreground border border-border hover:border-border"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-lg text-xs ${viewMode === "grid" ? "bg-purple-600/20 text-purple-400" : "text-muted-foreground hover:text-gray-300"}`}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-2 rounded-lg text-xs ${viewMode === "table" ? "bg-purple-600/20 text-purple-400" : "text-muted-foreground hover:text-gray-300"}`}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {(errorMsg || modelsError || providersError) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <XCircle className="w-4 h-4" />
              {errorMsg || (modelsError ? "שגיאה בטעינת מודלים — נסה לרענן את הדף" : "שגיאה בטעינת ספקים")}
            </div>
            {errorMsg && (
              <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-300 text-xs">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {modelsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-1/2 rounded bg-muted/20" />
                    <div className="h-3 w-1/3 rounded bg-muted/15" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-muted/15" />
                  <div className="h-5 w-20 rounded-full bg-muted/10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid View */}
        {!modelsLoading && viewMode === "grid" && (
          <div className="space-y-8">
            {Array.from(groupedByProvider.entries()).map(([providerId, providerModels]) => {
              const provider = providerMap.get(providerId);
              const colors = PROVIDER_COLORS[providerId] || PROVIDER_COLORS[1];
              return (
                <motion.div
                  key={providerId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
                      <Globe className={`w-4 h-4 ${colors.text}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-sm">{provider?.name || `Provider ${providerId}`}</h3>
                      <p className="text-muted-foreground text-xs">{providerModels.length} מודלים</p>
                    </div>
                    {provider?.website && (
                      <a
                        href={provider.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`mr-auto text-xs ${colors.text} hover:underline flex items-center gap-1`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {provider.website.replace("https://", "")}
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {providerModels.map(model => {
                      const TypeIcon = MODEL_TYPE_ICONS[model.modelType] || Brain;
                      const isExpanded = expandedModel === model.id;
                      return (
                        <motion.div
                          key={model.id}
                          whileHover={{ y: -2 }}
                          className={`bg-card border ${colors.border} rounded-2xl overflow-hidden group cursor-pointer`}
                          onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                        >
                          <div className={`flex items-center justify-between px-4 py-3 ${colors.bg} border-b ${colors.border}`}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center">
                                <TypeIcon className={`w-4 h-4 ${colors.text}`} />
                              </div>
                              <div>
                                <h4 className="font-bold text-foreground text-sm">{model.name}</h4>
                                <span className="text-[10px] text-muted-foreground font-mono">{model.slug}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {model.supportsHebrew !== false && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">עב</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleMutation.mutate({ id: model.id, isActive: !model.isActive });
                                }}
                                className="transition-colors"
                              >
                                {model.isActive
                                  ? <ToggleRight className="w-5 h-5 text-green-400" />
                                  : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                              </button>
                            </div>
                          </div>

                          <div className="px-4 py-3">
                            {model.description && (
                              <p className="text-muted-foreground text-xs mb-3 leading-relaxed">{model.description}</p>
                            )}

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Hash className="w-3 h-3" />
                                <span>טוקנים: <span className="text-foreground font-mono">{formatTokenCount(model.maxTokens)}</span></span>
                              </div>
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Sparkles className="w-3 h-3" />
                                <span>סוג: <span className="text-foreground">{model.modelType}</span></span>
                              </div>
                            </div>

                            {(model.costPerInputToken || model.costPerOutputToken) && (
                              <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <DollarSign className="w-3 h-3" />
                                  <span>קלט: <span className="text-emerald-400 font-mono">{formatCost(model.costPerInputToken)}</span></span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <DollarSign className="w-3 h-3" />
                                  <span>פלט: <span className="text-amber-400 font-mono">{formatCost(model.costPerOutputToken)}</span></span>
                                </div>
                              </div>
                            )}
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className={`px-4 py-3 border-t ${colors.border} bg-black/20 text-xs space-y-2`}>
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>ספק</span>
                                    <span className={`${colors.text}`}>{provider?.name}</span>
                                  </div>
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>סטטוס</span>
                                    <span className={model.isActive ? "text-green-400" : "text-red-400"}>
                                      {model.isActive ? "פעיל" : "מושבת"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>תמיכה בעברית</span>
                                    <span className="text-blue-400">{model.supportsHebrew !== false ? "כן ✓" : "לא"}</span>
                                  </div>
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>נוצר</span>
                                    <span className="text-gray-300">{new Date(model.createdAt).toLocaleDateString("he-IL")}</span>
                                  </div>
                                  <div className="flex gap-2 pt-2 border-t border-border">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingModel(model); }}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      ערוך
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm("למחוק מודל זה?")) deleteMutation.mutate(model.id);
                                      }}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      מחק
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className={`flex items-center justify-between px-4 py-2 border-t ${colors.border} bg-black/10`}>
                            <span className={`text-[10px] ${model.isActive ? "text-green-400" : "text-muted-foreground"} flex items-center gap-1`}>
                              {model.isActive
                                ? <><CheckCircle2 className="w-3 h-3" /> מוכן לשימוש</>
                                : <><XCircle className="w-3 h-3" /> מושבת</>}
                            </span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {!modelsLoading && viewMode === "table" && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-right px-4 py-3 font-medium">מודל</th>
                    <th className="text-right px-4 py-3 font-medium">ספק</th>
                    <th className="text-right px-4 py-3 font-medium">סוג</th>
                    <th className="text-right px-4 py-3 font-medium">טוקנים</th>
                    <th className="text-right px-4 py-3 font-medium">עלות קלט</th>
                    <th className="text-right px-4 py-3 font-medium">עלות פלט</th>
                    <th className="text-right px-4 py-3 font-medium">עברית</th>
                    <th className="text-right px-4 py-3 font-medium">סטטוס</th>
                    <th className="text-right px-4 py-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.map(model => {
                    const provider = providerMap.get(model.providerId);
                    const colors = PROVIDER_COLORS[model.providerId] || PROVIDER_COLORS[1];
                    return (
                      <tr key={model.id} className="border-b border-border/50 hover:bg-card/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Brain className={`w-4 h-4 ${colors.text}`} />
                            <div>
                              <div className="font-medium text-foreground">{model.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{model.slug}</div>
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-xs ${colors.text}`}>{provider?.name}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{model.modelType}</td>
                        <td className="px-4 py-3 text-xs text-foreground font-mono">{formatTokenCount(model.maxTokens)}</td>
                        <td className="px-4 py-3 text-xs text-emerald-400 font-mono">{formatCost(model.costPerInputToken)}</td>
                        <td className="px-4 py-3 text-xs text-amber-400 font-mono">{formatCost(model.costPerOutputToken)}</td>
                        <td className="px-4 py-3 text-xs">
                          {model.supportsHebrew !== false
                            ? <span className="text-blue-400">✓</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleMutation.mutate({ id: model.id, isActive: !model.isActive })}
                            className="transition-colors"
                          >
                            {model.isActive
                              ? <ToggleRight className="w-5 h-5 text-green-400" />
                              : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingModel(model)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { if (confirm("למחוק מודל זה?")) deleteMutation.mutate(model.id); }}
                              className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

        {/* Empty State */}
        {!modelsLoading && filteredModels.length === 0 && (
          <div className="text-center py-20 bg-card border border-border rounded-2xl">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-foreground font-bold mb-2">לא נמצאו מודלים</h3>
            <p className="text-muted-foreground text-sm">נסה לשנות את מסנני החיפוש</p>
          </div>
        )}

        {/* Quick Navigation */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            ניווט מהיר — AI
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "מנוע AI", path: "/ai-engine", icon: Brain, color: "text-violet-400" },
              { label: "צ'אט Claude", path: "/claude-chat", icon: MessageSquare, color: "text-blue-400" },
              { label: "דאשבורד הייטק", path: "/hi-tech-dashboard", icon: Cpu, color: "text-cyan-400" },
              { label: "ניתוח שיחות", path: "/ai-engine/call-nlp", icon: Activity, color: "text-green-400" },
              { label: "דירוג לידים", path: "/ai-engine/lead-scoring", icon: Star, color: "text-amber-400" },
              { label: "ניהול ספקים", path: "/procurement-dashboard", icon: Globe, color: "text-orange-400" },
              { label: "ניהול ייצור", path: "/production", icon: Settings, color: "text-emerald-400" },
              { label: "כספים", path: "/finance", icon: DollarSign, color: "text-pink-400" },
            ].map((nav, i) => {
              const NavIcon = nav.icon;
              return (
                <button
                  key={i}
                  onClick={() => setLocation(nav.path)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-border transition-colors text-sm text-gray-300 hover:text-foreground"
                >
                  <NavIcon className={`w-4 h-4 ${nav.color}`} />
                  {nav.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit/Create Modal */}
      <AnimatePresence>
        {editingModel && (
          <ModelFormModal
            model={editingModel === "new" ? null : editingModel}
            providers={providers}
            onClose={() => setEditingModel(null)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["ai-models"] })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
