import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  FileText, Search, Clock, Shield, Share2, AlertTriangle,
  CheckCircle2, XCircle, Eye, Download, Lock, Unlock,
  GitBranch, RotateCcw, Link2, Plus, X, RefreshCw, History,
  FileSearch, Gavel, ChevronDown, ChevronUp, ArrowLeft,
  Check, Loader2, FileUp
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";
const tok = () => localStorage.getItem("erp_token") || "";
const authHeaders = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function FileTypeBadge({ mimeType }: { mimeType: string }) {
  let label = "FILE", color = "bg-muted text-muted-foreground";
  if (mimeType.includes("pdf")) { label = "PDF"; color = "bg-red-100 text-red-700"; }
  else if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) { label = "XLS"; color = "bg-green-100 text-green-700"; }
  else if (mimeType.includes("word") || mimeType.includes("document")) { label = "DOC"; color = "bg-blue-100 text-blue-700"; }
  else if (mimeType.startsWith("image/")) { label = "IMG"; color = "bg-purple-100 text-purple-700"; }
  return <span className={`text-xs font-mono px-1.5 py-0.5 rounded font-bold ${color}`}>{label}</span>;
}

function ApprovalBadge({ status }: { status: string }) {
  if (!status || status === "none") return null;
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "ממתין לאישור", color: "bg-yellow-100 text-yellow-700" },
    approved: { label: "מאושר", color: "bg-green-100 text-green-700" },
    rejected: { label: "נדחה", color: "bg-red-100 text-red-700" },
  };
  const cfg = map[status] || { label: status, color: "bg-muted text-muted-foreground" };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>;
}

function LegalHoldBadge({ isHeld }: { isHeld: boolean }) {
  if (!isHeld) return null;
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1"><Gavel size={10} />עצירה משפטית</span>;
}

type Tab = "repository" | "approvals" | "versions" | "sharing" | "legal-hold";

export default function DMSRepositoryPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<Tab>("repository");

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "repository", label: "מאגר מסמכים", icon: FileText },
    { id: "approvals", label: "תהליכי אישור", icon: CheckCircle2 },
    { id: "versions", label: "גרסאות", icon: GitBranch },
    { id: "sharing", label: "שיתוף מאובטח", icon: Share2 },
    { id: "legal-hold", label: "עצירה משפטית", icon: Gavel },
  ];

  return (
    <div className="flex flex-col h-screen bg-background" dir="rtl">
      <div className="bg-card border-b px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileSearch className="text-indigo-600" size={24} />
          מאגר מסמכים מרכזי (DMS)
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">ניהול מסמכים, גרסאות, אישורים ועצירה משפטית</p>
      </div>

      <div className="border-b bg-card shrink-0">
        <nav className="flex px-6 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === "repository" && <RepositoryTab />}
        {activeTab === "approvals" && <ApprovalsTab />}
        {activeTab === "versions" && <VersionsTab />}
        {activeTab === "sharing" && <SharingTab />}
        {activeTab === "legal-hold" && <LegalHoldTab />}
      </div>
    </div>
  );
}

