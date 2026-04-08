import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Plus, X, Key, Copy, CheckCircle2, AlertTriangle, MessageSquare,
  Clock, Send, Trash2, ExternalLink, Shield, Eye
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function PortalAccessCard({ access, onRevoke }: { access: any; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const portalUrl = `${window.location.origin}/portal/project/${access.access_token}`;
  const handleCopy = () => {
    copyToClipboard(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const perms = access.permissions || {};
  return (
    <div className={`bg-muted/50 border rounded-xl p-4 ${access.is_active ? "border-border" : "border-border opacity-60"}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-sm font-medium text-foreground">{access.contact_email || "ללא אימייל"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{access.project_name || `פרויקט #${access.project_id}`}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs ${access.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}`}>
            {access.is_active ? "פעיל" : "בוטל"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {perms.view_progress && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded">צפייה בהתקדמות</span>}
        {perms.view_documents && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded">צפייה במסמכים</span>}
        {perms.approve_milestones && <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded">אישור אבני דרך</span>}
        {perms.submit_comments && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded">הוספת תגובות</span>}
      </div>

      <div className="flex gap-2">
        <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted rounded-lg text-xs text-foreground flex-1 justify-center">
          {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? "הועתק!" : "העתק קישור"}
        </button>
        {access.is_active && (
          <button onClick={onRevoke} className="p-1.5 hover:bg-red-500/20 rounded-lg">
            <Trash2 size={14} className="text-red-400" />
          </button>
        )}
      </div>

      {access.last_accessed_at && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock size={10} />
          גישה אחרונה: {new Date(access.last_accessed_at).toLocaleDateString("he-IL")}
        </div>
      )}
    </div>
  );
}

function CommentThread({ projectId }: { projectId: number }) {
  const [msg, setMsg] = useState("");
  const [authorName, setAuthorName] = useState("צוות פנימי");
  const qc = useQueryClient();

  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ["project-comments", projectId],
    queryFn: async () => {
      const r = await authFetch(`${API}/project-comments?projectId=${projectId}`);
      return safeArr(await r.json());
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/project-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: msg, authorName, authorType: "internal" }),
      });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-comments", projectId] }); setMsg(""); },
  });

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">אין תגובות עדיין</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className={`flex gap-2 ${c.author_type === "external" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.author_type === "external" ? "bg-purple-500/30 text-purple-400" : "bg-blue-500/30 text-blue-400"}`}>
                {(c.author_name || "?")[0].toUpperCase()}
              </div>
              <div className={`flex-1 ${c.author_type === "external" ? "items-end" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-foreground">{c.author_name}</span>
                  <span className={`text-[10px] px-1 rounded ${c.author_type === "external" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>
                    {c.author_type === "external" ? "לקוח" : "פנימי"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString("he-IL")}</span>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-foreground">{c.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-border">
        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="הוסף תגובה..."
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && msg.trim()) { e.preventDefault(); addComment.mutate(); } }}
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        />
        <button
          onClick={() => msg.trim() && addComment.mutate()}
          disabled={!msg.trim() || addComment.isPending}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-foreground rounded-lg text-sm"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ProjectPortalPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<any>({ permissions: { view_progress: true, view_documents: true, approve_milestones: false, submit_comments: true } });
  const [activeTab, setActiveTab] = useState<"access" | "comments">("access");
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["projects-module"],
    queryFn: async () => { const r = await authFetch(`${API}/projects-module`); return safeArr(await r.json()); },
  });

  const { data: allAccess = [] } = useQuery<any[]>({
    queryKey: ["project-portal-access", selectedProject],
    queryFn: async () => {
      const url = selectedProject ? `${API}/project-portal-access?projectId=${selectedProject}` : `${API}/project-portal-access`;
      const r = await authFetch(url);
      return safeArr(await r.json());
    },
  });

  const createAccess = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`${API}/project-portal-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-portal-access"] });
      setShowCreateForm(false);
      setForm({ permissions: { view_progress: true, view_documents: true, approve_milestones: false, submit_comments: true } });
    },
  });

  const revokeAccess = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/project-portal-access/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-portal-access"] }),
  });

  const displayAccess = selectedProject
    ? allAccess.filter((a: any) => a.project_id === selectedProject)
    : allAccess;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="text-purple-400" size={28} />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">פורטל לקוחות</h1>
            <p className="text-xs text-muted-foreground mt-0.5">ניהול גישת לקוחות לפרויקטים</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-sm"
        >
          <Plus size={16} /> גישה חדשה
        </button>
      </div>

      {/* Project filter */}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-muted-foreground">סינון לפי פרויקט:</label>
        <select
          value={selectedProject || ""}
          onChange={e => setSelectedProject(e.target.value ? Number(e.target.value) : null)}
          className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        >
          <option value="">כל הפרויקטים</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name || p.project_name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["access", "גישות פורטל", Key], ["comments", "שרשורי תקשורת", MessageSquare]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? "border-purple-500 text-purple-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {activeTab === "access" && (
        <div>
          {displayAccess.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין גישות פורטל</p>
              <p className="text-sm mt-1">לחץ על "גישה חדשה" כדי לשתף פרויקט עם לקוח</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayAccess.map((a: any) => (
                <PortalAccessCard
                  key={a.id}
                  access={a}
                  onRevoke={async () => {
                    if (await globalConfirm("לבטל גישה זו?")) revokeAccess.mutate(a.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "comments" && (
        <div className="space-y-4">
          {!selectedProject ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              בחר פרויקט מהסינון למעלה כדי לראות את שרשור התקשורת
            </div>
          ) : (
            <div className="bg-background border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <MessageSquare size={14} className="text-purple-400" />
                שרשור תקשורת — {projects.find((p: any) => p.id === selectedProject)?.name || `פרויקט #${selectedProject}`}
              </h3>
              <CommentThread projectId={selectedProject} />
            </div>
          )}
        </div>
      )}

      {/* Portal info banner */}
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Eye size={16} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-purple-400 mb-1">כיצד עובד הפורטל?</p>
            <p className="text-xs text-muted-foreground">
              כאשר תיצור גישה חדשה, תיווצר קישורית ייחודית ללקוח. הלקוח יכול לראות התקדמות הפרויקט, אבני דרך,
              מסמכים מאושרים, ולתקשר ישירות עם הצוות. לחץ "העתק קישור" כדי לשתף עם הלקוח.
            </p>
          </div>
        </div>
      </div>

      {/* Create Form Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreateForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-background border border-border rounded-2xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-foreground">גישת פורטל חדשה</h2>
                <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">פרויקט <span className="text-red-400">*</span></label>
                  <select
                    value={form.projectId || ""}
                    onChange={e => setForm({ ...form, projectId: Number(e.target.value) })}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-foreground text-sm"
                  >
                    <option value="">בחר פרויקט...</option>
                    {projects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name || p.project_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground block mb-1">אימייל לקוח</label>
                  <input
                    type="email"
                    value={form.contactEmail || ""}
                    onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                    placeholder="client@company.com"
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-foreground text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground block mb-1">תאריך פקיעה</label>
                  <input
                    type="date"
                    value={form.expiresAt || ""}
                    onChange={e => setForm({ ...form, expiresAt: e.target.value || null })}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-foreground text-sm"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground block mb-2">הרשאות</label>
                  <div className="space-y-2">
                    {[
                      { key: "view_progress", label: "צפייה בהתקדמות ואבני דרך" },
                      { key: "view_documents", label: "צפייה במסמכים מאושרים" },
                      { key: "approve_milestones", label: "אישור אבני דרך" },
                      { key: "submit_comments", label: "שליחת תגובות ושאלות" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.permissions?.[key] || false}
                          onChange={e => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-gray-300">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCreateForm(false)} className="flex-1 px-4 py-2.5 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
                  ביטול
                </button>
                <button
                  onClick={() => createAccess.mutate()}
                  disabled={!form.projectId || createAccess.isPending}
                  className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-foreground rounded-lg text-sm"
                >
                  {createAccess.isPending ? "יוצר..." : "צור גישה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
