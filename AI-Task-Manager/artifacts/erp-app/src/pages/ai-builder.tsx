import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { Plus, Edit2, Trash2, Brain, Sparkles, Wand2, Search, FileText, Tag, Play, History, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface AiConfig {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  entityId: number | null;
  featureType: string;
  providerId: number | null;
  modelId: number | null;
  promptTemplateId: number | null;
  inputConfig: any;
  outputConfig: any;
  systemPrompt: string | null;
  userPromptTemplate: string | null;
  triggerType: string;
  triggerConfig: any;
  isActive: boolean;
  createdAt: string;
}

interface ExecutionLog {
  id: number;
  configId: number;
  inputData: any;
  outputData: any;
  promptUsed: string | null;
  status: string;
  tokensUsed: number | null;
  executionTimeMs: number | null;
  createdAt: string;
}

const FEATURE_TYPES = [
  { value: "field_autofill", label: "מילוי אוטומטי", icon: Wand2, description: "השלמת שדות חכמה" },
  { value: "classification", label: "סיווג אוטומטי", icon: Tag, description: "קטלוג וסיווג רשומות" },
  { value: "search", label: "חיפוש טבעי", icon: Search, description: "חיפוש בשפה טבעית" },
  { value: "content_generation", label: "יצירת תוכן", icon: FileText, description: "הפקת טקסטים אוטומטית" },
  { value: "analysis", label: "ניתוח נתונים", icon: Sparkles, description: "ניתוח ותובנות חכמות" },
];

const TRIGGER_TYPES = [
  { value: "manual", label: "ידני" },
  { value: "on_create", label: "ביצירת רשומה" },
  { value: "on_update", label: "בעדכון רשומה" },
  { value: "scheduled", label: "מתוזמן" },
  { value: "workflow", label: "מתוך Workflow" },
];

export default function AiBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [executeConfigId, setExecuteConfigId] = useState<number | null>(null);
  const [executeInput, setExecuteInput] = useState<Record<string, string>>({});
  const [executeResult, setExecuteResult] = useState<any>(null);
  const [showLogsForId, setShowLogsForId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    featureType: "field_autofill",
    systemPrompt: "",
    userPromptTemplate: "",
    triggerType: "manual",
    isActive: true,
  });

  const { data: configs = [], isLoading } = useQuery<AiConfig[]>({
    queryKey: ["ai-builder"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/ai-builder`);
      if (!r.ok) throw new Error("Failed to fetch AI configs");
      return r.json();
    },
  });

  const { data: providers = [] } = useQuery<any[]>({
    queryKey: ["/api/ai-providers"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/ai-providers`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: logs = [] } = useQuery<ExecutionLog[]>({
    queryKey: ["ai-builder-logs", showLogsForId],
    queryFn: async () => {
      if (!showLogsForId) return [];
      const r = await authFetch(`${API_BASE}/platform/ai-builder/${showLogsForId}/logs`);
      if (!r.ok) throw new Error("Failed to fetch logs");
      return r.json();
    },
    enabled: !!showLogsForId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API_BASE}/platform/ai-builder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create AI config");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-builder"] });
      setIsModalOpen(false);
      toast({ title: "נוצר בהצלחה", description: "תצורת AI חדשה נוצרה." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await authFetch(`${API_BASE}/platform/ai-builder/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update AI config");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-builder"] });
      setIsModalOpen(false);
      toast({ title: "עודכן בהצלחה", description: "התצורה עודכנה." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/platform/ai-builder/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete AI config");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-builder"] });
      toast({ title: "נמחק", description: "התצורה הוסרה." });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async ({ id, inputData }: { id: number; inputData: Record<string, string> }) => {
      const r = await authFetch(`${API_BASE}/platform/ai-builder/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputData }),
      });
      if (!r.ok) throw new Error("Failed to execute AI action");
      return r.json();
    },
    onSuccess: (result) => {
      setExecuteResult(result);
      toast({ title: "בוצע בהצלחה", description: "פעולת ה-AI הושלמה." });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", slug: "", description: "", featureType: "field_autofill", systemPrompt: "", userPromptTemplate: "", triggerType: "manual", isActive: true });
    setIsModalOpen(true);
  };

  const openEdit = (config: AiConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      slug: config.slug,
      description: config.description || "",
      featureType: config.featureType,
      systemPrompt: config.systemPrompt || "",
      userPromptTemplate: config.userPromptTemplate || "",
      triggerType: config.triggerType,
      isActive: config.isActive,
    });
    setIsModalOpen(true);
  };

  const openExecute = (config: AiConfig) => {
    setExecuteConfigId(config.id);
    setExecuteResult(null);
    const variables: Record<string, string> = {};
    const matches = (config.userPromptTemplate || "").match(/\{\{(\w+)\}\}/g) || [];
    matches.forEach(m => {
      const key = m.replace(/\{\{|\}\}/g, "");
      variables[key] = "";
    });
    if (Object.keys(variables).length === 0) {
      variables["input"] = "";
    }
    setExecuteInput(variables);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      description: formData.description || undefined,
      systemPrompt: formData.systemPrompt || undefined,
      userPromptTemplate: formData.userPromptTemplate || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">בונה AI</h1>
          <p className="text-muted-foreground mt-1">הוספת יכולות בינה מלאכותית למודולים — מילוי חכם, סיווג, חיפוש ויצירת תוכן</p>
        </div>
        <div className="flex gap-2">
          {providers.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-emerald-500/10 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> {providers.length} ספקי AI מחוברים
            </span>
          )}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-5 h-5" /> צור תצורת AI
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">טוען תצורות AI...</div>
      ) : configs.length === 0 ? (
        <Card className="p-12 text-center">
          <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">אין תצורות AI</h3>
          <p className="text-sm text-muted-foreground mb-4">הוסף יכולת AI ראשונה למערכת</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> צור תצורת AI</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {configs.map((config) => {
            const feature = FEATURE_TYPES.find(f => f.value === config.featureType) || FEATURE_TYPES[0];
            const FeatureIcon = feature.icon;
            return (
              <Card key={config.id} className="flex flex-col hover:border-primary/30 transition-colors">
                <div className="p-5 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-violet-500/10">
                      <FeatureIcon className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{config.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{config.description || feature.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(config)} className="p-2 text-muted-foreground hover:bg-card/10 hover:text-foreground rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {isSuperAdmin && <button onClick={async () => {
                      const ok = await globalConfirm("למחוק תצורה זו?"); if (ok) deleteMutation.mutate(config.id);
                    }} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>}
                  </div>
                </div>
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 text-[10px] rounded bg-violet-500/10 text-violet-400 font-semibold uppercase tracking-wider">
                    {feature.label}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 font-semibold">
                    {TRIGGER_TYPES.find(t => t.value === config.triggerType)?.label || config.triggerType}
                  </span>
                  {config.isActive ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> פעיל
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-muted/20 text-muted-foreground font-semibold">
                      <XCircle className="w-3 h-3" /> מושבת
                    </span>
                  )}
                </div>
                {config.userPromptTemplate && (
                  <div className="px-5 pb-3">
                    <div className="bg-muted/10 rounded-lg p-2.5 border border-border/20">
                      <p className="text-[11px] text-muted-foreground font-mono line-clamp-2">{config.userPromptTemplate}</p>
                    </div>
                  </div>
                )}
                <div className="p-4 border-t border-border/30 flex justify-between items-center">
                  <button onClick={() => openExecute(config)} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                    <Play className="w-4 h-4" /> הרץ
                  </button>
                  <button onClick={() => setShowLogsForId(config.id)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <History className="w-4 h-4" /> היסטוריה
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "עריכת תצורת AI" : "יצירת תצורת AI חדשה"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>שם התצורה</Label>
              <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="מילוי אוטומטי תיאור" />
            </div>
            <div className="space-y-2">
              <Label>מזהה (Slug)</Label>
              <Input value={formData.slug} onChange={e => setFormData(p => ({ ...p, slug: e.target.value }))} placeholder="auto-description" dir="ltr" className="text-left" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>סוג יכולת</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FEATURE_TYPES.map(ft => (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, featureType: ft.value }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors ${
                    formData.featureType === ft.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-border/80 text-muted-foreground"
                  }`}
                >
                  <ft.icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">{ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>תיאור</Label>
            <Input value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="תיאור היכולת..." />
          </div>

          <div className="space-y-2">
            <Label>System Prompt</Label>
            <textarea
              value={formData.systemPrompt}
              onChange={e => setFormData(p => ({ ...p, systemPrompt: e.target.value }))}
              className="flex min-h-[80px] w-full rounded-xl border-2 border-border bg-background/50 px-4 py-3 text-sm focus-visible:outline-none focus-visible:border-primary resize-none font-mono"
              placeholder="You are an expert assistant..."
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label>User Prompt Template</Label>
            <textarea
              value={formData.userPromptTemplate}
              onChange={e => setFormData(p => ({ ...p, userPromptTemplate: e.target.value }))}
              className="flex min-h-[120px] w-full rounded-xl border-2 border-border bg-background/50 px-4 py-3 text-sm focus-visible:outline-none focus-visible:border-primary resize-none font-mono"
              placeholder="Analyze: {{input}}&#10;Classify into: {{categories}}"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">{"השתמש ב- {{שם_משתנה}} להגדרת קלט דינמי"}</p>
          </div>

          <div className="space-y-2">
            <Label>סוג הפעלה</Label>
            <select
              value={formData.triggerType}
              onChange={e => setFormData(p => ({ ...p, triggerType: e.target.value }))}
              className="h-12 w-full rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
            >
              {TRIGGER_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="aiActive" checked={formData.isActive}
              onChange={e => setFormData(p => ({ ...p, isActive: e.target.checked }))}
              className="w-5 h-5 rounded border-border bg-background text-primary" />
            <Label htmlFor="aiActive" className="mb-0">תצורה פעילה</Label>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>ביטול</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "שומר..." : "שמור תצורה"}
            </Button>
          </div>
        </form>
      </Modal>

      {executeConfigId && (
        <Modal isOpen={!!executeConfigId} onClose={() => { setExecuteConfigId(null); setExecuteResult(null); }} title="הרצת פעולת AI">
          <div className="space-y-4">
            {!executeResult ? (
              <>
                <p className="text-sm text-muted-foreground">הזן את הנתונים להרצה:</p>
                {Object.entries(executeInput).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label>{key}</Label>
                    <textarea
                      value={value}
                      onChange={e => setExecuteInput(p => ({ ...p, [key]: e.target.value }))}
                      className="flex min-h-[60px] w-full rounded-xl border-2 border-border bg-background/50 px-4 py-3 text-sm focus-visible:outline-none focus-visible:border-primary resize-none"
                      placeholder={`ערך עבור ${key}`}
                    />
                  </div>
                ))}
                <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                  <Button type="button" variant="ghost" onClick={() => { setExecuteConfigId(null); setExecuteResult(null); }}>ביטול</Button>
                  <Button
                    onClick={() => executeMutation.mutate({ id: executeConfigId, inputData: executeInput })}
                    disabled={executeMutation.isPending}
                    className="gap-2"
                  >
                    {executeMutation.isPending ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-pulse" /> מעבד...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" /> הרץ
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">הושלם בהצלחה</span>
                </div>
                <div className="bg-muted/10 rounded-xl p-4 border border-border/30">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">תוצאה</h4>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{executeResult.result?.generatedText}</p>
                </div>
                {executeResult.executionLog && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Tokens: {executeResult.executionLog.tokensUsed}</span>
                    <span>זמן: {executeResult.executionLog.executionTimeMs}ms</span>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="ghost" onClick={() => { setExecuteConfigId(null); setExecuteResult(null); }}>סגור</Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showLogsForId && (
        <Modal isOpen={!!showLogsForId} onClose={() => setShowLogsForId(null)} title="היסטוריית הרצות">
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">אין הרצות קודמות</p>
            ) : logs.map((log) => (
              <div key={log.id} className="p-3 rounded-xl bg-muted/10 border border-border/20">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                    log.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>{log.status === "completed" ? "הושלם" : "נכשל"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("he-IL")}</span>
                </div>
                {log.outputData?.generatedText && (
                  <p className="text-sm text-foreground/80 line-clamp-2">{log.outputData.generatedText}</p>
                )}
                <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground">
                  {log.tokensUsed && <span>{log.tokensUsed} tokens</span>}
                  {log.executionTimeMs && <span>{log.executionTimeMs}ms</span>}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
