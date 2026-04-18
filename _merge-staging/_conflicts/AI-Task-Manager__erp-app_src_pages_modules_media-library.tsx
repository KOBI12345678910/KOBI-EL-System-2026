import { usePermissions } from "@/hooks/use-permissions";
import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image, Video, FileText, Upload, Search, X, Eye, Trash2, Plus,
  FolderOpen, Grid3x3, List, Filter, Download, Tag, ChevronDown,
  Film, Music, File, CheckCircle2, Folder, AlertCircle, Share2
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";

interface MediaFile {
  id: number;
  name: string;
  type: "image" | "video" | "document" | "audio" | "other";
  size: number;
  url: string;
  thumbnailUrl?: string;
  album?: string;
  project?: string;
  customer?: string;
  tags: string[];
  uploadedAt: string;
  uploadedBy?: string;
  notes?: string;
  mimeType?: string;
}

interface Album {
  id: number;
  name: string;
  description?: string;
  project?: string;
  customer?: string;
  fileCount: number;
  coverUrl?: string;
  createdAt: string;
}

const FILE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  image: Image,
  video: Video,
  document: FileText,
  audio: Music,
  other: File,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  image: "text-blue-500",
  video: "text-purple-500",
  document: "text-amber-500",
  audio: "text-green-500",
  other: "text-muted-foreground",
};

const FALLBACK_INSTALL_TYPES = [
  "שערים חשמליים", "שערים ידניים", "שערי כניסה", "סורגים", "גדרות",
  "מעקות", "דלתות", "פרגולות", "ויטרינות", "קונסטרוקציות", "אחר"
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("he-IL");
}

function getFileTypeFromMime(mimeType: string): MediaFile["type"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("text")) return "document";
  return "other";
}

const FALLBACK_INITIAL_ALBUMS: Album[] = [
  { id: 1, name: "פרויקט וילה כהן - שערים", description: "תמונות התקנת שערים", project: "פרויקט כהן", customer: "משפחת כהן", fileCount: 12, createdAt: "2026-01-15" },
  { id: 2, name: "פרויקט מסחרי - גדרות", description: "גדרות פאנל מסחריות", project: "מרכז מסחרי ABC", customer: "חברת ABC", fileCount: 8, createdAt: "2026-02-01" },
  { id: 3, name: "מוצרים - קטלוג ראשי", description: "תמונות קטלוג מוצרים", fileCount: 24, createdAt: "2025-11-20" },
  { id: 4, name: "סרטוני הדרכה", description: "סרטוני הכשרה ותפעול", fileCount: 5, createdAt: "2026-01-05" },
];

const FALLBACK_INITIAL_FILES: MediaFile[] = [
  { id: 1, name: "שער_כניסה_פרמיום_1.jpg", type: "image", size: 2.4 * 1024 * 1024, url: "https://picsum.photos/seed/gate1/800/600", thumbnailUrl: "https://picsum.photos/seed/gate1/300/200", album: "פרויקט וילה כהן - שערים", project: "פרויקט כהן", customer: "משפחת כהן", tags: ["שערים", "כניסה", "פרמיום"], uploadedAt: "2026-01-16", uploadedBy: "דן לוי" },
  { id: 2, name: "גדר_פאנל_מסחרי.jpg", type: "image", size: 1.8 * 1024 * 1024, url: "https://picsum.photos/seed/fence1/800/600", thumbnailUrl: "https://picsum.photos/seed/fence1/300/200", album: "פרויקט מסחרי - גדרות", project: "מרכז מסחרי ABC", customer: "חברת ABC", tags: ["גדרות", "מסחרי"], uploadedAt: "2026-02-02", uploadedBy: "משה כהן" },
  { id: 3, name: "מעקה_מרפסת_אלומיניום.jpg", type: "image", size: 3.1 * 1024 * 1024, url: "https://picsum.photos/seed/railing1/800/600", thumbnailUrl: "https://picsum.photos/seed/railing1/300/200", album: "מוצרים - קטלוג ראשי", tags: ["מעקות", "אלומיניום", "מרפסת"], uploadedAt: "2025-12-01" },
  { id: 4, name: "הדרכת_התקנה_שערים.mp4", type: "video", size: 45 * 1024 * 1024, url: "#", album: "סרטוני הדרכה", tags: ["הדרכה", "שערים", "התקנה"], uploadedAt: "2026-01-06" },
  { id: 5, name: "מפרט_טכני_שערים.pdf", type: "document", size: 524 * 1024, url: "#", album: "מוצרים - קטלוג ראשי", tags: ["מפרטים", "שערים"], uploadedAt: "2025-11-22" },
  { id: 6, name: "שרטוט_גדר_פאנל_150.jpg", type: "image", size: 1.2 * 1024 * 1024, url: "https://picsum.photos/seed/drawing1/800/600", thumbnailUrl: "https://picsum.photos/seed/drawing1/300/200", album: "מוצרים - קטלוג ראשי", tags: ["שרטוטים", "גדרות"], uploadedAt: "2025-11-25" },
  { id: 7, name: "תמונת_לפני_אחרי_כהן.jpg", type: "image", size: 4.2 * 1024 * 1024, url: "https://picsum.photos/seed/before1/800/600", thumbnailUrl: "https://picsum.photos/seed/before1/300/200", album: "פרויקט וילה כהן - שערים", project: "פרויקט כהן", customer: "משפחת כהן", tags: ["לפני/אחרי", "שערים"], uploadedAt: "2026-01-20" },
  { id: 8, name: "קטלוג_מוצרים_2026.pdf", type: "document", size: 2.1 * 1024 * 1024, url: "#", album: "מוצרים - קטלוג ראשי", tags: ["קטלוג", "2026"], uploadedAt: "2026-01-01" },
];

