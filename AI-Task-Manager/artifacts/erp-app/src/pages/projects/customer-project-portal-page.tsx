import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, AlertCircle, MessageSquare, Send,
  BarChart2, Calendar, User, Loader2, FileText, Package, Tag
} from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL || "/";
function publicFetch(path: string, opts?: RequestInit) {
  const url = path.startsWith("http") ? path : `${BASE_URL.replace(/\/$/, "")}${path}`;
  return fetch(url, opts);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "פעיל", cls: "bg-emerald-500/20 text-emerald-400" },
    planning: { label: "תכנון", cls: "bg-blue-500/20 text-blue-400" },
    completed: { label: "הושלם", cls: "bg-gray-500/20 text-gray-400" },
    on_hold: { label: "בהמתנה", cls: "bg-amber-500/20 text-amber-400" },
    cancelled: { label: "בוטל", cls: "bg-red-500/20 text-red-400" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-500/20 text-gray-400" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function MilestoneStatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "approved") return <CheckCircle2 size={16} className="text-emerald-400" />;
  if (status === "in_progress") return <Clock size={16} className="text-blue-400" />;
  return <AlertCircle size={16} className="text-gray-400" />;
}

export default function CustomerProjectPortalPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "milestones" | "documents" | "comments">("overview");

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ["public-portal", token],
    queryFn: async () => {
      const r = await publicFetch(`/api/public/project-portal/${token}`);
      if (!r.ok) throw new Error("Invalid or expired access link");
      return r.json();
    },
    retry: false,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["public-portal-milestones", token],
    queryFn: async () => {
      const r = await publicFetch(`/api/public/project-portal/${token}/milestones`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!project,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["public-portal-comments", token],
    queryFn: async () => {
      const r = await publicFetch(`/api/public/project-portal/${token}/comments`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!project,
  });

  const { data: docsData } = useQuery({
    queryKey: ["public-portal-documents", token],
    queryFn: async () => {
      const r = await publicFetch(`/api/public/project-portal/${token}/documents`);
      if (!r.ok) return { documents: [], workOrders: [] };
      return r.json();
    },
    enabled: !!project && !!(project as { permissions?: { view_documents?: boolean } })?.permissions?.view_documents,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["public-portal-change-orders", token],
    queryFn: async () => {
      const r = await publicFetch(`/api/public/project-portal/${token}/change-orders`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!project && !!(project as { permissions?: { view_documents?: boolean } })?.permissions?.view_documents,
  });

  const approveMutation = useMutation({
    mutationFn: async (milestoneId: number) => {
      const r = await publicFetch(`/api/public/project-portal/${token}/milestones/${milestoneId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "שגיאה באישור");
      }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-portal-milestones", token] }),
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      const r = await publicFetch(`/api/public/project-portal/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newComment, authorName }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "שגיאה בשמירת ההודעה");
      }
      return r.json();
    },
    onSuccess: () => {
      setNewComment("");
      qc.invalidateQueries({ queryKey: ["public-portal-comments", token] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-400" size={36} />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">קישור לא תקף</h2>
          <p className="text-muted-foreground">הקישור שגוי, פג תוקף, או בוטל. אנא פנו למנהל הפרויקט.</p>
        </div>
      </div>
    );
  }

  const perms = project.permissions || {};
  const completionPct = parseFloat(project.completion_pct || "0");
  const milestoneArr = Array.isArray(milestones) ? milestones : [];
  const commentArr = Array.isArray(comments) ? comments : [];
  const approvedDocs = Array.isArray(docsData?.documents) ? docsData.documents : [];
  const workOrders = Array.isArray(docsData?.workOrders) ? docsData.workOrders : [];

  return (
    <div className="min-h-screen bg-gray-950 text-foreground" dir="rtl">
      <header className="bg-background border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{project.project_name}</h1>
            <p className="text-xs text-muted-foreground">{project.project_number} • {project.customer_name || ""}</p>
          </div>
          <StatusBadge status={project.status} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-8 border-b border-border pb-0">
          {[
            { id: "overview", label: "סקירה כללית" },
            { id: "milestones", label: `אבני דרך (${milestoneArr.length})` },
            ...(perms.view_documents ? [{ id: "documents", label: `מסמכים ואצווה (${approvedDocs.length})` }] : []),
            ...(perms.submit_comments ? [{ id: "comments", label: `תקשורת (${commentArr.length})` }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "overview" | "milestones" | "documents" | "comments")}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "התקדמות", value: `${completionPct}%`, icon: BarChart2, color: "text-blue-400" },
                  { label: "תאריך התחלה", value: formatDate(project.start_date), icon: Calendar, color: "text-green-400" },
                  { label: "תאריך יעד", value: formatDate(project.end_date), icon: Calendar, color: "text-amber-400" },
                  { label: "מנהל פרויקט", value: project.manager_name || "—", icon: User, color: "text-purple-400" },
                ].map((item) => (
                  <div key={item.label} className="bg-background border border-border rounded-xl p-4">
                    <item.icon size={18} className={`${item.color} mb-2`} />
                    <div className="text-lg font-semibold text-foreground">{item.value}</div>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>

              <div className="bg-background border border-border rounded-xl p-6 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-muted-foreground">התקדמות כוללת</span>
                  <span className="text-sm font-semibold text-foreground">{completionPct}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${completionPct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>

              {project.description && (
                <div className="bg-background border border-border rounded-xl p-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">תיאור הפרויקט</h3>
                  <p className="text-foreground text-sm leading-relaxed">{project.description}</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "milestones" && (
            <motion.div key="milestones" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {milestoneArr.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">אין אבני דרך מוגדרות</div>
              ) : (
                <div className="space-y-3">
                  {milestoneArr.map((m: any) => (
                    <div key={m.id} className="bg-background border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <MilestoneStatusIcon status={m.status} />
                          <div>
                            <div className="text-sm font-medium text-foreground">{m.title}</div>
                            {m.description && <div className="text-xs text-muted-foreground mt-1">{m.description}</div>}
                            <div className="text-xs text-muted-foreground mt-1">
                              תאריך יעד: {formatDate(m.target_date)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            m.status === "completed" || m.status === "approved"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : m.status === "in_progress"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}>
                            {m.status === "completed" ? "הושלם" : m.status === "approved" ? "אושר" : m.status === "in_progress" ? "בביצוע" : "ממתין"}
                          </span>
                          {perms.approve_milestones && m.status === "completed" && (
                            <button
                              onClick={() => approveMutation.mutate(m.id)}
                              disabled={approveMutation.isPending}
                              className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs rounded-lg disabled:opacity-50"
                            >
                              <CheckCircle2 size={12} />
                              אשר
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "documents" && perms.view_documents && (
            <motion.div key="documents" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {workOrders.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">צווי עבודה מקושרים</h3>
                  <div className="space-y-2">
                    {workOrders.map((wo: any, i: number) => (
                      <div key={i} className="bg-background border border-border rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Package size={16} className="text-blue-400 shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-foreground">{wo.title || wo.order_number}</div>
                            <div className="text-xs text-muted-foreground">{wo.order_number} • תאריך יעד: {formatDate(wo.due_date)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">{Math.round(parseFloat(wo.completion_percentage || "0"))}%</div>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            wo.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                            wo.status === "in_progress" ? "bg-blue-500/20 text-blue-400" :
                            "bg-gray-500/20 text-gray-400"
                          }`}>
                            {wo.status === "completed" ? "הושלם" : wo.status === "in_progress" ? "בביצוע" : wo.status || "מתוכנן"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(changeOrders as any[]).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">בקשות שינוי</h3>
                  <div className="space-y-2">
                    {(changeOrders as any[]).map((co: any, i: number) => (
                      <div key={i} className="bg-background border border-border rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Tag size={16} className="text-purple-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="text-sm font-medium text-foreground">{co.title}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{co.change_number} • {formatDate(co.created_at)}</div>
                              {co.description && <div className="text-xs text-muted-foreground mt-1">{co.description}</div>}
                              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                {co.cost_impact != null && <span>עלות: {co.cost_impact > 0 ? "+" : ""}{co.cost_impact}</span>}
                                {co.schedule_impact != null && <span>לו"ז: {co.schedule_impact > 0 ? "+" : ""}{co.schedule_impact} ימים</span>}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${
                            co.status === "approved" ? "bg-emerald-500/20 text-emerald-400" :
                            co.status === "rejected" ? "bg-red-500/20 text-red-400" :
                            co.status === "pending_approval" ? "bg-amber-500/20 text-amber-400" :
                            "bg-gray-500/20 text-gray-400"
                          }`}>
                            {co.status === "approved" ? "אושר" : co.status === "rejected" ? "נדחה" : co.status === "pending_approval" ? "ממתין לאישור" : co.status === "draft" ? "טיוטה" : co.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <h3 className="text-sm font-semibold text-foreground mb-3">מסמכים מאושרים</h3>
              {approvedDocs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">אין מסמכים מאושרים זמינים</div>
              ) : (
                <div className="space-y-2">
                  {approvedDocs.map((doc: any) => (
                    <div key={doc.id} className="bg-background border border-border rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-amber-400 shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-foreground">{doc.title}</div>
                          <div className="text-xs text-muted-foreground">{doc.type || doc.category || ""} • גרסה {doc.version || "1"} • {formatDate(doc.created_at)}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400">
                        {doc.status === "approved" ? "מאושר" : doc.status === "published" ? "פורסם" : "פעיל"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "comments" && perms.submit_comments && (
            <motion.div key="comments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="space-y-3 mb-6">
                {commentArr.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">אין הודעות עדיין</div>
                ) : (
                  commentArr.map((c: any) => (
                    <div
                      key={c.id}
                      className={`rounded-xl p-4 ${
                        c.author_type === "external"
                          ? "bg-blue-900/20 border border-blue-800/30 mr-8"
                          : "bg-background border border-border ml-8"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-foreground">{c.author_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleString("he-IL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{c.message}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="bg-background border border-border rounded-xl p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">הוסף הודעה</h4>
                <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="שמך"
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground mb-2 focus:outline-none focus:border-blue-500"
                />
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="כתוב הודעה..."
                  rows={3}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground mb-2 focus:outline-none focus:border-blue-500 resize-none"
                />
                <button
                  onClick={() => commentMutation.mutate()}
                  disabled={!newComment.trim() || commentMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-foreground text-sm rounded-lg disabled:opacity-50"
                >
                  <Send size={14} />
                  {commentMutation.isPending ? "שולח..." : "שלח"}
                </button>
                {commentMutation.isError && (
                  <p className="text-xs text-red-400 mt-2">{(commentMutation.error as Error)?.message}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground mt-12">
        פורטל לקוחות — מערכת ERP
      </footer>
    </div>
  );
}
