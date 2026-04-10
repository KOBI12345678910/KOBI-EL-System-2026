import { usePermissions } from "@/hooks/use-permissions";
import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Folder, FolderOpen, Upload, Plus, Search, Grid3X3, List, LayoutGrid,
  File, FileText, FileImage, FileArchive, Film, Music, ChevronRight,
  Trash2, Download, Edit2, X, Check, RotateCcw, Star, Share2, Tag,
  HardDrive, Clock, Building2, Users, Inbox, Brain, Sparkles, CheckCircle2,
  AlertCircle, Loader2, FileCheck, ArrowLeftRight, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  color: string;
  icon: string;
  description: string;
  isSystem: boolean;
  fileCount: number;
  createdAt: string;
}

interface DocFile {
  id: number;
  name: string;
  originalName: string;
  folderId: number | null;
  mimeType: string;
  size: number;
  filePath: string;
  thumbnailPath: string | null;
  tags: string[];
  description: string;
  uploadedBy: string;
  isTrashed: boolean;
  createdAt: string;
}

interface Stats {
  totalFolders: number;
  totalFiles: number;
  totalSize: number;
  recentFiles: DocFile[];
}

interface AIProcessResult {
  fileName: string;
  docId: number;
  status: string;
  documentType?: string;
  extractedData?: any;
  distributionLog?: any;
  folderId?: number;
  folderName?: string;
  error?: string;
}

interface AIProcessSummary {
  total: number;
  succeeded: number;
  failed: number;
  suppliersCreated: number;
  expensesCreated: number;
  apCreated: number;
  journalEntries: number;
  materialsUpdated: number;
}

const SIDEBAR_ITEMS = [
  { id: "all", label: "הכל", icon: HardDrive },
  { id: "company", label: "חברה", icon: Building2 },
  { id: "my-drive", label: "My Drive", icon: Star },
  { id: "shared", label: "משותף איתי", icon: Users },
  { id: "recent", label: "אחרון", icon: Clock },
  { id: "trash", label: "אשפה", icon: Trash2 },
];

function getFileIcon(mimeType: string, className = "text-blue-500") {
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType.startsWith("video/")) return <Film className={className} />;
  if (mimeType.startsWith("audio/")) return <Music className={className} />;
  if (mimeType.includes("pdf")) return <FileText className={`${className} text-red-500`} />;
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar")) return <FileArchive className={`${className} text-yellow-600`} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileText className={`${className} text-green-600`} />;
  if (mimeType.includes("word") || mimeType.includes("document")) return <FileText className={`${className} text-blue-600`} />;
  return <File className={className} />;
}

function hasImagePreview(file: DocFile): boolean {
  return file.thumbnailPath !== null && file.mimeType.startsWith("image/");
}