export default function MediaLibraryPage() {
  const { data: medialibraryData } = useQuery({
    queryKey: ["media-library"],
    queryFn: () => authFetch("/api/modules/media_library"),
    staleTime: 5 * 60 * 1000,
  });

  const INSTALL_TYPES = medialibraryData ?? FALLBACK_INSTALL_TYPES;
  const INITIAL_ALBUMS = FALLBACK_INITIAL_ALBUMS;
  const INITIAL_FILES = FALLBACK_INITIAL_FILES;

  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [files, setFiles] = useState<MediaFile[]>(INITIAL_FILES);
  const [albums, setAlbums] = useState<Album[]>(INITIAL_ALBUMS);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAlbum, setFilterAlbum] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newAlbumForm, setNewAlbumForm] = useState({ name: "", description: "", project: "", customer: "" });
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => files.filter(f => {
    if (filterType !== "all" && f.type !== filterType) return false;
    if (filterAlbum !== "all" && f.album !== filterAlbum) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.tags.join(",").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [files, filterType, filterAlbum, search]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFilesUpload(droppedFiles);
  }, []);

  const handleFilesUpload = (uploadFiles: File[]) => {
    setUploading(true);
    setUploadProgress(0);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        const newFiles: MediaFile[] = uploadFiles.map((f, i) => ({
          id: Date.now() + i,
          name: f.name,
          type: getFileTypeFromMime(f.type),
          size: f.size,
          url: URL.createObjectURL(f),
          thumbnailUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
          tags: [],
          uploadedAt: new Date().toISOString().slice(0, 10),
          mimeType: f.type,
        }));
        setFiles(prev => [...newFiles, ...prev]);
        setUploading(false);
        setShowUpload(false);
      }
    }, 100);
  };

  const toggleSelect = (id: number) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteFile = (id: number) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selectedFile?.id === id) setSelectedFile(null);
  };

  const deleteSelected = () => {
    setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
    setSelectedFiles(new Set());
  };

  const createAlbum = () => {
    if (!newAlbumForm.name) return;
    const album: Album = {
      id: Date.now(),
      name: newAlbumForm.name,
      description: newAlbumForm.description,
      project: newAlbumForm.project,
      customer: newAlbumForm.customer,
      fileCount: 0,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setAlbums(prev => [album, ...prev]);
    setNewAlbumForm({ name: "", description: "", project: "", customer: "" });
    setShowNewAlbum(false);
  };

  const stats = useMemo(() => ({
    total: files.length,
    images: files.filter(f => f.type === "image").length,
    videos: files.filter(f => f.type === "video").length,
    documents: files.filter(f => f.type === "document").length,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    albums: albums.length,
  }), [files, albums.length]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                <Image className="w-6 h-6 text-foreground" />
              </div>
              מודול מדיה
            </h1>
            <p className="text-muted-foreground mt-1">ניהול מרכזי של תמונות, סרטונים ומסמכים לפי פרויקט ולקוח</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowNewAlbum(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted text-foreground rounded-lg font-medium text-sm"
            >
              <Folder className="w-4 h-4" /> אלבום חדש
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-foreground rounded-lg font-medium text-sm"
            >
              <Upload className="w-4 h-4" /> העלאת קבצים
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "סה״כ קבצים", value: stats.total, icon: File, color: "text-blue-400" },
            { label: "תמונות", value: stats.images, icon: Image, color: "text-violet-400" },
            { label: "סרטונים", value: stats.videos, icon: Film, color: "text-purple-400" },
            { label: "מסמכים", value: stats.documents, icon: FileText, color: "text-amber-400" },
            { label: "אלבומים", value: stats.albums, icon: FolderOpen, color: "text-emerald-400" },
            { label: "נפח כולל", value: formatSize(stats.totalSize), icon: Download, color: "text-muted-foreground" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-muted-foreground text-xs">{s.label}</p>
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-2.5 text-muted-foreground w-4 h-4" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, תג..."
              className="w-full pr-9 pl-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none"
          >
            <option value="all">כל הסוגים</option>
            <option value="image">תמונות</option>
            <option value="video">סרטונים</option>
            <option value="document">מסמכים</option>
            <option value="audio">קבצי שמע</option>
          </select>
          <select
            value={filterAlbum}
            onChange={e => setFilterAlbum(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none"
          >
            <option value="all">כל האלבומים</option>
            {albums.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
          <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded ${viewMode === "list" ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="w-4 h-4" />
            </button>
          </div>
          {selectedFiles.size > 0 && isSuperAdmin && (
            <button onClick={deleteSelected} className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 text-foreground rounded-lg text-sm font-medium">
              <Trash2 className="w-3.5 h-3.5" /> מחק נבחרים ({selectedFiles.size})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-foreground font-medium mb-3 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-violet-400" /> אלבומים
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => setFilterAlbum("all")}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${filterAlbum === "all" ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  <div className="flex items-center justify-between">
                    <span>כל הקבצים</span>
                    <span className="text-xs bg-muted rounded-full px-2 py-0.5">{files.length}</span>
                  </div>
                </button>
                {albums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => setFilterAlbum(album.name)}
                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${filterAlbum === album.name ? "bg-violet-600 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{album.name}</span>
                      <span className="text-xs bg-muted rounded-full px-2 py-0.5 flex-shrink-0">{album.fileCount}</span>
                    </div>
                    {album.customer && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{album.customer}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <Image className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl text-muted-foreground mb-2">אין קבצים</h3>
                <p className="text-muted-foreground">העלה קבצים כדי להתחיל</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filtered.map(file => {
                  const TypeIcon = FILE_TYPE_ICONS[file.type] || File;
                  const iconColor = FILE_TYPE_COLORS[file.type];
                  const isSelected = selectedFiles.has(file.id);
                  return (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`bg-card border rounded-xl overflow-hidden cursor-pointer group relative transition-all ${isSelected ? "border-violet-500" : "border-border hover:border-border"}`}
                      onClick={() => setSelectedFile(file)}
                    >
                      <div className="absolute top-2 right-2 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => { e.stopPropagation(); toggleSelect(file.id); }}
                          className="w-4 h-4 accent-violet-600 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <div className="h-32 bg-muted flex items-center justify-center overflow-hidden">
                        {file.thumbnailUrl ? (
                          <img src={file.thumbnailUrl} alt={file.name} className="w-full h-full object-cover" />
                        ) : (
                          <TypeIcon className={`w-12 h-12 ${iconColor}`} />
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-foreground text-xs font-medium truncate">{file.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-muted-foreground text-xs">{formatSize(file.size)}</span>
                          <span className="text-muted-foreground text-xs">{formatDate(file.uploadedAt)}</span>
                        </div>
                        {file.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {file.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-xs bg-violet-900/40 text-violet-300 px-1.5 py-0.5 rounded">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 flex items-center justify-center gap-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setSelectedFile(file); }} className="p-1 text-foreground hover:text-violet-400">
                          <Eye className="w-4 h-4" />
                        </button>
                        {isSuperAdmin && <button onClick={e => { e.stopPropagation(); deleteFile(file.id); }} className="p-1 text-foreground hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium w-8"></th>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium">שם קובץ</th>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium">סוג</th>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium">אלבום</th>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium">גודל</th>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium">תאריך</th>
                      <th className="px-4 py-3 text-right text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(file => {
                      const TypeIcon = FILE_TYPE_ICONS[file.type] || File;
                      const iconColor = FILE_TYPE_COLORS[file.type];
                      const isSelected = selectedFiles.has(file.id);
                      return (
                        <tr key={file.id} className={`border-b border-border hover:bg-muted/40 transition-colors ${isSelected ? "bg-violet-900/20" : ""}`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(file.id)} className="w-4 h-4 accent-violet-600" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <TypeIcon className={`w-4 h-4 ${iconColor} flex-shrink-0`} />
                              <span className="text-foreground font-medium truncate max-w-[200px]">{file.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{file.type === "image" ? "תמונה" : file.type === "video" ? "סרטון" : file.type === "document" ? "מסמך" : file.type}</td>
                          <td className="px-4 py-3 text-muted-foreground truncate max-w-[150px]">{file.album || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatSize(file.size)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(file.uploadedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => setSelectedFile(file)} className="p-1.5 text-muted-foreground hover:text-violet-400 hover:bg-muted rounded">
                                <Eye className="w-4 h-4" />
                              </button>
                              {isSuperAdmin && <button onClick={() => deleteFile(file.id)} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-muted rounded">
                                <Trash2 className="w-4 h-4" />
                              </button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => !uploading && setShowUpload(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">העלאת קבצים</h2>
                {!uploading && <button onClick={() => setShowUpload(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>}
              </div>
              <div className="p-6 space-y-4">
                <div
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragOver ? "border-violet-500 bg-violet-900/20" : "border-border hover:border-gray-500"}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-medium mb-1">גרור קבצים לכאן</p>
                  <p className="text-muted-foreground text-sm">או לחץ לבחירת קבצים</p>
                  <p className="text-muted-foreground text-xs mt-2">תמונות, סרטונים, מסמכים ועוד</p>
                  <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={e => e.target.files && handleFilesUpload(Array.from(e.target.files))} />
                </div>
                {uploading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">מעלה קבצים...</span>
                      <span className="text-violet-400">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-violet-600 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewAlbum && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setShowNewAlbum(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">אלבום חדש</h2>
                <button onClick={() => setShowNewAlbum(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שם האלבום *</label>
                  <input value={newAlbumForm.name} onChange={e => setNewAlbumForm({ ...newAlbumForm, name: e.target.value })} placeholder='למשל: פרויקט כהן - שערים' className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">תיאור</label>
                  <input value={newAlbumForm.description} onChange={e => setNewAlbumForm({ ...newAlbumForm, description: e.target.value })} placeholder="תיאור קצר..." className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-violet-500" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">פרויקט</label>
                    <input value={newAlbumForm.project} onChange={e => setNewAlbumForm({ ...newAlbumForm, project: e.target.value })} placeholder="שם פרויקט" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">לקוח</label>
                    <input value={newAlbumForm.customer} onChange={e => setNewAlbumForm({ ...newAlbumForm, customer: e.target.value })} placeholder="שם לקוח" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:outline-none focus:border-violet-500" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={createAlbum} className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-foreground rounded-lg font-medium text-sm">
                    צור אלבום
                  </button>
                  <button onClick={() => setShowNewAlbum(false)} className="px-4 py-2.5 text-muted-foreground hover:text-foreground text-sm">ביטול</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedFile(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-bold text-foreground truncate">{selectedFile.name}</h2>
                <button onClick={() => setSelectedFile(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                {selectedFile.type === "image" && selectedFile.thumbnailUrl && (
                  <div className="rounded-xl overflow-hidden bg-muted">
                    <img src={selectedFile.thumbnailUrl} alt={selectedFile.name} className="w-full max-h-80 object-contain" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">סוג</p>
                    <p className="text-foreground capitalize">{selectedFile.type === "image" ? "תמונה" : selectedFile.type === "video" ? "סרטון" : selectedFile.type === "document" ? "מסמך" : selectedFile.type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">גודל</p>
                    <p className="text-foreground">{formatSize(selectedFile.size)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">תאריך העלאה</p>
                    <p className="text-foreground">{formatDate(selectedFile.uploadedAt)}</p>
                  </div>
                  {selectedFile.uploadedBy && (
                    <div>
                      <p className="text-muted-foreground">הועלה על ידי</p>
                      <p className="text-foreground">{selectedFile.uploadedBy}</p>
                    </div>
                  )}
                  {selectedFile.album && (
                    <div>
                      <p className="text-muted-foreground">אלבום</p>
                      <p className="text-foreground">{selectedFile.album}</p>
                    </div>
                  )}
                  {selectedFile.project && (
                    <div>
                      <p className="text-muted-foreground">פרויקט</p>
                      <p className="text-foreground">{selectedFile.project}</p>
                    </div>
                  )}
                  {selectedFile.customer && (
                    <div>
                      <p className="text-muted-foreground">לקוח</p>
                      <p className="text-foreground">{selectedFile.customer}</p>
                    </div>
                  )}
                </div>
                {selectedFile.tags.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-sm mb-2">תגיות</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFile.tags.map(tag => (
                        <span key={tag} className="text-sm bg-violet-900/40 text-violet-300 border border-violet-700/50 px-2.5 py-1 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  {selectedFile.url !== "#" && (
                    <a href={selectedFile.url} download={selectedFile.name} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-foreground rounded-lg text-sm font-medium">
                      <Download className="w-4 h-4" /> הורדה
                    </a>
                  )}
                  {isSuperAdmin && <button onClick={() => { deleteFile(selectedFile.id); }} className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-foreground rounded-lg text-sm font-medium">
                    <Trash2 className="w-4 h-4" /> מחיקה
                  </button>}
                  <button onClick={() => setSelectedFile(null)} className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm">סגור</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-6 pb-6 space-y-6">
        <ActivityLog entityType="media-library" />
      </div>
    </div>
  );
}
