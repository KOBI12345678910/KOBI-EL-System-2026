import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  ChevronLeft, Clock, RotateCcw, Eye, GitBranch, Upload,
  Plus, Minus, Edit2, X, ArrowLeftRight, CheckCircle, AlertTriangle
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

interface ModuleVersion {
  id: number;
  moduleId: number;
  versionNumber: number;
  label: string | null;
  notes: string | null;
  snapshot: any;
  publishedBy: string | null;
  createdAt: string;
}

interface VersionChange {
  id: number;
  changeType: string;
  objectType: string;
  objectId: number | null;
  objectName: string | null;
  field: string | null;
  oldValue: any;
  newValue: any;
}

interface DiffResult {
  from: { id: number; versionNumber: number; label: string; createdAt: string };
  to: { id: number; versionNumber: number; label: string; createdAt: string };
  changes: VersionChange[];
  summary: { added: number; modified: number; removed: number };
}

const CHANGE_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  added: { label: "נוסף", icon: Plus, color: "text-green-400 bg-green-500/10 border-green-500/20" },
  modified: { label: "שונה", icon: Edit2, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  removed: { label: "הוסר", icon: Minus, color: "text-red-400 bg-red-500/10 border-red-500/20" },
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

export default function ModuleVersionHistory() {
  const { id } = useParams<{ id: string }>();
  const moduleId = Number(id);
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<ModuleVersion | null>(null);
  const [diffMode, setDiffMode] = useState(false);
  const [diffVersion1, setDiffVersion1] = useState<number | null>(null);
  const [diffVersion2, setDiffVersion2] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState<ModuleVersion | null>(null);

  const { data: mod } = useQuery({
    queryKey: ["platform-module", moduleId],
    queryFn: () => authFetch(`${API}/platform/modules/${moduleId}`).then(r => r.json()),
  });

  const { data: versions = [], isLoading } = useQuery<ModuleVersion[]>({
    queryKey: ["module-versions", moduleId],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/modules/${moduleId}/versions`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: versionDetails } = useQuery({
    queryKey: ["module-version-detail", selectedVersion?.id],
    queryFn: async () => {
      if (!selectedVersion) return null;
      const r = await authFetch(`${API}/platform/module-versions/${selectedVersion.id}`);
      return r.json();
    },
    enabled: !!selectedVersion,
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
      queryClient.invalidateQueries({ queryKey: ["module-versions", moduleId] });
      queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] });
      setShowRollbackConfirm(null);
    },
  });

  const fetchDiff = async () => {
    if (!diffVersion1 || !diffVersion2) return;
    try {
      const r = await authFetch(`${API}/platform/module-versions/${diffVersion1}/diff/${diffVersion2}`);
      if (!r.ok) return;
      const data = await r.json();
      setDiffResult(data);
    } catch {}
  };

  const publishMutation = useMutation({
    mutationFn: async (data: { notes?: string }) => {
      const r = await authFetch(`${API}/platform/modules/${moduleId}/publish-version`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, publishedBy: "user" }),
      });
      if (!r.ok) throw new Error("Failed to publish version");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-versions", moduleId] });
      queryClient.invalidateQueries({ queryKey: ["platform-module", moduleId] });
    },
  });

  const moduleName = mod?.nameHe || mod?.name || "מודול";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/builder" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />בונה הפלטפורמה
        </Link>
        <span>/</span>
        <Link href={`/builder/module/${moduleId}`} className="hover:text-foreground transition-colors">{moduleName}</Link>
        <span>/</span>
        <span className="text-foreground">היסטוריית גרסאות</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <GitBranch className="w-8 h-8 text-blue-400" />
            היסטוריית גרסאות — {moduleName}
          </h1>
          <p className="text-muted-foreground mt-1">
            {versions.length} גרסאות · גרסה נוכחית: v{mod?.version || 1}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setDiffMode(!diffMode); setDiffResult(null); setDiffVersion1(null); setDiffVersion2(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${diffMode ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <ArrowLeftRight className="w-4 h-4" />
            השוואת גרסאות
          </button>
          <button onClick={() => publishMutation.mutate({})} disabled={publishMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" />
            {publishMutation.isPending ? "מפרסם..." : "פרסם גרסה חדשה"}
          </button>
        </div>
      </div>

      {diffMode && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-blue-400 mb-3">השוואה בין גרסאות</h3>
          <div className="flex items-center gap-3">
            <select value={diffVersion1 || ""} onChange={e => setDiffVersion1(Number(e.target.value) || null)}
              className="px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">בחר גרסה ראשונה</option>
              {versions.map(v => <option key={v.id} value={v.id}>v{v.versionNumber} — {v.label}</option>)}
            </select>
            <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
            <select value={diffVersion2 || ""} onChange={e => setDiffVersion2(Number(e.target.value) || null)}
              className="px-3 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">בחר גרסה שנייה</option>
              {versions.map(v => <option key={v.id} value={v.id}>v{v.versionNumber} — {v.label}</option>)}
            </select>
            <button onClick={fetchDiff} disabled={!diffVersion1 || !diffVersion2}
              className="px-4 py-2 bg-blue-600 text-foreground rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              השווה
            </button>
          </div>
        </div>
      )}

      {diffResult && (
        <DiffView diff={diffResult} onClose={() => setDiffResult(null)} />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : versions.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <GitBranch className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין גרסאות עדיין</h3>
          <p className="text-muted-foreground mb-4">פרסם את הגרסה הראשונה כדי להתחיל לעקוב אחר שינויים</p>
          <button onClick={() => publishMutation.mutate({})} disabled={publishMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-foreground rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" />
            פרסם גרסה ראשונה
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((ver, i) => (
            <motion.div key={ver.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`bg-card border rounded-2xl p-4 transition-all ${i === 0 ? "border-green-500/30 bg-green-500/5" : "border-border hover:border-primary/30"}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${i === 0 ? "bg-green-500/10" : "bg-blue-500/10"}`}>
                  <GitBranch className={`w-6 h-6 ${i === 0 ? "text-green-400" : "text-blue-400"}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">v{ver.versionNumber}</span>
                    {ver.label && <span className="text-sm text-muted-foreground">{ver.label}</span>}
                    {i === 0 && <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs font-medium">נוכחי</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{ver.publishedBy || "מערכת"}</span>
                    <span>·</span>
                    <span>{new Date(ver.createdAt).toLocaleString("he-IL")}</span>
                  </div>
                  {ver.notes && <p className="text-sm text-muted-foreground mt-1">{ver.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedVersion(ver)} className="flex items-center gap-1.5 px-3 py-2 hover:bg-muted rounded-lg transition-colors text-sm">
                    <Eye className="w-4 h-4 text-muted-foreground" /> צפה
                  </button>
                  {i > 0 && (
                    <button onClick={() => setShowRollbackConfirm(ver)}
                      className="flex items-center gap-1.5 px-3 py-2 hover:bg-orange-500/10 rounded-lg transition-colors text-sm text-orange-400">
                      <RotateCcw className="w-4 h-4" /> שחזר
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedVersion && (
          <VersionDetailModal
            version={selectedVersion}
            details={versionDetails}
            onClose={() => setSelectedVersion(null)}
          />
        )}
        {showRollbackConfirm && (
          <RollbackConfirmModal
            version={showRollbackConfirm}
            onConfirm={() => rollbackMutation.mutate(showRollbackConfirm.id)}
            onClose={() => setShowRollbackConfirm(null)}
            isLoading={rollbackMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DiffView({ diff, onClose }: { diff: DiffResult; onClose: () => void }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-5 h-5 text-blue-400" />
          <span className="font-semibold">
            v{diff.from.versionNumber} ↔ v{diff.to.versionNumber}
          </span>
          <div className="flex items-center gap-2 text-xs">
            {diff.summary.added > 0 && <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full">+{diff.summary.added} נוסף</span>}
            {diff.summary.modified > 0 && <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full">~{diff.summary.modified} שונה</span>}
            {diff.summary.removed > 0 && <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full">-{diff.summary.removed} הוסר</span>}
          </div>
        </div>
        <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground hover:text-foreground" /></button>
      </div>
      <div className="p-4 max-h-96 overflow-y-auto">
        {diff.changes.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין שינויים בין הגרסאות</p>
        ) : (
          <div className="space-y-2">
            {diff.changes.map((change, i) => {
              const config = CHANGE_TYPE_CONFIG[change.changeType] || CHANGE_TYPE_CONFIG.modified;
              const Icon = config.icon;
              return (
                <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${config.color}`}>
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium px-1.5 py-0.5 bg-muted/50 rounded">{OBJECT_TYPE_LABELS[change.objectType] || change.objectType}</span>
                      <span className="text-sm font-medium">{change.objectName || `#${change.objectId}`}</span>
                      {change.field && <span className="text-xs text-muted-foreground">· {change.field}</span>}
                    </div>
                    {change.changeType === "modified" && change.field && (
                      <div className="flex items-center gap-2 mt-1 text-xs" dir="ltr">
                        <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded line-through max-w-[200px] truncate">
                          {typeof change.oldValue === "object" ? JSON.stringify(change.oldValue) : String(change.oldValue ?? "")}
                        </span>
                        <span>→</span>
                        <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded max-w-[200px] truncate">
                          {typeof change.newValue === "object" ? JSON.stringify(change.newValue) : String(change.newValue ?? "")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function VersionDetailModal({ version, details, onClose }: { version: ModuleVersion; details: any; onClose: () => void }) {
  const [tab, setTab] = useState<"snapshot" | "changes">("changes");
  const snapshot = version.snapshot as any;
  const changes: VersionChange[] = details?.changes || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">גרסה v{version.versionNumber}</h2>
            <p className="text-sm text-muted-foreground">
              {version.publishedBy || "מערכת"} · {new Date(version.createdAt).toLocaleString("he-IL")}
              {version.notes && <span> · {version.notes}</span>}
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-1 px-6 pt-4">
          <button onClick={() => setTab("changes")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "changes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            שינויים ({changes.length})
          </button>
          <button onClick={() => setTab("snapshot")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "snapshot" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            Snapshot מלא
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(85vh-160px)]">
          {tab === "changes" ? (
            changes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין שינויים מתועדים (גרסה ראשונה)</p>
            ) : (
              <div className="space-y-2">
                {changes.map((change, i) => {
                  const config = CHANGE_TYPE_CONFIG[change.changeType] || CHANGE_TYPE_CONFIG.modified;
                  const Icon = config.icon;
                  return (
                    <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${config.color}`}>
                      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium px-1.5 py-0.5 bg-muted/50 rounded">{OBJECT_TYPE_LABELS[change.objectType] || change.objectType}</span>
                          <span className="text-sm font-medium">{change.objectName || `#${change.objectId}`}</span>
                          {change.field && <span className="text-xs text-muted-foreground">· {change.field}</span>}
                        </div>
                        {change.changeType === "modified" && change.field && (
                          <div className="flex items-center gap-2 mt-1 text-xs" dir="ltr">
                            <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded line-through max-w-[200px] truncate">
                              {typeof change.oldValue === "object" ? JSON.stringify(change.oldValue) : String(change.oldValue ?? "")}
                            </span>
                            <span>→</span>
                            <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded max-w-[200px] truncate">
                              {typeof change.newValue === "object" ? JSON.stringify(change.newValue) : String(change.newValue ?? "")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <SnapshotSection title="מודול" data={snapshot?.module} />
              <SnapshotSection title={`ישויות (${snapshot?.entities?.length || 0})`} data={snapshot?.entities} />
              <SnapshotSection title={`שדות (${snapshot?.fields?.length || 0})`} data={snapshot?.fields} />
              <SnapshotSection title={`קשרים (${snapshot?.relations?.length || 0})`} data={snapshot?.relations} />
              <SnapshotSection title={`סטטוסים (${snapshot?.statuses?.length || 0})`} data={snapshot?.statuses} />
              <SnapshotSection title={`תצוגות (${snapshot?.views?.length || 0})`} data={snapshot?.views} />
              <SnapshotSection title={`טפסים (${snapshot?.forms?.length || 0})`} data={snapshot?.forms} />
              <SnapshotSection title={`פעולות (${snapshot?.actions?.length || 0})`} data={snapshot?.actions} />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function SnapshotSection({ title, data }: { title: string; data: any }) {
  const [expanded, setExpanded] = useState(false);
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-sm font-medium">
        <span>{title}</span>
        <ChevronLeft className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : "-rotate-90"}`} />
      </button>
      {expanded && (
        <pre className="p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap bg-background" dir="ltr">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function RollbackConfirmModal({ version, onConfirm, onClose, isLoading }: {
  version: ModuleVersion; onConfirm: () => void; onClose: () => void; isLoading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">שחזור לגרסה v{version.versionNumber}</h2>
            <p className="text-sm text-muted-foreground">
              {new Date(version.createdAt).toLocaleString("he-IL")}
            </p>
          </div>
        </div>
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 mb-4">
          <p className="text-sm text-orange-400">
            שחזור גרסה יחליף את כל המטא-דאטה הנוכחית (ישויות, שדות, טפסים, תצוגות וכו׳) בנתונים מגרסה v{version.versionNumber}. פעולה זו לא ניתנת לביטול אך תיצור גרסה חדשה אוטומטית.
          </p>
        </div>
        {version.notes && <p className="text-sm text-muted-foreground mb-4">הערות: {version.notes}</p>}
        <div className="flex items-center gap-3">
          <button onClick={onConfirm} disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-foreground rounded-xl font-medium hover:bg-orange-700 transition-colors disabled:opacity-50">
            <RotateCcw className="w-4 h-4" />
            {isLoading ? "משחזר..." : "שחזר לגרסה זו"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="version-history" />
        <RelatedRecords entityType="version-history" />
      </div>
      </motion.div>
    </motion.div>
  );
}