function FilePreviewThumbnail({ file, className }: { file: DocFile; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch(`${API}/document-files/${file.id}/preview`, { headers: headers() })
      .then(res => {
        if (!res.ok) throw new Error("Preview failed");
        return res.blob();
      })
      .then(blob => {
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [file.id]);

  if (!blobUrl) return getFileIcon(file.mimeType, className || "");

  return (
    <img
      src={blobUrl}
      alt={file.name}
      className={`object-cover rounded ${className || ""}`}
      loading="lazy"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}


const r: any[] = [];
export default function DocumentsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeSection, setActiveSection] = useState("all");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<DocFile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#6366f1");
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [smartUpload, setSmartUpload] = useState(true);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResults, setAiResults] = useState<AIProcessResult[]>([]);
  const [aiSummary, setAiSummary] = useState<AIProcessSummary | null>(null);
  const [showAiResults, setShowAiResults] = useState(false);
  const [processingFileId, setProcessingFileId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const formValidation = useFormValidation({ name: { required: true, message: "שם מסמך נדרש" } });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [fRes, sRes] = await Promise.all([
      authFetch(`${API}/document-folders`, { headers: headers() }),
      authFetch(`${API}/document-stats`, { headers: headers() }),
    ]);
    if (fRes.ok) setFolders(await fRes.json());
    if (sRes.ok) setStats(await sRes.json());
  }, []);

  const loadFiles = useCallback(async (folderId?: number, trash = false) => {
    const params = new URLSearchParams();
    if (folderId !== undefined) params.set("folderId", folderId.toString());
    if (trash) params.set("trashed", "true");
    if (search) params.set("search", search);
    const res = await authFetch(`${API}/document-files?${params}`, { headers: headers() });
    if (res.ok) setFiles(await res.json());
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeSection === "trash") {
      loadFiles(undefined, true);
    } else if (selectedFolder) {
      loadFiles(selectedFolder.id);
    } else if (activeSection === "recent") {
      loadFiles();
    } else {
      loadFiles();
    }
  }, [activeSection, selectedFolder, search, loadFiles]);

  const handleFolderClick = (folder: Folder) => {
    setSelectedFolder(folder);
    setActiveSection("folder");
    setSelected(new Set());
  };

  const handleSidebarClick = (id: string) => {
    setActiveSection(id);
    setSelectedFolder(null);
    setSelected(new Set());
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await authFetch(`${API}/document-folders`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: newFolderName, color: newFolderColor, parentId: selectedFolder?.id }),
    });
    setNewFolderName("");
    setShowNewFolder(false);
    load();
  };

  const deleteFolder = async (id: number) => {
    const folder = folders.find((f: any) => f.id === id);
    if (!(await globalConfirm("למחוק תיקייה?", { itemName: folder?.name || String(id), entityType: "תיקייה" }))) return;
    await authFetch(`${API}/document-folders/${id}`, { method: "DELETE", headers: headers() });
    load();
    if (selectedFolder?.id === id) setSelectedFolder(null);
  };

  const saveEditFolder = async () => {
    if (!editingFolder || !editFolderName.trim()) return;
    await authFetch(`${API}/document-folders/${editingFolder.id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ name: editFolderName }),
    });
    setEditingFolder(null);
    load();
  };

  const uploadFiles = async (fileList: FileList) => {
    if (smartUpload) {
      await smartUploadFiles(fileList);
      return;
    }
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      if (selectedFolder) fd.append("folderId", selectedFolder.id.toString());
      await authFetch(`${API}/document-files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
    }
    setUploading(false);
    load();
    if (selectedFolder) loadFiles(selectedFolder.id);
    else loadFiles();
  };

  const smartUploadFiles = async (fileList: FileList) => {
    setUploading(true);
    setAiProcessing(true);
    setAiResults([]);
    setAiSummary(null);
    setShowAiResults(true);

    const fd = new FormData();
    for (const file of Array.from(fileList)) {
      fd.append("files", file);
    }

    try {
      const res = await authFetch(`${API}/ai-documents/smart-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });

      if (res.ok) {
        const data = await res.json();
        setAiResults(data.results || []);
        setAiSummary(data.summary || null);
      } else {
        const err = await res.json().catch(() => ({ error: "שגיאה לא ידועה" }));
        setAiResults([{ fileName: "שגיאה", docId: 0, status: "failed", error: err.error }]);
      }
    } catch (err: any) {
      setAiResults([{ fileName: "שגיאה", docId: 0, status: "failed", error: err.message }]);
    }

    setAiProcessing(false);
    setUploading(false);
    load();
    if (selectedFolder) loadFiles(selectedFolder.id);
    else loadFiles();
  };

  const processExistingFile = async (fileId: number) => {
    setProcessingFileId(fileId);
    try {
      const res = await authFetch(`${API}/ai-documents/process-existing-file`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ fileId }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiResults([{
          fileName: data.extractedData?.supplierName || "מסמך",
          docId: data.docId,
          status: "completed",
          documentType: data.documentType,
          extractedData: data.extractedData,
          distributionLog: data.distributionLog,
          folderName: data.assignedFolder,
        }]);
        setShowAiResults(true);
      }
    } catch {}
    setProcessingFileId(null);
    load();
    if (selectedFolder) loadFiles(selectedFolder.id);
    else loadFiles();
  };

  const deleteFile = async (id: number, permanent = false) => {
    await authFetch(`${API}/document-files/${id}${permanent ? "?permanent=true" : ""}`, {
      method: "DELETE",
      headers: headers(),
    });
    load();
    if (selectedFolder) loadFiles(selectedFolder.id);
    else loadFiles();
  };

  const restoreFile = async (id: number) => {
    await authFetch(`${API}/document-files/${id}/restore`, { method: "PUT", headers: headers() });
    loadFiles(undefined, true);
    load();
  };

  const downloadFile = async (file: DocFile) => {
    const res = await authFetch(`${API}/document-files/${file.id}/download`, { headers: headers() });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.originalName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const filteredFolders = folders.filter(f => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeSection === "company") return f.isSystem;
    if (activeSection === "my-drive") return !f.isSystem;
    return true;
  });

  const filteredFiles = (() => {
    if (activeSection === "recent") {
      return [...files].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
    }
    if (activeSection === "shared") {
      const systemFolderIds = new Set(folders.filter(f => f.isSystem).map(f => f.id));
      return files.filter(f => f.folderId !== null && systemFolderIds.has(f.folderId));
    }
    return files;
  })();

  const isTrash = activeSection === "trash";
  const inFolder = activeSection === "folder" && selectedFolder;

  const breadcrumbs = [
    { label: "מסמכים", onClick: () => { setSelectedFolder(null); setActiveSection("all"); } },
    ...(selectedFolder ? [{ label: selectedFolder.name, onClick: () => {} }] : []),
  ];

  return (
    <div className="flex h-screen bg-muted/30" dir="rtl">
      <aside className="w-56 bg-card border-l flex flex-col shrink-0 shadow-sm">
        <div className="p-4 border-b">
          <h2 className="font-bold text-foreground text-lg flex items-center gap-2">
            <FileText size={20} className="text-indigo-600" /> מסמכים
          </h2>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {SIDEBAR_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => handleSidebarClick(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSection === item.id
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t text-xs text-muted-foreground space-y-1">
          {stats && (
            <>
              <div>{stats.totalFiles} קבצים</div>
              <div>{formatSize(stats.totalSize || 0)} בשימוש</div>
            </>
          )}
        </div>
      </aside>

      <div
        ref={dropZoneRef}
        className={`flex-1 flex flex-col overflow-hidden relative transition-all ${isDragging ? "ring-4 ring-inset ring-indigo-300 bg-indigo-50/50" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-50/80 backdrop-blur-sm">
            <div className="text-center">
              <Upload size={48} className="text-indigo-500 mx-auto mb-3" />
              <p className="text-xl font-bold text-indigo-700">שחרר להעלאה</p>
            </div>
          </div>
        )}

        <header className="bg-card border-b px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={14} />}
                <button onClick={b.onClick} className={i === breadcrumbs.length - 1 ? "font-semibold text-foreground" : "hover:text-indigo-600"}>
                  {b.label}
                </button>
              </span>
            ))}
          </div>

          <div className="flex-1" />

          <div className="relative">
            <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש מסמכים..."
              className="pr-9 pl-4 py-2 text-sm border rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "bg-indigo-100 text-indigo-700" : "text-muted-foreground hover:text-muted-foreground"}`} title="גריד"><Grid3X3 size={16} /></button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded ${viewMode === "list" ? "bg-indigo-100 text-indigo-700" : "text-muted-foreground hover:text-muted-foreground"}`} title="רשימה"><List size={16} /></button>
            <button onClick={() => setViewMode("kanban")} className={`p-1.5 rounded ${viewMode === "kanban" ? "bg-indigo-100 text-indigo-700" : "text-muted-foreground hover:text-muted-foreground"}`} title="כנבן"><LayoutGrid size={16} /></button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="flex items-center gap-1.5 bg-indigo-600 text-foreground px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm"
            >
              <Plus size={16} /> חדש
            </button>
            <AnimatePresence>
              {showNewMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute left-0 top-10 bg-card border rounded-xl shadow-lg py-1 z-30 w-44"
                >
                  <button
                    onClick={() => { setShowNewMenu(false); setShowNewFolder(true); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30"
                  >
                    <Folder size={16} className="text-indigo-500" /> תיקייה חדשה
                  </button>
                  <button
                    onClick={() => { setShowNewMenu(false); fileInputRef.current?.click(); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30"
                  >
                    <Upload size={16} className="text-green-500" /> העלאת קובץ
                  </button>
                  <div className="border-t mx-2 my-1" />
                  <button
                    onClick={() => { setSmartUpload(!smartUpload); setShowNewMenu(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30"
                  >
                    <Brain size={16} className={smartUpload ? "text-purple-500" : "text-muted-foreground"} />
                    <span className="flex-1 text-start">עיבוד AI</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${smartUpload ? "bg-purple-100 text-purple-700" : "bg-muted/50 text-muted-foreground"}`}>
                      {smartUpload ? "פעיל" : "כבוי"}
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) uploadFiles(e.target.files); }}
          />
        </header>

        {smartUpload && (
          <div className="bg-purple-50 border-b border-purple-200 px-6 py-1.5 text-xs text-purple-700 flex items-center gap-2">
            <Sparkles size={14} className="text-purple-500" />
            <span className="font-medium">עיבוד חכם פעיל</span> — קבצים שיועלו יעברו זיהוי AI אוטומטי, סיווג לתיקיות, וסנכרון למודולים (ספקים, הוצאות, חשבוניות, חו"ג, חומרי גלם)
          </div>
        )}

        {uploading && (
          <div className={`border-b px-6 py-2 text-sm flex items-center gap-2 ${aiProcessing ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-indigo-50 border-indigo-200 text-indigo-700"}`}>
            <Loader2 size={16} className="animate-spin" />
            {aiProcessing ? "מעבד עם AI — מזהה סוג מסמך, מחלץ נתונים ומסנכרן למודולים..." : "מעלה קבצים..."}
          </div>
        )}

        <AnimatePresence>
          {showAiResults && aiResults.length > 0 && !aiProcessing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b overflow-hidden"
            >
              <div className="bg-gradient-to-l from-purple-50 to-indigo-50 px-6 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-600" />
                    <span className="font-bold text-sm text-purple-800">תוצאות עיבוד AI</span>
                    {aiSummary && (
                      <span className="text-xs text-purple-600">
                        {aiSummary.succeeded}/{aiSummary.total} הצליחו
                      </span>
                    )}
                  </div>
                  <button onClick={() => setShowAiResults(false)} className="p-1 hover:bg-card/60 rounded">
                    <X size={14} className="text-purple-400" />
                  </button>
                </div>

                {aiSummary && aiSummary.succeeded > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {aiSummary.suppliersCreated > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        <Building2 size={10} /> {aiSummary.suppliersCreated} ספקים חדשים
                      </span>
                    )}
                    {aiSummary.expensesCreated > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                        <FileText size={10} /> {aiSummary.expensesCreated} הוצאות
                      </span>
                    )}
                    {aiSummary.apCreated > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        <ArrowLeftRight size={10} /> {aiSummary.apCreated} חשבונות לתשלום
                      </span>
                    )}
                    {aiSummary.journalEntries > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <FileCheck size={10} /> {aiSummary.journalEntries} פקודות יומן
                      </span>
                    )}
                    {aiSummary.materialsUpdated > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        <Tag size={10} /> {aiSummary.materialsUpdated} חומרי גלם
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {aiResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${r.status === "completed" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                      {r.status === "completed" ? <CheckCircle2 size={12} className="text-green-500 shrink-0" /> : <AlertCircle size={12} className="text-red-500 shrink-0" />}
                      <span className="font-medium truncate max-w-[200px]">{r.fileName}</span>
                      {r.documentType && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">{r.documentType}</span>}
                      {r.folderName && <span className="text-muted-foreground">→ {r.folderName}</span>}
                      {r.distributionLog?.supplier && (
                        <span className="text-blue-600">ספק: {r.distributionLog.supplier.name}{r.distributionLog.supplier.isNew ? " (חדש)" : ""}</span>
                      )}
                      {r.distributionLog?.expense && <span className="text-orange-600">הוצאה #{r.distributionLog.expense.id}</span>}
                      {r.distributionLog?.accountsPayable && <span className="text-red-600">חשבון #{r.distributionLog.accountsPayable.id}</span>}
                      {r.distributionLog?.journalEntry && <span className="text-green-600">פקו"י #{r.distributionLog.journalEntry.id}</span>}
                      {r.error && <span className="text-red-600">{r.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-6">
          {showNewFolder && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-card border rounded-xl p-4 shadow-sm flex items-center gap-3"
            >
              <input
                type="color"
                value={newFolderColor}
                onChange={e => setNewFolderColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border"
              />
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
                placeholder="שם תיקייה"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button onClick={createFolder} className="p-2 text-green-600 hover:bg-green-50 rounded-lg"><Check size={18} /></button>
              <button onClick={() => setShowNewFolder(false)} className="p-2 text-muted-foreground hover:bg-muted/30 rounded-lg"><X size={18} /></button>
            </motion.div>
          )}

          {!inFolder && !isTrash && (
            <>
              <div className="mb-4">
                <h3 className="font-semibold text-foreground mb-3 text-sm uppercase tracking-wide">תיקיות</h3>

                {viewMode === "list" ? (
                  <div className="bg-card rounded-xl border divide-y">
                    {filteredFolders.length === 0 && (
                      <div className="py-10 text-center text-muted-foreground text-sm">אין תיקיות</div>
                    )}
                    {filteredFolders.map(folder => (
                      <div
                        key={folder.id}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 cursor-pointer group"
                        onClick={() => handleFolderClick(folder)}
                      >
                        <input type="checkbox" className="rounded" checked={selected.has(folder.id)} onChange={() => toggleSelect(folder.id)} onClick={e => e.stopPropagation()} />
                        <Folder size={20} style={{ color: folder.color }} />
                        <span className="flex-1 font-medium text-sm">{folder.name}</span>
                        <span className="text-xs text-muted-foreground">{folder.fileCount} קבצים</span>
                        <span className="text-xs text-muted-foreground">{formatDate(folder.createdAt)}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <button onClick={e => { e.stopPropagation(); setEditingFolder(folder); setEditFolderName(folder.name); }} className="p-1 hover:bg-muted rounded text-muted-foreground"><Edit2 size={14} /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/document-files`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }} className="p-1 hover:bg-red-500/10 rounded text-red-400"><Trash2 size={14} /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : viewMode === "kanban" ? (
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {filteredFolders.map(folder => (
                      <div
                        key={folder.id}
                        className="min-w-0 sm:min-w-[200px] bg-card rounded-xl border shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow group"
                        onClick={() => handleFolderClick(folder)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Folder size={28} style={{ color: folder.color }} />
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                            <button onClick={e => { e.stopPropagation(); setEditingFolder(folder); setEditFolderName(folder.name); }} className="p-1 hover:bg-muted/50 rounded"><Edit2 size={12} /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/document-files`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }} className="p-1 hover:bg-red-500/10 rounded text-red-400"><Trash2 size={12} /></button>}
                          </div>
                        </div>
                        <div className="font-semibold text-sm text-foreground">{folder.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">{folder.fileCount} קבצים</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {filteredFolders.length === 0 && (
                      <div className="col-span-full py-10 text-center text-muted-foreground text-sm">אין תיקיות</div>
                    )}
                    {filteredFolders.map(folder => (
                      <motion.div
                        key={folder.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group relative bg-card rounded-xl border hover:shadow-md transition-all cursor-pointer p-3"
                        onClick={() => handleFolderClick(folder)}
                      >
                        <input
                          type="checkbox"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded z-10"
                          checked={selected.has(folder.id)}
                          onChange={() => toggleSelect(folder.id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="flex justify-center mb-2 pt-2">
                          <Folder size={36} style={{ color: folder.color }} />
                        </div>

                        {editingFolder?.id === folder.id ? (
                          <div onClick={e => e.stopPropagation()} className="flex flex-col gap-1 mt-1">
                            <input
                              autoFocus
                              value={editFolderName}
                              onChange={e => setEditFolderName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveEditFolder(); if (e.key === "Escape") setEditingFolder(null); }}
                              className="w-full border rounded px-2 py-1 text-xs text-center"
                            />
                            <div className="flex justify-center gap-1">
                              <button onClick={saveEditFolder} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={12} /></button>
                              <button onClick={() => setEditingFolder(null)} className="p-1 text-muted-foreground hover:bg-muted/30 rounded"><X size={12} /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-foreground text-center truncate">{folder.name}</p>
                            <p className="text-xs text-muted-foreground text-center">{folder.fileCount} קבצים</p>
                          </>
                        )}

                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 flex gap-0.5">
                          <button onClick={e => { e.stopPropagation(); setEditingFolder(folder); setEditFolderName(folder.name); }} className="p-1 bg-card/80 hover:bg-card rounded shadow text-muted-foreground"><Edit2 size={12} /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/document-files`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={e => { e.stopPropagation(); deleteFolder(folder.id); }} className="p-1 bg-card/80 hover:bg-card rounded shadow text-red-400"><Trash2 size={12} /></button>}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {stats?.recentFiles && stats.recentFiles.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold text-foreground mb-3 text-sm uppercase tracking-wide">קבצים אחרונים</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {stats.recentFiles.map(file => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group bg-card rounded-xl border hover:shadow-md transition-all p-3 cursor-pointer"
                        onClick={() => downloadFile(file)}
                      >
                        <div className="flex justify-center mb-2 pt-2 text-muted-foreground">
                          {hasImagePreview(file) ? (
                            <FilePreviewThumbnail file={file} className="w-full h-20 object-cover rounded-lg" />
                          ) : (
                            getFileIcon(file.mimeType, "w-9 h-9")
                          )}
                        </div>
                        <p className="text-xs font-medium text-foreground text-center truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground text-center">{formatSize(file.size)}</p>
                        <div className="mt-2 opacity-0 group-hover:opacity-100 flex justify-center gap-1">
                          <button onClick={e => { e.stopPropagation(); downloadFile(file); }} className="p-1 bg-muted/50 hover:bg-indigo-100 rounded text-muted-foreground"><Download size={12} /></button>
                          {isSuperAdmin && <button onClick={e => { e.stopPropagation(); deleteFile(file.id); }} className="p-1 bg-muted/50 hover:bg-red-500/10 rounded text-red-400"><Trash2 size={12} /></button>}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {(!filteredFolders.length && (!stats?.recentFiles || !stats.recentFiles.length)) && (
                <div className="py-20 text-center">
                  <Inbox size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-muted-foreground text-lg font-medium">אין מסמכים עדיין</p>
                  <p className="text-slate-300 text-sm mt-1">גרור קבצים לכאן או לחץ על "חדש" להתחיל</p>
                </div>
              )}
            </>
          )}

          {inFolder && (
            <FilesView
              folder={selectedFolder!}
              files={filteredFiles}
              viewMode={viewMode}
              selected={selected}
              onToggleSelect={toggleSelect}
              onDelete={isSuperAdmin ? deleteFile : undefined}
              onDownload={downloadFile}
              onUpload={() => fileInputRef.current?.click()}
              onProcessAI={processExistingFile}
              processingFileId={processingFileId}
            />
          )}

          {(activeSection === "recent" || activeSection === "shared") && !selectedFolder && (
            <div>
              <h3 className="font-semibold text-foreground mb-3 text-sm uppercase tracking-wide">
                {activeSection === "recent" ? "קבצים אחרונים" : "קבצים משותפים"}
              </h3>
              {filteredFiles.length === 0 ? (
                <div className="py-12 text-center">
                  <Inbox size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-muted-foreground">{activeSection === "recent" ? "אין קבצים אחרונים" : "אין קבצים משותפים"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {filteredFiles.map(file => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group bg-card rounded-xl border hover:shadow-md transition-all p-3 cursor-pointer"
                      onClick={() => downloadFile(file)}
                    >
                      <div className="flex justify-center mb-2 pt-2 text-muted-foreground">
                        {hasImagePreview(file) ? (
                          <FilePreviewThumbnail file={file} className="w-full h-20 object-cover rounded-lg" />
                        ) : (
                          getFileIcon(file.mimeType, "w-9 h-9")
                        )}
                      </div>
                      <p className="text-xs font-medium text-foreground text-center truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground text-center">{formatSize(file.size)}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isTrash && (
            <TrashView
              files={filteredFiles}
              onRestore={restoreFile}
              onDelete={(id) => deleteFile(id, true)}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelectedFile(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  {getFileIcon(selectedFile.mimeType, "w-5 h-5")}
                  {selectedFile.name}
                </h3>
                <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-muted/50 rounded-lg"><X size={20} className="text-muted-foreground" /></button>
              </div>

              <div className="flex border-b px-6">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>

              {detailTab === "details" && (
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">שם מקורי:</span> <span className="font-medium mr-2 text-foreground">{selectedFile.originalName}</span></div>
                    <div><span className="text-muted-foreground">גודל:</span> <span className="font-medium mr-2 text-foreground">{formatSize(selectedFile.size)}</span></div>
                    <div><span className="text-muted-foreground">סוג:</span> <span className="font-medium mr-2 text-foreground">{selectedFile.mimeType}</span></div>
                    <div><span className="text-muted-foreground">הועלה ע"י:</span> <span className="font-medium mr-2 text-foreground">{selectedFile.uploadedBy || "—"}</span></div>
                    <div><span className="text-muted-foreground">תאריך:</span> <span className="font-medium mr-2 text-foreground">{formatDate(selectedFile.createdAt)}</span></div>
                  </div>
                  {selectedFile.description && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">תיאור</div>
                      <p className="text-sm text-foreground">{selectedFile.description}</p>
                    </div>
                  )}
                  {selectedFile.tags && selectedFile.tags.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">תגיות</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedFile.tags.map((tag, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => downloadFile(selectedFile)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-foreground rounded-lg hover:bg-indigo-500 text-sm"><Download size={14} /> הורד</button>
                  </div>
                </div>
              )}
              {detailTab === "related" && (
                <div className="p-6">
                  <RelatedRecords entityType="documents" entityId={selectedFile.id} relations={[
                    { key: "folders", label: "תיקיות", endpoint: "/api/document-folders" },
                  ]} />
                </div>
              )}
              {detailTab === "docs" && (
                <div className="p-6">
                  <AttachmentsSection entityType="documents" entityId={selectedFile.id} />
                </div>
              )}
              {detailTab === "history" && (
                <div className="p-6">
                  <ActivityLog entityType="documents" entityId={selectedFile.id} />
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilesView({
  folder,
  files,
  viewMode,
  selected,
  onToggleSelect,
  onDelete,
  onDownload,
  onUpload,
  onProcessAI,
  processingFileId,
}: {
  folder: Folder;
  files: DocFile[];
  viewMode: string;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onDelete?: (id: number) => void;
  onDownload: (f: DocFile) => void;
  onUpload: () => void;
  onProcessAI?: (fileId: number) => void;
  processingFileId?: number | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Folder size={24} style={{ color: folder.color }} />
        <h2 className="text-lg font-bold text-foreground">{folder.name}</h2>
        <span className="text-sm text-muted-foreground">{files.length} קבצים</span>
        <div className="flex-1" />
        <button onClick={onUpload} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
          <Upload size={14} /> העלאה
        </button>
      </div>

      {files.length === 0 ? (
        <div className="py-20 text-center">
          <FolderOpen size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-muted-foreground text-lg">תיקייה ריקה</p>
          <p className="text-slate-300 text-sm mt-1">גרור קבצים לכאן או לחץ על "העלאה"</p>
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-card rounded-xl border divide-y">
          <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground rounded-t-xl">
            <span className="w-4" />
            <span className="flex-1">שם</span>
            <span className="w-24">גודל</span>
            <span className="w-32">תאריך</span>
            <span className="w-20">פעולות</span>
          </div>
          {files.map(file => (
            <div key={file.id} className="flex items-center gap-4 px-4 py-2.5 hover:bg-muted/30 group">
              <input type="checkbox" className="rounded" checked={selected.has(file.id)} onChange={() => onToggleSelect(file.id)} />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {hasImagePreview(file) ? (
                  <FilePreviewThumbnail file={file} className="w-5 h-5 shrink-0 rounded" />
                ) : (
                  getFileIcon(file.mimeType, "w-5 h-5 shrink-0")
                )}
                <span className="text-sm font-medium truncate">{file.name}</span>
              </div>
              <span className="text-xs text-muted-foreground w-24">{formatSize(file.size)}</span>
              <span className="text-xs text-muted-foreground w-32">{formatDate(file.createdAt)}</span>
              <div className="flex gap-1 w-28 opacity-0 group-hover:opacity-100">
                {onProcessAI && (
                  <button
                    onClick={() => onProcessAI(file.id)}
                    disabled={processingFileId === file.id}
                    className="p-1 hover:bg-purple-100 rounded text-purple-500 disabled:opacity-50"
                    title="עיבוד AI"
                  >
                    {processingFileId === file.id ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                  </button>
                )}
                <button onClick={() => onDownload(file)} className="p-1 hover:bg-indigo-100 rounded text-indigo-500"><Download size={14} /></button>
                {onDelete && <button onClick={() => onDelete(file.id)} className="p-1 hover:bg-red-500/10 rounded text-red-400"><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={viewMode === "kanban" ? "flex gap-3 flex-wrap" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"}>
          {files.map(file => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`group relative bg-card rounded-xl border hover:shadow-md transition-all cursor-pointer p-3 ${viewMode === "kanban" ? "w-44" : ""}`}
              onClick={() => onDownload(file)}
            >
              <input
                type="checkbox"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 rounded z-10"
                checked={selected.has(file.id)}
                onChange={() => onToggleSelect(file.id)}
                onClick={e => e.stopPropagation()}
              />
              <div className="flex justify-center mb-2 pt-2 text-muted-foreground">
                {hasImagePreview(file) ? (
                  <FilePreviewThumbnail file={file} className="w-full h-20 object-cover rounded-lg" />
                ) : (
                  getFileIcon(file.mimeType, "w-10 h-10")
                )}
              </div>
              <p className="text-xs font-semibold text-foreground text-center truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground text-center">{formatSize(file.size)}</p>
              <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 flex gap-0.5">
                {onProcessAI && (
                  <button
                    onClick={e => { e.stopPropagation(); onProcessAI(file.id); }}
                    disabled={processingFileId === file.id}
                    className="p-1 bg-card/80 hover:bg-purple-100 rounded shadow text-purple-500 disabled:opacity-50"
                    title="עיבוד AI"
                  >
                    {processingFileId === file.id ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); onDownload(file); }} className="p-1 bg-card/80 hover:bg-card rounded shadow text-indigo-500"><Download size={12} /></button>
                {onDelete && <button onClick={e => { e.stopPropagation(); onDelete(file.id); }} className="p-1 bg-card/80 hover:bg-card rounded shadow text-red-400"><Trash2 size={12} /></button>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrashView({ files, onRestore, onDelete }: { files: DocFile[]; onRestore: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
        <Trash2 size={20} className="text-muted-foreground" /> אשפה
        {files.length > 0 && <span className="text-sm font-normal text-muted-foreground">({files.length} קבצים)</span>}
      </h2>
      {files.length === 0 ? (
        <div className="py-20 text-center">
          <Trash2 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-muted-foreground text-lg">האשפה ריקה</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border divide-y">
          {files.map(file => (
            <div key={file.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 group">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getFileIcon(file.mimeType, "w-5 h-5 shrink-0 text-muted-foreground")}
                <span className="text-sm text-muted-foreground truncate">{file.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
              <span className="text-xs text-muted-foreground">{formatDate(file.createdAt)}</span>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                <button onClick={() => onRestore(file.id)} className="flex items-center gap-1 text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded border border-green-200">
                  <RotateCcw size={12} /> שחזור
                </button>
                <button onClick={() => onDelete(file.id)} className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded border border-red-200">
                  <Trash2 size={12} /> מחיקה קבועה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
