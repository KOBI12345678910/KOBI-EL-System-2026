import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules, PLATFORM_MODULES_QUERY_KEY } from "@/hooks/usePlatformModules";
import {
  GitBranch, ChevronLeft, Clock, Upload, RotateCcw, Eye,
  CheckCircle, Edit2, Archive, FileText, Layers, ArrowLeftRight,
  X, Plus, Minus, Box, AlertTriangle
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface ModuleVersion {
  id: number;
  moduleId: number;
  versionNumber: number;
  label: string | null;
  notes: string | null;
  publishedBy: string | null;
  createdAt: string;
}

const CHANGE_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  added: { label: "נוסף", icon: Plus, color: "text-green-400 bg-green-500/10" },
  modified: { label: "שונה", icon: Edit2, color: "text-yellow-400 bg-yellow-500/10" },
  removed: { label: "הוסר", icon: Minus, color: "text-red-400 bg-red-500/10" },
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  module: "מודול",
  entity: "ישות",
  field: "שדה",
  relation: "קשר",
  status: "סטטוס",
  view: "תצוגה",
  form: "טופס",
  action: "פעולה",
};

export default function VersioningBuilderPage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [publishingModuleId, setPublishingModuleId] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [publishNotes, setPublishNotes] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);

  const { modules } = usePlatformModules();

  const { data: moduleVersions = [] } = useQuery<ModuleVersion[]>({
    queryKey: ["module-versions-for", selectedModuleId],
    queryFn: async () => {
      if (!selectedModuleId) return [];
      const r = await authFetch(`${API}/platform/modules/${selectedModuleId}/versions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedModuleId,
  });

  const publishMutation = useMutation({
    mutationFn: async (data: { moduleId: number; notes: string }) => {
      const r = await authFetch(`${API}/platform/modules/${data.moduleId}/publish-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: data.notes, publishedBy: "user" }),
      });
      if (!r.ok) throw new Error("Failed to publish");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["module-versions-for"] });
      setPublishingModuleId(null);
      setPublishNotes("");
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const r = await authFetch(`${API}/platform/module-versions/${versionId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishedBy: "user" }),
      });
      if (!r.ok) throw new Error("Failed to rollback");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["module-versions-for"] });
    },
  });

  const draftModules = modules.filter((m: any) => m.status === "draft");
  const publishedModules = modules.filter((m: any) => m.status === "published");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span><span className="text-foreground">גרסאות ופרסום</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <GitBranch className="w-8 h-8 text-green-400" />גרסאות ופרסום
          </h1>
          <p className="text-muted-foreground mt-1">ניהול גרסאות מטא-דאטה, פרסום, היסטוריית שינויים ושחזור</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Edit2} label="טיוטות" value={draftModules.length} color="yellow" />
        <StatCard icon={CheckCircle} label="פורסמו" value={publishedModules.length} color="green" />
        <StatCard icon={Layers} label="מודולים" value={modules.length} color="blue" />
        <StatCard icon={GitBranch} label="סה״כ גרסאות" value={moduleVersions.length} color="purple" />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">מודולים</h2>
        <div className="space-y-3">
          {modules.map((mod: any) => (
            <div key={mod.id} className={`bg-card border rounded-2xl p-4 transition-all ${selectedModuleId === mod.id ? "border-primary" : "border-border hover:border-primary/30"}`}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Box className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{mod.nameHe || mod.name}</span>
                    <span className="text-xs text-muted-foreground">v{mod.version}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${mod.status === "published" ? "bg-green-500/10 text-green-400 border-green-500/20" : mod.status === "draft" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-muted/10 text-muted-foreground border-gray-500/20"}`}>
                      {mod.status === "published" ? "פורסם" : mod.status === "draft" ? "טיוטה" : "ארכיון"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.description || mod.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedModuleId(selectedModuleId === mod.id ? null : mod.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${selectedModuleId === mod.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    <Clock className="w-4 h-4" /> גרסאות
                  </button>
                  <button onClick={() => navigate(`/builder/module/${mod.id}/versions`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Eye className="w-4 h-4" /> מסך מלא
                  </button>
                  <button onClick={() => { setPublishingModuleId(mod.id); setPublishNotes(""); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-foreground rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                    <Upload className="w-4 h-4" /> פרסם גרסה
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {selectedModuleId === mod.id && moduleVersions.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-4 border-t border-border overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-muted-foreground">{moduleVersions.length} גרסאות</span>
                      <Link href={`/builder/module/${mod.id}/versions`} className="text-xs text-primary hover:underline">
                        צפה בהיסטוריה מלאה →
                      </Link>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {moduleVersions.slice(0, 5).map((ver, i) => (
                        <div key={ver.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${i === 0 ? "border-green-500/20 bg-green-500/5" : "border-border"}`}>
                          <GitBranch className={`w-4 h-4 ${i === 0 ? "text-green-400" : "text-blue-400"}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">v{ver.versionNumber}</span>
                              {ver.label && <span className="text-xs text-muted-foreground">{ver.label}</span>}
                              {i === 0 && <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">נוכחי</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {ver.publishedBy || "מערכת"} · {new Date(ver.createdAt).toLocaleString("he-IL")}
                            </p>
                          </div>
                          {i > 0 && (
                            <button onClick={async () => { const ok = await globalConfirm(`לשחזר לגרסה v${ver.versionNumber}?`, { variant: "warning", title: "אישור שחזור", confirmText: "שחזר", requireTypedConfirm: false }); if (ok) rollbackMutation.mutate(ver.id); }}
                              className="p-1.5 hover:bg-orange-500/10 rounded-lg transition-colors" title="שחזר">
                              <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
                {selectedModuleId === mod.id && moduleVersions.length === 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-4 border-t border-border text-center text-sm text-muted-foreground py-4">
                    אין גרסאות עדיין — פרסם גרסה ראשונה
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {publishingModuleId && (
          <PublishModal
            module={modules.find((m: any) => m.id === publishingModuleId)}
            notes={publishNotes}
            onNotesChange={setPublishNotes}
            onPublish={() => publishMutation.mutate({ moduleId: publishingModuleId, notes: publishNotes })}
            onClose={() => setPublishingModuleId(null)}
            isLoading={publishMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    yellow: "bg-yellow-500/10 text-yellow-400",
    green: "bg-green-500/10 text-green-400",
    blue: "bg-blue-500/10 text-blue-400",
    purple: "bg-purple-500/10 text-purple-400",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-lg sm:text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function PublishModal({ module, notes, onNotesChange, onPublish, onClose, isLoading }: {
  module: any; notes: string; onNotesChange: (v: string) => void; onPublish: () => void; onClose: () => void; isLoading: boolean;
}) {
  if (!module) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">פרסום גרסה חדשה</h2>
            <p className="text-sm text-muted-foreground">{module.nameHe || module.name} — v{module.version} → v{module.version + 1}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          פרסום גרסה יוצר snapshot מלא של כל המטא-דאטה של המודול: ישויות, שדות, טפסים, תצוגות, סטטוסים, קשרים ופעולות.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">הערות לגרסה (אופציונלי)</label>
          <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={3} placeholder="תאר את השינויים בגרסה זו..."
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onPublish} disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-foreground rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
            {isLoading ? "מפרסם..." : "פרסם גרסה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="versioning" />
        <RelatedRecords entityType="versioning" />
      </div>
      </motion.div>
    </motion.div>
  );
}
