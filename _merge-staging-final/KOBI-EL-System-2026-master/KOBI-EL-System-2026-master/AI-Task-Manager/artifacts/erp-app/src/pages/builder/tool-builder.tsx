import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Settings, Wrench, Play, ChevronLeft,
  Search, CheckCircle, XCircle, Clock, List, Power,
  RefreshCw, X, Download, Upload, Calculator, Shuffle, Box,
  Eye, ArrowRight
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface Tool {
  id: number;
  moduleId: number | null;
  name: string;
  slug: string;
  description: string | null;
  toolType: string;
  entityId: number | null;
  inputConfig: any;
  outputConfig: any;
  executionConfig: any;
  isActive: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ToolExecutionLog {
  id: number;
  toolId: number;
  status: string;
  inputData: any;
  outputData: any;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface PlatformModule {
  id: number;
  name: string;
  slug: string;
}

const TOOL_TYPES = [
  { type: "import", label: "ייבוא נתונים", icon: Download, color: "green" },
  { type: "export", label: "ייצוא נתונים", icon: Upload, color: "blue" },
  { type: "transform", label: "טרנספורמציה", icon: Shuffle, color: "purple" },
  { type: "calculate", label: "חישוב", icon: Calculator, color: "orange" },
  { type: "custom", label: "מותאם אישית", icon: Box, color: "cyan" },
];

const TOOL_TYPE_MAP: Record<string, typeof TOOL_TYPES[0]> = {};
TOOL_TYPES.forEach(t => { TOOL_TYPE_MAP[t.type] = t; });

export default function ToolBuilder() {
  const queryClient = useQueryClient();
  const [filterModule, setFilterModule] = useState<string>("");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showCreate, setShowCreate] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [viewingLogs, setViewingLogs] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const { modules } = usePlatformModules();

  const { data: tools = [], isLoading } = useQuery<Tool[]>({
    queryKey: ["platform-tools", filterModule],
    queryFn: async () => {
      const qs = filterModule ? `?moduleId=${filterModule}` : "";
      const r = await authFetch(`${API}/platform/tools${qs}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/tools`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create tool");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-tools"] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/tools/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update tool");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-tools"] });
      setEditingTool(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/tools/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete tool");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-tools"] }),
  });

  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/tools/${id}/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error("Failed to execute tool");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-tools"] }),
  });

  if (viewingLogs !== null) {
    return (
      <ToolExecutionLogView
        toolId={viewingLogs}
        toolName={tools.find(t => t.id === viewingLogs)?.name || ""}
        onBack={() => setViewingLogs(null)}
      />
    );
  }

  if (editingTool) {
    return (
      <ToolEditor
        tool={editingTool}
        modules={modules}
        onBack={() => setEditingTool(null)}
        onSave={(data) => updateMutation.mutate({ id: editingTool.id, ...data })}
        isSaving={updateMutation.isPending}
      />
    );
  }

  const filtered = tools.filter(t => !search || t.name.includes(search) || (t.description || "").includes(search));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">בונה כלים</h1>
          <p className="text-muted-foreground mt-1">צור כלי עזר מותאמים — ייבוא, ייצוא, חישובים, טרנספורמציות ועוד</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-5 h-5" />
          כלי חדש
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{tools.length}</p>
              <p className="text-xs text-muted-foreground">סה״כ כלים</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{tools.filter(t => t.isActive).length}</p>
              <p className="text-xs text-muted-foreground">פעילים</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg sm:text-2xl font-bold">{tools.reduce((sum, t) => sum + t.runCount, 0)}</p>
              <p className="text-xs text-muted-foreground">הרצות</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש כלים..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)}
          className="px-3 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">כל המודולים</option>
          {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Wrench className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">אין כלים</h3>
          <p className="text-muted-foreground mb-6">צור כלי ראשון — למשל: ״ייבוא לקוחות מ-CSV״ או ״חישוב מרווח רווחיות״</p>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
            <Plus className="w-5 h-5" />
            צור כלי ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tool, i) => {
            const typeDef = TOOL_TYPE_MAP[tool.toolType] || TOOL_TYPE_MAP.custom;
            const TypeIcon = typeDef.icon;
            const moduleName = modules.find(m => m.id === tool.moduleId)?.name;
            return (
              <motion.div key={tool.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${typeDef.color}-500/10`}>
                      <TypeIcon className={`w-5 h-5 text-${typeDef.color}-400`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{tool.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{typeDef.label}</span>
                        {moduleName && <><span>•</span><span>{moduleName}</span></>}
                        <span>•</span>
                        <span>{tool.runCount} הרצות</span>
                      </div>
                      {tool.description && <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`px-2 py-1 bg-${typeDef.color}-500/10 text-${typeDef.color}-400 rounded-lg text-xs font-medium`}>
                    {typeDef.label}
                  </span>
                  {Object.keys(tool.inputConfig as any || {}).length > 0 && (
                    <span className="px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-medium">
                      קלט מוגדר
                    </span>
                  )}
                  {Object.keys(tool.outputConfig as any || {}).length > 0 && (
                    <span className="px-2 py-1 bg-teal-500/10 text-teal-400 rounded-lg text-xs font-medium">
                      פלט מוגדר
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                  <button onClick={() => updateMutation.mutate({ id: tool.id, isActive: !tool.isActive })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tool.isActive ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {tool.isActive ? <Play className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    {tool.isActive ? "פעיל" : "מושהה"}
                  </button>
                  <button onClick={() => executeMutation.mutate(tool.id)} disabled={executeMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                    <Play className="w-3.5 h-3.5" />
                    הרץ עכשיו
                  </button>
                  <button onClick={() => setViewingLogs(tool.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:text-foreground transition-colors">
                    <List className="w-3.5 h-3.5" />
                    לוג
                  </button>
                  <div className="mr-auto flex items-center gap-1">
                    <button onClick={() => setEditingTool(tool)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק כלי?"); if (ok) deleteMutation.mutate(tool.id); }}
                      className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateToolModal
            modules={modules}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CreateToolModal({ modules, onClose, onSubmit, isLoading }: {
  modules: PlatformModule[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: "", slug: "", description: "",
    toolType: "custom", moduleId: "",
    inputConfig: {} as Record<string, any>,
    outputConfig: {} as Record<string, any>,
  });
  const [inputFields, setInputFields] = useState<{ name: string; type: string; required: boolean }[]>([]);
  const [outputFields, setOutputFields] = useState<{ name: string; type: string }[]>([]);

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const addInputField = () => setInputFields(f => [...f, { name: "", type: "text", required: false }]);
  const addOutputField = () => setOutputFields(f => [...f, { name: "", type: "text" }]);

  const handleSubmit = () => {
    const inputConfig: any = {};
    inputFields.filter(f => f.name).forEach(f => { inputConfig[f.name] = { type: f.type, required: f.required }; });
    const outputConfig: any = {};
    outputFields.filter(f => f.name).forEach(f => { outputConfig[f.name] = { type: f.type }; });

    onSubmit({
      ...form,
      moduleId: form.moduleId ? Number(form.moduleId) : null,
      inputConfig,
      outputConfig,
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">כלי חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: autoSlug(e.target.value) }))}
              placeholder="למשל: ייבוא לקוחות מ-CSV" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="מה הכלי עושה?" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">סוג כלי</label>
            <div className="grid grid-cols-2 gap-2">
              {TOOL_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.type} type="button" onClick={() => setForm(f => ({ ...f, toolType: t.type }))}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-all ${form.toolType === t.type ? `border-${t.color}-500 bg-${t.color}-500/10` : "border-border hover:border-primary/30"}`}>
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">מודול מקושר</label>
            <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">ללא</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-yellow-400">קלט (Input)</h3>
              <button onClick={addInputField} className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> שדה
              </button>
            </div>
            {inputFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין שדות קלט. הוסף שדות כדי להגדיר מה הכלי מקבל.</p>
            ) : (
              <div className="space-y-2">
                {inputFields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={field.name} onChange={e => setInputFields(f => f.map((ff, fi) => fi === i ? { ...ff, name: e.target.value } : ff))}
                      placeholder="שם שדה" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
                    <select value={field.type} onChange={e => setInputFields(f => f.map((ff, fi) => fi === i ? { ...ff, type: e.target.value } : ff))}
                      className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs">
                      <option value="text">טקסט</option>
                      <option value="number">מספר</option>
                      <option value="date">תאריך</option>
                      <option value="file">קובץ</option>
                      <option value="json">JSON</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={field.required} onChange={e => setInputFields(f => f.map((ff, fi) => fi === i ? { ...ff, required: e.target.checked } : ff))} />
                      חובה
                    </label>
                    <button onClick={() => setInputFields(f => f.filter((_, fi) => fi !== i))} className="p-1 hover:bg-destructive/10 rounded">
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-teal-500/5 border border-teal-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-teal-400">פלט (Output)</h3>
              <button onClick={addOutputField} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> שדה
              </button>
            </div>
            {outputFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין שדות פלט. הוסף שדות כדי להגדיר מה הכלי מחזיר.</p>
            ) : (
              <div className="space-y-2">
                {outputFields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={field.name} onChange={e => setOutputFields(f => f.map((ff, fi) => fi === i ? { ...ff, name: e.target.value } : ff))}
                      placeholder="שם שדה" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
                    <select value={field.type} onChange={e => setOutputFields(f => f.map((ff, fi) => fi === i ? { ...ff, type: e.target.value } : ff))}
                      className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs">
                      <option value="text">טקסט</option>
                      <option value="number">מספר</option>
                      <option value="json">JSON</option>
                      <option value="file">קובץ</option>
                      <option value="table">טבלה</option>
                    </select>
                    <button onClick={() => setOutputFields(f => f.filter((_, fi) => fi !== i))} className="p-1 hover:bg-destructive/10 rounded">
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={handleSubmit} disabled={!form.name || !form.slug || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור כלי"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ToolEditor({ tool, modules, onBack, onSave, isSaving }: {
  tool: Tool;
  modules: PlatformModule[];
  onBack: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    name: tool.name,
    description: tool.description || "",
    toolType: tool.toolType,
    moduleId: tool.moduleId?.toString() || "",
    isActive: tool.isActive,
  });
  const [inputConfig, setInputConfig] = useState<Record<string, any>>(
    (tool.inputConfig && typeof tool.inputConfig === "object") ? tool.inputConfig as Record<string, any> : {}
  );
  const [outputConfig, setOutputConfig] = useState<Record<string, any>>(
    (tool.outputConfig && typeof tool.outputConfig === "object") ? tool.outputConfig as Record<string, any> : {}
  );
  const [newInputName, setNewInputName] = useState("");
  const [newOutputName, setNewOutputName] = useState("");

  const handleSave = () => {
    onSave({
      ...form,
      moduleId: form.moduleId ? Number(form.moduleId) : null,
      inputConfig,
      outputConfig,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">עריכת כלי — {tool.name}</h1>
          <p className="text-sm text-muted-foreground">{tool.slug}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h3 className="font-semibold">הגדרות בסיסיות</h3>
            <div>
              <label className="block text-sm font-medium mb-1.5">שם</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">תיאור</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">סוג כלי</label>
              <div className="grid grid-cols-2 gap-2">
                {TOOL_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.type} type="button" onClick={() => setForm(f => ({ ...f, toolType: t.type }))}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs transition-all ${form.toolType === t.type ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">מודול מקושר</label>
              <select value={form.moduleId} onChange={e => setForm(f => ({ ...f, moduleId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm">
                <option value="">ללא</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">פעיל</label>
              <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                className={`w-10 h-6 rounded-full transition-colors relative ${form.isActive ? "bg-green-500" : "bg-muted"}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-card transition-all ${form.isActive ? "right-1" : "left-1"}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-yellow-400">קלט (Input Config)</h3>
            </div>
            {Object.entries(inputConfig).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                <span className="text-sm flex-1 font-mono">{key}</span>
                <span className="text-xs text-muted-foreground">{(val as any)?.type || "text"}</span>
                {(val as any)?.required && <span className="text-xs text-yellow-400">חובה</span>}
                <button onClick={() => { const c = { ...inputConfig }; delete c[key]; setInputConfig(c); }}
                  className="p-1 hover:bg-destructive/10 rounded">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={newInputName} onChange={e => setNewInputName(e.target.value)} placeholder="שם שדה חדש"
                className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
              <button onClick={() => { if (newInputName) { setInputConfig(c => ({ ...c, [newInputName]: { type: "text", required: false } })); setNewInputName(""); } }}
                disabled={!newInputName} className="px-3 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-medium disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-teal-400">פלט (Output Config)</h3>
            </div>
            {Object.entries(outputConfig).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                <span className="text-sm flex-1 font-mono">{key}</span>
                <span className="text-xs text-muted-foreground">{(val as any)?.type || "text"}</span>
                <button onClick={() => { const c = { ...outputConfig }; delete c[key]; setOutputConfig(c); }}
                  className="p-1 hover:bg-destructive/10 rounded">
                  <X className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={newOutputName} onChange={e => setNewOutputName(e.target.value)} placeholder="שם שדה חדש"
                className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-xs" />
              <button onClick={() => { if (newOutputName) { setOutputConfig(c => ({ ...c, [newOutputName]: { type: "text" } })); setNewOutputName(""); } }}
                disabled={!newOutputName} className="px-3 py-1.5 bg-teal-500/10 text-teal-400 rounded-lg text-xs font-medium disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button onClick={handleSave} disabled={!form.name || isSaving}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
          {isSaving ? "שומר..." : "שמור שינויים"}
        </button>
        <button onClick={onBack} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80">ביטול</button>
      </div>
    </div>
  );
}

function ToolExecutionLogView({ toolId, toolName, onBack }: {
  toolId: number;
  toolName: string;
  onBack: () => void;
}) {
  const { data, isLoading } = useQuery<{ logs: ToolExecutionLog[]; total: number }>({
    queryKey: ["tool-logs", toolId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/tools/${toolId}/logs`);
      if (!r.ok) return { logs: [], total: 0 };
      return r.json();
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const logs = data?.logs || [];
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Clock className="w-4 h-4 text-yellow-400 animate-spin" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return "הושלם";
      case "failed": return "נכשל";
      default: return "רץ...";
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">לוגי הרצות — {toolName}</h1>
          <p className="text-sm text-muted-foreground">{data?.total || 0} הרצות סה״כ</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <List className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">אין הרצות</h3>
          <p className="text-muted-foreground">הפעל את הכלי כדי לראות לוגים כאן</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log, i) => (
            <motion.div key={log.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                <div className="flex items-center gap-3">
                  {statusIcon(log.status)}
                  <div>
                    <span className="font-medium text-sm">{statusLabel(log.status)}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(log.startedAt).toLocaleString("he-IL")}</span>
                      {log.completedAt && (
                        <>
                          <span>•</span>
                          <span>{((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000).toFixed(1)}s</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Eye className={`w-4 h-4 text-muted-foreground transition-transform ${expandedLog === log.id ? "rotate-180" : ""}`} />
              </div>

              <AnimatePresence>
                {expandedLog === log.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden">
                    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                      {log.errorMessage && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                          <p className="text-sm text-red-400 font-medium">שגיאה</p>
                          <p className="text-xs text-red-300 mt-1">{log.errorMessage}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">קלט:</p>
                        <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-x-auto direction-ltr text-left" dir="ltr">
                          {JSON.stringify(log.inputData, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">פלט:</p>
                        <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-x-auto direction-ltr text-left" dir="ltr">
                          {JSON.stringify(log.outputData, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      <ActivityLog entityType="tools" />
      <RelatedRecords entityType="tools" />
    </div>
    </div>
  );
}