function RepositoryTab() {
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [ocrLoading, setOcrLoading] = useState<number | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [approvalForm, setApprovalForm] = useState({ assignedTo: "", stepName: "אישור מסמך", dueDate: "", comments: "" });
  const [holdForm, setHoldForm] = useState({ caseName: "" });
  const [shareForm, setShareForm] = useState({ expiresInDays: "30", allowDownload: true, requireWatermark: false, maxViews: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, statsRes] = await Promise.all([
        authFetch(`${API}/dms/search?q=${encodeURIComponent(search)}`, { headers: authHeaders() }),
        authFetch(`${API}/dms/stats`, { headers: authHeaders() }),
      ]);
      if (filesRes.ok) setFiles(await filesRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {}
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleOcr = async (file: any) => {
    setOcrLoading(file.id);
    try {
      const res = await authFetch(`${API}/dms/files/${file.id}/ocr`, { method: "POST", headers: authHeaders() });
      if (res.ok) {
        load();
      }
    } catch {}
    setOcrLoading(null);
  };

  const submitApproval = async () => {
    if (!selectedFile) return;
    try {
      await authFetch(`${API}/dms/approvals/request`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ fileId: selectedFile.id, ...approvalForm }),
      });
      setShowApprovalDialog(false);
      load();
    } catch {}
  };

  const submitShare = async () => {
    if (!selectedFile) return;
    try {
      const res = await authFetch(`${API}/dms/share-links`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ fileId: selectedFile.id, ...shareForm, maxViews: shareForm.maxViews ? parseInt(shareForm.maxViews) : null }),
      });
      if (res.ok) {
        const data = await res.json();
        const url = `${window.location.origin}${data.shareUrl}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        alert(`הקישור הועתק: ${url}`);
      }
      setShowShareDialog(false);
    } catch {}
  };

  const submitHold = async () => {
    if (!selectedFile || !holdForm.caseName.trim()) return;
    try {
      await authFetch(`${API}/dms/files/${selectedFile.id}/legal-hold`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ caseName: holdForm.caseName }),
      });
      setShowHoldDialog(false);
      load();
    } catch {}
  };

  const releaseHold = async (file: any) => {
    if (!(await globalConfirm(`לשחרר עצירה משפטית ל-"${file.name}"?`))) return;
    await authFetch(`${API}/dms/files/${file.id}/release-hold`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ releaseNote: "" }),
    });
    load();
  };

  const kpis = stats ? [
    { label: "סה\"כ מסמכים", value: stats.totalFiles, icon: FileText, color: "text-indigo-600" },
    { label: "ממתינים לאישור", value: stats.pendingApprovals, icon: Clock, color: "text-yellow-600" },
    { label: "בעצירה משפטית", value: stats.legalHoldFiles, icon: Gavel, color: "text-orange-600" },
    { label: "קישורי שיתוף", value: stats.activeShareLinks, icon: Link2, color: "text-blue-600" },
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <div key={i} className="bg-card border rounded-xl p-4">
              <k.icon className={`${k.color} mb-2`} size={20} />
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border rounded-xl p-4">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש בכל המסמכים (שם, תיאור, OCR)..."
              className="w-full pr-9 pl-4 py-2 border rounded-lg text-sm"
            />
          </div>
          <button onClick={load} className="p-2 border rounded-lg hover:bg-muted"><RefreshCw size={16} /></button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">טוען מסמכים...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText size={48} className="mx-auto mb-3 opacity-30" />
            <p>אין מסמכים</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-3 py-2 text-right">שם</th>
                <th className="px-3 py-2 text-right">תיקייה</th>
                <th className="px-3 py-2 text-right">גרסה</th>
                <th className="px-3 py-2 text-right">סטטוס אישור</th>
                <th className="px-3 py-2 text-right">OCR</th>
                <th className="px-3 py-2 text-right">גודל</th>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file: any) => (
                <tr key={file.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileTypeBadge mimeType={file.mime_type || file.mimeType || ""} />
                      <span className="font-medium truncate max-w-[200px]">{file.name}</span>
                      {file.is_legal_hold && <Gavel size={14} className="text-orange-500 shrink-0" />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{file.folder_name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">v{file.current_version || 1}</td>
                  <td className="px-3 py-2"><ApprovalBadge status={file.approval_status} /></td>
                  <td className="px-3 py-2">
                    {file.ocr_status === "completed"
                      ? <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} />OCR</span>
                      : file.ocr_status === "processing"
                      ? <span className="text-xs text-blue-600">מעבד...</span>
                      : <button onClick={() => handleOcr(file)} className="text-xs text-muted-foreground hover:text-indigo-600">
                          {ocrLoading === file.id ? <Loader2 size={12} className="animate-spin" /> : "OCR"}
                        </button>
                    }
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{formatSize(file.size)}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(file.created_at).toLocaleDateString("he-IL")}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setSelectedFile(file); setShowApprovalDialog(true); }}
                        className="p-1 hover:bg-yellow-50 rounded text-yellow-600" title="בקש אישור"
                        disabled={!!file.is_legal_hold}
                      >
                        <CheckCircle2 size={14} />
                      </button>
                      <button
                        onClick={() => { setSelectedFile(file); setShowShareDialog(true); }}
                        className="p-1 hover:bg-blue-50 rounded text-blue-600" title="שתף"
                      >
                        <Share2 size={14} />
                      </button>
                      {file.is_legal_hold ? (
                        <button onClick={() => releaseHold(file)} className="p-1 hover:bg-orange-50 rounded text-orange-600" title="שחרר עצירה">
                          <Unlock size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => { setSelectedFile(file); setShowHoldDialog(true); }}
                          className="p-1 hover:bg-orange-50 rounded text-orange-600" title="עצירה משפטית"
                        >
                          <Lock size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AnimatePresence>
        {showApprovalDialog && selectedFile && (
          <Modal title={`בקש אישור: ${selectedFile.name}`} onClose={() => setShowApprovalDialog(false)}>
            <div className="space-y-4 p-5">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">שם שלב</label>
                <input value={approvalForm.stepName} onChange={e => setApprovalForm(f => ({ ...f, stepName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">מוקצה ל</label>
                <input value={approvalForm.assignedTo} onChange={e => setApprovalForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="שם המאשר" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">תאריך יעד</label>
                <input type="date" value={approvalForm.dueDate} onChange={e => setApprovalForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">הערות</label>
                <textarea value={approvalForm.comments} onChange={e => setApprovalForm(f => ({ ...f, comments: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowApprovalDialog(false)} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
                <button onClick={submitApproval} className="px-4 py-2 bg-indigo-600 text-foreground rounded-lg text-sm hover:bg-indigo-700">שלח לאישור</button>
              </div>
            </div>
          </Modal>
        )}

        {showShareDialog && selectedFile && (
          <Modal title={`שיתוף מאובטח: ${selectedFile.name}`} onClose={() => setShowShareDialog(false)}>
            <div className="space-y-4 p-5">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">תוקף (ימים)</label>
                <input type="number" value={shareForm.expiresInDays} onChange={e => setShareForm(f => ({ ...f, expiresInDays: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">מגבלת צפיות</label>
                <input type="number" value={shareForm.maxViews} onChange={e => setShareForm(f => ({ ...f, maxViews: e.target.value }))} placeholder="ללא הגבלה" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={shareForm.allowDownload} onChange={e => setShareForm(f => ({ ...f, allowDownload: e.target.checked }))} className="rounded" />
                  אפשר הורדה
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={shareForm.requireWatermark} onChange={e => setShareForm(f => ({ ...f, requireWatermark: e.target.checked }))} className="rounded" />
                  הוסף סימן מים
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowShareDialog(false)} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
                <button onClick={submitShare} className="px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1"><Link2 size={14} />צור קישור</button>
              </div>
            </div>
          </Modal>
        )}

        {showHoldDialog && selectedFile && (
          <Modal title={`עצירה משפטית: ${selectedFile.name}`} onClose={() => setShowHoldDialog(false)}>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">מסמך בעצירה משפטית לא ניתן למחיקה או שינוי עד לשחרורו.</p>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">שם התיק / מקרה *</label>
                <input value={holdForm.caseName} onChange={e => setHoldForm(f => ({ ...f, caseName: e.target.value }))} placeholder="לדוג׳: תיק בית משפט 2024-001" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowHoldDialog(false)} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
                <button onClick={submitHold} className="px-4 py-2 bg-orange-600 text-foreground rounded-lg text-sm hover:bg-orange-700 flex items-center gap-1"><Gavel size={14} />הוסף עצירה</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function ApprovalsTab() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"inbox" | "all">("inbox");
  const [actionId, setActionId] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const url = filter === "inbox" ? `${API}/dms/approvals/inbox` : `${API}/dms/approvals`;
      const res = await authFetch(url, { headers: authHeaders() });
      if (res.ok) setApprovals(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const approve = async (id: number) => {
    setActionId(id);
    try {
      await authFetch(`${API}/dms/approvals/${id}/approve`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ comments }),
      });
      load();
    } catch {}
    setActionId(null);
  };

  const reject = async (id: number) => {
    if (!comments.trim()) { alert("נדרש להוסיף הערה לדחייה"); return; }
    setActionId(id);
    try {
      await authFetch(`${API}/dms/approvals/${id}/reject`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ comments }),
      });
      setShowRejectDialog(null);
      setComments("");
      load();
    } catch {}
    setActionId(null);
  };

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: "ממתין", color: "bg-yellow-100 text-yellow-700" },
    approved: { label: "מאושר", color: "bg-green-100 text-green-700" },
    rejected: { label: "נדחה", color: "bg-red-100 text-red-700" },
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setFilter("inbox")} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === "inbox" ? "bg-indigo-600 text-foreground" : "bg-muted text-muted-foreground"}`}>תיבת דואר נכנס</button>
        <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === "all" ? "bg-indigo-600 text-foreground" : "bg-muted text-muted-foreground"}`}>כל האישורים</button>
        <button onClick={load} className="p-2 border rounded-lg hover:bg-muted ml-auto"><RefreshCw size={16} /></button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">טוען...</div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 size={48} className="mx-auto mb-3 opacity-30" />
          <p>{filter === "inbox" ? "אין בקשות ממתינות" : "אין אישורים"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a: any) => (
            <div key={a.id} className="bg-card border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText size={16} className="text-muted-foreground" />
                    <span className="font-medium">{a.file_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusMap[a.status]?.color || "bg-muted text-muted-foreground"}`}>
                      {statusMap[a.status]?.label || a.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>שלב: {a.step_name}</div>
                    {a.assigned_to && <div>מוקצה ל: {a.assigned_to}</div>}
                    {a.requested_by && <div>בוקש על ידי: {a.requested_by}</div>}
                    {a.due_date && <div>תאריך יעד: {new Date(a.due_date).toLocaleDateString("he-IL")}</div>}
                    {a.action_at && <div>{a.status === "approved" ? "אושר" : "נדחה"}: {formatDate(a.action_at)} על ידי {a.action_by}</div>}
                    {a.comments && <div className="mt-1 text-sm italic">{a.comments}</div>}
                  </div>
                </div>
                {a.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => approve(a.id)}
                      disabled={actionId === a.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-foreground rounded-lg text-xs hover:bg-green-700"
                    >
                      <Check size={12} />אשר
                    </button>
                    <button
                      onClick={() => setShowRejectDialog(a.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-foreground rounded-lg text-xs hover:bg-red-700"
                    >
                      <X size={12} />דחה
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showRejectDialog !== null && (
          <Modal title="דחה בקשת אישור" onClose={() => setShowRejectDialog(null)}>
            <div className="space-y-4 p-5">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">סיבת הדחייה *</label>
                <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="נדרשת סיבה לדחייה..." />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowRejectDialog(null)} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
                <button onClick={() => reject(showRejectDialog!)} className="px-4 py-2 bg-red-600 text-foreground rounded-lg text-sm hover:bg-red-700">דחה</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function VersionsTab() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [diffData, setDiffData] = useState<any | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffVersions, setDiffVersions] = useState<{ v1: number; v2: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`${API}/dms/search`, { headers: authHeaders() });
        if (res.ok) setFiles(await res.json());
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const loadVersions = async (file: any) => {
    setSelectedFile(file);
    setVersionsLoading(true);
    try {
      const res = await authFetch(`${API}/dms/files/${file.id}/versions`, { headers: authHeaders() });
      if (res.ok) setVersions(await res.json());
    } catch {}
    setVersionsLoading(false);
  };

  const rollback = async (versionNum: number) => {
    if (!selectedFile) return;
    if (!(await globalConfirm(`לשחזר לגרסה ${versionNum}?`))) return;
    await authFetch(`${API}/dms/files/${selectedFile.id}/rollback/${versionNum}`, { method: "POST", headers: authHeaders() });
    loadVersions(selectedFile);
  };

  const loadDiff = async (v1: number, v2: number) => {
    if (!selectedFile) return;
    setDiffLoading(true);
    setDiffVersions({ v1, v2 });
    try {
      const res = await authFetch(`${API}/dms/files/${selectedFile.id}/versions/${v1}/diff/${v2}`, { headers: authHeaders() });
      if (res.ok) setDiffData(await res.json());
    } catch {}
    setDiffLoading(false);
  };

  const uploadVersion = async () => {
    if (!selectedFile || !fileInput) return;
    const fd = new FormData();
    fd.append("file", fileInput);
    fd.append("changeNote", changeNote);
    await authFetch(`${API}/dms/files/${selectedFile.id}/versions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok()}` },
      body: fd,
    });
    setShowUpload(false);
    setFileInput(null);
    setChangeNote("");
    loadVersions(selectedFile);
  };

  if (selectedFile) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => setSelectedFile(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} />חזרה לרשימה
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">{selectedFile.name}</h2>
            <p className="text-sm text-muted-foreground">גרסה נוכחית: v{selectedFile.current_version || 1}</p>
          </div>
          {!selectedFile.is_legal_hold && (
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-foreground rounded-lg text-sm hover:bg-indigo-700">
              <FileUp size={14} />העלה גרסה חדשה
            </button>
          )}
        </div>

        {showUpload && (
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1">קובץ</label>
              <input type="file" onChange={e => setFileInput(e.target.files?.[0] || null)} className="text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground block mb-1">הערת שינוי</label>
              <input value={changeNote} onChange={e => setChangeNote(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="מה השתנה?" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowUpload(false)} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
              <button onClick={uploadVersion} disabled={!fileInput} className="px-4 py-2 bg-indigo-600 text-foreground rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">העלה גרסה</button>
            </div>
          </div>
        )}

        {versionsLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">טוען גרסאות...</div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History size={40} className="mx-auto mb-2 opacity-30" />
            <p>אין היסטוריית גרסאות</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {versions.map((v: any, idx: number) => (
                <div key={v.id} className="bg-card border rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-indigo-600">v{v.version_number}</span>
                      {v.version_number === (selectedFile.current_version || 1) && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">נוכחית</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{v.original_name} • {formatSize(Number(v.size))} • {formatDate(v.created_at)}</div>
                    {v.change_note && <div className="text-xs text-muted-foreground mt-1 italic">{v.change_note}</div>}
                    <div className="text-xs text-muted-foreground">על ידי: {v.created_by}</div>
                  </div>
                  <div className="flex gap-2">
                    {idx < versions.length - 1 && (
                      <button
                        onClick={() => loadDiff(versions[idx + 1].version_number, v.version_number)}
                        className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-blue-50 text-blue-600"
                      >
                        <Eye size={12} />השוואה
                      </button>
                    )}
                    {v.version_number !== (selectedFile.current_version || 1) && !selectedFile.is_legal_hold && (
                      <button onClick={() => rollback(v.version_number)} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-muted">
                        <RotateCcw size={12} />שחזר
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {diffLoading && (
              <div className="text-center py-4 text-muted-foreground text-sm">טוען השוואה...</div>
            )}

            {diffData && diffVersions && !diffLoading && (
              <div className="bg-card border rounded-xl p-5 space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Eye size={16} className="text-blue-600" />
                    השוואת גרסאות: v{diffVersions.v1} ↔ v{diffVersions.v2}
                  </h3>
                  <button onClick={() => { setDiffData(null); setDiffVersions(null); }} className="text-xs text-muted-foreground hover:text-foreground">סגור</button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="font-medium text-red-700 mb-1">v{diffVersions.v1} (ישנה)</div>
                    <div className="text-xs text-muted-foreground">{diffData.version1.name} • {formatSize(diffData.version1.size)}</div>
                    {diffData.version1.changeNote && <div className="text-xs mt-1 italic">{diffData.version1.changeNote}</div>}
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="font-medium text-green-700 mb-1">v{diffVersions.v2} (חדשה)</div>
                    <div className="text-xs text-muted-foreground">{diffData.version2.name} • {formatSize(diffData.version2.size)}</div>
                    {diffData.version2.changeNote && <div className="text-xs mt-1 italic">{diffData.version2.changeNote}</div>}
                  </div>
                </div>

                {diffData.metadataChanges?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">שינויי מטא-נתונים</h4>
                    <div className="space-y-1">
                      {diffData.metadataChanges.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{c.field}:</span>
                          <span className="bg-red-100 text-red-700 px-1 rounded line-through">{String(c.from)}</span>
                          <span>→</span>
                          <span className="bg-green-100 text-green-700 px-1 rounded">{String(c.to)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {diffData.textDiff && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">השוואת תוכן</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-red-50 border rounded p-2 max-h-60 overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono" dir="auto">{diffData.textDiff.from.substring(0, 5000)}</pre>
                      </div>
                      <div className="bg-green-50 border rounded p-2 max-h-60 overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono" dir="auto">{diffData.textDiff.to.substring(0, 5000)}</pre>
                      </div>
                    </div>
                  </div>
                )}

                {!diffData.textDiff && diffData.metadataChanges?.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    אין שינויים נראים בין הגרסאות (הקובץ הוחלף)
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="font-bold text-lg">בחר מסמך לצפייה בגרסאות</h2>
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">טוען...</div>
      ) : (
        <div className="grid gap-2">
          {files.map((file: any) => (
            <button
              key={file.id}
              onClick={() => loadVersions(file)}
              className="bg-card border rounded-xl p-4 flex items-center gap-3 text-right hover:border-indigo-300 transition-colors"
            >
              <FileText size={20} className="text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">גרסה v{file.current_version || 1} • {file.folder_name || "ללא תיקייה"}</div>
              </div>
              <History size={16} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SharingTab() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/dms/share-links`, { headers: authHeaders() });
      if (res.ok) setLinks(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deactivate = async (id: number) => {
    if (!(await globalConfirm("לבטל קישור שיתוף?"))) return;
    await authFetch(`${API}/dms/share-links/${id}`, { method: "DELETE", headers: authHeaders() });
    load();
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/api/dms/shared/${token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    alert(`הועתק: ${url}`);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">קישורי שיתוף פעילים</h2>
        <button onClick={load} className="p-2 border rounded-lg hover:bg-muted"><RefreshCw size={16} /></button>
      </div>
      <p className="text-sm text-muted-foreground">כדי ליצור קישור שיתוף, עבור ל"מאגר מסמכים" ולחץ על כפתור השיתוף</p>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">טוען...</div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Share2 size={48} className="mx-auto mb-3 opacity-30" />
          <p>אין קישורי שיתוף</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link: any) => (
            <div key={link.id} className={`bg-card border rounded-xl p-4 ${!link.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium mb-1">{link.file_name}</div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${link.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {link.is_active ? "פעיל" : "מבוטל"}
                      </span>
                      {link.require_watermark && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">סימן מים</span>}
                      {!link.allow_download && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs">ללא הורדה</span>}
                    </div>
                    <div>צפיות: {link.view_count}{link.max_views ? ` / ${link.max_views}` : ""}</div>
                    {link.expires_at && <div>פג תוקף: {new Date(link.expires_at).toLocaleDateString("he-IL")}</div>}
                    <div>נוצר: {new Date(link.created_at).toLocaleDateString("he-IL")}</div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {link.is_active && (
                    <>
                      <button onClick={() => copyLink(link.token)} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-muted">
                        <Link2 size={12} />העתק
                      </button>
                      <button onClick={() => deactivate(link.id)} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-red-50 text-red-600">
                        <X size={12} />בטל
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegalHoldTab() {
  const [holds, setHolds] = useState<any[]>([]);
  const [filesOnHold, setFilesOnHold] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [showNewHold, setShowNewHold] = useState(false);
  const [newHoldForm, setNewHoldForm] = useState({ caseName: "", description: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [holdsRes, filesRes] = await Promise.all([
        authFetch(`${API}/dms/legal-holds`, { headers: authHeaders() }),
        authFetch(`${API}/dms/files-on-hold${selectedCase ? `?caseName=${encodeURIComponent(selectedCase)}` : ""}`, { headers: authHeaders() }),
      ]);
      if (holdsRes.ok) setHolds(await holdsRes.json());
      if (filesRes.ok) setFilesOnHold(await filesRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedCase]);

  const releaseHold = async (holdId: number) => {
    if (!(await globalConfirm("לשחרר את העצירה המשפטית? כל המסמכים הקשורים לתיק זה ישוחררו."))) return;
    const releaseNote = prompt("הוסף הערה לשחרור (אופציונלי):");
    await authFetch(`${API}/dms/legal-holds/${holdId}/release`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ releaseNote: releaseNote || "" }),
    });
    load();
  };

  const createHold = async () => {
    if (!newHoldForm.caseName.trim()) return;
    await authFetch(`${API}/dms/legal-holds`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(newHoldForm),
    });
    setShowNewHold(false);
    setNewHoldForm({ caseName: "", description: "" });
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg flex items-center gap-2"><Gavel className="text-orange-600" size={20} />ניהול עצירות משפטיות</h2>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-muted"><RefreshCw size={16} /></button>
          <button onClick={() => setShowNewHold(true)} className="flex items-center gap-1 px-4 py-2 bg-orange-600 text-foreground rounded-lg text-sm hover:bg-orange-700">
            <Plus size={14} />תיק חדש
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-3 text-sm">תיקים פעילים</h3>
          {loading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">טוען...</div>
          ) : holds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-card border rounded-xl">
              <Gavel size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">אין עצירות משפטיות</p>
            </div>
          ) : (
            <div className="space-y-2">
              {holds.map((hold: any) => (
                <div
                  key={hold.id}
                  onClick={() => setSelectedCase(selectedCase === hold.case_name ? null : hold.case_name)}
                  className={`bg-card border rounded-xl p-4 cursor-pointer transition-colors ${selectedCase === hold.case_name ? "border-orange-400 bg-orange-50/30" : "hover:border-orange-200"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {hold.case_name}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${hold.status === "active" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                          {hold.status === "active" ? "פעיל" : "שוחרר"}
                        </span>
                      </div>
                      {hold.description && <div className="text-xs text-muted-foreground mt-0.5">{hold.description}</div>}
                      <div className="text-xs text-muted-foreground mt-1">נוצר: {new Date(hold.created_at).toLocaleDateString("he-IL")}</div>
                      {hold.released_at && <div className="text-xs text-muted-foreground">שוחרר: {new Date(hold.released_at).toLocaleDateString("he-IL")}</div>}
                    </div>
                    {hold.status === "active" && (
                      <button
                        onClick={e => { e.stopPropagation(); releaseHold(hold.id); }}
                        className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-green-50 text-green-600 shrink-0"
                      >
                        <Unlock size={12} />שחרר
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-3 text-sm">
            {selectedCase ? `מסמכים בתיק: ${selectedCase}` : "כל המסמכים בעצירה"}
          </h3>
          {filesOnHold.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-card border rounded-xl">
              <FileText size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">אין מסמכים</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filesOnHold.map((file: any) => (
                <div key={file.id} className="bg-card border rounded-xl p-3 flex items-center gap-3">
                  <Gavel size={16} className="text-orange-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{file.folder_name || "ללא תיקייה"} • {file.legal_hold_case}</div>
                    {file.legal_hold_at && <div className="text-xs text-muted-foreground">בוצע: {new Date(file.legal_hold_at).toLocaleDateString("he-IL")}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showNewHold && (
          <Modal title="יצירת עצירה משפטית חדשה" onClose={() => setShowNewHold(false)}>
            <div className="space-y-4 p-5">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">שם התיק *</label>
                <input value={newHoldForm.caseName} onChange={e => setNewHoldForm(f => ({ ...f, caseName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="לדוג׳: תיק בית משפט 2024-001" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">תיאור</label>
                <textarea value={newHoldForm.description} onChange={e => setNewHoldForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewHold(false)} className="px-4 py-2 bg-muted rounded-lg text-sm">ביטול</button>
                <button onClick={createHold} className="px-4 py-2 bg-orange-600 text-foreground rounded-lg text-sm hover:bg-orange-700 flex items-center gap-1">
                  <Gavel size={14} />צור עצירה
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="bg-card border rounded-2xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg"><X size={16} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
